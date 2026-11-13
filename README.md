# Rosa Mystica

A catalogue + ledger operations hub for **Katolinen Kirjakauppa** — one centre that
consolidates product data and every stock movement, across channels.

It is a single self-contained HTML file. It runs fully offline (React + htm + fflate are
inlined; fonts fall back to system fonts with no network) and keeps data in the browser.

## Architecture
Two sources of truth, anchored on the **product code**:

- **Catalogue** — master product records: code (the unique anchor), type (goods/book/…),
  name, author/year where relevant, category, supplier, cost, price, sellable, online, notes.
  Stock on hand and "last ordered" are derived from the ledger, not stored.
- **Ledger** — every movement: date, channel, direction (in/out), batch reference, product
  code, quantity, unit price, country, provider, the **provider's own reference** (the bridge from
  your code to their invoice line), and a note. On import a blank batch reference auto-generates as
  `COUNTRY-YYYYMMDD-PROVIDER` so one invoice's lines share it.

Three sales shapes are read. A **Vektori Product Sales Report** (per product, per period), a
**WooCommerce line-item export** (one row per product, with SKU), and a **WooCommerce Analytics →
Orders** report — which carries no SKU and no line prices, its products sitting in one cell as
"2× Title, 1× Other". That last one is recognised by its shape rather than its column names, split
into lines, matched to the catalogue **by name** and priced from it; each order is then checked
against the Net Sales the file itself reports, and where they disagree — a discount, a changed price —
the lines are scaled to the reported figure, or left at catalogue price, as you choose. Unmatched
titles and disagreeing orders are listed before anything is imported.

An order that was **cancelled, failed or never got past checkout** is not a sale — it took no money
and no stock left the shelf — so its lines are left out, with the count and the statuses stated and a
box to include them anyway. *Refunded* and *on hold* are deliberately not on that list, since those
goods may well have gone out; they are reported and left to you.

A product that *is* in the catalogue but carries **no price** is a different problem from one that is
not there at all, and is reported as itself: an Orders report has no line prices, so it can only price
from the catalogue. Confirming staging does not set a price, which is the usual way a product ends up
in that state — and being told to rename a product that was never missing sends you after the wrong fix.

Sales reports import **several files at once** — a weekly Vektori export is a stack of them — each
keeping its own period, with a warning when a period crosses a month boundary (a Vektori report carries
no per-line date, so the whole file is dated to the end of its period). Duplicates are caught across the
whole set, so re-adding a week already imported changes nothing.

Plus a **staging** queue (codes seen in an import but not yet in the catalogue, confirmed in
with the code intact), a **sales/analytics** layer fed by WooCommerce / Vektori exports, and a
**financial tracker** fed by Vektori settlement data (see below).

Each sale channel carries a **mode** — *in-person* or *online* — so analytics can split takings by
mode (Vektori = in-person counter, WooCommerce = online) independently of how many channels feed each.

## Finding what needs work
The catalogue filters by type, sellable, online, **supplier** and **category**, and by what a record is
**missing** — no price, no cost, no name, no author, no category, no supplier, no reorder point — each
with its count, and greyed out when there is no such gap. That turns "the catalogue needs tidying" into
a list of 23 products with no price. Code, name, author, type, category, supplier, cost, price, stock
and last-ordered all sort; author and supplier are columns, so the obvious groupings are a click.

There is no publisher field: **supplier is who you bought from**, which for a distributor is not who
published the book.

## Secure editing
The product code is the unique key. Product edits are validated as a whole before anything is
written (code required + unique, name required, numbers valid); nothing commits until valid, and
renaming a code relinks its ledger movements atomically. A code with movements can't be deleted.

## Data
Lives in this browser (localStorage). Export a portable **core file** (`.json`), optionally
AES-256 encrypted, from Settings. Catalogue and ledger also export to CSV. No data is stored in
this repository — only the app code.

Two rules make that safe to rely on. A payload the app **cannot read is never replaced**: instead of
starting blank over it, a recovery screen shows the raw bytes, offers them as a download and waits —
nothing is written until you choose. And a **refused save is reported**, not swallowed: if the browser
is out of room, a banner says so and stays up, rather than letting a day's work look saved. Settings
shows how much of the ~4.8 MB budget is used (a ledger line costs about 260 characters, so roughly
19 000 movements fit) and how long it has been since the last core export.

