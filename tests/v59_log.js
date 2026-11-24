/* The log. Not event sourcing — the ledger already is that. This is an audit record over the
   commands that change state, and the invariant that makes it safe is asserted here twice: it is
   append-only, and nothing in the app reads it. The second is checked by deleting the whole log
   and confirming every figure in the app is byte-identical afterwards. If that ever fails, the
   log has stopped being a side record and become load-bearing. */
const {chromium}=require("playwright");
const APP="file://"+require("path").join(__dirname,"..","index.html");
const A=[];const chk=(c,n)=>A.push((c?"ok   ":"FAIL ")+n);

const INV=()=>({id:"inv1",status:"draft",provider:"Demi Art",country:"Italy",invoiceNo:"2176",
  date:"2026-11-10",due:"",currency:"EUR",rate:"1",treatment:"eu_acq",vatDefault:"0",
  freight:"50.00",freightVat:"0",duty:"",importVat:"",invoiceTotal:"241.96",note:"",
  batchRef:"",postedAt:"",lineType:"goods",freightBasis:"value",
  lines:[{id:"d",supplierRef:"R3255",code:"R3255",name:"Our Lady 14cm",qty:"2",qtyRecv:"",lineTotal:"181.36",vatRate:"0",type:""},
         {id:"e",supplierRef:"8219",code:"8219",name:"Decoration 5cm",qty:"2",qtyRecv:"",lineTotal:"10.60",vatRate:"0",type:""}]});

