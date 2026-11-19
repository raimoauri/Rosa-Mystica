/* Minted codes became EAN-13s in GS1's restricted-circulation space, so a barcode the shop prints
   scans like a publisher's and lives in one field across Vektori and WooCommerce. The check digit
   is the gain: KKG-114 and KKG-141 were both plausible, so a typo was a silent wrong product.

   The whole risk of this change is scope creep into validation. The shop asked for minting only:
   nothing may require the shape, nothing may reject a code typed by hand, and no code already in
   the catalogue may stop being valid. Most of what follows guards that. */
const {chromium}=require("playwright");
const APP="file://"+require("path").join(__dirname,"..","index.html");
const A=[];const chk=(c,n)=>A.push((c?"ok   ":"FAIL ")+n);
const ean13=s=>/^\d{13}$/.test(String(s));
(async()=>{
  const b=await chromium.launch({args:["--no-sandbox"]});
  const p=await b.newPage({viewport:{width:1500,height:1000}});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.goto(APP,{waitUntil:"domcontentloaded"});await p.waitForTimeout(500);

  /* ---- the arithmetic ---- */
  const M=await p.evaluate(()=>{
    const S=(cat,inv,pre)=>({settings:{rcnPrefix:pre||"20"},catalogue:cat||[],invoices:inv||[]});
    const valid=c=>{let s=0;for(let i=0;i<12;i++)s+=(+c[i])*(i%2?3:1);
      return c.length===13&&String((10-s%10)%10)===c[12];};
    return {
      /* a real EAN must reproduce its own check digit */
      knownEan:eanCheck("400638133393")==="1",
      seq1:rcnCode("20",1), seq114:rcnCode("20",114),
      longPrefix:rcnCode("020",1),
      tooLong:rcnCode("20",12345678901),
      allValid:[1,2,114,115,999999].every(n=>valid(rcnCode("20",n))),
      prefixJunk:rcnPrefixOf({settings:{rcnPrefix:"kkg"}}),
      prefixStrip:rcnPrefixOf({settings:{rcnPrefix:"2-0"}}),
      prefixMissing:rcnPrefixOf({settings:{}}),
      emptyCat:nextFreeCode(S()),
      after114:nextFreeCode(S([{code:"2000000001142"}])),
      /* the old scheme is invisible to the counter, not broken by it */
      ignoresKkg:nextFreeCode(S([{code:"KKG-114"},{code:"KKG-900"}])),
      /* a supplier EAN in the same range must not be handed out again */
      skipsTaken:nextFreeCode(S([{code:"2000000000015"}])),
      /* an unposted draft's codes are counted too */
      readsDrafts:nextFreeCode(S([],[{lines:[{code:"2000000001142"}]}])),
    };});

  chk(M.knownEan,"eanCheck reproduces a real EAN-13's own check digit");
  chk(M.seq1==="2000000000015","sequence 1 mints 2000000000015 ("+M.seq1+")");
  chk(M.seq114==="2000000001142","sequence 114 mints 2000000001142 ("+M.seq114+")");
  chk(M.longPrefix==="0200000000011"&&ean13(M.longPrefix),"a 3-digit prefix still yields 13 digits ("+M.longPrefix+")");
  chk(M.tooLong===null,"a sequence too long for the prefix mints nothing rather than a bad code");
  chk(M.allValid,"every minted code carries a correct check digit");
  chk(M.prefixJunk==="20","a non-numeric prefix falls back to 20 ("+M.prefixJunk+")");
  chk(M.prefixStrip==="20","punctuation is stripped from the prefix ("+M.prefixStrip+")");
  chk(M.prefixMissing==="20","an unset prefix defaults to 20 ("+M.prefixMissing+")");
  chk(M.emptyCat==="2000000000015","an empty catalogue starts at sequence 1 ("+M.emptyCat+")");
  chk(M.after114==="2000000001159","it counts on from the highest in use ("+M.after114+")");
  chk(M.ignoresKkg==="2000000000015","old prefix codes do not move the sequence ("+M.ignoresKkg+")");
  chk(M.skipsTaken==="2000000000022","a number already held is skipped ("+M.skipsTaken+")");
  chk(M.readsDrafts==="2000000001159","an unposted draft's codes are counted ("+M.readsDrafts+")");

  /* ---- nothing is required, nothing is rejected ---- */
  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.channels=[{id:"c1",name:"Purchase",dir:"in",mode:null,kind:null}];
    s.catalogue=[{code:"KKG-114",name:"Vanha koodi",type:"goods",cost:1,price:5,sellable:true,stocked:true}];
    s.ledger=[{id:"m1",date:"2026-01-01",channel:"Purchase",dir:"in",batchRef:"B1",code:"KKG-114",qty:3,unitPrice:1,vatRate:0,createdAt:"x"}];
    s.invoices=[{id:"i1",status:"draft",provider:"Oma",country:"Finland",invoiceNo:"OMA-1",date:"2026-11-19",
      due:"",currency:"EUR",rate:"1",treatment:"domestic",freight:"",freightVat:"",duty:"",importVat:"",
      vatDefault:"",invoiceTotal:"30",note:"",batchRef:"",postedAt:"",lineType:"goods",
      lines:[{id:"l1",supplierRef:"",code:"",name:"Uusi A",qty:"1",qtyRecv:"",lineTotal:"10",vatRate:"",type:""},
             {id:"l2",supplierRef:"",code:"",name:"Uusi B",qty:"1",qtyRecv:"",lineTotal:"10",vatRate:"",type:""},
             {id:"l3",supplierRef:"",code:"KKG-114",name:"Vanha koodi",qty:"1",qtyRecv:"",lineTotal:"10",vatRate:"",type:""}]}];
    s.staging=[];localStorage.setItem("rosamystica:v1",JSON.stringify(s));});
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(700);

  /* the existing product still opens and still saves, untouched by any format rule */
  await p.getByRole("button",{name:/^Catalogue/}).first().click();await p.waitForTimeout(350);
  await p.locator("tbody tr").first().click();await p.waitForTimeout(450);
  const saveOn=await p.getByRole("button",{name:/^Save changes$/}).isEnabled();
  chk(saveOn,"a product whose code is KKG-114 still saves — no format is demanded");
  const nextBtn=p.getByRole("button",{name:/^Next$/});
  chk(await nextBtn.count()>0,"the product editor still offers Next");
  await nextBtn.click();await p.waitForTimeout(250);
  const offered=await p.evaluate(()=>{for(const i of document.querySelectorAll("input"))
    if(/^\d{13}$/.test(i.value))return i.value;return null;});
  chk(ean13(offered),"Next offers a 13-digit code ("+offered+")");
  await p.getByRole("button",{name:/^Cancel$/}).click();await p.waitForTimeout(250);

  /* the invoice allocator */
  await p.getByRole("button",{name:/^Invoices/}).first().click();await p.waitForTimeout(350);
  await p.locator("tbody tr").first().click();await p.waitForTimeout(600);
  await p.getByRole("button",{name:/^Give our codes to/}).click();await p.waitForTimeout(500);
  const codes=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    return s.invoices[0].lines.map(l=>l.code);});
  chk(ean13(codes[0])&&ean13(codes[1]),"both blank lines were minted 13-digit codes ("+codes.slice(0,2).join(", ")+")");
  chk(codes[0]!==codes[1],"the two minted codes differ");
  chk(codes[2]==="KKG-114","a line that already had a code was left alone ("+codes[2]+")");
  chk(!codes.includes("KKG-115"),"nothing was minted in the old scheme");

  chk(errs.length===0,"no page errors"+(errs.length?" — "+errs[0]:""));
  A.forEach(l=>console.log(l));
  await b.close();
})().catch(e=>{console.log("FAIL crashed — "+e.message);process.exit(1);});
