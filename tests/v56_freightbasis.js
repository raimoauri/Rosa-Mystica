/* Freight is spread into landed cost, and until now it was always spread per unit — which
   overcharges the cheap lines on a mixed-value order. Demi Art 2176 is the case that prompted
   this: €50 of carriage over 9 pieces puts €5,56 on a €5,30 Christmas ornament, more than the
   ornament cost. The basis is now chosen per invoice and baked into the rows at posting.

   The invariant that matters most is the one checked last: every basis books the same total.
   Only who carries it changes. The second invariant is that a row without the new field reads
   exactly as it always did, which is why nothing already in the ledger can move. */
const {chromium}=require("playwright");
const APP="file://"+require("path").join(__dirname,"..","index.html");
const A=[];const chk=(c,n)=>A.push((c?"ok   ":"FAIL ")+n);
const near=(a,b,t)=>a!=null&&Math.abs(a-b)<=(t||0.005);

/* Demi Art GmbH, Laion, Italy — intra-community, so VAT 0 and the line totals are already net.
   goods 405,09 + Versandkosten 50,00 = 455,09, which is what the paper says. */
const INV=()=>({id:"inv1",status:"draft",provider:"Demi Art",country:"Italy",invoiceNo:"2176",
  date:"2026-11-10",due:"2026-12-10",currency:"EUR",rate:"1",treatment:"eu_acq",vatDefault:"0",
  freight:"50.00",freightVat:"0",duty:"",importVat:"",invoiceTotal:"455.09",note:"",
  batchRef:"",postedAt:"",lineType:"goods",
  lines:[{id:"a",supplierRef:"8516",code:"8516",name:"Cross with Christ and Mary 10cm",qty:"2",qtyRecv:"",lineTotal:"46.00",vatRate:"0",type:""},
         {id:"b",supplierRef:"R1000",code:"R1000",name:"Mountain St Mary 15cm",qty:"1",qtyRecv:"",lineTotal:"67.13",vatRate:"0",type:""},
         {id:"c",supplierRef:"6610",code:"6610",name:"St Francis of Assisi 12cm",qty:"2",qtyRecv:"",lineTotal:"100.00",vatRate:"0",type:""},
         {id:"d",supplierRef:"R3255",code:"R3255",name:"Our Lady of Grace with Joseph 14cm",qty:"2",qtyRecv:"",lineTotal:"181.36",vatRate:"0",type:""},
         {id:"e",supplierRef:"8219",code:"8219",name:"Christmas decoration: Tree with Family 5cm",qty:"2",qtyRecv:"",lineTotal:"10.60",vatRate:"0",type:""}]});