## Invoices (draft → reconciled → posted)
A supplier invoice is entered as a **draft** before it reaches the ledger. The header carries the
provider, country, invoice number, dates, currency and rate, the **tax treatment**, and the freight
and duty; the lines carry the supplier's article number, your code, the quantity billed and the
quantity **actually received**. Lines can be pasted straight from the supplier's own list — tabs,
semicolons or aligned columns — and you say what each column is before they are added.

Nothing is written until the draft **agrees with the total printed on the invoice**: *Post to ledger*
stays disabled while the two disagree. A missing, doubled or mistyped line shows up as a gap, which is
how a 30-line invoice gets checked without reading it twice. The comparison allows for rounding, because
a real invoice rounds every line to the cent and then adds them up — a 30-line invoice can honestly
differ from its own printed total by a cent. The allowance is half a cent per line plus two, so a
one-line invoice must match exactly while a long one is forgiven arithmetic it did itself; the panel
says *exact* when the difference is truly zero, so a cent is visible rather than hidden.
Posting creates ordinary in-movements under one batch reference (the invoice number), through the same
preparation a file import goes through, so duplicate detection, staging and the re-import guard behave
identically. A posted invoice can be **unposted**, which removes its movements and returns it to draft.

Four **tax treatments** set the line VAT, defaulted from the country and always overridable: domestic
Finland, intra-EU acquisition (0% on the invoice, self-accounted), import from outside the EU, and own
print. On a domestic invoice a line whose code is already in the catalogue takes that product's own
statutory rate — 13,5% for a book, 25,5% for goods — so a mixed invoice needs no per-line typing.
**Freight and duty are separate fields**: freight is keyed exactly as billed, with its own VAT rate
beside it, so the gate compares like with like against the printed total while only its **net** part is
spread per unit into landed cost. Duty is outside VAT; import VAT is recorded for the VAT return and
deliberately never capitalised.

Invoices can also be **imported as drafts**: a file of lines in the ledger template's shape becomes
one draft per invoice reference, grouped on the batch ref, with freight lifted from the Transport
column and the treatment inferred from the country. The printed total is left blank on purpose, so the
gate is still satisfied against the paper invoice rather than against the file that produced it. The
Note column carries over to the draft — unless it stood in for a missing product name — so a file can
tell you what the paper says (its total, an unusual tax treatment, a figure still to be checked)
without that note pretending to be a reconciliation.

A treatment the country cannot imply is the one thing such a file can't carry: an **own print** from a
Finnish printer is indistinguishable from a domestic purchase by its header alone, so it arrives as
*Domestic* and is switched by hand.

## Stock count
A count is a difference, not a replacement. **Listed** is what the ledger says; **Counted** is what you
type from the shelf; the app writes only the gap between them, in one commit — out where the shelf has
fewer, in where it has more — taking cost and price from the catalogue. The difference appears as you
type, and a count that agrees writes nothing at all.

A count in progress is **kept**: counting a shop takes hours, so what has been typed survives leaving
the tab and closing the browser, and the segment shows how many lines are pending. Nothing reaches the
ledger until it is committed. The sheet is still there for walking the shelves or handing to someone —
but reading a filled sheet back now fills the same on-screen count for review rather than committing
straight to the ledger. One commit path, two ways to fill it. Download the sheet, fill **Counted** for the products you
actually counted, upload it back, and the app writes exactly the movements needed to make the derived
figure agree with the shelf: short lines as **adjustments** (stock leaves, nothing is booked as a sale),
found lines as receipts. A line that already agrees writes nothing at all.

Two rules still carry the weight. A blank is **not counted**, never *counted zero* — so counting one shelf
cannot write off the rest of the shop, and a count can be done in pieces. And a found unit is never
given a silent cost of zero: it takes the FIFO average that product already has, failing that the
catalogue cost, and if it has neither the preview says so and names the codes rather than inventing
stock value — a zero-cost lot would later sell at an apparent 100% margin. Non-stocked products are
left off the sheet, a bad cell is refused rather than guessed, and the whole count goes in under one
`COUNT-<date>` reference so it can be filtered or removed in one go.

A shortfall is not always shrinkage. Stock sold at a fair or over the counter without passing the
till is a **sale**: it should book what it earned and take its cost with it. So the count asks what a
shortfall means — gone, or sold — and any line can differ from that default, because breakage and
external sales usually turn up in the same count. A line booked as a sale goes out at its catalogue
price on a sale-kind channel, so it reaches takings, COGS, margins and the batch that supplied it like
any till sale. It defaults to a channel of its own rather than the till's, since money the till never
saw would otherwise land in the in-person takings and the Finance reconciliation would never square.
A line with no price cannot be booked as a sale at all: the count says which, and waits.

