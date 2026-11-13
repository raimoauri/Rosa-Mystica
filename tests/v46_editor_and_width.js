/* Two fixes. Changing a product's code in the editor used to move the ledger and leave invoice
   lines behind, so the ledger read right and the invoice it came from read wrong. And the Batches
   table was wider than the screen it sat in, with the overflow invisible on systems that hide
   scrollbars, so it simply looked cut off. */
const {chromium}=require("playwright");
const APP="file://"+require("path").join(__dirname,"..","index.html");
const A=[];const chk=(c,n)=>A.push((c?"ok   ":"FAIL ")+n);
(async()=>{
  const b=await chromium.launch({args:["--no-sandbox"]});
  const p=await b.newPage({viewport:{width:1440,height:1000}});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.goto(APP,{waitUntil:"domcontentloaded"});await p.waitForTimeout(500);

  /* ---------- the product editor carries the whole history ---------- */
  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.channels=[{id:"c1",name:"Purchase",dir:"in",mode:null,kind:null}];
    s.catalogue=[{code:"WRONG-PC",name:"Holy Bible",type:"book",supplier:"St Pauls",
      supplierRef:"9788119597260",cost:12.35,price:29,sellable:true,stocked:true}];
    s.ledger=[{id:"m1",date:"2026-09-09",channel:"Purchase",dir:"in",batchRef:"2310000034",
      code:"WRONG-PC",providerRef:"9788119597260",qty:10,unitPrice:12.35,vatRate:0,
      provider:"St Pauls",createdAt:"x"}];
    s.invoices=[{id:"inv1",status:"posted",provider:"St Pauls",invoiceNo:"2310000034",
      date:"2026-09-09",batchRef:"2310000034",postedAt:"x",invoiceTotal:"123.50",
      treatment:"import",vatDefault:"0",currency:"EUR",rate:"1",
      lines:[{id:"a",supplierRef:"9788119597260",code:"WRONG-PC",name:"Holy Bible",qty:"10",
        lineTotal:"123.50",vatRate:"0",type:"book"}]}];
    s.staging=[{code:"WRONG-PC",name:"staged",type:"book",seenCount:1,qty:10,
      firstDate:"2026-09-09",provider:"St Pauls",providerRef:"9788119597260"}];
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));});
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(650);
  await p.getByRole("button",{name:/^Catalogue/}).first().click();await p.waitForTimeout(350);
  await p.locator("tbody tr").first().click();await p.waitForTimeout(450);
  await p.locator(".modal input").first().fill("KKG-BIBLE");await p.waitForTimeout(400);
  const warn=(await p.locator(".modal").innerText()).replace(/\s+/g," ");
  chk(/1 ledger movement/.test(warn),"the editor warns about the ledger movement it will move");
  chk(/1 invoice line/.test(warn),"and about the invoice line, which it never used to mention — "
      +(warn.match(/Changing the code[^.]*\./)||[""])[0].slice(0,110));
  await p.getByRole("button",{name:/^Save|^Add product/}).last().click();await p.waitForTimeout(800);
  const after=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    return {cat:s.catalogue.map(x=>x.code),led:s.ledger.map(x=>x.code),
      inv:s.invoices[0].lines.map(l=>l.code),stg:s.staging.map(x=>x.code),
      name:s.invoices[0].lines[0].name,ref:s.invoices[0].lines[0].supplierRef};});
  chk(after.cat.join()==="KKG-BIBLE","the catalogue takes the new code");
  chk(after.led.join()==="KKG-BIBLE","the ledger movement follows it");
  chk(after.inv.join()==="KKG-BIBLE","and so does the invoice line ("+after.inv.join()+")");
  chk(after.stg.join()==="KKG-BIBLE","as does the staged entry");
  chk(after.name==="Holy Bible"&&after.ref==="9788119597260",
      "while the line keeps the supplier's reference and description — only the code moves");

  /* ---------- the Batches table fits the screen it is given ---------- */
  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.channels=[{id:"c1",name:"Purchase",dir:"in",mode:null,kind:null},
                {id:"c2",name:"Vektori",dir:"out",mode:"in_person",kind:"sale"},
                {id:"c3",name:"Breakage",dir:"out",mode:null,kind:"writeoff"}];
    s.catalogue=[{code:"P-1",name:"Thing",type:"goods",supplier:"Fatirosarium, Lda",
      cost:2,price:12.55,sellable:true,stocked:true}];
    s.ledger=[{id:"i1",date:"2026-02-02",channel:"Purchase",dir:"in",batchRef:"FA2026-100",
      code:"P-1",qty:40,unitPrice:2,vatRate:0,provider:"Fatirosarium, Lda",createdAt:"x"},
      {id:"o1",date:"2026-05-01",channel:"Vektori",dir:"out",batchRef:"V1",code:"P-1",qty:10,unitPrice:5,createdAt:"x"},
      {id:"w1",date:"2026-05-02",channel:"Breakage",dir:"out",batchRef:"W1",code:"P-1",qty:3,unitPrice:0,createdAt:"x"}];
    s.invoices=[{id:"inv9",status:"posted",provider:"Fatirosarium, Lda",invoiceNo:"FA2026-100",
      date:"2026-02-02",batchRef:"FA2026-100",postedAt:"x",lines:[]}];
    s.staging=[];localStorage.setItem("rosamystica:v1",JSON.stringify(s));});
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(650);
  await p.getByRole("button",{name:/^Inventory/}).first().click();await p.waitForTimeout(300);
  await p.getByRole("button",{name:/^Batches/}).first().click();await p.waitForTimeout(500);

  const fit=await p.evaluate(()=>{const w=document.querySelector(".tablewrap");
    const cs=getComputedStyle(w);
    return {over:w.scrollWidth-w.clientWidth,scroll:cs.overflowX,
      full:!!document.querySelector(".content.full"),
      heads:[...w.querySelectorAll("thead th")].map(h=>h.textContent.trim())};});
  chk(fit.over<=0,"at 1440 the whole table fits with nothing cut off (overflow "+fit.over+"px)");
  chk(fit.full,"the Inventory screen is exempt from the reading-width cap that a text page wants");
  chk(fit.scroll==="auto","and still scrolls on a narrower screen rather than squashing");
  chk(fit.heads.indexOf("Not sold")<0,"the Not sold column is gone from the header");

  /* the information it held is not */
  const soldCell=await p.evaluate(()=>{const tr=document.querySelector("tbody tr");
    return tr.children[6].textContent.replace(/\s+/g," ").trim();});
  chk(/10/.test(soldCell)&&/3 not sold/.test(soldCell),
      "it sits under the Sold figure instead — "+soldCell);

  const narrow=await p.evaluate(()=>{const w=document.querySelector(".tablewrap");
    const sb=getComputedStyle(w).scrollbarWidth;return sb;});
  chk(narrow==="thin"||narrow==="auto","the scrollbar is styled rather than left to vanish ("+narrow+")");

  chk(errs.length===0,"no page errors"+(errs.length?": "+errs[0]:""));
  console.log(A.join("\n"));
  console.log("\n"+A.filter(x=>x.startsWith("ok")).length+"/"+A.length+" passed");
  await b.close();process.exit(A.some(x=>x.startsWith("FAIL"))?1:0);
})();