(async()=>{
  const b=await chromium.launch({args:["--no-sandbox"]});
  const p=await b.newPage({viewport:{width:1600,height:1100}});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.goto(APP,{waitUntil:"domcontentloaded"});await p.waitForTimeout(500);
  const seed=async()=>{await p.evaluate(i=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.channels=[{id:"c1",name:"Purchase",dir:"in",mode:null,kind:null},
                {id:"c2",name:"Vektori",dir:"out",mode:"in_person",kind:"sale"}];
    s.catalogue=[];s.ledger=[];s.staging=[];s.invoices=[i];s.diag={disp:{},hist:[]};
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));},INV());
    await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(650);};
  await seed();

  /* ---------------------------------------------------------- the allocator alone */
  const alloc=await p.evaluate(()=>{
    const rows=[{qty:2,unitPrice:23.00},{qty:1,unitPrice:67.13},{qty:2,unitPrice:50.00},
                {qty:2,unitPrice:90.68},{qty:2,unitPrice:5.30}];
    const sum=a=>a.reduce((x,y,i)=>x+y*rows[i].qty,0);
    const u=allocFreightUnits(rows,50,"units");
    const v=allocFreightUnits(rows,50,"value");
    const bl=allocFreightUnits(rows,50,"blend");
    return {u,v,bl,sumU:Math.round(sum(u)*100)/100,sumV:Math.round(sum(v)*100)/100,
      sumB:Math.round(sum(bl)*100)/100,
      empty:allocFreightUnits([],50,"value"),
      zero:allocFreightUnits(rows,0,"value"),
      noValue:allocFreightUnits([{qty:2,unitPrice:0},{qty:3,unitPrice:0}],10,"value"),
      unknown:allocFreightUnits(rows,50,"nonsense"),
      awkward:(()=>{const r=[{qty:3,unitPrice:1},{qty:3,unitPrice:1},{qty:3,unitPrice:1}];
        const a=allocFreightUnits(r,10,"value");
        return Math.round(a.reduce((x,y,i)=>x+y*r[i].qty,0)*100)/100;})()};});

  chk(alloc.u.every(x=>near(x,50/9,1e-5)),"units basis gives every unit the same share");
  chk(alloc.sumU===50,"units basis sums to the freight exactly");
  chk(alloc.sumV===50,"value basis sums to the freight exactly");
  chk(alloc.sumB===50,"blend basis sums to the freight exactly");
  chk(alloc.awkward===10,"a total that does not divide evenly still sums to the cent");
  chk(near(alloc.v[4],0.655,0.011),"value basis puts ~0,66 per unit on the cheapest line");
  chk(near(alloc.v[3],11.19,0.011),"value basis puts ~11,19 per unit on the dearest line");
  chk(alloc.v[4]<alloc.u[4],"the cheap line carries less by value than per unit");
  chk(alloc.v[3]>alloc.u[3],"the dear line carries more by value than per unit");
  chk(alloc.bl[4]>alloc.v[4]&&alloc.bl[4]<alloc.u[4],"the blend lands between the two bases");
  chk(alloc.empty.length===0,"no rows, no allocation");
  chk(alloc.zero.every(x=>x===0),"no freight, no allocation");
  chk(alloc.noValue.every(x=>x>0),"lines with no value fall back to per unit rather than vanishing");
  chk(alloc.unknown.every(x=>near(x,50/9,1e-5)),"an unrecognised basis behaves as per unit");

  /* ------------------------------------------------- the fallback on the read side */
  const fb=await p.evaluate(()=>({
    own:landedUnit({qty:2,unitPrice:5.30,vatRate:0,batchRef:"B",freightUnit:0.655},{B:5.5556}),
    fall:landedUnit({qty:2,unitPrice:5.30,vatRate:0,batchRef:"B"},{B:5.5556}),
    blank:landedUnit({qty:2,unitPrice:5.30,vatRate:0,batchRef:"B",freightUnit:""},{B:5.5556}),
    junk:landedUnit({qty:2,unitPrice:5.30,vatRate:0,batchRef:"B",freightUnit:"x"},{B:5.5556}),
    none:landedUnit({qty:2,unitPrice:5.30,vatRate:0,batchRef:"Z"},{B:5.5556})}));
  chk(near(fb.own,5.955,0.002),"a row carrying its own share uses it");
  chk(near(fb.fall,10.8556,0.002),"a row without one falls back to the batch per unit");
  chk(near(fb.blank,10.8556,0.002),"an empty field is not a zero share");
  chk(near(fb.junk,10.8556,0.002),"an unparseable field falls back rather than poisoning the cost");
  chk(near(fb.none,5.30,0.002),"a batch with no freight adds nothing");

  /* --------------------------------------------------------- the preview, headless */
  const pvf=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    const inv=s.invoices[0];const pv=freightPreview(inv,s);
    return {some:!!pv,rows:pv?pv.rows.length:0,
      totals:pv?pv.totals:null,worst:pv&&pv.worst?pv.worst.r.code:null,
      worstK:pv&&pv.worst?Math.round(pv.worst.k*100):null,
      none:freightPreview(Object.assign({},inv,{freight:"0"}),s)===null,
      noLines:freightPreview(Object.assign({},inv,{lines:[]}),s)===null};});
  chk(pvf.some&&pvf.rows===5,"the preview covers every postable line");
  chk(pvf.none,"no freight, no preview");
  chk(pvf.noLines,"no lines, no preview");
  chk(pvf.totals.units===50&&pvf.totals.value===50&&pvf.totals.blend===50,
      "all three bases allocate the same 50,00");
  chk(pvf.worst==="8219","the preview names the ornament as the line the choice turns on");
  chk(pvf.worstK===105,"and puts its per-unit freight at 105 % of its own cost");

  /* ------------------------------------------------------------------ end to end */
  const openInv=async()=>{await p.getByRole("button",{name:/^Invoices/}).first().click();await p.waitForTimeout(350);
    await p.locator("tbody tr").first().click();await p.waitForTimeout(500);};
  const picker=()=>p.locator('div:has(> label.lab:text-is("Spread freight by")) > select');
  const post=async()=>{await p.getByRole("button",{name:/Post to ledger/}).click();await p.waitForTimeout(300);
    const c=p.getByRole("button",{name:/^Post/}).last();if(await c.count())await c.click();await p.waitForTimeout(1100);};
  const unpost=async()=>{await p.getByRole("button",{name:/^Unpost/}).click();await p.waitForTimeout(300);
    await p.getByRole("button",{name:"Remove from the ledger"}).click();await p.waitForTimeout(1000);};
  const read=()=>p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    const bs=computeBatches(s);const bt=bs.find(x=>x.batchRef==="2176")||{lines:[]};
    const cost={};for(const l of bt.lines)cost[l.code]=Math.round(l.cost*1e4)/1e4;
    return {cost,invested:Math.round(bt.investedNet*100)/100,transport:bt.transport,
      received:bt.received,status:s.invoices[0].status,rows:s.ledger.length,
      withShare:s.ledger.filter(r=>r.freightUnit!=null).length,
      outRows:s.ledger.filter(r=>r.dir==="out").length};});

  await openInv();
  chk(await picker().count()===1,"the draft shows one freight basis picker");
  chk(await picker().inputValue()==="units","it defaults to per unit");

  const grid=()=>p.evaluate(()=>{const t=document.querySelector(".fpv table");if(!t)return null;
    const cell=c=>c.innerText.split("\n").map(x=>x.trim());
    return {sel:[...t.querySelectorAll("thead th.sel")].map(h=>h.textContent.trim()),
      heads:[...t.querySelectorAll("thead th")].map(h=>h.textContent.trim()),
      foot:[...t.querySelectorAll("tfoot th")].map(h=>h.textContent.trim()).slice(1),
      rows:Object.fromEntries([...t.querySelectorAll("tbody tr")].map(tr=>{const td=[...tr.children];
        return [td[0].textContent.trim(),td.slice(4).map(cell)];})),
      warn:document.body.innerText.includes("105 %")};});
  const g1=await grid();
  chk(g1!==null,"the preview table is on the page");
  chk(g1.heads.join("|").includes("Per unit|By line value|Blend"),"it shows all three bases side by side");
  chk(g1.sel.length===1&&g1.sel[0]==="Per unit","the selected basis is the highlighted column");
  chk(g1.foot.every(x=>x.replace(/\s/g,"")==="50,00€"),"the footer shows the same 50,00 under each");
  chk(g1.rows["8219"][0][0].replace(/\s/g,"")==="10,86€","per unit column: the ornament at 10,86");
  chk(g1.rows["8219"][1][0].replace(/\s/g,"")==="5,96€","by value column: the ornament at 5,96");
  chk(g1.rows["8219"][2][0].replace(/\s/g,"")==="8,41€","blend column: the ornament at 8,41");
  chk(g1.rows["8219"][0][1].replace(/\s/g,"")==="+5,56€","each cell shows the freight it adds");
  chk(g1.rows["R3255"][1][0].replace(/\s/g,"")==="101,87€","by value column: Our Lady at 101,87");
  chk(g1.warn,"the note names the line the decision turns on");

  await picker().selectOption("value");await p.waitForTimeout(250);
  const g2=await grid();
  chk(g2.sel[0]==="By line value","the highlight follows the picker");
  chk(g2.rows["8219"][0][0]===g1.rows["8219"][0][0],"and the figures themselves do not move");
  await picker().selectOption("units");await p.waitForTimeout(250);

  await post();
  const U=await read();
  chk(U.status==="posted","posting under the default works");
  chk(U.withShare===0,"the default basis writes no per-row share at all");
  chk(near(U.cost["8219"],10.8556,0.002),"per unit: the ornament lands at 10,86");
  chk(near(U.cost["R3255"],96.2356,0.002),"per unit: Our Lady lands at 96,24");
  chk(U.invested===455.09,"per unit: the batch books 455,09");
  chk(U.transport===50,"the batch still reports 50,00 of transport");
  chk(U.received===9,"nine units received");

  /* the picker is frozen once posted — the allocation is history, not a live setting */
  chk(await picker().isDisabled(),"the picker is locked while the invoice is posted");

  /* unpost, change the basis, repost — the sequence this was built for */
  await unpost();
  const mid=await read();
  chk(mid.status==="draft","unposting returns it to draft");
  chk(mid.rows===0,"unposting removes the batch's in-movements");
  await picker().selectOption("value");await p.waitForTimeout(250);
  chk(await picker().inputValue()==="value","the basis can be changed on the draft");
  await post();
  const V=await read();
  chk(V.status==="posted","reposting under a new basis works");
  chk(V.withShare===5,"every row now carries its own share");
  chk(near(V.cost["8219"],5.955,0.006),"by value: the ornament lands at 5,95 instead of 10,86");
  chk(near(V.cost["R3255"],101.8725,0.006),"by value: Our Lady lands at 101,87");
  chk(near(V.cost["8516"],25.84,0.006),"by value: the cross lands at 25,84");
  chk(V.invested===455.09,"by value: the batch books the same 455,09");
  chk(V.transport===50,"and still reports 50,00 of transport");

  /* and back again — nothing is one-way */
  await unpost();await picker().selectOption("units");await p.waitForTimeout(250);await post();
  const back=await read();
  chk(back.withShare===0,"returning to per unit clears the stored shares");
  chk(near(back.cost["8219"],10.8556,0.002),"the ornament is back to 10,86");
  chk(back.invested===455.09,"and the batch still books 455,09");

  /* the blend, for completeness */
  await unpost();await picker().selectOption("blend");await p.waitForTimeout(250);await post();
  const B=await read();
  chk(B.invested===455.09,"blend: the batch books the same 455,09 as every other basis");
  chk(B.cost["8219"]>V.cost["8219"]&&B.cost["8219"]<back.cost["8219"],
      "blend: the ornament lands between the two bases");

  /* ------------------------------- a sale carrying the batch reference must survive unpost */
  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.ledger.push({id:"sale1",date:"2026-11-18",channel:"Vektori",dir:"out",batchRef:"2176",
      code:"8219",qty:1,unitPrice:14.00,vatRate:25.5,note:"",country:"",provider:"",providerRef:""});
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));});
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(650);
  await openInv();
  const pre=await read();
  chk(pre.outRows===1,"a sale tagged with the batch reference is in the ledger");
  await unpost();
  const postUnpost=await read();
  chk(postUnpost.outRows===1,"unposting does not delete a sale that shares the batch reference");
  chk(postUnpost.rows===1,"only the in-movements went");

  chk(errs.length===0,"no page errors"+(errs.length?" ("+errs[0]+")":""));
  await b.close();
  console.log(A.join("\n"));
  console.log((A.filter(x=>x[0]==="F").length?"FAILURES":"all ok")+" — "+A.length+" checks");
  process.exit(A.some(x=>x[0]==="F")?1:0);
})();