Stock on hand is never writable directly, by any import. It is derived from the ledger, so the only way
to change it is a movement — which is why a count is entered as what you see, and the app works out the
difference.

## Re-importing a corrected invoice
Duplicate detection keys on the batch reference, which cannot see the commonest correction of all: the
same invoice imported again under a reference that has since been fixed — a supplier's order number
replaced by the real invoice number. Every line looks new and the stock quietly doubles.

So an incoming batch is also compared to the ones already held by **what it contains**: your codes, the
supplier's article numbers, or — when the first import had the quantities wrong too — just the set of
articles. The date gates all three, because that is what separates a correction from a reorder: the
same invoice keeps its date whatever it is filed under, while reordering the same articles, even in the
same quantities, happens on another day. A match names both references and says which to delete first.

## Deleting, and what a wipe is
Two stores sit side by side and are cleared independently. The **ledger** holds movements, and
Analytics and Inventory are views derived from it — they store nothing of their own, so a figure
there can never disagree with the movements behind it. **Finance** holds the settlement days
imported from Vektori and WooCommerce, and never touches the ledger or stock.

So most "start again" is a deletion, not a wipe. The Ledger's filters — channel, batch, date window,
search — define a selection, and that selection can be deleted in one confirmation, which names what
it is about to remove and how many batches it spans. That matters because WooCommerce gives every
order its own batch reference: a month of web sales is a hundred batches, and clearing it one at a
time would be a hundred confirmations. The catalogue, the invoices and the settlement data are not
touched, so money already imported never needs importing again. One Undo follows.

Staging follows the ledger rather than outliving it. A staged entry exists only because an import saw
that code, and its *Seen* and *Qty* are a readout of the movements behind it — so when movements are
deleted the entries are recounted from what is left, and one with nothing behind it any more goes with
them instead of lingering as a worklist of codes that no longer exist.

*Erase everything* is the blunt instrument, and it now says what it destroys. By default it clears
the catalogue, ledger, invoices and staging — the stock data — and **keeps** the settlement days, the
online postage, the channels and the VAT settings. A checkbox makes it a true reset, with the
settlement days counted in the warning so losing them is a choice rather than a surprise.

## Bulk editing
**Export sits beside Import on the Catalogue screen**, because export-edit-import is one round trip
and an export filed under Settings is an export nobody finds.

A catalogue import only touches the columns the file actually contains. Export the catalogue, change
one column, import it back, and everything the file does not mention — cost, price, supplier, reorder
point, notes — is left exactly as it was. That makes export-edit-import a safe way to replace a stack
of supplier descriptions with your own shelf names.

## Re-coding and renaming products
Product codes and names can be changed in bulk — moving a catalogue to EAN numbers, or replacing a
supplier's description with your own shelf name. Download the catalogue as a sheet with an empty
**New code** column beside the editable **Name**, change either or both on the rows you want, and
upload it back:
blank rows are left alone, and every change is previewed with the number of ledger movements and draft
lines that will follow each code before anything is written. Unknown codes and duplicates within the
file are reported and block the commit. A new code that already belongs to another product is refused
too — unless **fold duplicates together** is ticked, which treats it as the merge it is: the record
whose code is kept survives, fills in anything it left empty from the other, and the other's catalogue
entry disappears while its movements, staged entries and draft lines move across. Renaming carries history: the
catalogue entry, its movements, its staged entries and any invoice draft lines all move together.

## Several of a supplier's articles under one code
A supplier may list a hundred variants of what the shop sells as one thing at one price — resin
magnets, say. Giving them all one product code works: the invoice reconciles, every line still
reaches the ledger, and Inventory shows one product with one blended cost. Each movement keeps the
supplier's **article number and its own description** in its note, so the Ledger still says which
variant arrived while the shop deals in one product.

That needed a fix. Duplicate detection keyed on date, channel, code, quantity, unit price and batch,
which made twenty magnet lines byte-identical — same day, same 0,95 €, same quantity — so the guard
against re-importing a file was eating the invoice's own lines. Nine units posted as three, after the
gate had said the invoice agreed to the cent. The supplier's article number is now part of what makes
a line distinct, and an invoice's own lines are taken as distinct by definition when posting;
duplicates are still looked for against what the ledger already holds, so posting twice or
re-importing the same file is caught as before.

