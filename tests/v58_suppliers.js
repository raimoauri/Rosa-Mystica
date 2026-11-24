/* A supplier was a string, retyped on every invoice and matched at read time by normProv. Two
   health checks existed to police that. It is now a record: canonical name plus every spelling it
   answers to, its country, what it bills in, how it is taxed, how it ships, how long it takes.

   The two properties that matter: recording a supplier rewrites nothing — every string already on
   an invoice, movement or product stays where it is — and a record never overwrites something you
   typed on the invoice in front of you. */
const {chromium}=require("playwright");
const APP="file://"+require("path").join(__dirname,"..","index.html");
const A=[];const chk=(c,n)=>A.push((c?"ok   ":"FAIL ")+n);

const SEED=()=>({
  invoices:[
    {id:"i1",status:"posted",provider:"Demi Art GmbH",country:"Italy",invoiceNo:"2176",date:"2026-11-10",
     currency:"EUR",rate:"1",treatment:"eu_acq",batchRef:"2176",lines:[]},
    {id:"i2",status:"draft",provider:"demi art",country:"Italy",invoiceNo:"2180",date:"2026-11-20",
     currency:"EUR",rate:"1",treatment:"eu_acq",batchRef:"",lines:[]},
    {id:"i3",status:"draft",provider:"Katolsk Bokhandel AB",country:"Sweden",invoiceNo:"48730F",
     date:"2026-10-01",currency:"SEK",rate:"0.087",treatment:"eu_acq",batchRef:"",lines:[]}],
  catalogue:[
    {code:"A1",name:"Statue",type:"goods",supplier:"Demi Art srl",price:40,cost:null,sellable:true,stocked:true},
    {code:"A2",name:"Cross",type:"goods",supplier:"Demi-Art",price:30,cost:null,sellable:true,stocked:true},
    {code:"B1",name:"Bok",type:"book",supplier:"Katolsk Bokhandel",price:20,cost:null,sellable:true,stocked:true}]});

