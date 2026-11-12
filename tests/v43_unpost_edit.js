/* Correcting an old, fully logged invoice: unpost, edit the line, post again — on a batch whose
   stock has since partly sold, and whose products were long ago confirmed into the catalogue.
   This is the supported route; re-importing an edited copy instead leaves the original movements
   in place and posts the edited line on top of them, which is checked at the end. */
const {chromium}=require("playwright");
const APP="file://"+require("path").join(__dirname,"..","index.html");
const A=[];const chk=(c,n)=>A.push((c?"ok   ":"FAIL ")+n);
const near=(a,b,t)=>a!=null&&Math.abs(a-b)<=(t||0.005);
const INV=()=>({id:"inv1",status:"draft",provider:"St Pauls",country:"India",invoiceNo:"2310000034",
  date:"2026-09-09",due:"",currency:"EUR",rate:"1",treatment:"import",vatDefault:"0",
  freight:"0",freightVat:"0",duty:"",importVat:"",invoiceTotal:"146.25",note:"",batchRef:"",postedAt:"",
  lines:[{id:"a",supplierRef:"9780895550972",code:"9780895550972",name:"The Agony of Jesus",qty:"5",qtyRecv:"",lineTotal:"22.75",vatRate:"0",type:"book"},
         {id:"b",supplierRef:"9788119597260",code:"9788119597260",name:"Holy Bible",qty:"10",qtyRecv:"",lineTotal:"123.50",vatRate:"0",type:"book"}]});
(async()=>{
  const b=await chromium.launch({args:["--no-sandbox"]});
  const p=await b.newPage({viewport:{width:1600,height:1000}});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.goto(APP,{waitUntil:"domcontentloaded"});await p.waitForTimeout(500);
  await p.evaluate(i=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.channels=[{id:"c1",name:"Purchase",dir:"in",mode:null,kind:null},
                {id:"c2",name:"Vektori",dir:"out",mode:"in_person",kind:"sale"}];
    s.catalogue=[];s.ledger=[];s.staging=[];s.invoices=[i];
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));},INV());
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(650);

  const openInv=async()=>{await p.getByRole("button",{name:/^Invoices/}).first().click();await p.waitForTimeout(350);
    await p.locator("tbody tr").first().click();await p.waitForTimeout(500);};
  const post=async()=>{await p.getByRole("button",{name:/Post to ledger/}).click();await p.waitForTimeout(300);
    const c=p.getByRole("button",{name:/^Post/}).last();if(await c.count())await c.click();await p.waitForTimeout(1100);};
  const state=()=>p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    const inv=computeInventory(s);const m={};for(const r of inv)m[r.code]={recv:r.received,sold:r.sold,
      onHand:r.onHand,cost:r.unitCost,unmatched:r.unmatched,profit:r.realProfit};
    return {moves:s.ledger.length,inv:m,cat:s.catalogue.map(x=>x.code),staging:s.staging.map(x=>x.code),
      status:s.invoices[0].status,lines:s.invoices[0].lines.map(l=>l.code),invoices:s.invoices.length};});

  await openInv();await post();
  await p.getByRole("button",{name:/^Staging|Unconfirmed/}).first().click();await p.waitForTimeout(400);
  await p.getByRole("button",{name:/Confirm all/}).click();await p.waitForTimeout(800);
  /* the stock then sells, months later — this is what makes it an "old, fully logged" invoice */
  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.ledger.push({id:"s1",date:"2026-10-20",channel:"Vektori",dir:"out",batchRef:"V1",code:"9788119597260",
      qty:6,unitPrice:24.9,createdAt:"x"});
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));});
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(650);

  let st=await state();
  const bible0=st.inv["9788119597260"];
  chk(st.moves===3&&st.cat.length===2,"starting point: invoice posted, products confirmed, six sold");
  chk(bible0.sold===6&&bible0.onHand===4,"the Bible is 10 in, 6 out, 4 on hand");
  chk(near(bible0.cost,12.35),"costed at 12,35 landed ("+bible0.cost+")");
  const profit0=bible0.profit;

  /* ---- unpost ---- */
  await openInv();
  await p.getByRole("button",{name:/Unpost…/}).click();await p.waitForTimeout(350);
  await p.getByRole("button",{name:/Remove from the ledger/}).click();await p.waitForTimeout(1100);
  st=await state();
  chk(st.moves===1,"unpost removes only this batch's movements — the sale stays ("+st.moves+")");
  chk(st.status==="draft","the invoice returns to draft");
  chk(st.lines.join(",")==="9780895550972,9788119597260","with its lines and codes intact, ready to edit");
  chk(st.cat.length===2,"the catalogue products it created months ago REMAIN — unposting does not delete products");
  chk(st.inv["9788119597260"].unmatched===6,
      "meanwhile the sale has no lot to draw on, so six units read as uncosted — expected, and it heals on reposting");
  chk(st.inv["9788119597260"].onHand===-6,"and stock reads -6 in the gap between unpost and post");

  /* ---- edit the code, then post ---- */
  await openInv();
  const codeCell=i=>p.locator(".content tbody tr").nth(i).locator('input.mono').nth(1);
  await codeCell(1).fill("KKG-BIBLE");await p.waitForTimeout(400);
  const txt=await p.locator(".content").innerText();
  chk(/agrees to the cent/.test(txt),"the gate still reconciles after the edit");
  await post();
  st=await state();
  chk(st.moves===3,"both lines post again — none lost as duplicates ("+st.moves+")");
  chk(st.invoices===1,"and there is still one invoice, not two");
  /* THE CATCH, and the reason this route suits a freshly posted invoice but not an old one:
     unpost/edit/post moves the PURCHASE to the new code and leaves every sale pointing at the
     old one. The history splits and the old code is left owing stock it never received. To move
     a product's code once its stock has sold, use Catalogue → Re-code / rename, which carries
     movements, invoice lines and staged entries across together. */
  const ob=st.inv["9788119597260"],nb=st.inv["KKG-BIBLE"];
  chk(nb&&nb.recv===10&&nb.sold===0,"the ten units arrive under the new code, with no sales against them");
  chk(ob&&ob.sold===6&&ob.recv===0,"while the six sales stay on the old code, which now received nothing");
  chk(ob&&ob.onHand===-6,"leaving the old code at -6 on hand — the history is split, not moved ("+ob.onHand+")");
  chk(ob&&ob.unmatched===6,"and those six units permanently uncosted, so their profit is overstated");
  chk(st.cat.indexOf("9788119597260")>=0,"the old catalogue record stays behind, now with no stock");
  chk(st.staging.indexOf("KKG-BIBLE")>=0,"and the new code goes to staging to be made a product");

  chk(errs.length===0,"no page errors"+(errs.length?": "+errs[0]:""));
  console.log(A.join("\n"));
  console.log("\n"+A.filter(x=>x.startsWith("ok")).length+"/"+A.length+" passed");
  await b.close();process.exit(A.some(x=>x.startsWith("FAIL"))?1:0);
})();
