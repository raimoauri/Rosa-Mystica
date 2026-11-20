/* An invoice is keyed, reconciled and printed in its own currency; only the ledger is euros,
   converted at posting. Every figure on the invoice screens was formatted as euros regardless, so
   a 6 278 SEK book order read as "6 278,00 €" in the list and in the reconciliation panel — off by
   the exchange rate, in the direction that makes a 567-euro order look like a five-figure one.

   Nothing was ever stored or posted wrong: the ledger conversion was correct all along. This is a
   labelling fault, and the test holds both halves — that the screens say SEK, and that the ledger
   still comes out in euros. */
const {chromium}=require("playwright");
const APP="file://"+require("path").join(__dirname,"..","index.html");
const A=[];const chk=(c,n)=>A.push((c?"ok   ":"FAIL ")+n);
const near=(a,b,t)=>a!=null&&Math.abs(a-b)<=(t||0.02);
(async()=>{
  const b=await chromium.launch({args:["--no-sandbox"]});
  const p=await b.newPage({viewport:{width:1500,height:1000}});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.goto(APP,{waitUntil:"domcontentloaded"});await p.waitForTimeout(500);

  /* ---- the formatters ---- */
  const F=await p.evaluate(()=>({
    eurPlain:invMoney({currency:"EUR"},6278),
    eurBlank:invMoney({},6278),
    sek:invMoney({currency:"SEK"},6278),
    sekLower:invMoney({currency:"sek"},6278),
    nullAmt:invMoney({currency:"SEK"},null),
    conv:invEur({currency:"SEK",rate:"0.09036036"},6278),
    noRate:invEur({currency:"SEK",rate:""},6278),
    eurNoConv:invEur({currency:"EUR",rate:"1"},6278)}));
  chk(/€/.test(F.eurPlain),"a euro invoice still prints a euro sign ("+F.eurPlain+")");
  chk(/€/.test(F.eurBlank),"so does one with no currency set ("+F.eurBlank+")");
  chk(/SEK/.test(F.sek)&&!/€/.test(F.sek),"a krona figure says SEK and loses the euro sign ("+F.sek+")");
  chk(/SEK/.test(F.sekLower),"the currency code is upper-cased ("+F.sekLower+")");
  chk(F.nullAmt==="—","a missing amount is a dash, not 0 SEK");
  chk(near(F.conv,567.28,0.01),"the euro equivalent converts at the invoice's rate ("+F.conv+")");
  chk(F.noRate===null,"with no rate there is no euro equivalent to show");
  chk(F.eurNoConv===null,"and a euro invoice needs no second figure");

  /* ---- the screens, on the real Swedish invoice ---- */
  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.channels=[{id:"c1",name:"Purchase",dir:"in",mode:null,kind:null}];
    s.catalogue=[];s.ledger=[];s.staging=[];s.diag={disp:{},hist:[]};
    s.invoices=[{id:"i1",status:"draft",provider:"Katolsk Bokhandel",country:"Sweden",invoiceNo:"48730F",
      date:"2026-08-25",due:"2026-09-24",currency:"SEK",rate:"0.09036036",treatment:"eu_acq",
      freight:"437",freightVat:"0",duty:"",importVat:"",vatDefault:"0",invoiceTotal:"6278",note:"",
      batchRef:"",postedAt:"",lineType:"book",
      lines:[{id:"l1",supplierRef:"",code:"KBH-STUDIEBIBEL",name:"Studiebibel",qty:"7",qtyRecv:"",lineTotal:"2971",vatRate:"0",type:""},
             {id:"l2",supplierRef:"",code:"KBH-TIDEGARDEN",name:"Tidegarden",qty:"3",qtyRecv:"",lineTotal:"2551",vatRate:"0",type:""},
             {id:"l3",supplierRef:"",code:"KBH-BIRGITTA",name:"Birgitta",qty:"3",qtyRecv:"",lineTotal:"319",vatRate:"0",type:""}]}];
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));});
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(800);
  await p.getByRole("button",{name:/^Invoices/}).first().click();await p.waitForTimeout(400);

  const listRow=await p.evaluate(()=>document.querySelector("tbody tr").innerText.replace(/\s+/g," "));
  chk(/6\s?278,00\s*SEK/.test(listRow),"the list shows the total in kronor ("+listRow.slice(-40)+")");
  chk(/567,28/.test(listRow),"with the euro equivalent beneath it");
  chk(!/6\s?278,00\s*€/.test(listRow),"and never 6 278,00 € — the fault that started this");

  await p.locator("tbody tr").first().click();await p.waitForTimeout(600);
  const kpi=await p.evaluate(()=>{const o={};for(const k of document.querySelectorAll(".kpi"))
    o[k.querySelector(".k").textContent.trim()]={v:k.querySelector(".v").textContent.trim(),
      f:((k.querySelector(".f")||{}).textContent||"").trim()};
    return o;});
  chk(/SEK/.test(kpi["Lines"].v)&&!/€/.test(kpi["Lines"].v),"Lines reads in kronor ("+kpi["Lines"].v+")");
  chk(/SEK/.test(kpi["Freight + duty"].v),"Freight + duty reads in kronor ("+kpi["Freight + duty"].v+")");
  chk(/SEK/.test(kpi["Computed total"].v),"Computed total reads in kronor ("+kpi["Computed total"].v+")");
  chk(/567,28/.test(kpi["Computed total"].f)&&/0\.09036036/.test(kpi["Computed total"].f),
      "and names the euro figure and the rate it used ("+kpi["Computed total"].f+")");
  chk(/SEK|—/.test(kpi["Difference"].v),"Difference reads in kronor ("+kpi["Difference"].v+")");

  /* ---- the part that was never broken: the ledger is euros ---- */
  await p.getByRole("button",{name:/Post to ledger/}).click();await p.waitForTimeout(350);
  const c=p.getByRole("button",{name:/^Post/}).last();if(await c.count())await c.click();
  await p.waitForTimeout(1200);
  const led=await p.evaluate(()=>JSON.parse(localStorage.getItem("rosamystica:v1")).ledger);
  const eur=led.reduce((a,r)=>a+r.qty*r.unitPrice,0);
  chk(near(eur,527.79,0.02),"posting converts the goods to 527,79 € ("+eur.toFixed(2)+")");
  chk(near(led[0].transport,39.49,0.02),"and the freight to 39,49 € ("+led[0].transport+")");
  chk(led.every(r=>r.unitPrice<100),"no movement kept a krona-sized unit price");

  chk(errs.length===0,"no page errors"+(errs.length?" — "+errs[0]:""));
  A.forEach(l=>console.log(l));
  await b.close();
})().catch(e=>{console.log("FAIL crashed — "+e.message);process.exit(1);});
