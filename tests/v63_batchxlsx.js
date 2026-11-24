/* A quiet way to get one opened batch out as a spreadsheet. The point of the file is that the
   figures arrive as numbers rather than formatted strings — a sheet you have to retype is not
   an export — so that is what is checked here, by unzipping what the button would produce and
   reading the cells back out of the worksheet XML. */
const {chromium}=require("playwright");
const APP="file://"+require("path").join(__dirname,"..","index.html");
const A=[];const chk=(c,n)=>A.push((c?"ok   ":"FAIL ")+n);

(async()=>{
  const b=await chromium.launch({args:["--no-sandbox"]});
  const p=await b.newPage({viewport:{width:1700,height:1200}});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.goto(APP,{waitUntil:"domcontentloaded"});await p.waitForTimeout(500);

  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.channels=[{id:"c1",name:"Purchase",dir:"in",mode:null,kind:null},
                {id:"c2",name:"Vektori",dir:"out",mode:"in_person",kind:"sale"}];
    s.staging=[];s.suppliers=[];s.log=[];s.diag={disp:{},hist:[]};
    s.catalogue=[
      {code:"R900-1",name:"Rosary – olive wood",type:"goods",supplier:"Jakóbczak Studio",
       supplierRef:"R900-1",price:5.00,cost:null,sellable:true,stocked:true},
      {code:"K001",name:"Cross – St Benedict",type:"goods",supplier:"Jakóbczak Studio",
       supplierRef:"K001",price:null,cost:null,sellable:false,stocked:false}];
    s.invoices=[{id:"i1",status:"posted",provider:"Jakóbczak Studio",country:"Poland",
      invoiceNo:"WV 5553/11/2026",date:"2026-11-18",currency:"EUR",rate:"1",
      treatment:"eu_acq",batchRef:"WV-5553-11-2026",lines:[]}];
    const mv=(id,code,qty,unitPrice,dir,batchRef,channel)=>({id,date:"2026-11-18",channel,dir,
      batchRef,code,qty,unitPrice,vatRate:0,transport:(dir==="in"?35:null),note:"",
      country:"Poland",provider:"Jakóbczak Studio",providerRef:code});
    s.ledger=[mv("a","R900-1",12,1.35,"in","WV-5553-11-2026","Purchase"),
              mv("b","K001",5,1.01,"in","WV-5553-11-2026","Purchase"),
              {id:"c",date:"2026-11-20",channel:"Vektori",dir:"out",batchRef:"",code:"R900-1",
               qty:4,unitPrice:5.00,vatRate:25.5,note:"",country:"",provider:"",providerRef:""}];
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));});
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(800);

  await p.getByRole("button",{name:/^Inventory/}).first().click();await p.waitForTimeout(600);
  await p.getByRole("button",{name:/^Batches|Batches/}).first().click().catch(()=>{});
  await p.waitForTimeout(500);

  /* hidden until the batch is opened */
  chk(await p.locator("button.quietx").count()===0,"nothing on screen until a batch is opened");
  await p.locator("tbody tr").filter({hasText:"WV-5553-11-2026"}).first().click();
  await p.waitForTimeout(600);
  const btn=p.locator("button.quietx");
  chk(await btn.count()===1,"opening the batch reveals one export control");
  chk((await btn.innerText()).trim().toLowerCase()==="xlsx","labelled plainly, and small");
  const op=await btn.evaluate(e=>getComputedStyle(e).opacity);
  chk(parseFloat(op)<0.5,"and kept faint until wanted (opacity "+op+")");
  chk(/WV-5553-11-2026/.test(await btn.getAttribute("title")),"its tooltip names the batch");

  /* build what the button builds, and read the workbook back */
  const sheet=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    const bs=computeBatches(s);const b=bs.find(x=>x.batchRef==="WV-5553-11-2026");
    const sheets=batchSheets(b);
    const bytes=makeXlsx(sheets);
    const files=fflate.unzipSync(bytes);
    const dec=new TextDecoder();
    const wbx=dec.decode(files["xl/workbook.xml"]);
    const xml=dec.decode(files["xl/worksheets/sheet1.xml"]);
    /* every <c> that carries a bare <v> is a real number to Excel; t="inlineStr" is text */
    const nums=(xml.match(/<c r="[A-Z]+\d+"><v>/g)||[]).length;
    const strs=(xml.match(/t="inlineStr"/g)||[]).length;
    return {rows:sheets[0].rows,name:sheets[0].name,sheetName:(wbx.match(/<sheet name="([^"]*)"/)||[])[1],
      nums,strs,parts:Object.keys(files).sort(),
      hasUnitCost:xml.indexOf("Unit cost")>=0};});

  chk(["[Content_Types].xml","_rels/.rels","xl/_rels/workbook.xml.rels","xl/workbook.xml",
       "xl/worksheets/sheet1.xml"].every(f=>sheet.parts.indexOf(f)>=0),
      "the workbook carries every part a reader needs");
  chk(sheet.sheetName==="WV-5553-11-2026","the sheet is named for the batch");
  chk(sheet.hasUnitCost,"and carries the line table");
  chk(sheet.nums>15,"figures are written as numbers, not strings ("+sheet.nums+" numeric cells)");
  chk(sheet.strs>10,"with labels as text ("+sheet.strs+")");

  const rows=sheet.rows;
  const find=k=>{const r=rows.find(x=>x[0]===k);return r?r[1]:undefined;};
  chk(find("Batch")==="WV-5553-11-2026","the header block names the batch");
  chk(find("Provider")==="Jakóbczak Studio","and the provider, accents intact");
  chk(find("Units received")===17,"units received is a number: 12 + 5");
  chk(find("Freight")===35,"freight carries over");

  const head=rows.find(r=>r[0]==="Code");
  const hi=n=>head.indexOf(n);
  const line=rows.find(r=>r[0]==="R900-1");
  chk(!!head&&!!line,"the line table is there with the rosary in it");
  chk(line[hi("Received")]===12&&line[hi("Sold")]===4,"quantities come through as numbers");
  chk(typeof line[hi("Unit cost")]==="number"&&line[hi("Unit cost")]>1.35,
      "unit cost is landed — above the 1,35 on the invoice because freight is in it");
  chk(line[hi("Provider ref")]==="R900-1","the supplier's own article number is included");
  chk(line[hi("Sellable")]==="yes","and whether it is for sale");
  const till=rows.find(r=>r[0]==="K001");
  chk(till[hi("Sellable")]==="no","a line not for sale says so");
  chk(till[hi("Price")]==="","with no price invented for it");

  chk(errs.length===0,"no page errors"+(errs.length?" ("+errs[0]+")":""));
  await b.close();
  console.log(A.join("\n"));
  console.log((A.filter(x=>x[0]==="F").length?"FAILURES":"all ok")+" — "+A.length+" checks");
  process.exit(A.some(x=>x[0]==="F")?1:0);
})();
