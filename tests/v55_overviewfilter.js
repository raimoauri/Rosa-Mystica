/* The Overview reports posted invoices only, which makes it long once there are several suppliers
   and hard to read when one of them dominates. Ticking suppliers narrows the chart; a second row
   of tiles then describes exactly the bars on screen, because a filtered chart above unfiltered
   totals is worse than no filter at all — the eye reads them as the same population.

   The second row appears only when something is actually excluded: when everything is ticked it
   would be a duplicate of the first, and a tile that always repeats its neighbour teaches you to
   stop reading both. Clicking a bar opens the invoice behind it. */
const {chromium}=require("playwright");
const APP="file://"+require("path").join(__dirname,"..","index.html");
const A=[];const chk=(c,n)=>A.push((c?"ok   ":"FAIL ")+n);
const asNum=s=>parseFloat(String(s).replace(/[^0-9,.-]/g,"").replace(/\s/g,"").replace(/\.(?=\d{3})/g,"").replace(",","."));
(async()=>{
  const b=await chromium.launch({args:["--no-sandbox"]});
  const p=await b.newPage({viewport:{width:1500,height:1150}});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.goto(APP,{waitUntil:"domcontentloaded"});await p.waitForTimeout(500);

  /* three suppliers, one of them spelled two ways — the filter must treat those as one */
  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.channels=[{id:"c1",name:"Purchase",dir:"in",mode:null,kind:null},
                {id:"c2",name:"Vektori",dir:"out",mode:"in_person",kind:"sale"}];
    s.catalogue=[];s.ledger=[];s.invoices=[];s.staging=[];s.diag={disp:{},hist:[]};
    const add=(prov,ref,code,qty,cost,sold)=>{
      s.catalogue.push({code,name:code,type:"goods",supplier:prov,cost,price:cost*3,sellable:true,stocked:true});
      s.ledger.push({id:"i"+code,date:"2026-03-01",channel:"Purchase",dir:"in",batchRef:ref,code,qty,unitPrice:cost,vatRate:0,provider:prov,createdAt:"x"});
      if(sold)s.ledger.push({id:"o"+code,date:"2026-09-01",channel:"Vektori",dir:"out",batchRef:"V"+code,code,qty:sold,unitPrice:cost*3,vatRate:0,createdAt:"x"});
      s.invoices.push({id:"n"+ref,status:"posted",provider:prov,invoiceNo:ref,batchRef:ref,date:"2026-03-01",
        postedAt:"x",treatment:"eu_acq",currency:"EUR",rate:"1",invoiceTotal:"",lines:[]});};
    add("Lellostore Oy","LEL-1","A",10,2,5);
    add("lellostore",   "LEL-2","B",10,2,5);   /* same supplier, other spelling */
    add("Jakobczak",    "JAK-1","C",10,3,5);
    add("MRP",          "MRP-1","D",10,4,5);
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));});
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(900);

  const rows=()=>p.evaluate(()=>document.querySelectorAll(".kpis").length);
  const bars=()=>p.evaluate(()=>document.querySelectorAll("svg g[style*='cursor']").length);
  const tile=(sel,label)=>p.evaluate(a=>{for(const k of document.querySelectorAll(a.sel))
    if(k.querySelector(".k").textContent.trim().startsWith(a.label))return k.querySelector(".v").textContent.trim();
    return null;},{sel,label});
  const names=()=>p.evaluate(()=>[...document.querySelectorAll(".supitem .nm")].map(x=>x.textContent.trim()));

  chk((await names()).length===3,"two spellings of one supplier list once — three entries, not four ("+(await names()).join(" / ")+")");
  chk(await bars()===4,"every posted invoice is charted to begin with ("+(await bars())+")");
  chk(await rows()===1,"and there is no second tile row while nothing is excluded ("+(await rows())+")");

  /* Lellostore holds two invoices under two spellings; unticking it must drop both */
  const boxFor=async nm=>{const i=(await names()).indexOf(nm);return p.locator(".supitem input").nth(i);};
  await (await boxFor("Lellostore Oy")).uncheck();await p.waitForTimeout(450);
  chk(await bars()===2,"unticking one supplier drops both its invoices, spelling notwithstanding ("+(await bars())+")");
  chk(await rows()===2,"and the second tile row appears ("+(await rows())+")");

  const all=asNum(await tile(".kpi:not(.sel)","Stock value"));
  const sel=asNum(await tile(".kpi.sel","Stock value"));
  /* 5 of each 10 remain: 5x2 + 5x2 + 5x3 + 5x4 */
  chk(all===55,"the first row still counts every invoice — 55,00 € ("+all+")");
  /* Lellostore unticked leaves C and D: 5x3 + 5x4 */
  chk(sel===35,"the second counts only the ticked ones — 35,00 € ("+sel+")");
  chk(sel<all,"so the selected figure is the smaller of the two");

  await p.getByRole("button",{name:/^None$/}).click();await p.waitForTimeout(400);
  chk(await bars()===0,"None empties the chart rather than silently showing everything ("+(await bars())+")");
  chk(/Nothing ticked/.test(await p.content()),"and says so, so an empty chart is never mistaken for no data");
  await p.getByRole("button",{name:/^All$/}).click();await p.waitForTimeout(400);
  chk(await bars()===4,"All restores every invoice ("+(await bars())+")");
  chk(await rows()===1,"and the second row goes away again ("+(await rows())+")");

  /* a bar opens its own invoice */
  await p.locator("svg g[style*='cursor']").last().click();await p.waitForTimeout(800);
  const where=await p.evaluate(()=>document.querySelector(".where").textContent.trim());
  const open=await p.evaluate(()=>{const m=document.body.innerText.match(/All invoices\s*\n\s*(\S+)/);return m?m[1]:null;});
  chk(where==="Invoices","clicking a bar goes to Invoices ("+where+")");
  chk(open==="MRP-1","and opens that invoice, not the list ("+open+")");

  chk(errs.length===0,"no page errors"+(errs.length?" — "+errs[0]:""));
  A.forEach(l=>console.log(l));
  await b.close();
})().catch(e=>{console.log("FAIL crashed — "+e.message);process.exit(1);});
