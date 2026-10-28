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

Sales reports import **several files at once** — a weekly Vektori export is a stack of them — each
keeping its own period, with a warning when a period crosses a month boundary (a Vektori report carries
no per-line date, so the whole file is dated to the end of its period). Duplicates are caught across the
whole set, so re-adding a week already imported changes nothing.

Plus a **staging** queue (codes seen in an import but not yet in the catalogue, confirmed in
with the code intact), a **sales/analytics** layer fed by WooCommerce / Vektori exports, and a
**financial tracker** fed by Vektori settlement data (see below).

Each sale channel carries a **mode** — *in-person* or *online* — so analytics can split takings by
mode (Vektori = in-person counter, WooCommerce = online) independently of how many channels feed each.

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

Nothing is written until the draft **agrees with the total printed on the invoice**, to the cent:
*Post to ledger* stays disabled while the difference is anything but zero. A missing, doubled or
mistyped line shows up as a gap, which is how a 30-line invoice gets checked without reading it twice.
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
gate is still satisfied against the paper invoice rather than against the file that produced it.

## Re-coding products
Product codes can be changed in bulk — moving a catalogue to EAN numbers, say. Download the catalogue
as a sheet with an empty **New code** column, fill in only the rows to change, and upload it back:
blank rows are left alone, and every change is previewed with the number of ledger movements and draft
lines that will follow each code before anything is written. Unknown codes, duplicates within the file
and collisions with existing products are reported and block the commit. Renaming carries history: the
catalogue entry, its movements, its staged entries and any invoice draft lines all move together.

## Supplier article numbers
The catalogue's supplier + supplier-ref pair is a live index. An imported or posted line whose code is
unknown but whose provider and reference match a catalogue product resolves onto that product, and the
import says how many lines matched that way. So the first invoice from a supplier teaches the map —
give its lines codes in your own scheme with one button, or set them as you confirm staging — and every
later invoice from them lands on your codes with no staging at all.

## Out-movement kinds
Each out-channel carries a **kind** — sale, adjustment, write-off or gift. Every out line consumes
stock in FIFO order, because a unit that left the shelf has left it either way; only a *sale* line
books takings, COGS and margin. A breakage or a stock-count correction therefore shows up as units
*not sold* (with their cost) in Inventory and Batches, instead of quietly depressing ROI and
sell-through as a sale at zero.

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
quantity into the **net landed cost** — entered once per batch (repeated on each line or on one). Margins
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
