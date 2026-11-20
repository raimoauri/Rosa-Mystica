/* The health page is nineteen invariants over the shop's own data, in two tiers divided by one
   rule: a minor check's every possible hit is unambiguously wrong, so it can run on every load and
   show in the rail. A full check needs judgement, so it waits to be read.

   Two things are load-bearing and tested hardest. First, nothing on the page may write to the
   ledger, catalogue or invoices — a diagnostic that repairs turns one bad row into a hundred.
   Second, "accepted" and "pending" must stay distinct: accepted means a document will never
   exist, pending means it is still owed. Collapsing them would hide the inherited-stock backlog
   inside the list of exceptions, which is the one outcome that makes the page useless. */
const {chromium}=require("playwright");
const APP="file://"+require("path").join(__dirname,"..","index.html");
const A=[];const chk=(c,n)=>A.push((c?"ok   ":"FAIL ")+n);
(async()=>{
  const b=await chromium.launch({args:["--no-sandbox"]});
  const p=await b.newPage({viewport:{width:1500,height:1000}});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.goto(APP,{waitUntil:"domcontentloaded"});await p.waitForTimeout(500);

  /* ---- a clean store fires nothing ---- */
  const clean=await p.evaluate(()=>{
    const st={schema:4,settings:{vatRates:{book:13.5,goods:25.5,other:0},rcnPrefix:"02",lastExport:new Date().toISOString()},
      channels:[{id:"c1",name:"Purchase",dir:"in",mode:null,kind:null}],
      catalogue:[{code:"0200000000011",name:"Kirja",type:"book",supplier:"Kustantaja",supplierRef:"K-1",cost:5,price:20,sellable:true,stocked:true}],
      ledger:[{id:"m1",date:"2026-01-02",channel:"Purchase",dir:"in",batchRef:"FA-1",code:"0200000000011",qty:10,unitPrice:5,vatRate:0,provider:"Kustantaja",createdAt:"x"}],
      invoices:[{id:"i1",status:"posted",provider:"Kustantaja",invoiceNo:"FA-1",batchRef:"FA-1",date:"2026-01-02",postedAt:"2026-01-02",treatment:"eu_acq",lines:[],invoiceTotal:""}],
      staging:[],finance:[],postage:[],count:{lines:{}},order:{lines:{}},diag:{disp:{},hist:[]}};
    const r=runChecks(st);
    return {minor:r.findings.filter(f=>f.tier==="minor").length,
            full:r.findings.filter(f=>f.tier==="full").length,
            meter:r.meter, count:healthCount(st)};});
  chk(clean.minor===0,"a sound store raises no structural finding ("+clean.minor+")");
  chk(clean.count===0,"so the rail badge is zero and the page stays invisible ("+clean.count+")");
  chk(clean.meter.docB===1&&clean.meter.totB===1,"its one batch counts as documented ("+clean.meter.docB+"/"+clean.meter.totB+")");

  /* ---- one deliberate fault per check ---- */
  const hits=await p.evaluate(()=>{
    const base=()=>({schema:4,settings:{vatRates:{book:13.5,goods:25.5,other:0},rcnPrefix:"02",lastExport:new Date().toISOString()},
      channels:[{id:"c1",name:"Purchase",dir:"in",mode:null,kind:null},{id:"c2",name:"Till",dir:"out",mode:"in_person",kind:"sale"}],
      catalogue:[],ledger:[],invoices:[],staging:[],finance:[],postage:[],count:{lines:{}},order:{lines:{}},diag:{disp:{},hist:[]}});
    const prod=(o)=>Object.assign({code:"P",name:"N",type:"goods",supplier:"",supplierRef:"",cost:null,price:null,sellable:true,stocked:true},o);
    const mv=(o)=>Object.assign({id:"m"+Math.random(),date:"2026-02-02",channel:"Purchase",dir:"in",batchRef:"B1",code:"P",qty:1,unitPrice:1,vatRate:0,createdAt:"x"},o);
    const ran=st=>{const m={};for(const f of runChecks(st).findings)m[f.chk]=(m[f.chk]||0)+1;return m;};
    const out={};

    {const s=base();s.ledger=[mv({code:"GHOST"})];out.M1=ran(s).M1;}
    {const s=base();s.invoices=[{id:"i",status:"draft",invoiceNo:"X",lines:[{id:"l",code:"GHOST",qty:"1",lineTotal:"1"}]}];out.M2=ran(s).M2;}
    {const s=base();s.catalogue=[prod({code:"A-1"}),prod({code:"A.1"})];out.M3=ran(s).M3;}
    {const s=base();s.catalogue=[prod({code:"X1",supplier:"MRP Oy",supplierRef:"R-9"}),prod({code:"X2",supplier:"mrp",supplierRef:"R9"})];out.M4=ran(s).M4;}
    {const s=base();s.invoices=[{id:"i",status:"posted",invoiceNo:"FA-9",batchRef:"FA-9",postedAt:"2026-02-02",lines:[]}];out.M5=ran(s).M5;}
    {const s=base();s.catalogue=[prod({code:"P"})];s.staging=[{code:"P",name:"N",type:"goods"}];out.M6=ran(s).M6;}
    {const s=base();s.catalogue=[prod({code:"P"})];
     s.ledger=[mv({qty:1}),mv({dir:"out",channel:"Till",qty:5,batchRef:"S1",unitPrice:9})];out.M7=ran(s).M7;}
    {const s=base();s.catalogue=[prod({code:"0200000000019"})];out.M8=ran(s).M8;}
    {const s=base();s.settings.lastExport="";out.M9_never=ran(s).M9;
     const t=base();t.settings.lastExport="2020-01-01T00:00:00.000Z";out.M9_stale=ran(t).M9;}

    {const s=base();s.catalogue=[prod({code:"P"})];s.ledger=[mv({batchRef:"OPENING"})];const r=runChecks(s);
     out.F1=r.findings.filter(f=>f.chk==="F1").length;out.F1meter=r.meter;}
    {const s=base();s.catalogue=[prod({code:"P"})];s.ledger=[mv({batchRef:"FA-2",qty:5,unitPrice:10})];  /* 5 in the ledger against 1 on the line */
     s.invoices=[{id:"i",status:"posted",invoiceNo:"FA-2",batchRef:"FA-2",postedAt:"x",treatment:"eu_acq",
       invoiceTotal:"999",lines:[{id:"l",code:"P",qty:"1",qtyRecv:"",lineTotal:"10",vatRate:"0",type:"goods"}]}];
     const m=ran(s);out.F2=m.F2;out.F3=m.F3;}
    {const s=base();s.catalogue=[prod({code:"P",cost:100})];s.ledger=[mv({unitPrice:1})];out.F4=ran(s).F4;}
    {const s=base();s.catalogue=[prod({code:"P"})];s.ledger=[mv({unitPrice:0,qty:4})];out.F5=ran(s).F5;}
    {const s=base();s.catalogue=[prod({code:"P",sellable:true,price:null})];out.F6=ran(s).F6;}
    {const s=base();s.catalogue=[prod({code:"P",price:1,sellable:true})];s.ledger=[mv({unitPrice:50})];out.F7=ran(s).F7;}
    {const s=base();s.catalogue=[prod({code:"A",name:"Sama nimi"}),prod({code:"B",name:"sama  nimi"})];out.F8=ran(s).F8;}
    {const s=base();s.catalogue=[prod({code:"P",type:"book"})];
     s.invoices=[{id:"i",status:"draft",invoiceNo:"D",treatment:"domestic",lines:[{id:"l",code:"P",qty:"1",lineTotal:"10",vatRate:"25.5",type:""}]}];out.F9=ran(s).F9;}
    {const s=base();s.catalogue=[prod({code:"A",supplier:"Lellostore Oy"}),prod({code:"B",supplier:"lellostore"})];out.F10=ran(s).F10;}
    return out;});

  const want=[["M1","a ledger row whose code nothing knows"],["M2","an invoice line whose code nothing knows"],
    ["M3","two codes that normalise alike"],["M4","one supplier reference on two products"],
    ["M5","a posted invoice with nothing in the ledger"],["M6","a staged item already catalogued"],
    ["M7","negative stock on hand"],["M8","a minted code with a broken check digit"],
    ["F1","a batch with no document"],["F2","a posted invoice that no longer reconciles"],
    ["F3","posted quantities disagreeing with the ledger"],["F4","catalogue cost far from landed"],
    ["F5","a lot received at no cost"],["F6","sellable with no price"],["F7","priced below landed cost"],
    ["F8","one name under two codes"],["F9","purchase VAT against the product's type"],
    ["F10","a supplier spelled two ways"]];
  for(const [k,label] of want)chk(hits[k]===1,k+" fires on "+label+" ("+hits[k]+")");
  chk(hits.M9_never===1,"M9 fires when no core file was ever exported ("+hits.M9_never+")");
  chk(hits.M9_stale===1,"M9 fires on a stale export ("+hits.M9_stale+")");
  chk(hits.F1meter.docB===0&&hits.F1meter.totB===1,"the meter counts an undocumented batch ("+hits.F1meter.docB+"/"+hits.F1meter.totB+")");

  /* ---- the page itself: invisible when clean, and it must not write ---- */
  const seed=async()=>{await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.channels=[{id:"c1",name:"Purchase",dir:"in",mode:null,kind:null}];
    s.catalogue=[{code:"KKG-1",name:"Peritty",type:"goods",cost:2,price:9,sellable:true,stocked:true}];
    s.ledger=[{id:"m1",date:"2026-01-02",channel:"Purchase",dir:"in",batchRef:"OPENING",code:"KKG-1",qty:5,unitPrice:2,vatRate:0,createdAt:"x"},
              {id:"m2",date:"2026-01-03",channel:"Purchase",dir:"in",batchRef:"B-GHOST",code:"EI-MITAAN",qty:1,unitPrice:1,vatRate:0,createdAt:"x"}];
    s.invoices=[];s.staging=[];s.diag={disp:{},hist:[]};
    s.settings.lastExport=new Date().toISOString();  /* isolate M1: a fresh export silences M9 */
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));});
    await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(800);};
  await seed();

  const railBadge=async()=>p.evaluate(()=>{for(const b of document.querySelectorAll(".navitem"))
    if(/Health/.test(b.textContent)){const c=b.querySelector(".count");return c?c.textContent.trim():null;}return "no-tab";});
  chk(await railBadge()==="1","the rail shows one structural finding ("+(await railBadge())+")");

  const snap=async()=>p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    return JSON.stringify({c:s.catalogue,l:s.ledger,i:s.invoices,g:s.staging});});
  const before=await snap();
  await p.getByRole("button",{name:/^Health/}).first().click();await p.waitForTimeout(600);
  chk(/Needs attention/.test(await p.content()),"the page lists what needs attention");
  chk(/0 \/ 1|0 \/ 2/.test(await p.content()),"the meter shows no batch documented yet");

  await p.getByRole("button",{name:/^Pending$/}).first().click();await p.waitForTimeout(350);
  const afterPending=await p.evaluate(()=>{const d=JSON.parse(localStorage.getItem("rosamystica:v1")).diag.disp;
    const k=Object.keys(d)[0];return k?{k,d:d[k].d}:null;});
  chk(afterPending&&afterPending.d==="pending","Pending is stored as its own disposition ("+JSON.stringify(afterPending)+")");
  chk(await railBadge()==="1","a pending finding is still counted — it is work, not an exception ("+(await railBadge())+")");

  await p.getByRole("button",{name:/^Accept$/}).first().click();await p.waitForTimeout(400);
  chk(await railBadge()===null,"accepting it clears the badge, so the rail goes quiet ("+JSON.stringify(await railBadge())+")");
  const accd=await p.evaluate(()=>{const d=JSON.parse(localStorage.getItem("rosamystica:v1")).diag.disp;
    return Object.values(d).map(x=>x.d);});
  chk(accd.includes("accepted"),"and accepted is stored distinctly from pending ("+accd.join(",")+")");

  chk(await snap()===before,"nothing on the page touched the catalogue, ledger, invoices or staging");

  const hist=await p.evaluate(()=>JSON.parse(localStorage.getItem("rosamystica:v1")).diag.hist);
  chk(hist.length===1&&hist[0].totB>0,"one progress point was recorded for today ("+JSON.stringify(hist)+")");

  chk(errs.length===0,"no page errors"+(errs.length?" — "+errs[0]:""));
  A.forEach(l=>console.log(l));
  await b.close();
})().catch(e=>{console.log("FAIL crashed — "+e.message);process.exit(1);});