## Supplier article numbers
The catalogue's supplier + supplier-ref pair is a live index. An imported or posted line whose code is
unknown but whose provider and reference match a catalogue product resolves onto that product, and the
import says how many lines matched that way. So the first invoice from a supplier teaches the map —
give its lines codes in your own scheme with one button, or set them as you confirm staging — and every
later invoice from them lands on your codes with no staging at all.

## Staging: where a product gets its price
A staged code is one the ledger already knows the cost of — the movements that staged it are in the
ledger, freight share and all — but which the catalogue has never been told how to sell. Staging is
that decision, made in a grid for as many items at once as you like: name, type, units received, the
**cost read from the ledger**, a multiplier, a suggested price, your price, the resulting margin, and
sellable / online / stock-tracked.

Nothing is invented. The cost is the same landed figure FIFO uses, so the margin shown is the margin
you will get. The suggested price sits in its own column and stays a suggestion until it is taken or
typed over; price and multiplier are two-way, so entering either gives the other. The multiplier
offered in bulk is the **median the rest of the catalogue already uses**, net-to-net, counted from the
products that carry both a cost and a price — a starting point taken from your own shelves rather than
a number chosen for you.

A selection can be set in bulk: type, a multiplier with rounding (0,05 / 0,10 / 0,50 / 1,00 or ending
in ,99), take all suggested prices, flip online or not-for-sale, discard. **Confirm writes only the
selection** and leaves the rest staged. Staging filters by supplier, type and search, and selection
follows what is on screen — changing a filter clears it, so nothing hidden can be confirmed by
accident, and once a supplier has been confirmed away its filter drops itself rather than leaving a
blank table. A hundred new codes are then a few passes: one supplier's medals at one multiplier,
another's books at another. Items marked
sellable with no price are counted in a standing warning, because that is exactly the state that makes
a WooCommerce Orders import drop their sales.

## Things that take money but hold no stock
A product can be marked **not stock-tracked** — a till button, a gift card, a service. It keeps its
revenue and its VAT, so takings still tie out, but it stays out of the on-hand and stock-value
headlines and out of the reorder list, and its missing cost never pretends to be a margin. Vektori's
generic buttons (PR0005, PR0006) are recognised on sight and confirmed that way by default. Inventory
also counts **units sold without a cost** — sales with no purchase lot behind them — so the part of
the history that carries no margin is visible rather than assumed.

## Out-movement kinds
Each out-channel carries a **kind** — sale, adjustment, write-off or gift. Every out line consumes
stock in FIFO order, because a unit that left the shelf has left it either way; only a *sale* line
books takings, COGS and margin. A breakage or a stock-count correction therefore shows up as units
*not sold* (with their cost) in Inventory and Batches, instead of quietly depressing ROI and
sell-through as a sale at zero.

