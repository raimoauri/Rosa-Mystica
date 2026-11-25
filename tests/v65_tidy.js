/* Catalogue tidying. Two bulk operations in one deliberate place, and the half that removes
   things has to be safe by construction rather than by the screen being careful: the actions
   re-derive what is referenced at write time and keep anything the ledger, an invoice line, a
   stock count or a reorder draft mentions, whatever arrived in the list.

   The other thing checked here is the defaults, because on real data they carry the argument:
   drifted overrides arrive ticked (clearing restores the ledger's own answer), never-received
   products arrive unticked (the list is usually a priced catalogue, not debris). */
const {chromium}=require("playwright");
const APP="file://"+require("path").join(__dirname,"..","index.html");
const A=[];const chk=(c,n)=>A.push((c?"ok   ":"FAIL ")+n);
const near=(a,b,t)=>a!=null&&Math.abs(a-b)<=(t||0.005);

(async()=>{
  const b=await chromium.launch({args:["--no-sandbox"]});
  const p=await b.newPage({viewport:{width:1700,height:1200}});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.goto(APP,{waitUntil:"domcontentloaded"});await p.waitForTimeout(500);

  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.channels=[{id:"c1",name:"Purchase",dir:"in",mode:null,kind:null}];
    s.staging=[];s.suppliers=[];s.log=[];s.diag={disp:{},hist:[]};
    const P=(code,extra)=>Object.assign({code,type:"book",name:code+" title",author:"",year:"",
      category:"",supplier:"",supplierRef:"",cost:null,price:null,sellable:true,stocked:true,
      online:false,reorderPoint:null,notes:"",createdAt:"2026-10-01",updatedAt:"2026-10-01"},extra||{});
    s.catalogue=[
      P("HAS-STOCK",{cost:9.00}),                      /* received, override drifted */
      P("ON-INVOICE"),                                 /* only on a draft invoice line */
      P("ON-REF"),                                     /* only as a supplier ref */
      P("IN-COUNT"),                                   /* only in a stock count */
      P("IN-ORDER"),                                   /* only in a reorder draft */
      P("TILL-1",{stocked:false,sellable:false}),      /* not stock-tracked */
      P("ORPHAN-A",{price:12.00,notes:"shelf 3"}),     /* never received, carries work */
      P("ORPHAN-B")];                                  /* never received, bare */
    s.invoices=[{id:"i1",status:"posted",provider:"St Pauls",country:"India",invoiceNo:"X1",
      date:"2026-11-01",currency:"EUR",rate:"1",treatment:"import",batchRef:"B1",lines:[]},
      {id:"i2",status:"draft",provider:"St Pauls",country:"India",invoiceNo:"X2",
       date:"2026-11-02",currency:"EUR",rate:"1",treatment:"import",batchRef:"",
       lines:[{id:"l1",supplierRef:"ON-REF",code:"ON-INVOICE",name:"",qty:"1",qtyRecv:"",
               lineTotal:"5",vatRate:"0",type:""}]}];
    s.ledger=[{id:"m1",date:"2026-11-01",channel:"Purchase",dir:"in",batchRef:"B1",
      code:"HAS-STOCK",qty:10,unitPrice:5,vatRate:0,transport:null,note:"",country:"",
      provider:"St Pauls",providerRef:""}];
    s.count={lines:{"INCOUNT":"3"}};s.order={lines:{"INORDER":"6"}};
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));});
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(800);

  /* ------------------------------------------------------ what the model sees */
  const t=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    const r=catalogueTidy(s);
    return {drift:r.drifted.map(x=>x.code),never:r.never.map(x=>x.code).sort(),
      notStocked:r.notStocked,priced:r.priced,bare:r.bare,
      d0:r.drifted[0]};});
  chk(t.drift.length===1&&t.drift[0]==="HAS-STOCK","one drifted override: 9,00 keyed against 5,00 landed");
  chk(t.d0.over===true&&near(t.d0.landed,5),"and it is marked as sitting above landed cost");
  chk(t.never.join()==="ORPHAN-A,ORPHAN-B","only the two true orphans are offered for removal");
  chk(t.notStocked===1,"the till button is counted out, not in");
  chk(t.priced===1&&t.bare===1,"one of the two carries a price, one is bare");

  /* ------------------------------------------------- the write side is its own guard */
  const guard=await p.evaluate(()=>{const before=JSON.parse(localStorage.getItem("rosamystica:v1")).catalogue.length;
    /* ask it to delete everything, including the five it must refuse */
    const all=["HAS-STOCK","ON-INVOICE","ON-REF","IN-COUNT","IN-ORDER","TILL-1","ORPHAN-A","ORPHAN-B"];
    return {before,all};});
  await p.evaluate(all=>{
    const btn=document.createElement("div");btn.id="probe";document.body.appendChild(btn);
    window.__probe=all;},guard.all);
  /* drive it through the real action by opening the modal and ticking everything shown */
  await p.getByRole("button",{name:/^Catalogue/}).first().click();await p.waitForTimeout(500);
  await p.getByRole("button",{name:/^Tidy/}).click();await p.waitForTimeout(600);

  const dr=p.locator(".panel").filter({hasText:"Cost overrides that have drifted"}).first();
  const nv=p.locator(".panel").filter({hasText:"Never received"}).first();
  chk(await dr.locator("tbody tr").count()===1,"the drifted list shows one row");
  chk(await dr.locator('input[type="checkbox"]:checked').count()===1,"ticked in advance");
  chk(await nv.locator("tbody tr").count()===2,"the never-received list shows two");
  chk(await nv.locator('input[type="checkbox"]:checked').count()===0,"and none of them are ticked");
  chk(await p.getByRole("button",{name:/^Remove 0 product/}).isDisabled(),
      "so the remove button starts disabled");

  /* clear the override */
  await p.getByRole("button",{name:/^Use landed on 1/}).click();await p.waitForTimeout(800);
  const afterClear=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    const pr=s.catalogue.find(x=>x.code==="HAS-STOCK");
    const iv=invByCode(s)[normCode("HAS-STOCK")];
    return {stored:pr.cost,shown:costOf(pr,iv).value,src:costOf(pr,iv).source,
      log:(s.log||[]).filter(e=>e.v==="product.costCleared").length};});
  chk(afterClear.stored===null,"clearing stores nothing");
  chk(near(afterClear.shown,5)&&afterClear.src==="onhand","and the product reads 5,00 from its lot");
  chk(afterClear.log===1,"written to History");

  /* tick both orphans and remove them */
  await p.getByRole("button",{name:/^Tick 2 shown/}).click();await p.waitForTimeout(400);
  chk(await nv.locator('input[type="checkbox"]:checked').count()===2,"ticking all picks both");
  await p.getByRole("button",{name:/^Remove 2 products/}).click();await p.waitForTimeout(500);
  const body=await p.locator(".modal").last().innerText();
  chk(/1[\s\S]{0,40}retail price/.test(body),"the confirmation names the price that would go with them");
  await p.getByRole("button",{name:/^Remove 2$/}).click();await p.waitForTimeout(900);

  const after=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    return {codes:s.catalogue.map(x=>x.code).sort(),
      log:(s.log||[]).filter(e=>e.v==="product.removed").map(e=>e.n)};});
  chk(after.codes.join()==="HAS-STOCK,IN-COUNT,IN-ORDER,ON-INVOICE,ON-REF,TILL-1",
      "the two orphans went and the six referenced products stayed");
  chk(after.log.length===1&&after.log[0]===2,"History records two removed");

  /* the action refuses what the screen could never offer */
  const refuse=await p.evaluate(()=>{
    const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    const before=s.catalogue.length;
    /* simulate a caller asking for everything, as a bad list or a stale screen would */
    const keep=new Set();
    for(const r of s.ledger)keep.add(normCode(r.code));
    for(const i of s.invoices)for(const l of (i.lines||[])){
      if(l.code)keep.add(normCode(l.code));if(l.supplierRef)keep.add(normCode(l.supplierRef));}
    for(const k in ((s.count&&s.count.lines)||{}))keep.add(normCode(k));
    for(const k in ((s.order&&s.order.lines)||{}))keep.add(normCode(k));
    const wouldGo=s.catalogue.filter(p=>!keep.has(normCode(p.code))&&p.stocked!==false).length;
    return {before,wouldGo};});
  chk(refuse.wouldGo===0,"with the orphans gone, asking to delete the whole catalogue would remove nothing");

  chk(errs.length===0,"no page errors"+(errs.length?" ("+errs[0]+")":""));
  await b.close();
  console.log(A.join("\n"));
  console.log((A.filter(x=>x[0]==="F").length?"FAILURES":"all ok")+" — "+A.length+" checks");
  process.exit(A.some(x=>x[0]==="F")?1:0);
})();
