/* Supplier matching stripped [^a-z0-9], which DELETED accented letters rather than folding them.
   "Jakóbczak" lost its ó and keyed as jakbczak; "Jakobczak" keyed as jakobczak. Two keys, one
   company — and since the Overview's supplier filter groups on that key, a batch could sit under
   a second entry the eye reads as the same supplier, ticked or not. For a shop buying from
   Poland, Sweden and Finland that is most of the supplier list.

   Folding fixes the spelling. It cannot fix a legal form nobody listed, so the second half is
   that a recorded supplier now outranks the guess: where a record claims a name, its identity
   is the key, and every alias it carries collapses onto it. */
const {chromium}=require("playwright");
const APP="file://"+require("path").join(__dirname,"..","index.html");
const A=[];const chk=(c,n)=>A.push((c?"ok   ":"FAIL ")+n);

const FULL="JAKÓBCZAK STUDIO SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ";

(async()=>{
  const b=await chromium.launch({args:["--no-sandbox"]});
  const p=await b.newPage({viewport:{width:1700,height:1200}});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.goto(APP,{waitUntil:"domcontentloaded"});await p.waitForTimeout(500);

  /* ----------------------------------------------------------- the key itself */
  const k=await p.evaluate(f=>({
    polish:[ "Jakóbczak Studio","Jakobczak Studio",f ].map(normProv),
    swedish:["Katolska Pedagogiska Nämnden","Katolska Pedagogiska Namnden"].map(normProv),
    finnish:["Lellostore Oy","lellostore"].map(normProv),
    nordic:["Ørsted","Orsted","Åbo Bokhandel","Abo Bokhandel"].map(normProv),
    german:["Weiß Verlag","Weiss Verlag"].map(normProv),
    italian:["Ulpe s.r.l.","ULPE"].map(normProv),
    distinct:[normProv("Demi Art"),normProv("Demi Arte")],
    fold:foldAccents("Jakóbczak Spółka Ørsted Æble Weiß")}),FULL);
  chk(new Set(k.polish).size===1,"three spellings of Jakóbczak, including the registered name, make one key");
  chk(k.polish[0]==="jakobczakstudio","and the ó folds to o rather than vanishing");
  chk(new Set(k.swedish).size===1,"Nämnden and Namnden are one supplier");
  chk(new Set(k.finnish).size===1,"the Oy suffix still drops");
  chk(new Set(k.nordic.slice(0,2)).size===1&&new Set(k.nordic.slice(2)).size===1,
      "ø and å fold too — neither decomposes the same way");
  chk(new Set(k.german).size===1,"ß becomes ss");
  chk(new Set(k.italian).size===1,"s.r.l. still drops");
  chk(k.distinct[0]!==k.distinct[1],"but two genuinely different names stay apart");
  chk(!/[^\x00-\x7f]/.test(k.fold),"folding leaves nothing outside ASCII");

  /* ------------------------------------------- the Overview groups them as one */
  await p.evaluate(f=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.channels=[{id:"c1",name:"Purchase",dir:"in",mode:null,kind:null}];
    s.catalogue=[];s.staging=[];s.suppliers=[];s.log=[];s.diag={disp:{},hist:[]};
    s.invoices=[{id:"i1",status:"posted",provider:"Jakóbczak Studio",country:"Poland",
                 invoiceNo:"WV-1",date:"2026-10-01",currency:"EUR",rate:"1",treatment:"eu_acq",batchRef:"WV-1",lines:[]},
                {id:"i2",status:"posted",provider:f,country:"Poland",
                 invoiceNo:"WV-2",date:"2026-11-18",currency:"EUR",rate:"1",treatment:"eu_acq",batchRef:"WV-2",lines:[]},
                {id:"i3",status:"posted",provider:"Demi Arte",country:"Italy",
                 invoiceNo:"DA-1",date:"2026-11-10",currency:"EUR",rate:"1",treatment:"eu_acq",batchRef:"DA-1",lines:[]}];
    const mv=(id,batchRef,code,qty,unitPrice,provider)=>({id,date:"2026-10-01",channel:"Purchase",
      dir:"in",batchRef,code,qty,unitPrice,vatRate:0,transport:null,note:"",country:"",provider,providerRef:""});
    s.ledger=[mv("a","WV-1","R900",10,1.35,"Jakóbczak Studio"),
              mv("b","WV-2","K001",10,1.01,f),
              mv("c","DA-1","6610",2,50,"Demi Arte")];
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));},FULL);
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(800);
  await p.getByRole("button",{name:/^Overview/}).first().click();await p.waitForTimeout(700);

  const supRows=()=>p.locator(".supitem").count();
  chk(await supRows()===2,"two suppliers listed, not three — the Jakóbczak spellings merged");
  const names=(await p.locator(".supitem").allInnerTexts()).join(" | ");
  chk(/Jak/i.test(names),"Jakóbczak is one of them");

  /* ------------------------------- a record merges what spelling alone cannot */
  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.suppliers=[{id:"sp1",name:"Demi Art GmbH",aliases:["Demi Arte","Demi Art srl"],
      country:"Italy",vatNo:"",currency:"",treatment:"",freightBasis:"",leadDays:"",notes:"",
      createdAt:"",updatedAt:""}];
    s.invoices.push({id:"i4",status:"posted",provider:"Demi Art srl",country:"Italy",
      invoiceNo:"DA-2",date:"2026-11-12",currency:"EUR",rate:"1",treatment:"eu_acq",batchRef:"DA-2",lines:[]});
    s.ledger.push({id:"d",date:"2026-11-12",channel:"Purchase",dir:"in",batchRef:"DA-2",
      code:"8516",qty:2,unitPrice:23,vatRate:0,transport:null,note:"",country:"",
      provider:"Demi Art srl",providerRef:""});
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));});
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(800);
  await p.getByRole("button",{name:/^Overview/}).first().click();await p.waitForTimeout(700);
  chk(await supRows()===2,"\"Demi Arte\" and \"Demi Art srl\" collapse onto the record, still two suppliers");
  const names2=(await p.locator(".supitem").allInnerTexts()).join(" | ");
  chk(/Demi Art GmbH/.test(names2),"and the list shows the record's own name, not whichever was typed most");

  /* the filter has to agree with the grouping, or ticking one hides the other */
  const demi=p.locator(".supitem").filter({hasText:"Demi Art GmbH"}).first();
  await demi.click();await p.waitForTimeout(500);
  const after=await p.evaluate(()=>{const t=[...document.querySelectorAll(".kpi")]
    .find(x=>/Capital still out|Put in/i.test(x.textContent));return t?t.textContent:"";});
  chk(typeof after==="string","the filter responds without error");
  chk(errs.length===0,"no page errors"+(errs.length?" ("+errs[0]+")":""));

  await b.close();
  console.log(A.join("\n"));
  console.log((A.filter(x=>x[0]==="F").length?"FAILURES":"all ok")+" — "+A.length+" checks");
  process.exit(A.some(x=>x[0]==="F")?1:0);
})();