## Reading a batch
A batch row in Inventory opens to show the invoice product by product: received, sold, on hand, the
**unit cost landed** (its own net price plus that batch's freight share), the shelf **price**, the
**margin** that price implies against *this* batch's cost, and what the units that sold actually
returned. The same product bought twice at different prices therefore carries a different margin in
each batch, which is the whole point of attributing by batch. Its header states the freight arithmetic
— "freight 20,00 € spread over 40 units, 0,50 € each" — so the costs below it can be checked rather
than taken on trust, and the lines add up to the batch row above them.

Nothing in it is editable. It is a reading of the ledger, not a second place to change it.

A product marked **not for sale** shows its cost and the stock it ties up, because it was still bought
and still holds capital, but no price, margin, revenue or profit: a margin on something never meant to
be sold is not a number worth printing, and it would drag the batch's ROI for no reason. That is kept
distinct from a sellable product with **no price**, which says so — one is a decision, the other a gap.

## Where a name lives
Every view looks a product's name up in the catalogue, by code. So a name typed in staging reaches
nothing until the item is confirmed — the batch view shows it as *unlinked* until then — and once it
is confirmed, a later rename reaches every view at once, including movements posted months before.
Nothing is rewritten, because the code is the anchor and the name is only ever looked up.

The movement keeps its own record either way: the supplier's article number, and its note, which for a
posted invoice is the description as billed. Renaming a product never touches it.

## Inventory (FIFO) & invoice progress
An Inventory tab derives, from the one ledger, FIFO stock per code — received, sold, on-hand,
sell-through, FIFO cost, realized profit and ROI (only units matched to a cost lot count), plus a
reorder list (sellable, out of stock, previously moved) carrying provider + provider ref, exportable.
A **Batches** segment rolls the same ledger up per invoice/batch (via FIFO lot→batch attribution, so a
reordered code's sales land against the batch that supplied them): received, sold, on-hand, sell-through,
capital invested, recouped, profit and ROI per invoice — the old Import Desk invoice progress, rebuilt
from the unified ledger.

## VAT
Purchases carry an explicit **per-line VAT rate**; the VAT-inclusive line total is keyed and net/VAT are
counted back from it. A batch can also carry a **transport (freight-in) total**, spread per unit by
quantity into the **net landed cost** — entered once per batch (repeated on each line or on one).
Posting an invoice writes its net freight plus duty onto every line of that batch, so the spread is
**by quantity, not by value**: €180 of postage over 140 books puts €1,29 on each of them, on the €7
title and the €75 one alike. That suits carriage, which tracks weight and count rather than price, but
it is a choice and it is the one being made. Margins
everywhere are **net-to-net**: landed purchase cost (net + freight share) vs sale price stripped by the
rate for the product's type (configurable in Settings; a movement's own VAT % overrides). The Finance tab shows **output VAT** (sales, from settlement) beside **input VAT** (purchases,
from the ledger) over any range, for a by-hand net-VAT / Fivaldi reconciliation.

## Financial tracker
A **Finance** tab, parallel to Analytics, imports two daily money views, auto-detected:
the **Vektori Transaction Report** (in-person: gross, net, VAT by rate, refunds, roundings, cash/card
split) and the **WooCommerce Analytics → Revenue** export (online: orders, net, taxes, shipping, total —
money-in is the order total incl. shipping). Re-importing the same days changes nothing (duplicates
skipped). It summarises any period — day / week / month or a custom range — with KPIs, a gross
time-series, an **in-person-vs-online** split, a VAT summary (net · VAT · gross by rate, Fivaldi-ready),
a payment-method breakdown, and an **output-vs-input VAT** view (sales VAT from settlement beside
purchase VAT from the ledger), all exportable to one .xlsx. The time-series panel toggles between
**Bars** (gross per day/week/month — the day axis carries the weekday above the date) and
**Cumulative income**, which stacks the running total by channel in fixed categorical colours with a
crosshair tooltip giving each channel's running figure and the total.

Two **reconciliations**: in-person till gross vs in-person sales recorded in the app, and online money-in
vs online sales recorded in the app. The online gap is mostly shipping, so an **online postage** box logs
what the carrier actually bills the shop (the charged-to-us side), to square against the shipping charged
to customers by hand. The Vektori Settlement Report isn't needed — the Transaction Report carries the
same totals plus daily detail.

## Build phases
1. Catalogue · Ledger · Staging · Settings — foundation. ✅
2. Ledger import (Excel/CSV template): append, skip duplicates, route unknown codes to staging. ✅
3. Sales & analytics from WooCommerce / Vektori exports (imported as ledger out-movements), and report/file generation. ✅
4. Auto batch references, the provider-reference bridge, and the Inventory (FIFO) tab with reorder. ✅
5. Per-item reorder points, a catalogue import template + bulk-confirm staging, and .xlsx reports. ✅
6. Channel mode (in-person / online) with an analytics split, and a **Financial tracker** — Vektori
   Transaction Report import, period summaries (day/week/month/custom), VAT + payment breakdowns,
   and till-vs-app reconciliation. ✅
7. Per-line purchase VAT (totals keyed, VAT counted back), net-to-net margins, a **Batches** invoice-progress
   segment in Inventory, and an input-vs-output VAT view in Finance. ✅
8. WooCommerce Revenue import (online money view), in-person-vs-online split, per-mode reconciliation, and an
   online postage box (shipping charged vs postage paid to the carrier). ✅
9. Batch-level transport (freight-in) spread per unit by quantity into net landed cost, feeding FIFO,
   margins and the Batches view; Transport column in the ledger template, movement form and exports. ✅
10. Finance charts: weekday names above the dates on the day axis, and a **Cumulative income** view —
    stacked areas by channel, with a validated categorical palette for light and dark. ✅
11. Hardening pass: unreadable data is never overwritten (recovery screen) and a refused save is
    reported, not swallowed; **out-movement kinds** so a write-off consumes stock without counting as a
    sale; a windowed Ledger with date filters, batch deletion and Undo; an Analytics period control and
    a gross/net basis; one app-wide channel colour; staged types read from the code; and Vektori unit
    prices kept at full precision. ✅
12. **Invoices**: drafts with a reconciliation gate, four tax treatments, freight and duty separated,
    paste-in lines with column mapping, supplier-article-number matching, and next-free-code allocation. ✅
13. **Archived invoices as drafts** and **bulk re-coding** with a template, blank-skipping and a preview. ✅
14. Multi-file sales import with per-file periods and a month-straddle warning. ✅
15. A reconciliation gate that allows for the invoice's own per-line rounding (half a cent per line
    plus two, and still reported as *exact* only at zero), and an imported draft that keeps its
    Note — so a file of archived invoices can say what each paper total is without asserting it. ✅
