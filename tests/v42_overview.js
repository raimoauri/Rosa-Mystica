/* The Overview as a reading of the same two functions the Inventory tab uses, and the opened
   batch as a block you can actually see. Also a smoke pass over every tab, since the suite that
   used to cover them was lost with a container and this is what stands in until it is rebuilt. */
const {chromium}=require("playwright");
const APP="file://"+require("path").join(__dirname,"..","index.html");
const A=[];const chk=(c,n)=>A.push((c?"ok   ":"FAIL ")+n);
const near=(a,b,t)=>a!=null&&Math.abs(a-b)<=(t||0.005);
(async()=>{
  const b=await chromium.launch({args:["--no-sandbox"]});
  const p=await b.newPage({viewport:{width:1500,height:1000}});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.goto(APP,{waitUntil:"domcontentloaded"});await p.waitForTimeout(500);

  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.channels=[{id:"c1",name:"Purchase",dir:"in",mode:null,kind:null},
                {id:"c2",name:"Vektori",dir:"out",mode:"in_person",kind:"sale"}];
    const C=(c,n,sup,cost,price)=>({code:c,name:n,type:"goods",supplier:sup,supplierRef:c,cost,price,
      sellable:true,stocked:true,reorderPoint:2});
    s.catalogue=[C("P-1","Earner","Alfa",2,12.55),      /* sells a lot, good cash profit */
                 C("P-2","Margin star","Alfa",1,12.55), /* fewer sold, best margin */
                 C("P-3","One lucky sale","Beta",1,12.55), /* 1 sold — must not reach the margin list */
                 C("P-4","Dead weight","Beta",5,20)];   /* never sold: capital sitting still */
    s.ledger=[
      {id:"i1",date:"2026-02-01",channel:"Purchase",dir:"in",batchRef:"B-1",code:"P-1",qty:100,unitPrice:2,vatRate:0,provider:"Alfa",createdAt:"x"},
      {id:"i2",date:"2026-02-01",channel:"Purchase",dir:"in",batchRef:"B-1",code:"P-2",qty:20,unitPrice:1,vatRate:0,provider:"Alfa",createdAt:"x"},
      {id:"i3",date:"2026-03-01",channel:"Purchase",dir:"in",batchRef:"B-2",code:"P-3",qty:10,unitPrice:1,vatRate:0,provider:"Beta",createdAt:"x"},
      {id:"i4",date:"2026-04-01",channel:"Purchase",dir:"in",batchRef:"B-3",code:"P-4",qty:12,unitPrice:5,vatRate:0,provider:"Beta",createdAt:"x"},
      {id:"o1",date:"2026-06-01",channel:"Vektori",dir:"out",batchRef:"V1",code:"P-1",qty:60,unitPrice:12.55,createdAt:"x"},
      {id:"o2",date:"2026-06-02",channel:"Vektori",dir:"out",batchRef:"V2",code:"P-2",qty:10,unitPrice:12.55,createdAt:"x"},
      {id:"o3",date:"2026-06-03",channel:"Vektori",dir:"out",batchRef:"V3",code:"P-3",qty:1,unitPrice:12.55,createdAt:"x"}];
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));});
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(800);

  const kpi=async label=>p.evaluate(l=>{for(const k of document.querySelectorAll(".kpi"))
    if(k.querySelector(".k").textContent.trim()===l)return k.querySelector(".v").textContent.trim();return null;},label);
  const truth=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    const inv=computeInventory(s),bs=computeBatches(s);
    let sv=0,pr=0,cg=0,out=0;
    for(const r of inv){pr+=r.realProfit;cg+=r.cogs;if(r.stocked)sv+=r.onHandValue;}
    for(const x of bs){const l=x.investedNet-x.recoupedNet;if(l>0)out+=l;}
    return {stockVal:sv,profit:pr,roi:cg>0?pr/cg:null,out};});

  /* ---- the tiles say what Inventory says ---- */
  const asNum=s=>parseFloat(String(s).replace(/[^0-9,.-]/g,"").replace(/\s/g,"").replace(",","."));
  chk(near(asNum(await kpi("Stock value")),truth.stockVal,0.02),
      "Stock value is the FIFO landed value Inventory computes, not quantity × the catalogue cost field ("+(await kpi("Stock value"))+")");
  chk(near(asNum(await kpi("Profit realised")),truth.profit,0.02),"Profit realised matches ("+(await kpi("Profit realised"))+")");
  chk(near(asNum(await kpi("Return on cost")),truth.roi*100,0.1),"Return on cost matches ("+(await kpi("Return on cost"))+")");
  chk(near(asNum(await kpi("Capital still out")),truth.out,0.02),
      "Capital still out counts only invoices still in the red ("+(await kpi("Capital still out"))+")");
  chk(truth.out>0,"and that figure is not simply zero in this fixture");

  /* ---- the chart ---- */

  /* each bar stacks the capital coming back under the profit on top of it, so an invoice that
     has returned something draws two segments and one that has not draws a single stub */
  /* segments are paths, not rects: only the outer end of a stack is rounded, which a rect's
     rx cannot express without curving the join between the two colours */
  const groups=await p.evaluate(()=>[...document.querySelectorAll("svg g")]
    .filter(g=>g.querySelector("path")).map(g=>({rects:g.querySelectorAll("path").length,
      fills:[...g.querySelectorAll("path")].map(r=>r.style.fill),
      ds:[...g.querySelectorAll("path")].map(r=>r.getAttribute("d"))})));
  chk(groups.length===3,"a group per invoice, three here ("+groups.length+")");
  const sold=groups.filter(g=>g.rects===2),idle=groups.filter(g=>g.rects===1);
  chk(sold.length===2,"each invoice that has sold draws two stacked segments ("+sold.length+")");
  chk(sold[0].fills.some(f=>/accent-soft/.test(f))&&sold[0].fills.some(f=>/--good/.test(f)),
      "capital back beneath, profit above ("+sold[0].fills.join(" + ")+")");
  chk(idle.length===1,"the one that has returned nothing draws a visible stub ("+idle.length+")");
  chk(idle.every(g=>/line-strong/.test(g.fills[0])),"in the muted tone, not as profit");
  /* the join is square: the lower segment's path carries no curve, the upper one two */
  const lower=sold[0].ds[0],upper=sold[0].ds[1];
  chk((lower.match(/Q/g)||[]).length===0,"the capital segment is square at both ends");
  chk((upper.match(/Q/g)||[]).length===2,"the profit segment is rounded only at its outer end");
  const paid=await p.evaluate(()=>[...document.querySelectorAll("svg text")]
    .map(t=>t.textContent).filter(t=>/paid for itself/.test(t)).length);
  chk(paid===1,"and a line at 100% marks where an invoice has paid for itself");
  const refs=await p.evaluate(()=>[...document.querySelectorAll("svg text")]
    .map(t=>t.textContent).filter(t=>/average|%$/.test(t)&&!/paid for itself/.test(t)));
  chk(!refs.some(t=>/average/.test(t)),
      "and it is the only reference line — the average-ROI line is gone, being a second measure on one axis");

  /* the tile carries the same ratio for the shop as a whole */
  const tileTxt=await p.evaluate(()=>{for(const k of document.querySelectorAll(".kpi"))
    if(k.querySelector(".k").textContent.trim()==="Capital still out")return k.textContent;return "";});
  chk(/of everything bought has come back/.test(tileTxt),"the Capital still out tile says what share has come back");
  const expShare=await p.evaluate(()=>{const bs=computeBatches(JSON.parse(localStorage.getItem("rosamystica:v1")));
    const i=bs.reduce((a,x)=>a+x.investedNet,0),r=bs.reduce((a,x)=>a+x.recoupedNet,0);return i>0?r/i*100:0;});
  chk(tileTxt.indexOf(expShare.toFixed(1).replace(".",","))>=0,
      "and the figure is total recouped over total invested ("+expShare.toFixed(1)+"%)");

  /* ---- the three lists ---- */
  const list=async title=>p.evaluate(t=>{for(const pan of document.querySelectorAll(".panel"))
    {const h=pan.querySelector(".panel-h h3");if(h&&h.textContent.trim()===t)
      return [...pan.querySelectorAll(".toprow-t .name")].map(x=>x.textContent.trim());}return null;},title);
  const earn=await list("Earning most"),mar=await list("Best margin"),dead=await list("Money sitting still");
  chk(earn[0]==="Earner","Earning most ranks by cash profit, so the volume seller leads ("+earn.join(", ")+")");
  chk(mar[0]==="Margin star","Best margin ranks by realised margin instead ("+mar.join(", ")+")");
  chk(earn[0]!==mar[0],"and the two lists disagree, which is the reason to show both");
  chk(mar.indexOf("One lucky sale")<0,"a product with a single sale is kept out of the margin ranking");
  chk(dead.length===1&&dead[0]==="Dead weight","Money sitting still lists what has never sold ("+dead.join(", ")+")");

  /* ---- the opened batch is visibly a block ---- */
  await p.getByRole("button",{name:/^Inventory/}).first().click();await p.waitForTimeout(300);
  await p.getByRole("button",{name:/^Batches/}).first().click();await p.waitForTimeout(400);
  const paint=async()=>p.evaluate(()=>{const tr=document.querySelector("tbody tr.clickable");
    const td=tr.querySelector("td");const cs=getComputedStyle(td);
    const pan=document.querySelector("td.openpanel");
    return {rowBg:cs.backgroundColor,rowImg:cs.backgroundImage,open:tr.classList.contains("rowopen"),
            panel:pan?getComputedStyle(pan).backgroundColor:null,
            panelImg:pan?getComputedStyle(pan).backgroundImage:null};});
  const before=await paint();
  chk(!before.open,"a closed batch row carries no open styling");
  await p.locator("tbody tr.clickable").first().click();await p.waitForTimeout(500);
  const after=await paint();
  chk(after.open,"opening one marks the row");
  chk(after.rowBg!==before.rowBg,"the row takes a different background from the rows around it ("+after.rowBg+")");
  chk(/gradient/.test(after.rowImg),"with an accent edge down its left side");
  chk(after.panel&&after.panel!=="rgba(0, 0, 0, 0)",
      "and the panel beneath has a real surface rather than the undefined --bg2 it used to ask for ("+after.panel+")");
  chk(/gradient/.test(after.panelImg||""),"carrying the same edge, so row and panel read as one block");

  /* ---- smoke: every tab renders ---- */
  for(const tab of ["Overview","Catalogue","Invoices","Ledger","Inventory","Staging","Analytics","Finance","Settings"]){
    await p.getByRole("button",{name:new RegExp("^"+tab)}).first().click();await p.waitForTimeout(350);
    const n=await p.locator(".content").count();
    chk(n>0&&errs.length===0,tab+" renders"+(errs.length?" — "+errs[0]:""));}

  chk(errs.length===0,"no page errors"+(errs.length?": "+errs[0]:""));
  console.log(A.join("\n"));
  console.log("\n"+A.filter(x=>x.startsWith("ok")).length+"/"+A.length+" passed");
  await b.close();process.exit(A.some(x=>x.startsWith("FAIL"))?1:0);
})();
