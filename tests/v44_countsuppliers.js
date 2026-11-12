/* The stock count's supplier filter. Three ways it used to hide a shelf, all from the same
   place: it read only the catalogue's Supplier field, compared it as an exact string, and kept
   one supplier per normalised product code. */
const {chromium}=require("playwright");
const APP="file://"+require("path").join(__dirname,"..","index.html");
const A=[];const chk=(c,n)=>A.push((c?"ok   ":"FAIL ")+n);
(async()=>{
  const b=await chromium.launch({args:["--no-sandbox"]});
  const p=await b.newPage({viewport:{width:1600,height:1000}});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.goto(APP,{waitUntil:"domcontentloaded"});await p.waitForTimeout(500);

  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.channels=[{id:"c1",name:"Purchase",dir:"in",mode:null,kind:null}];
    const P=(c,n,sup)=>({code:c,name:n,type:"book",supplier:sup,supplierRef:"",cost:9,price:29,
      sellable:true,stocked:true});
    s.catalogue=[
      P("KKG-300","Bought from Gaudeamus",""),        /* record has no supplier; the invoice does */
      P("KKG-301","Plain St Pauls","St Pauls"),
      P("KKG-302","Non-breaking space","St Pauls"),
      P("KKG-303","Full stop","St. Pauls"),
      P("KKG-304","Legal suffix","St Pauls, Ltd"),
      P("978-93-92340-84-0","Hyphenated code","St Pauls"),
      P("9789392340840","Same code unhyphenated","Gaudeamus")];
    s.ledger=s.catalogue.map((c,i)=>({id:"m"+i,date:"2026-08-01",channel:"Purchase",dir:"in",
      batchRef:i===0?"GAU-1":"B-"+i,code:c.code,qty:5,unitPrice:9,vatRate:0,
      provider:i===0?"Gaudeamus":"St Pauls",providerRef:"R"+i,createdAt:"x"}));
    s.staging=[];localStorage.setItem("rosamystica:v1",JSON.stringify(s));});
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(700);

  await p.getByRole("button",{name:/^Inventory/}).first().click();await p.waitForTimeout(300);
  await p.getByRole("button",{name:/^Count/}).first().click();await p.waitForTimeout(500);
  const sel=p.locator("select").filter({hasText:/All suppliers/}).first();
  const labels=await sel.locator("option").allTextContents();
  const shown=async()=>p.evaluate(()=>[...document.querySelectorAll("tbody tr")].map(t=>(t.querySelector("td")||{}).textContent||"").map(x=>x.trim()).filter(Boolean));

  /* 1 — a supplier that only the invoices name */
  chk(labels.some(l=>/^Gaudeamus/.test(l)),
      "a supplier named only on the invoices reaches the list ("+labels.join(" · ")+")");
  /* 2 — one entry per supplier, not per spelling */
  const sp=labels.filter(l=>/Pauls/.test(l));
  chk(sp.length===1,"four spellings of St Pauls collapse to one entry ("+sp.join(" | ")+")");
  chk(/4 spellings/.test(sp[0]),"and it says how many spellings it covers, rather than hiding the mess");

  await sel.selectOption({index:labels.findIndex(l=>/Pauls/.test(l))});await p.waitForTimeout(500);
  let c=await shown();
  chk(c.length===5,"picking it shows every St Pauls product whatever the spelling ("+c.length+")");
  for(const code of ["KKG-301","KKG-302","KKG-303","KKG-304"])
    chk(c.indexOf(code)>=0,"  including "+code);
  /* 3 — two codes that normalise alike no longer share one supplier */
  chk(c.indexOf("978-93-92340-84-0")>=0,
      "the hyphenated code keeps its own supplier instead of borrowing its twin's");
  chk(c.indexOf("9789392340840")<0,"and its unhyphenated twin, bought elsewhere, stays out of the list");

  await sel.selectOption({index:labels.findIndex(l=>/^Gaudeamus/.test(l))});await p.waitForTimeout(500);
  c=await shown();
  chk(c.indexOf("KKG-300")>=0,"Gaudeamus shows the product its invoice delivered");
  chk(c.indexOf("9789392340840")>=0,"and the unhyphenated twin, which really is theirs");
  chk(c.length===2,"and nothing else ("+c.join(", ")+")");

  chk(errs.length===0,"no page errors"+(errs.length?": "+errs[0]:""));
  console.log(A.join("\n"));
  console.log("\n"+A.filter(x=>x.startsWith("ok")).length+"/"+A.length+" passed");
  await b.close();process.exit(A.some(x=>x.startsWith("FAIL"))?1:0);
})();
