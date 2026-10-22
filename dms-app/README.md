# DMS Distribution Management

## Background
Internal distribution operations for distributors, dealers, products, sales orders and stock ledgers. Vietnamese interface and VND pricing.

## Requested features
Manage distributors and dealers, orders and inventory on Lark Base.

## Implemented capabilities
Partner, product and warehouse creation and editing; multi-product draft orders with server-calculated price snapshots; order status and collected-amount updates; append-only receipt/issue vouchers; inventory by warehouse, low-stock alerts, receivables, dashboard and dealer-visit GPS check-ins. Check-ins capture browser coordinates only after an explicit user action and permission grant, and store the server timestamp, accuracy and current operator ID. All admitted users share the same operations access. Only the six dedicated DMS tables are bound.

## Status and limitations
Preview implementation. Dealer-visit GPS is an explicit, one-time browser geolocation check-in; it does not track in the background, verify proximity to a saved dealer address, or prevent location spoofing. It requires a supported browser, location permission and network access. Order status changes do not create stock vouchers; operators record warehouse movements separately and link the order code. Inventory is a reporting ledger, with negative balances highlighted; there is no atomic reservation or prevention of overselling. Collected amount is a current balance, not an accounting payment ledger. No strict role segregation, tax invoice, purchasing, returns workflow or offline mode. Concurrent edits require operational coordination; the backend has no transactional compare-and-set or uniqueness guarantee. Records with unknown write outcomes must be reconciled before manual retry. UI interaction and multi-user behavior require user acceptance.

## Local project
Run base-database-cli contracts generate, check --json, then deploy. Production promotion requires approval after Preview review.
