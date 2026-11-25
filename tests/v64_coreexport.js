/* The core export listed the collections it carried by name, so every collection added after it
   was written fell out of the backup silently. Suppliers and the history log were both missing
   from real exports, and restoring one would have wiped them — replaceAll starts from a blank
   state and keeps only what the file holds.

   The fix names what to leave out instead. The test that matters is the last one: it invents a
   collection this build has never heard of and checks it survives a round trip, because that is
   the failure mode, not the two collections we already know about. */
const {chromium}=require("playwright");
const APP="file://"+require("path").join(__dirname,"..","index.html");
const A=[];const chk=(c,n)=>A.push((c?"ok   ":"FAIL ")+n);

(async()=>{
  const b=await chromium.launch({args:["--no-sandbox"]});
  const p=await b.newPage({viewport:{width:1500,height:950}});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.goto(APP,{waitUntil:"domcontentloaded"});await p.waitForTimeout(500);

  const r=await p.evaluate(()=>{
    const s=migrate(blankState());
    s.catalogue=[{code:"A1",name:"Book",type:"book",price:10,cost:null,sellable:true,stocked:true,supplier:"St Pauls"}];
    s.ledger=[{id:"m1",date:"2026-11-01",channel:"Purchase",dir:"in",batchRef:"B1",code:"A1",
               qty:5,unitPrice:4,vatRate:0,note:"",country:"",provider:"St Pauls",providerRef:""}];
    s.invoices=[{id:"i1",status:"posted",provider:"St Pauls",invoiceNo:"X1",batchRef:"B1",
                 date:"2026-11-01",currency:"EUR",rate:"1",treatment:"import",lines:[]}];
    s.suppliers=[{id:"sp1",name:"St Pauls",aliases:["St. Pauls","ST PAULS"],country:"India",
                  vatNo:"",currency:"",treatment:"import",freightBasis:"value",leadDays:30,
                  notes:"",createdAt:"",updatedAt:""}];
    s.log=[logEntry("invoice.posted","B1",1,{no:"X1"})];
    s.diag={disp:{"F4:a1":{d:"accepted",note:"inherited stock"}},hist:[{t:1,v:30}]};
    s.order={lines:{a1:"12"}};
    s.count={lines:{a1:"4"}};
    /* a collection no build has ever seen: the real test of the rule */
    s.futureThing=[{id:"z",what:"invented by the next version"}];

    const core=makeCore(s);
    const keys=Object.keys(core.data).sort();
    const back=migrate(Object.assign({},blankState(),readCore(core)));
    return {keys,
      hasSuppliers:(back.suppliers||[]).length,
      alias:(back.suppliers[0]||{}).aliases,
      basis:(back.suppliers[0]||{}).freightBasis,
      hasLog:(back.log||[]).length,
      logVerb:(back.log[0]||{}).v,
      disp:Object.keys(back.diag&&back.diag.disp||{}).length,
      hist:((back.diag||{}).hist||[]).length,
      order:(back.order&&back.order.lines&&back.order.lines.a1)||null,
      count:(back.count&&back.count.lines&&back.count.lines.a1)||null,
      future:(back.futureThing||[]).length,
      cat:(back.catalogue||[]).length,led:(back.ledger||[]).length,
      inv:(back.invoices||[]).length,
      noSchemaInData:core.data.schema===undefined,
      envelope:[core.app,core.kind,core.schema!=null,!!core.savedAt]};});

  chk(r.cat===1&&r.led===1&&r.inv===1,"the collections that always worked still do");
  chk(r.hasSuppliers===1,"supplier records survive the round trip");
  chk(Array.isArray(r.alias)&&r.alias.length===2,"with their aliases, which are what stop F10 firing");
  chk(r.basis==="value","and their defaults, which seed the next invoice");
  chk(r.hasLog===1&&r.logVerb==="invoice.posted","the history log survives");
  chk(r.disp===1,"dismissed health findings survive — otherwise they all come back on restore");
  chk(r.hist===1,"and the health meter's own history");
  chk(r.order==="12","a reorder draft survives");
  chk(r.count==="4","and a stock count in progress");
  chk(r.future===1,"a collection this build has never heard of survives — the rule, not the list");
  chk(r.noSchemaInData,"schema is not duplicated into the payload; migrate sets it");
  chk(r.envelope[0]&&r.envelope[1]==="core"&&r.envelope[2]&&r.envelope[3],
      "the envelope still carries app, kind, schema and savedAt");
  chk(r.keys.indexOf("settings")>=0&&r.keys.indexOf("channels")>=0,
      "settings and channels are in there too ("+r.keys.length+" keys)");

  chk(errs.length===0,"no page errors"+(errs.length?" ("+errs[0]+")":""));
  await b.close();
  console.log(A.join("\n"));
  console.log((A.filter(x=>x[0]==="F").length?"FAILURES":"all ok")+" — "+A.length+" checks");
  process.exit(A.some(x=>x[0]==="F")?1:0);
})();
