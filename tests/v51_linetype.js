/* An invoice is nearly always all of one kind — a rosary supplier bills goods, a publisher bills
   books — so what a line is belongs on the invoice, with a per-line escape for the mixed one.
   Before this, every hand-entered line was goods, so a new book on a domestic invoice defaulted to
   the general rate and arrived in staging as goods. The file import already took a Type column;
   the form did not. Own print is the exception that has to keep the general rate: it is the
   printer's service fee, whatever is being printed. */
const {chromium}=require("playwright");
const APP="file://"+require("path").join(__dirname,"..","index.html");
const A=[];const chk=(c,n)=>A.push((c?"ok   ":"FAIL ")+n);
(async()=>{
  const b=await chromium.launch({args:["--no-sandbox"]});
  const p=await b.newPage({viewport:{width:1500,height:1000}});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.goto(APP,{waitUntil:"domcontentloaded"});await p.waitForTimeout(500);

  /* ---- the rules, called directly ---- */
  const L=await p.evaluate(()=>{
    const st={settings:{vatRates:{book:13.5,goods:25.5,other:0}}};
    const V=(l,inv,by)=>lineVatFor(l,inv,st,by||{});
    return {
      domGoods:defaultVatFor("domestic",st,"goods"),
      domBook:defaultVatFor("domestic",st,"book"),
      domOther:defaultVatFor("domestic",st,"other"),
      domLegacy:defaultVatFor("domestic",st),
      ownBook:defaultVatFor("own",st,"book"),
      euBook:defaultVatFor("eu_acq",st,"book"),
      tInherit:lineTypeFor({type:""},{lineType:"book"}),
      tOverride:lineTypeFor({type:"goods"},{lineType:"book"}),
      tLegacyLine:lineTypeFor({type:"goods"},{}),
      tNothing:lineTypeFor({type:""},{}),
      newLineType:blankLine().type,
      newInvType:blankInvoice({}).lineType,
      vInherit:V({vatRate:"",code:"X",type:""},{treatment:"domestic",lineType:"book",vatDefault:"13.5"}),
      vOverride:V({vatRate:"",code:"X",type:"book"},{treatment:"domestic",lineType:"goods",vatDefault:"25.5"}),
      vTyped:V({vatRate:"9",code:"X",type:"book"},{treatment:"domestic",lineType:"goods",vatDefault:"25.5"}),
      vKnown:V({vatRate:"",code:"P1",type:"goods"},{treatment:"domestic",lineType:"goods",vatDefault:"25.5"},{P1:{type:"book"}}),
      vEu:V({vatRate:"",code:"X",type:"book"},{treatment:"eu_acq",lineType:"book",vatDefault:""}),
      vLegacyInv:V({vatRate:"",code:"X",type:"goods"},{treatment:"domestic",vatDefault:"25.5"}),
    };});

  chk(L.domGoods===25.5,"domestic goods still 25,5 ("+L.domGoods+")");
  chk(L.domBook===13.5,"domestic book now 13,5 ("+L.domBook+")");
  chk(L.domOther===0,"domestic other 0 ("+L.domOther+")");
  chk(L.domLegacy===25.5,"the old two-argument call answers exactly as before ("+L.domLegacy+")");
  chk(L.ownBook===25.5,"own print keeps the general rate even for books — it is a service fee ("+L.ownBook+")");
  chk(L.euBook===0,"intra-EU is 0 whatever the line is ("+L.euBook+")");

  chk(L.tInherit==="book","an untyped line follows the invoice ("+L.tInherit+")");
  chk(L.tOverride==="goods","a typed line overrules the invoice ("+L.tOverride+")");
  chk(L.tLegacyLine==="goods","a stored line keeps the type it was saved with ("+L.tLegacyLine+")");
  chk(L.tNothing==="goods","an older invoice with no type falls back to goods ("+L.tNothing+")");
  chk(L.newLineType==="","a new line starts on (invoice), not goods ("+JSON.stringify(L.newLineType)+")");
  chk(L.newInvType==="goods","a new invoice starts on goods ("+L.newInvType+")");

  chk(L.vInherit===13.5,"a book invoice's untyped line defaults to 13,5 ("+L.vInherit+")");
  chk(L.vOverride===13.5,"one book line on a goods invoice defaults to 13,5 ("+L.vOverride+")");
  chk(L.vTyped===9,"a rate typed on the line still beats everything ("+L.vTyped+")");
  chk(L.vKnown===13.5,"a code already in the catalogue still takes that product's own rate ("+L.vKnown+")");
  chk(L.vEu===0,"line type does not put VAT on an intra-EU line ("+L.vEu+")");
  chk(L.vLegacyInv===25.5,"an invoice saved before this change is unaffected ("+L.vLegacyInv+")");

  /* ---- the form ---- */
  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.channels=[{id:"c1",name:"Purchase",dir:"in",mode:null,kind:null}];
    s.catalogue=[];s.ledger=[];s.staging=[];
    s.invoices=[{id:"inv1",status:"draft",provider:"Kotimainen",country:"Finland",invoiceNo:"LASKU-9",
      date:"2026-11-19",due:"",currency:"EUR",rate:"1",treatment:"domestic",freight:"",freightVat:"",
      duty:"",importVat:"",vatDefault:"",invoiceTotal:"20",note:"",batchRef:"",postedAt:"",lineType:"goods",
      lines:[{id:"l1",supplierRef:"",code:"KKG-901",name:"Kynttila",qty:"2",qtyRecv:"",lineTotal:"10",vatRate:"",type:""},
             {id:"l2",supplierRef:"",code:"KKG-902",name:"Rukouskirja",qty:"1",qtyRecv:"",lineTotal:"10",vatRate:"",type:""}]}];
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));});
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(700);
  await p.getByRole("button",{name:/^Invoices/}).first().click();await p.waitForTimeout(350);
  await p.locator("tbody tr").first().click();await p.waitForTimeout(600);

  /* pin the select to the div that owns the label, or an ancestor div matches and .last() lands
     on the final select on the page — which is a line's Type control */
  const selBy=lab=>p.locator('div:has(> label.lab:text-is("'+lab+'")) > select');
  const vatPh=()=>p.evaluate(()=>{for(const d of document.querySelectorAll("div")){
    const l=d.querySelector(":scope > label.lab");
    if(l&&l.textContent.trim()==="Default line VAT %"){const i=d.querySelector("input");return i?i.placeholder:null;}}return null;});
  const heads=()=>p.evaluate(()=>[...document.querySelectorAll("table th")].map(t=>t.textContent.trim()));
  const lineSels=()=>p.locator("tbody tr select");

  chk(await selBy("These lines are").count()>0,"the invoice carries a “These lines are” selector");
  chk((await heads()).includes("Type"),"the Lines table has a Type column");
  chk(await lineSels().count()===2,"each line has a Type control ("+(await lineSels().count())+")");
  /* the inherit option must not repeat a type name: "Book" beside "Book (invoice)" reads as two
     kinds of book, which is exactly how it was first written and exactly what confused the shop */
  const opts=async()=>p.evaluate(()=>[...document.querySelectorAll("tbody tr select")[0].options].map(o=>o.textContent.trim()));
  chk((await opts())[0]==="Same as invoice","the inherit option says where it comes from, not a type ("+(await opts())[0]+")");
  chk((await opts()).filter(o=>/book/i.test(o)).length===1,"only one option in the list mentions Book ("+(await opts()).join(" / ")+")");
  chk((await vatPh())==="25.5","a goods invoice defaults its lines to 25,5 ("+(await vatPh())+")");

  await selBy("These lines are").selectOption("book");await p.waitForTimeout(400);
  chk((await vatPh())==="13.5","switching the invoice to Books reseeds the default to 13,5 ("+(await vatPh())+")");
  chk((await opts())[0]==="Same as invoice","the inherit option is unchanged by the header ("+(await opts())[0]+")");

  await lineSels().nth(0).selectOption("goods");await p.waitForTimeout(400);
  const stored=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    const i=s.invoices[0];return {lt:i.lineType,l0:i.lines[0].type,l1:i.lines[1].type};});
  chk(stored.lt==="book","the invoice's choice is saved ("+stored.lt+")");
  chk(stored.l0==="goods","the overridden line is saved ("+stored.l0+")");
  chk(stored.l1==="","the other line stays on (invoice) ("+JSON.stringify(stored.l1)+")");

  /* ---- and it reaches staging ---- */
  await p.getByRole("button",{name:/Post to ledger/}).click();await p.waitForTimeout(350);
  const c=p.getByRole("button",{name:/^Post/}).last();if(await c.count())await c.click();
  await p.waitForTimeout(1200);
  const staged=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    const m={};for(const x of s.staging)m[x.code]=x.type;return m;});
  chk(staged["KKG-902"]==="book","the inherited line reaches staging as a book ("+staged["KKG-902"]+")");
  chk(staged["KKG-901"]==="goods","the overridden line reaches staging as goods ("+staged["KKG-901"]+")");

  chk(errs.length===0,"no page errors"+(errs.length?" — "+errs[0]:""));
  A.forEach(l=>console.log(l));
  await b.close();
})().catch(e=>{console.log("FAIL crashed — "+e.message);process.exit(1);});
