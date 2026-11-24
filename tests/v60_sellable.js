/* The Overview asks whether an invoice paid for itself. A till button, or anything marked not
   for sale, can never answer yes — it has no price and makes no sale, so it sits in the cost
   side of every ratio with nothing on the other. It is now set aside by default.

   Two things this must get right: the money has to stay consistent (cost removed with the line,
   never stranded), and a batch whose every line is unsellable has to leave the view rather than
   sit there at a return of zero. */
const {chromium}=require("playwright");
const APP="file://"+require("path").join(__dirname,"..","index.html");
const A=[];const chk=(c,n)=>A.push((c?"ok   ":"FAIL ")+n);
const near=(a,b,t)=>a!=null&&Math.abs(a-b)<=(t||0.005);

(async()=>{
  const b=await chromium.launch({args:["--no-sandbox"]});
  const p=await b.newPage({viewport:{width:1600,height:1200}});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.goto(APP,{waitUntil:"domcontentloaded"});await p.waitForTimeout(500);

  /* Two invoices. The first mixes a sellable book with a till button; the second is nothing but
     till buttons, so it should disappear from the view altogether. */
  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.channels=[{id:"c1",name:"Purchase",dir:"in",mode:null,kind:null},
                {id:"c2",name:"Vektori",dir:"out",mode:"in_person",kind:"sale"}];
    s.staging=[];s.log=[];s.suppliers=[];s.diag={disp:{},hist:[]};
    s.catalogue=[
      {code:"BOOK1",name:"Missal",type:"book",supplier:"St Pauls",price:40,cost:null,sellable:true,stocked:true},
      {code:"TILL1",name:"Donation button",type:"other",supplier:"St Pauls",price:null,cost:null,sellable:false,stocked:false},
      {code:"TILL2",name:"Candle money",type:"other",supplier:"Parish",price:null,cost:null,sellable:false,stocked:false}];
    s.invoices=[
      {id:"i1",status:"posted",provider:"St Pauls",country:"India",invoiceNo:"A1",date:"2026-09-01",
       currency:"EUR",rate:"1",treatment:"import",batchRef:"A1",lines:[]},
      {id:"i2",status:"posted",provider:"Parish",country:"Finland",invoiceNo:"A2",date:"2026-09-02",
       currency:"EUR",rate:"1",treatment:"domestic",batchRef:"A2",lines:[]}];
    const mv=(batchRef,code,qty,unitPrice,provider)=>({id:"m"+code+batchRef,date:"2026-09-01",
      channel:"Purchase",dir:"in",batchRef,code,qty,unitPrice,vatRate:0,transport:null,note:"",
      country:"",provider,providerRef:""});
    s.ledger=[mv("A1","BOOK1",10,20,"St Pauls"),mv("A1","TILL1",5,10,"St Pauls"),
              mv("A2","TILL2",4,25,"Parish"),
              {id:"sale1",date:"2026-10-01",channel:"Vektori",dir:"out",batchRef:"",code:"BOOK1",
               qty:4,unitPrice:40,vatRate:13.5,note:"",country:"",provider:"",providerRef:""}];
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));});
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(800);

  /* ---------------------------------------------------------- the rule, alone */
  const r=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    const all=computeBatches(s).filter(b=>invoiceBatchSet(s).has(batchKey(b.batchRef)));
    const sell=batchesSellable(all);
    const pick=(bl,ref)=>bl.find(x=>x.batchRef===ref);
    return {allN:all.length,sellN:sell.length,
      allRefs:all.map(x=>x.batchRef).sort(),sellRefs:sell.map(x=>x.batchRef).sort(),
      a1All:{inv:pick(all,"A1").investedNet,codes:pick(all,"A1").codes,recv:pick(all,"A1").received},
      a1Sell:{inv:pick(sell,"A1").investedNet,codes:pick(sell,"A1").codes,recv:pick(sell,"A1").received},
      aside:sellableAside(all),
      totAll:overviewTotals(all),totSell:overviewTotals(sell)};});

  chk(r.allN===2&&r.sellN===1,"the all-till-button invoice drops out of the view");
  chk(r.sellRefs.join()==="A1","and the mixed one stays");
  chk(r.a1All.codes===2&&r.a1Sell.codes===1,"the mixed batch loses its unsellable line");
  chk(near(r.a1All.inv,250)&&near(r.a1Sell.inv,200),
      "and the cost of that line goes with it — 250 becomes 200");
  chk(r.a1All.recv===15&&r.a1Sell.recv===10,"units received follow the lines that remain");
  chk(r.aside.n===2,"two unsellable products are counted as set aside");
  chk(near(r.aside.val,150),"with 150 of cost between them");
  chk(near(r.totAll.invT,350)&&near(r.totSell.invT,200),"total invested drops to just the sellable");
  chk(r.totAll.prod.length===3&&r.totSell.prod.length===1,"and the product roll-up with it");
  chk(near(r.totAll.netRev,r.totSell.netRev),"revenue is unchanged — only sellable things ever sold");
  /* The headline ROI is profit over cost of goods SOLD, and an unsellable thing never sold, so
     it was never in that denominator and does not move. What moves is the share of the money
     put out that has come back — because the money put out was counted and the return could not
     be. That is the figure the switch is really for. */
  chk(near(r.totSell.roi,r.totAll.roi,1e-9),"return on cost of sales is unchanged, as it must be");
  chk(r.totSell.backShare>r.totAll.backShare,
      "but the share of outlay recouped rises, from "+Math.round(r.totAll.backShare*100)
      +"% to "+Math.round(r.totSell.backShare*100)+"%");
  chk(near(r.totAll.recT,r.totSell.recT),"because what came back never changed — only what went out");

  /* --------------------------------------------------------------- end to end */
  const money=t=>parseFloat(String(t).replace(/[^0-9,.-]/g,"").replace(/\s/g,"").replace(",","."));
  const tile=async(name)=>money(await p.locator(".kpi").filter({hasText:name}).first().locator(".v").innerText());
  await p.getByRole("button",{name:/^Overview/}).first().click();await p.waitForTimeout(600);

  const sw=p.getByRole("button",{name:/^(Sellable only|Everything)$/});
  chk(await sw.count()===1,"the Overview carries one switch");
  chk((await sw.innerText()).trim()==="Sellable only","and starts on sellable only");
  chk(await p.getByText(/2 products not for sale set aside/).count()===1,
      "saying what it has set aside, and what that cost");

  const onStock=await tile("Stock value");
  await sw.click();await p.waitForTimeout(500);
  chk((await sw.innerText()).trim()==="Everything","it switches to everything");
  const offStock=await tile("Stock value");
  chk(offStock>onStock,"which puts the unsellable stock back into the value");
  chk(await p.getByText(/Till buttons and anything marked not for sale are counted in/).count()===1,
      "and says so plainly");

  await sw.click();await p.waitForTimeout(500);
  chk(near(await tile("Stock value"),onStock,0.02),"switching back restores the first figure");

  chk(errs.length===0,"no page errors"+(errs.length?" ("+errs[0]+")":""));
  await b.close();
  console.log(A.join("\n"));
  console.log((A.filter(x=>x[0]==="F").length?"FAILURES":"all ok")+" — "+A.length+" checks");
  process.exit(A.some(x=>x[0]==="F")?1:0);
})();
