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
with the code intact) and a **sales/analytics** layer fed by WooCommerce / Vektori exports.

## Secure editing
The product code is the unique key. Product edits are validated as a whole before anything is
written (code required + unique, name required, numbers valid); nothing commits until valid, and
renaming a code relinks its ledger movements atomically. A code with movements can't be deleted.

## Data
Lives in this browser (localStorage). Export a portable **core file** (`.json`), optionally
AES-256 encrypted, from Settings. Catalogue and ledger also export to CSV. No data is stored in
this repository — only the app code.

## Inventory (FIFO)
An Inventory tab derives, from the one ledger, FIFO stock per code — received, sold, on-hand,
sell-through, FIFO cost, realized profit and ROI (only units matched to a cost lot count), plus a
reorder list (sellable, out of stock, previously moved) carrying provider + provider ref, exportable.

## Build phases
1. Catalogue · Ledger · Staging · Settings — foundation. ✅
2. Ledger import (Excel/CSV template): append, skip duplicates, route unknown codes to staging. ✅
3. Sales & analytics from WooCommerce / Vektori exports (imported as ledger out-movements), and report/file generation. ✅
4. Auto batch references, the provider-reference bridge, and the Inventory (FIFO) tab with reorder. ✅
5. Per-item reorder points, a catalogue import template + bulk-confirm staging, and .xlsx reports. ✅
