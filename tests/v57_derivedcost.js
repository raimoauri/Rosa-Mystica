/* The catalogue used to keep a cost: a number snapshotted when a product was confirmed out of
   staging, and never updated again. Re-cost an invoice and the ledger moved while the catalogue
   sat still — which is what health check F4 was for, and a health check for a derived value is
   the symptom, not the cure.

   Cost is now read from the lots: what the stock you hold actually cost, freight included at
   whichever basis its batch was posted under. A stored number is an override, set deliberately
   and never moving, and that is the only thing F4 now asks about.

   The case that prompted it is the last block here: confirm under one freight basis, repost
   under another, and the catalogue must follow. */
const {chromium}=require("playwright");
const APP="file://"+require("path").join(__dirname,"..","index.html");
const A=[];const chk=(c,n)=>A.push((c?"ok   ":"FAIL ")+n);
const near=(a,b,t)=>a!=null&&Math.abs(a-b)<=(t||0.005);

const INV=()=>({id:"inv1",status:"draft",provider:"Demi Art",country:"Italy",invoiceNo:"2176",
  date:"2026-11-10",due:"",currency:"EUR",rate:"1",treatment:"eu_acq",vatDefault:"0",
  freight:"50.00",freightVat:"0",duty:"",importVat:"",invoiceTotal:"241.96",note:"",
  batchRef:"",postedAt:"",lineType:"goods",freightBasis:"units",
  lines:[{id:"d",supplierRef:"R3255",code:"R3255",name:"Our Lady 14cm",qty:"2",qtyRecv:"",lineTotal:"181.36",vatRate:"0",type:""},
         {id:"e",supplierRef:"8219",code:"8219",name:"Christmas decoration 5cm",qty:"2",qtyRecv:"",lineTotal:"10.60",vatRate:"0",type:""}]});

