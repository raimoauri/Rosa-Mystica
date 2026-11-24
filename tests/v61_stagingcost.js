/* Staging read cost one way and the catalogue another: staging took the average of everything
   ever received, the catalogue takes the lots you still hold. For a first delivery those are the
   same number, so it never showed — but restock a product at a different price, sell some, and
   the cost jumped the moment you pressed Confirm, taking the margin with it.

   The invariant worth having is simply that confirming a row does not change its own figures. */
const {chromium}=require("playwright");
const APP="file://"+require("path").join(__dirname,"..","index.html");
const A=[];const chk=(c,n)=>A.push((c?"ok   ":"FAIL ")+n);
const near=(a,b,t)=>a!=null&&Math.abs(a-b)<=(t||0.005);

(async()=>{
  const b=await chromium.launch({args:["--no-sandbox"]});
  const p=await b.newPage({viewport:{width:1700,height:1100}});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.goto(APP,{waitUntil:"domcontentloaded"});await p.waitForTimeout(500);

  /* one product, two deliveries at different prices, the first of them sold through:
       B1  10 @ 10,00      B2  10 @ 20,00      sold 10  → FIFO eats B1
     everything received averages 15,00; what is actually on the shelf cost 20,00 */
  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    s.channels=[{id:"c1",name:"Purchase",dir:"in",mode:null,kind:null},
                {id:"c2",name:"Vektori",dir:"out",mode:"in_person",kind:"sale"}];
    s.catalogue=[];s.invoices=[];s.suppliers=[];s.log=[];s.diag={disp:{},hist:[]};
    const mv=(id,date,dir,batchRef,qty,unitPrice,channel)=>({id,date,channel,dir,batchRef,
      code:"BK1",qty,unitPrice,vatRate:0,transport:null,note:"",country:"",provider:"St Pauls",providerRef:"SP-1"});
    s.ledger=[mv("a","2026-01-10","in","B1",10,10,"Purchase"),
              mv("b","2026-06-10","in","B2",10,20,"Purchase"),
              mv("c","2026-09-10","out","",10,30,"Vektori")];
    s.staging=[{code:"BK1",name:"A book",provider:"St Pauls",providerRef:"SP-1",
                seenCount:2,qty:20,firstDate:"2026-01-10",ui:{}}];
    localStorage.setItem("rosamystica:v1",JSON.stringify(s));});
  await p.reload({waitUntil:"domcontentloaded"});await p.waitForTimeout(700);

  const figures=()=>p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("rosamystica:v1"));
    const iv=invByCode(s)[normCode("BK1")];
    const prod=(s.catalogue||[]).find(x=>normCode(x.code)===normCode("BK1"));
    return {avgCost:iv?Math.round(iv.avgCost*1e4)/1e4:null,
      unitCost:iv?Math.round(iv.unitCost*1e4)/1e4:null,
      catalogue:prod?costOf(prod,iv).value:null,
      inCat:!!prod};});

  const f0=await figures();
  chk(near(f0.avgCost,15),"everything received averages 15,00");
  chk(near(f0.unitCost,20),"but what is on the shelf cost 20,00 — FIFO ate the cheap lot");
  chk(!f0.inCat,"and the product is still only staged");

  await p.getByRole("button",{name:/^Staging|Unconfirmed/}).first().click();await p.waitForTimeout(500);
  const costCell=async()=>{const t=await p.locator("tbody tr").first().locator("td").nth(5).innerText();
    return parseFloat(t.replace(/[^0-9,.-]/g,"").replace(/\s/g,"").replace(",","."));};
  const shown=await costCell();
  chk(near(shown,20,0.02),"staging shows 20,00 — the lots on hand, not the 15,00 average");

  /* price it, read the margin, confirm, and check neither moved */
  await p.locator("tbody tr").first().locator('input.cellinput').nth(2).fill("30.00");
  await p.waitForTimeout(150);
  await p.locator("tbody tr").first().locator("td").nth(2).click();await p.waitForTimeout(400);
  /* Four numbers come out of the same two figures, and only one of them is what this column
     means. Cost 20,00, shelf price 30,00:
        50,0 %  markup on cost         (30-20)/20      — what a boss usually means
        33,3 %  margin on the gross    (30-20)/30      — forgetting the VAT
        24,3 %  margin as a book       net 26,43       — 13,5 % taken off first
        16,3 %  margin as goods        net 23,90       — 25,5 % taken off first
     The column is the last two: margin on the NET price, at the rate the row's Type implies. */
  const marginCell=async()=>(await p.locator("tbody tr").first().locator("td").nth(9).innerText()).trim();
  const m0=await marginCell();
  chk(/16,3/.test(m0),"typed as goods, 30,00 on a cost of 20,00 reads 16,3 % — 25,5 % comes off first");

  await p.locator("tbody tr").first().locator("td").nth(3).locator("select").selectOption("book");
  await p.waitForTimeout(400);
  const m1=await marginCell();
  chk(/24,3/.test(m1),"the same row as a book reads 24,3 % — only the VAT rate changed");
  await p.locator("tbody tr").first().locator("td").nth(3).locator("select").selectOption("goods");
  await p.waitForTimeout(400);

  await p.getByRole("button",{name:/^Confirm /}).click();await p.waitForTimeout(900);
  const f1=await figures();
  chk(f1.inCat,"the product is confirmed into the catalogue");
  chk(near(f1.catalogue,shown,0.02),
      "and the catalogue reports the same cost staging did — confirming moves nothing");

  chk(errs.length===0,"no page errors"+(errs.length?" ("+errs[0]+")":""));
  await b.close();
  console.log(A.join("\n"));
  console.log((A.filter(x=>x[0]==="F").length?"FAILURES":"all ok")+" — "+A.length+" checks");
  process.exit(A.some(x=>x[0]==="F")?1:0);
})();
