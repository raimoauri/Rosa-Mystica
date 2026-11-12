/* Has this invoice paid for itself yet? That is recouped over invested, and it is a different
   question from ROI, which is profit over invested. Both are shown; neither replaces the other. */
const {chromium}=require("playwright");
const APP="file://"+require("path").join(__dirname,"..","index.html");
const A=[];const chk=(c,n)=>A.push((c?"ok   ":"FAIL ")+n);
(async()=>{
  const b=await chromium.launch({args:["--no-sandbox"]});
  const p=await b.newPage({viewport:{width:1700,height:1000}});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.goto(APP,{waitUntil:"domcontentloaded"});await p.waitForTimeout(500);
  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.channels=[{id:"c1",name:"Purchase",dir:"in",mode:null,kind:null},
                {id:"c2",name:"Vektori",dir:"out",mode:"in_person",kind:"sale"}];
    s.catalogue=[{code:"P-1",name:"Thing",type:"goods",supplier:"A",cost:2,price:12.55,
      sellable:true,stocked:true}];
    /* three invoices of 100 units at 2,00 net = 200,00 each, sold back at 5,00 net a unit */
    const L=[];let i=0;
    const buy=(b,d)=>L.push({id:"i"+(++i),date:d,channel:"Purchase",dir:"in",batchRef:b,code:"P-1",
      qty:100,unitPrice:2,vatRate:0,provider:"A",createdAt:"x"});
    const sell=(b,d,q)=>L.push({id:"o"+(++i),date:d,channel:"Vektori",dir:"out",batchRef:b,code:"P-1",
      qty:q,unitPrice:5,vatRate:0,createdAt:"x"});
    buy("B-1","2026-01-02"); buy("B-2","2026-02-02"); buy("B-3","2026-03-02");
    /* FIFO drains B-1 first: 20 units -> 100,00 back on a 200,00 invoice = 50% */
    sell("V1","2026-04-01",20);
    s.ledger=L;s.staging=[];s.invoices=[];
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));});
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(700);

  const truth=await p.evaluate(()=>{const bs=computeBatches(JSON.parse(localStorage.getItem("rosamystica:v1")));
    const m={};for(const b of bs)m[b.batchRef]={inv:b.investedNet,rec:b.recoupedNet,profit:b.profit,roi:b.roi};
    return m;});
  const b1=truth["B-1"];
  chk(Math.abs(b1.inv-200)<0.01&&Math.abs(b1.rec-100)<0.01,
      "the fixture puts 100,00 back against a 200,00 invoice ("+b1.rec+" of "+b1.inv+")");
  chk(Math.abs(b1.roi-0.30)<0.005,"its ROI is 30% — profit over the whole invoice ("+(b1.roi*100).toFixed(1)+"%)");

  await p.getByRole("button",{name:/^Inventory/}).first().click();await p.waitForTimeout(300);
  await p.getByRole("button",{name:/^Batches/}).first().click();await p.waitForTimeout(500);
  const cell=async ref=>p.evaluate(r=>{for(const tr of document.querySelectorAll("tbody tr")){
    const c=tr.querySelector("td.code");if(!c||c.textContent.trim()!==r)continue;
    const m=tr.querySelector(".meta.recouped");
    return m?{text:m.textContent.replace(/\s+/g," ").trim(),
              good:!!m.querySelector(".good"),
              bar:(m.querySelector(".minibar span")||{}).style&&m.querySelector(".minibar span").style.width}:null;}
    return null;},ref);

  const c1=await cell("B-1");
  chk(!!c1,"the Recouped cell carries a ratio beneath the amount");
  chk(/50,0 % back/.test(c1.text),"and it reads 50,0 % back, not the 30% ROI — "+c1.text);
  chk(!c1.good,"below 100% it is not marked as recouped");
  chk(parseFloat(c1.bar)===50,"the bar is half full ("+c1.bar+")");

  const c2=await cell("B-2");
  chk(/0,0 % back/.test(c2.text),"an invoice nothing has sold from reads 0,0 % back");
  chk(parseFloat(c2.bar)===0,"with an empty bar ("+c2.bar+")");

  /* sell enough to clear B-1 and pass its cost: 60 units in all = 300,00 on a 200,00 invoice */
  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.ledger.push({id:"o9",date:"2026-04-02",channel:"Vektori",dir:"out",batchRef:"V2",code:"P-1",
      qty:40,unitPrice:5,vatRate:0,createdAt:"x"});
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));});
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(700);
  await p.getByRole("button",{name:/^Inventory/}).first().click();await p.waitForTimeout(300);
  await p.getByRole("button",{name:/^Batches/}).first().click();await p.waitForTimeout(500);
  const c3=await cell("B-1");
  chk(/150,0 % back/.test(c3.text),"past its cost it keeps counting — 150,0 % back ("+c3.text+")");
  chk(c3.good,"and is marked as having paid for itself");
  chk(parseFloat(c3.bar)===100,"the bar stops at full rather than overflowing ("+c3.bar+")");

  const after=await p.evaluate(()=>{const bs=computeBatches(JSON.parse(localStorage.getItem("rosamystica:v1")));
    return bs.find(x=>x.batchRef==="B-1").roi;});
  chk(Math.abs(after-0.9)<0.005,"while ROI reads 90% on the same invoice — the two are not the same number ("+(after*100).toFixed(0)+"%)");

  chk(errs.length===0,"no page errors"+(errs.length?": "+errs[0]:""));
  console.log(A.join("\n"));
  console.log("\n"+A.filter(x=>x.startsWith("ok")).length+"/"+A.length+" passed");
  await b.close();process.exit(A.some(x=>x.startsWith("FAIL"))?1:0);
})();