(async()=>{
  const b=await chromium.launch({args:["--no-sandbox"]});
  const p=await b.newPage({viewport:{width:1600,height:1100}});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.goto(APP,{waitUntil:"domcontentloaded"});await p.waitForTimeout(500);
  await p.evaluate(i=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.channels=[{id:"c1",name:"Purchase",dir:"in",mode:null,kind:null},
                {id:"c2",name:"Vektori",dir:"out",mode:"in_person",kind:"sale"}];
    s.catalogue=[];s.ledger=[];s.staging=[];s.invoices=[i];s.diag={disp:{},hist:[]};
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));},INV());
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(650);

  /* --------------------------------------------------------- the rule, alone */
  const r=await p.evaluate(()=>({
    override:costOf({cost:"7.50"},{unitCost:4,avgCost:5}),
    onhand:costOf({cost:null},{unitCost:4,avgCost:5}),
    soldOut:costOf({cost:null},{unitCost:null,avgCost:5}),
    nothing:costOf({cost:null},null),
    blank:costOf({cost:""},{unitCost:4,avgCost:5}),
    junk:costOf({cost:"abc"},{unitCost:4,avgCost:5}),
    zero:costOf({cost:null},{unitCost:0,avgCost:5})}));
  chk(r.override.value===7.5&&r.override.source==="set","a keyed cost overrides the ledger");
  chk(r.override.landed===4,"and the ledger figure is still reported alongside it");
  chk(r.onhand.value===4&&r.onhand.source==="onhand","with stock on hand, the lots you hold decide");
  chk(r.soldOut.value===5&&r.soldOut.source==="received","sold out, it falls back to all received");
  chk(r.nothing.value===null,"nothing received, no cost");
  chk(r.blank.value===4,"an empty field is not an override");
  chk(r.junk.value===4,"nor is an unparseable one");
  chk(r.zero.value===5,"a zero on-hand value is not a cost");

  /* ------------------------------------------------- nothing feeds back to the ledger */
  const oneWay=await p.evaluate(()=>{
    const src=document.scripts[document.scripts.length-1].textContent;
    /* the three functions that compute money from movements must not mention the catalogue field */
    const grab=n=>{const i=src.indexOf("function "+n+"(");if(i<0)return "";
      return src.slice(i,i+4000);};
    return ["computeInventory","computeBatches","landedUnit","netCostUnit"]
      .map(n=>({n,leaks:/[^a-zA-Z](p|prod|product)\.cost\b/.test(grab(n))}));});
  for(const f of oneWay)chk(!f.leaks,f.n+" never reads the catalogue's cost field");

  /* ------------------------------------------------------------------ end to end */
  const openInv=async()=>{await p.getByRole("button",{name:/^Invoices/}).first().click();await p.waitForTimeout(350);
    await p.locator("tbody tr").first().click();await p.waitForTimeout(500);};
  const post=async()=>{await p.getByRole("button",{name:/Post to ledger/}).click();await p.waitForTimeout(300);
    const c=p.getByRole("button",{name:/^Post/}).last();if(await c.count())await c.click();await p.waitForTimeout(1100);};
  const unpost=async()=>{await p.getByRole("button",{name:/^Unpost/}).click();await p.waitForTimeout(300);
    await p.getByRole("button",{name:"Remove from the ledger"}).click();await p.waitForTimeout(1000);};
  const picker=()=>p.locator('div:has(> label.lab:text-is("Spread freight by")) > select');
  const cat=()=>p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    const iv=invByCode(s);const o={};
    for(const pr of s.catalogue){const c=costOf(pr,iv[normCode(pr.code)]);
      o[pr.code]={stored:pr.cost,shown:c.value==null?null:Math.round(c.value*1e4)/1e4,src:c.source};}
    return o;});

  await openInv();await post();
  /* confirm out of staging without touching the cost column, as you would */
  await p.getByRole("button",{name:/^Staging|Unconfirmed/}).first().click();await p.waitForTimeout(450);
  await p.getByRole("button",{name:/^Confirm /}).click();await p.waitForTimeout(900);
  const c1=await cat();
  chk(Object.keys(c1).length===2,"both products confirmed into the catalogue");
  chk(c1["8219"].stored===null,"confirming stores no cost when none was typed");
  chk(near(c1["8219"].shown,17.80,0.002),"the catalogue shows landed cost — 5,30 plus 12,50 freight");
  chk(c1["8219"].src==="onhand","read from the lots on hand");
  chk(near(c1["R3255"].shown,103.18,0.002),"and 90,68 plus 12,50 for the statue");

  /* ---------------- the Friday case: re-cost the batch, the catalogue must follow */
  await openInv();await unpost();
  await picker().selectOption("value");await p.waitForTimeout(250);
  await post();
  const c2=await cat();
  chk(c2["8219"].stored===null,"the stored field is still empty after reposting");
  chk(near(c2["8219"].shown,6.68,0.01),"the catalogue follows the new basis — 17,80 becomes 6,68");
  chk(near(c2["R3255"].shown,114.30,0.01),"and the statue moves the other way, to 114,30");

  /* an override, by contrast, holds still and is what F4 now asks about */
  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    for(const pr of s.catalogue)if(pr.code==="8219")pr.cost=17.80;
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));});
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(650);
  const c3=await cat();
  chk(c3["8219"].shown===17.8&&c3["8219"].src==="set","an override does not follow the ledger");
  chk(near(c3["R3255"].shown,114.30,0.01),"while the product without one still does");

  const f4=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    const f=runChecks(s).findings.filter(x=>x.chk==="F4");
    return {n:f.length,code:f[0]?f[0].subject:null,says:f[0]?f[0].detail||"":""};});
  chk(f4.n===1,"F4 fires once — on the override, not on the derived product");
  chk(f4.code==="8219","and names the product carrying it");
  chk(/clearing it/.test(f4.says),"the finding says clearing the field is the fix");

  /* clearing it through the editor returns the product to the ledger */
  await p.getByRole("button",{name:/^Catalogue/}).first().click();await p.waitForTimeout(400);
  await p.locator("tbody tr").filter({hasText:"8219"}).first().click();await p.waitForTimeout(500);
  const useLanded=p.getByRole("button",{name:"Use landed"});
  chk(await useLanded.count()===1,"the editor offers to drop the override");
  await useLanded.click();await p.waitForTimeout(250);
  await p.getByRole("button",{name:/^Save changes/}).click();await p.waitForTimeout(800);
  const c4=await cat();
  chk(c4["8219"].stored===null,"clearing it stores nothing");
  chk(near(c4["8219"].shown,6.68,0.01),"and the product follows the ledger again");
  const f4b=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    return runChecks(s).findings.filter(x=>x.chk==="F4").length;});
  chk(f4b===0,"and F4 goes quiet");

  /* ------------------------------------------------- the export still round-trips */
  const ex=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    const sheet=catalogueSheets(s)[0].rows;const head=sheet[0];
    const row=sheet.find(r=>r[0]==="8219");
    return {head,override:row[head.indexOf("Cost override")],landed:row[head.indexOf("Landed now")]};});
  chk(ex.head.includes("Cost override")&&ex.head.includes("Landed now"),
      "the export separates the override from what the ledger says");
  chk(ex.override==="","a product with no override exports an empty cost");
  chk(near(ex.landed,6.68,0.01),"with the landed figure beside it, for reading only");

  chk(errs.length===0,"no page errors"+(errs.length?" ("+errs[0]+")":""));
  await b.close();
  console.log(A.join("\n"));
  console.log((A.filter(x=>x[0]==="F").length?"FAILURES":"all ok")+" — "+A.length+" checks");
  process.exit(A.some(x=>x[0]==="F")?1:0);
})();
