/* The Overview and the Batches tab report batches a posted invoice created, and nothing else.
   Inherited stock, opening balances and ledger imports carry costs nobody recorded against a
   document; mixing them in produced figures that were part record and part guess. FIFO still
   draws on every lot, so costs and sell-through do not change — those batches are not reported. */
const {chromium}=require("playwright");
const APP="file://"+require("path").join(__dirname,"..","index.html");
const A=[];const chk=(c,n)=>A.push((c?"ok   ":"FAIL ")+n);
const near=(a,b,t)=>a!=null&&Math.abs(a-b)<=(t||0.02);
const asNum=s=>parseFloat(String(s).replace(/[^0-9,.-]/g,"").replace(/\s/g,"").replace(",","."));
(async()=>{
  const b=await chromium.launch({args:["--no-sandbox"]});
  const p=await b.newPage({viewport:{width:1500,height:1000}});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.goto(APP,{waitUntil:"domcontentloaded"});await p.waitForTimeout(500);

  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.channels=[{id:"c1",name:"Purchase",dir:"in",mode:null,kind:null},
                {id:"c2",name:"Vektori",dir:"out",mode:"in_person",kind:"sale"}];
    s.catalogue=[{code:"P-1",name:"From an invoice",type:"goods",supplier:"A",cost:2,price:12.55,sellable:true,stocked:true},
                 {code:"P-2",name:"Inherited",type:"goods",supplier:"A",cost:2,price:12.55,sellable:true,stocked:true}];
    s.ledger=[
      /* an invoice: 100 units at 2,00, half sold at 5,00 net */
      {id:"i1",date:"2026-02-02",channel:"Purchase",dir:"in",batchRef:"FA-1",code:"P-1",qty:100,unitPrice:2,vatRate:0,provider:"A",createdAt:"x"},
      {id:"o1",date:"2026-05-01",channel:"Vektori",dir:"out",batchRef:"V1",code:"P-1",qty:50,unitPrice:5,vatRate:0,createdAt:"x"},
      /* an opening balance, same shape, no invoice behind it */
      {id:"i2",date:"2026-01-02",channel:"Purchase",dir:"in",batchRef:"OPENING-2026",code:"P-2",qty:100,unitPrice:2,vatRate:0,provider:"A",createdAt:"x"},
      {id:"o2",date:"2026-05-02",channel:"Vektori",dir:"out",batchRef:"V2",code:"P-2",qty:50,unitPrice:5,vatRate:0,createdAt:"x"}];
    s.invoices=[{id:"inv1",status:"posted",provider:"A",invoiceNo:"FA-1",date:"2026-02-02",
      batchRef:"FA-1",postedAt:"x",lines:[]}];
    s.staging=[];localStorage.setItem("rosamystica:v1",JSON.stringify(s));});
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(800);

  const kpi=async label=>p.evaluate(l=>{for(const k of document.querySelectorAll(".kpi"))
    if(k.querySelector(".k").textContent.trim()===l)return k.querySelector(".v").textContent.trim();return null;},label);

  /* the two halves are identical, so anything counting both would read exactly double */
  chk(near(asNum(await kpi("Stock value")),100,0.5),
      "Stock value counts the invoice's 50 remaining units only — 100,00 €, not 200,00 ("+(await kpi("Stock value"))+")");
  chk(near(asNum(await kpi("Profit realised")),150,0.5),
      "Profit realised likewise counts one half ("+(await kpi("Profit realised"))+")");
  chk(near(asNum(await kpi("Returned beyond cost")),50,0.5),
      "and so does Returned beyond cost ("+(await kpi("Returned beyond cost"))+")");

  const sub=await p.evaluate(()=>document.querySelector(".content .note").textContent.replace(/\s+/g," "));
  chk(/read from your posted invoices/.test(sub),"the Overview says what it is reading");
  chk(/1 batch .*left out/.test(sub),"and names what it is leaving out rather than hiding it — "+sub.slice(0,150));

  const bars=await p.evaluate(()=>[...document.querySelectorAll("svg g")].filter(g=>g.querySelector("path")).length);
  chk(bars===1,"one bar, for the one invoice ("+bars+")");

  const names=await p.evaluate(()=>[...document.querySelectorAll(".toprow-t .name")].map(x=>x.textContent.trim()));
  chk(names.indexOf("From an invoice")>=0,"the rankings include the invoiced product");
  chk(names.indexOf("Inherited")<0,"and leave out the inherited one ("+names.join(", ")+")");

  /* ---- the Batches tab follows the same rule ---- */
  await p.getByRole("button",{name:/^Inventory/}).first().click();await p.waitForTimeout(300);
  await p.getByRole("button",{name:/^Batches/}).first().click();await p.waitForTimeout(500);
  const refs=await p.evaluate(()=>[...document.querySelectorAll("tbody tr td.code")].map(x=>x.textContent.trim()));
  chk(refs.join()==="FA-1","Batches lists the invoice only ("+refs.join(", ")+")");
  const note=await p.evaluate(()=>document.querySelector(".content .note").textContent.replace(/\s+/g," "));
  chk(/not listed/.test(note),"saying so in its own note");

  /* ---- but the shelf is untouched: the inherited stock is still stock ---- */
  await p.getByRole("button",{name:/^Stock/}).first().click();await p.waitForTimeout(450);
  const codes=await p.evaluate(()=>[...document.querySelectorAll("tbody tr td.code")].map(x=>x.textContent.trim()));
  chk(codes.indexOf("P-2")>=0,"Stock still shows the inherited product ("+codes.join(", ")+")");
  const onhand=await p.evaluate(()=>{const inv=computeInventory(JSON.parse(localStorage.getItem("rosamystica:v1")));
    return inv.reduce((a,r)=>a+r.onHand,0);});
  chk(onhand===100,"and the whole shelf is still 100 units — nothing was removed from the ledger");

  chk(errs.length===0,"no page errors"+(errs.length?": "+errs[0]:""));
  console.log(A.join("\n"));
  console.log("\n"+A.filter(x=>x.startsWith("ok")).length+"/"+A.length+" passed");
  await b.close();process.exit(A.some(x=>x.startsWith("FAIL"))?1:0);
})();
