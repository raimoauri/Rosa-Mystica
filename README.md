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