16. Choices the app had been making silently: deleting **what the filter shows** rather than one
    batch at a time, an *Erase everything* that names the settlement data and setup it would take
    (and keeps them unless told otherwise), and sales import leaving out the orders that never
    shipped instead of importing them and asking you to undo it. ✅
17. A **stock count** entered as what is on the shelf and written as the difference; staging recounted
    when movements are deleted; a guard against re-importing an invoice under a corrected reference;
    and an unpriced catalogue product reported as that rather than as a missing one. ✅
18. **Staging as a pricing grid** — cost read from the ledger, a multiplier learned from the
    catalogue's own median, a suggested price that stays a suggestion, margins net-to-net, the
    sellable / online / stocked flags, bulk setting over a selection, and confirm writing only
    what is selected. ✅
19. A **Unit cost (FIFO)** column in Inventory — the cost of the units actually on the shelf, which
    the stock value divides by — plus catalogue filtering by supplier, category and **what a record
    is missing**, and staging filtered so a supplier can be confirmed at a time. ✅
20. **Batches open** to a read-only product-by-product panel — landed cost, price, the margin it
    implies, and what sold — with not-for-sale lines carrying no margin; and staging edits kept on
    the staged entry, so leaving the tab no longer discards them. ✅
21. A stock count's shortfalls can be **sales** rather than adjustments — per count or per line, at
    the catalogue price, on a channel of their own — for stock sold away from the till. ✅
22. The count becomes a **screen you type into** — Listed beside Counted, differences live, the count
    kept until committed — with the sheet reduced to one way of filling it. ✅
23. The catalogue **Export** moved to the Catalogue screen, next to Import, where the round trip
    it belongs to starts. ✅
24. Several of a supplier's articles can share one product code: each line still posts, each keeping
    its article number and description, while the shop sees one product. ✅
25. **The duplicate guard stops eating an invoice's own lines.** Fingerprinting a movement by code,
    quantity and price alone made the lines of a regrouped invoice identical twins: 69 magnet lines
    posted as 5 movements, silently, after the gate had said the invoice agreed to the cent. The
    fingerprint now carries the supplier's article number, and an invoice's lines are never compared
    against each other — a reorder of the same article is a real second line. Alongside it: folding
    several records into a code that does not exist yet is permitted when folding is on, and the
    article-number bridge no longer overrides a code typed on an invoice line. ✅
26. **Regular lines.** The reorder screen was a rule — what has fallen to its reorder point — which
    says nothing about the handful of lines the shop always keeps. Products can now be starred, from
    the catalogue row or the product editor, and Inventory → Reorder switches between the rule, the
    starred lines and both. Either way it is grouped under supplier headings with a subtotal, so a
    block is one order to place, and carries the volume (received, sold, on hand) beside the money
    per unit: average landed cost across every receipt, the catalogue price netted to VAT, the
    margin that implies and the cash profit per unit. A starred line that has never been bought is
    listed too, its catalogue cost standing in for the average and marked as a stand-in. ✅
27. **How many to order.** Each line on the reorder screen carries an editable quantity, proposed
    from the rate it has actually been selling — units sold over the weeks the shop has held the
    line, that window floored at four so a brisk first weekend cannot propose an absurd order —
    covering a span set once on the toolbar, less what is on the shelf. Write-offs are not demand
    and a line that has never sold gets no proposal. What you type is kept until the order is
    placed, and each supplier block, and the screen, totals the units and what they will cost at
    average landed cost. ✅
