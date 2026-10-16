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
counted back from it. Margins everywhere are **net-to-net**: purchase cost stripped by its line VAT, sale
price stripped by the rate for the product's type (configurable in Settings; a movement's own VAT %
overrides). The Finance tab shows **output VAT** (sales, from settlement) beside **input VAT** (purchases,
from the ledger) over any range, for a by-hand net-VAT / Fivaldi reconciliation.

## Financial tracker
A **Finance** tab, parallel to Analytics, imports the **Vektori Transaction Report** (.csv/.xlsx) —
one settlement record per day carrying gross, net, VAT by rate, refunds, roundings and the
cash / card split. Re-importing the same days changes nothing (duplicates skipped). It summarises any
period — day / week / month, or a custom date range — with KPIs, a gross time-series, a VAT summary
(net · VAT · gross by rate, Fivaldi-ready) and a payment-method breakdown, all exportable to one .xlsx.
A **reconciliation** panel compares the till's gross against the in-person sales recorded in the app
for the same period, flagging the variance (discounts, gift cards and cash-float are expected gaps).
The Settlement Report isn't needed — the Transaction Report carries the same totals plus daily detail.

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