(async()=>{
  const b=await chromium.launch({args:["--no-sandbox"]});
  const p=await b.newPage({viewport:{width:1600,height:1100}});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.goto(APP,{waitUntil:"domcontentloaded"});await p.waitForTimeout(500);
  await p.evaluate(i=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.channels=[{id:"c1",name:"Purchase",dir:"in",mode:null,kind:null},
                {id:"c2",name:"Vektori",dir:"out",mode:"in_person",kind:"sale"}];
    s.catalogue=[];s.ledger=[];s.staging=[];s.invoices=[i];s.suppliers=[];s.log=[];
    s.diag={disp:{},hist:[]};
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));},INV());
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(650);
  const log=()=>p.evaluate(()=>(JSON.parse(localStorage.getItem("rosamystica:v1")).log||[]));

  chk((await log()).length===0,"the log starts empty");

  const openInv=async()=>{await p.getByRole("button",{name:/^Invoices/}).first().click();await p.waitForTimeout(350);
    await p.locator("tbody tr").first().click();await p.waitForTimeout(500);};
  const post=async()=>{await p.getByRole("button",{name:/Post to ledger/}).click();await p.waitForTimeout(300);
    const c=p.getByRole("button",{name:/^Post/}).last();if(await c.count())await c.click();await p.waitForTimeout(1100);};
  const unpost=async()=>{await p.getByRole("button",{name:/^Unpost/}).click();await p.waitForTimeout(300);
    await p.getByRole("button",{name:"Remove from the ledger"}).click();await p.waitForTimeout(1000);};

  await openInv();await post();
  const L1=await log();
  chk(L1.length===1,"posting writes one entry");
  const e=L1[0];
  chk(e.v==="invoice.posted","in the past tense, named for what happened");
  chk(e.s==="2176","the subject is the batch it created");
  chk(e.n===2,"n is what was written to the ledger");
  chk(e.d&&e.d.basis==="value","the freight basis is kept — it decides every landed cost under it");
  chk(e.d&&Math.abs(e.d.total-241.96)<0.01,"and what the invoice came to");
  chk(typeof e.t==="number"&&e.t>1700000000,"the timestamp is epoch seconds, not a 24-byte string");
  chk(typeof e.c==="string"&&e.c.length<=6,"and it carries a short correlation id");
  chk(!JSON.stringify(e).includes("lineTotal"),"no snapshot of the thing it describes is stored");

  await p.getByRole("button",{name:/^Staging|Unconfirmed/}).first().click();await p.waitForTimeout(450);
  await p.getByRole("button",{name:/^Confirm /}).click();await p.waitForTimeout(900);
  const L2=await log();
  chk(L2.length===2&&L2[1].v==="product.confirmed","confirming staged items is recorded");
  chk(L2[1].n===2,"with how many were confirmed");
  chk(JSON.stringify(L2[0])===JSON.stringify(L1[0]),"and the earlier entry is untouched — append only");

  await openInv();await unpost();
  const L3=await log();
  chk(L3.length===3&&L3[2].v==="invoice.unposted","unposting is recorded");
  chk(L3[2].n===2,"with how many movements went");
  chk(L3[2].s==="2176","under the same subject, so the two line up");

  /* ---------------------------------------------- the invariant: nothing reads it */
  await post();
  const same=await p.evaluate(()=>{const key="rosamystica:v1";
    const snap=()=>{const s=JSON.parse(localStorage.getItem(key));
      return JSON.stringify({inv:computeInventory(s),bat:computeBatches(s),
        tot:overviewTotals(computeBatches(s)),health:runChecks(s).findings.length});};
    const before=snap();
    const s=JSON.parse(localStorage.getItem(key));const had=(s.log||[]).length;
    s.log=[];localStorage.setItem(key,JSON.stringify(s));
    const after=snap();
    return {had,equal:before===after};});
  chk(same.had>0,"there was a log to destroy");
  chk(same.equal,"deleting the entire log moves no figure in the app — it is a side record");

  /* ------------------------------------------------------------- bounded by design */
  const cap=await p.evaluate(()=>{const key="rosamystica:v1";
    const s=JSON.parse(localStorage.getItem(key));
    s.log=[];let st2=s;
    for(let i=0;i<LOG_CAP+25;i++)st2=withLog(st2,logEntry("test.entry","S"+i,i,{a:i}));
    const bytes=JSON.stringify(st2.log).length/st2.log.length;
    return {n:st2.log.length,cap:LOG_CAP,first:st2.log[0].s,last:st2.log[st2.log.length-1].s,bytes};});
  chk(cap.n===cap.cap,"the log is capped at "+cap.cap+" entries");
  chk(cap.first==="S25","the oldest entries drop off the front");
  chk(cap.last==="S"+(cap.cap+24),"and the newest is kept");
  chk(cap.bytes<150,"an entry costs under 150 bytes ("+Math.round(cap.bytes)+")");

  /* ------------------------------------------------------- an unknown verb still shows */
  const unknown=await p.evaluate(()=>logVerb("something.weHaveNeverSeen"));
  chk(unknown==="Something weHaveNeverSeen","a verb this build has never heard of still renders");

  /* ---------------------------------------------------------------- the two views */
  await p.getByRole("button",{name:/^History/}).first().click();await p.waitForTimeout(500);
  const rows=async()=>p.locator("tr.logrow").count();
  const allRows=await rows();
  chk(allRows>=4,"the History view lists the entries");
  await p.locator('input[type="search"]').first().fill("2176");await p.waitForTimeout(400);
  const filtered=await rows();
  chk(filtered>0&&filtered<allRows,"searching a batch reference narrows it");
  await p.locator('input[type="search"]').first().fill("");await p.waitForTimeout(300);

  await openInv();
  chk(await p.getByText("What has happened to this invoice").count()===1,
      "the invoice carries its own history");
  const onInv=await p.locator("tr.logrow").count();
  chk(onInv>=3,"showing the entries filed under its batch");

  chk(errs.length===0,"no page errors"+(errs.length?" ("+errs[0]+")":""));
  await b.close();
  console.log(A.join("\n"));
  console.log((A.filter(x=>x[0]==="F").length?"FAILURES":"all ok")+" — "+A.length+" checks");
  process.exit(A.some(x=>x[0]==="F")?1:0);
})();