28. **The Overview becomes a reading of the money.** It used to count catalogue rows and ledger
    rows and value stock at quantity × the catalogue's cost field — a number that disagreed with
    Inventory and was blank wherever a cost had never been typed. It now shows stock at FIFO landed
    value, capital still out across invoices not yet recouped, profit realised and return on cost,
    all from the same two functions the Inventory tab uses. Beneath them, return by invoice as a
    bar per batch against the average of those bars, and three rankings: earning most, best
    realised margin, and money sitting still in what has never sold. An opened batch and its panel
    now share a surface and an accent edge — the panel asked for `--bg2`, which was never defined,
    so it had no contrast at all. ✅

---

## Tests

`tests/run.sh` drives the real page in Chromium and prints one `ok`/`FAIL` line per check. A file
that prints neither crashed, and says so rather than passing quietly. The suite lives here, in the
repo, because the previous one lived in a scratch directory and went with the container.
29. **The stock count's supplier filter stops hiding shelves.** It read only the catalogue's
    Supplier field, compared it as an exact string, and kept one supplier per *normalised* product
    code. So a supplier named only on the invoices was missing from the list entirely; four
    spellings of one name appeared as identical-looking separate options, each holding part of the
    shelf; and two codes differing only by hyphens lent each other their suppliers. Each count row
    now carries its own supplier — the record's, or the provider from the invoice that delivered
    it — and the list groups by normalised name, saying how many spellings it covers. The rows are
    keyed by the product's own code too: a repeated key was making React keep stale rows and
    repeat a code down the sheet. ✅
30. **Recouped as a ratio, beside the amount.** Batches showed Invested and Recouped as sums and
    left the question they answer together — has this invoice paid for itself? — to arithmetic in
    the reader's head, where it was easily confused with ROI. Each Recouped figure now carries the
    share of the invoice's cost it covers, with a small bar, turning green at 100% where the stock
    still on the shelf becomes free. ROI is untouched: profit over the whole invoice is a different
    question from money back over money out. ✅
31. **The Overview chart carries both questions at once.** Recouped and ROI share a denominator —
    what the invoice cost — so they belong on one axis. Each bar is now the whole return: the pale
    part is capital coming back, the solid part the profit on top, and together they are the
    money-back ratio, against a line at 100% where the invoice has paid for itself. The Capital
    still out tile gains the same ratio for the shop as a whole. ✅
32. **The product editor carries the same history the bulk tool does**, and the Batches table fits
    the screen. Changing a code in the editor moved ledger movements and left invoice lines
    pointing at the old code, so the ledger read right and the invoice it came from read wrong
    with nothing to explain why; it now moves invoice lines and staged entries too, and says so
    before you save. The Batches table was wider than its container and the overflow was invisible
    wherever the system hides scrollbars: the Inventory screen is now exempt from the
    reading-width cap, *Not sold* moved under the Sold figure rather than holding a column of
    dashes, and the scroll is styled so a narrow screen shows there is more. ✅
33. **The stacked bar says what it is.** Its lower segment is the cost of the units that have
    sold, not the capital recovered — an invoice 150% recouped has its capital back in full while
    that segment sits near 60%. The label said "capital back", which contradicted the total above
    it. It now reads *stock sold, at cost* beneath *profit on it*, so the pale part doubles as
    sell-through measured in money and profit stays visible from the first sale rather than only
    after break-even. Both segments are one hue, the lower a tint. ✅
34. **Returned beyond cost**, a fifth tile: the money invoices have brought in past what they
    themselves cost. Counted per invoice, so a batch still in the red does not cancel one that is
    ahead — the first one's shelf stock is not cash. Accumulated profit was already on the
    Overview as *Profit realised*; this is the different question of how much has come back above
    the line the chart draws at 100%. ✅
35. **The Overview and Batches report posted invoices, and nothing else.** A shop that inherited
    its stock has batches in the ledger that no document stands behind — opening balances, ledger
    imports — and their costs are guesses. Mixing them with invoiced stock produced figures that
    were part record and part guess with no way to tell which. Every number on the Overview, and
    every row in Batches, now comes from a batch a posted invoice created; both say how many
    batches that leaves out. FIFO still draws on every lot, so costs and sell-through are
    unchanged, and Stock, Reorder and Count still show the whole shelf. ✅