(async()=>{
  const b=await chromium.launch({args:["--no-sandbox"]});
  const p=await b.newPage({viewport:{width:1600,height:1100}});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.goto(APP,{waitUntil:"domcontentloaded"});await p.waitForTimeout(500);
  await p.evaluate(d=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.channels=[{id:"c1",name:"Purchase",dir:"in",mode:null,kind:null}];
    s.ledger=[];s.staging=[];s.suppliers=[];s.diag={disp:{},hist:[]};
    s.invoices=d.invoices;s.catalogue=d.catalogue;
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));},SEED());
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(650);

  /* ------------------------------------------------------------- discovery */
  const d0=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    const f=discoverSuppliers(s);
    return f.map(x=>({name:x.name,aliases:x.aliases.slice().sort(),count:x.count,
      country:x.country,currency:x.currency}));});
  chk(d0.length===2,"four spellings of two suppliers are found as two");
  const demi=d0.find(x=>/demi/i.test(x.name));
  chk(!!demi,"Demi Art is one of them");
  chk(demi.aliases.length===3,"its other three spellings become aliases");
  chk(demi.count===4,"counted across both invoices and both products");
  chk(demi.country==="Italy","the country is taken from where it is already recorded");
  const bok=d0.find(x=>/bokhandel/i.test(x.name));
  chk(bok.currency==="SEK","a supplier that bills in another currency is noticed");
  chk(demi.currency==="","one that bills in euro is not labelled with a currency");

  /* ------------------------------------------------- F10 before and after */
  const f10a=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    return runChecks(s).findings.filter(x=>x.chk==="F10").length;});
  chk(f10a===1,"F10 reports the catalogue's two spellings of Demi Art");

  await p.getByRole("button",{name:/^Suppliers/}).first().click();await p.waitForTimeout(450);
  chk(await p.getByRole("button",{name:/^Record 2 of 2/}).count()===1,"the view offers to record both");
  await p.getByRole("button",{name:/^Record 2 of 2/}).click();await p.waitForTimeout(800);

  const after=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    return {n:(s.suppliers||[]).length,
      f10:runChecks(s).findings.filter(x=>x.chk==="F10").length,
      found:discoverSuppliers(s).length,
      invoiceProviders:s.invoices.map(i=>i.provider),
      catSuppliers:s.catalogue.map(c=>c.supplier),
      lookup:["Demi Art GmbH","demi art","Demi-Art","DEMI ART  SRL"].map(x=>{
        const sp=supplierFor(s,x);return sp?sp.name:null;})};});
  chk(after.n===2,"two supplier records now exist");
  chk(after.f10===0,"F10 goes quiet — the spellings are declared, not a defect");
  chk(after.found===0,"and nothing is left to discover");
  chk(after.invoiceProviders.join("|")==="Demi Art GmbH|demi art|Katolsk Bokhandel AB",
      "every provider string on the invoices is untouched");
  chk(after.catSuppliers.join("|")==="Demi Art srl|Demi-Art|Katolsk Bokhandel",
      "and so is every supplier string on the products");
  chk(after.lookup.every(x=>x&&/demi/i.test(x)),"all four spellings resolve to the one record");

  /* --------------------------------------------- the invoice seeds from it */
  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    for(const sp of s.suppliers)if(/demi/i.test(sp.name)){
      sp.country="Italy";sp.currency="EUR";sp.treatment="eu_acq";sp.freightBasis="value";sp.leadDays=14;}
    s.invoices.push({id:"i4",status:"draft",provider:"",country:"",invoiceNo:"9000",date:"2026-11-24",
      due:"",currency:"EUR",rate:"1",treatment:"eu_acq",vatDefault:"",freight:"",freightVat:"",
      duty:"",importVat:"",invoiceTotal:"",note:"",batchRef:"",postedAt:"",lineType:"goods",lines:[]});
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));});
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(650);
  await p.getByRole("button",{name:/^Invoices/}).first().click();await p.waitForTimeout(400);
  await p.locator("tbody tr").filter({hasText:"9000"}).first().click();await p.waitForTimeout(500);

  const prov=p.locator('div:has(> label.lab:text-is("Provider")) input').first();
  await prov.fill("Demi Art GmbH");await p.waitForTimeout(400);
  const seeded=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    const i=s.invoices.find(x=>x.invoiceNo==="9000");
    return {country:i.country,basis:i.freightBasis,treatment:i.treatment};});
  chk(seeded.country==="Italy","typing a recorded supplier fills the country");
  chk(seeded.basis==="value","and its usual freight basis");
  chk(seeded.treatment==="eu_acq","and its tax treatment");
  chk(await p.locator(".meta").filter({hasText:"recorded supplier"}).count()>0,
      "the field says the supplier is a recorded one");

  /* a record must never overwrite something already typed on the invoice */
  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    const i=s.invoices.find(x=>x.invoiceNo==="9000");
    i.provider="";i.country="Vatican City";i.freightBasis="units";
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));});
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(650);
  await p.getByRole("button",{name:/^Invoices/}).first().click();await p.waitForTimeout(400);
  await p.locator("tbody tr").filter({hasText:"9000"}).first().click();await p.waitForTimeout(500);
  await p.locator('div:has(> label.lab:text-is("Provider")) input').first().fill("Demi Art GmbH");
  await p.waitForTimeout(400);
  const kept=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    const i=s.invoices.find(x=>x.invoiceNo==="9000");return {country:i.country};});
  chk(kept.country==="Vatican City","a country already keyed is left alone");

  /* --------------------------------------------------- editing and removal */
  await p.getByRole("button",{name:/^Suppliers/}).first().click();await p.waitForTimeout(450);
  await p.locator("tbody tr").filter({hasText:"Bokhandel"}).first().click();await p.waitForTimeout(450);
  const alias=p.locator('div:has(> label.lab:text-is("Also spelled")) input').first();
  await alias.fill("Katolsk Bokhandel AB, KB Stockholm");await p.waitForTimeout(150);
  await p.getByRole("button",{name:/^Save$/}).click();await p.waitForTimeout(700);
  const ed=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    const sp=s.suppliers.find(x=>/bokhandel/i.test(x.name));
    return {aliases:sp.aliases,hit:!!supplierFor(s,"KB  Stockholm")};});
  chk(ed.aliases.length===2,"aliases are stored as a list, not a string");
  chk(ed.hit,"and a newly added spelling resolves straight away");

  chk(errs.length===0,"no page errors"+(errs.length?" ("+errs[0]+")":""));
  await b.close();
  console.log(A.join("\n"));
  console.log((A.filter(x=>x[0]==="F").length?"FAILURES":"all ok")+" — "+A.length+" checks");
  process.exit(A.some(x=>x[0]==="F")?1:0);
})();
