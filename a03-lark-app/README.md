# A03 Budget Workspace

## Background
Vietnamese budget operations using an authorized one-time copy of A03. The original source Base remains unchanged. Approval occurs inside this application, as explicitly chosen by the user.

## Requested features
Enter proposed amounts in Lark Sheets, configure sequential reviewer nodes, capture comments and timestamps, and automatically write the exact approved snapshot into the app's A03 after the last reviewer agrees.

## Implemented capabilities
Server-filtered paginated A03 ledger, source details, CSV export, real embedded Lark Sheets, and draft creation. The request list has an explicit Open request / Submit entry. Draft details always show the submit button, disabled with prerequisite guidance until reviewers and a Sheet preview are ready. Request details provide one to five sequential nodes selected from the Lark directory, Sheet preview and a matching digest before submission, assigned-reviewer actions, rejection with reason, creator withdrawal, immutable money snapshots and audit history. Requests are visible only to their creator or assigned reviewers. Server authorization uses CURRENT_USER_ID and stored personnel fields. The final approval checks the baseline and persists a syncing marker before one bounded batch write to the app's copied A03. Unknown or partial writes stop for manual reconciliation and cannot be retried through the approval action.

## Status and limitations
Not production. Server-side Sheet integration requires configured application credentials and bot read access to the workbook; CLI authorization alone is insufficient. Missing configuration blocks submission before any financial write. No native Lark Approval instance or automatic IM notification is created. The ledger copy is not synchronized back to the original Base. Formula/lookup/system fields remain snapshots. All admitted users can read the ledger, with no B04 Brand segregation. Request reads and actions enforce assigned identities separately. The creator cannot approve their own request. Base has no distributed CAS or transactional financial write guarantee; one-process locks, request versions and persisted markers reduce duplicate processing but cannot guarantee isolation across runtime instances or concurrent direct Base edits. Concurrent processing must be operationally avoided. Browser, multi-user approval, real Sheet integration and financial end-to-end acceptance remain pending until configuration and authorized testing. Native document sharing settings are unchanged.

## Development
Generate contracts, run local/full checks, and deploy Preview through Base Database CLI. Production requires review and approval of the same Preview artifact. Never put application secrets into Page code, repository files or logs.
