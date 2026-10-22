# Project Data and Persistence Contract

**Status:** Target contract approved for documentation on 2026-10-22; not implemented.
**Authority:** Canonical serialized project, identity, validation, migration, and persistence contract. Product concepts and optimizer request types do not override this format.

**Revision:** 2026-10-22 final review resolved: legacy-tab cutover, uncertain mutation reconciliation, retained creation metadata, and bounded snapshots/status reads. Earlier review resolutions remain in force.

## Scope and delivery boundaries

The current application implements schema v1 and synchronous whole-library localStorage persistence. It does not implement the recovery, repository, schema-v2, or cloud guarantees below. This document does not certify current behavior or authorize application changes.

- **MVP:** Existing local cutlist application; preserve the completed implementation plan as historical evidence.
- **Phase 2:** Plan local recovery, an asynchronous per-project repository, explicit identity operations, v1-to-v2 migration, and the embedded design contract before implementing design persistence. No accounts, Worker API, D1, R2, or network sync.
- **Phase 3:** Implement authentication, account migration, cloud saves, concurrency, retries, deletion synchronization, and Cloudflare storage. Revalidate platform/auth compatibility before implementation.
- Full offline PWA support and collaborative editing remain later work. Safe recovery from temporary connection failure is required for Phase 3 saves.

## Portable project schema

Use the existing serialized field names. UUIDs are generated on the client for new projects and entities. Legacy nonempty string IDs remain supported during migration; do not rewrite existing IDs merely to enforce UUID formatting. Entity IDs are unique within their entity collection in a project; stock IDs are unique across all its materials. References are project-scoped. Database child keys, if introduced, must include project identity.

The following is the normative target schema-v2 cutlist shape. All fields are required unless marked optional. `Dimension` and `Money` retain the current wrappers; changing wrappers requires a new document version.

```ts
type Dimension = { um: number }; // positive safe integer, except settings allowing zero
type Money = { cents: number }; // nonnegative safe integer
type Part = {
  id: string;
  name: string;
  materialId: string;
  length: Dimension;
  width?: Dimension; // required for sheet parts
  crossSection?: { width: Dimension; thickness: Dimension }; // linear only
  grainLocked?: boolean; // meaningful only for sheets; absent means false
  quantity: number; // positive safe integer
  group?: string;
  notes?: string;
};
type StockOption = {
  id: string;
  name: string;
  length: Dimension;
  widthUm?: number; // positive safe integer; required for sheets and board-foot rates
  thicknessUm?: number; // positive safe integer; required for board-foot rates
  price?: Money; // missing means unknown, not zero
  priceBasis?: 'piece' | 'board-foot'; // absent means piece
  quantityLimit?: number; // maximum purchases, absent means unlimited
  ownedQuantity: number; // nonnegative project-local available count
};
type Material = {
  id: string;
  name: string;
  type: 'linear' | 'sheet';
  stocks: StockOption[];
};
type ProjectDocumentV2 = {
  schemaVersion: 2;
  id: string;
  name: string;
  notes?: string;
  unitSystem: 'imperial' | 'metric';
  kerf: Dimension; // zero allowed
  trim: Dimension; // zero allowed
  minOffcutLinear: Dimension; // zero allowed
  minOffcutSheet: { shortSideUm: number; longSideUm: number }; // nonnegative safe integers; short <= long
  sheetLayout?: 'cheapest' | 'simplestCuts'; // absent means cheapest
  currency: 'CAD' | 'USD' | 'EUR' | 'GBP'; // initial supported two-minor-unit currencies
  taxRate?: number; // finite percentage in [0, 100], absent means zero
  parts: Part[];
  materials: Material[];
  createdAt: string; // canonical UTC ISO 8601
  updatedAt: string; // canonical UTC ISO 8601; content metadata, never a lock
  design?: DesignDocumentV1;
};
```

`DesignDocumentV1` is an independently versioned renderer-free domain document, defined under the design requirements below. Its exact geometry records must be specified in the Phase 2 plan before v2 implementation; this is the remaining schema gate, not permission to accept arbitrary JSON.

`label`, `stockOptions`, `maxQty`, and `isOwned` are conceptual/optimizer names, not aliases accepted in v2. `materialChoices`, `pinned`, nominal-size catalogs, inventory references, and price profiles are future extensions requiring explicit versioning. The selected material remains `materialId`. Preset nominal labels may appear in names; actual stock dimensions determine fit.

Persist canonical integer micrometers regardless of display units. Display-unit changes never rescale stored dimensions. Monetary amounts are project-currency minor units. Initial supported currencies must use two minor-unit digits; supporting other currency exponents needs a new contract. Changing currency requires an explicit relabel confirmation and performs no exchange conversion. Board-foot `price.cents` is a rate per board foot; piece pricing is derived with explicit rounding to cents. Sheet stock permits piece pricing only. Missing price is optimization-incomplete; owned stock is consumed at zero acquisition cost without erasing its purchase rate.

Project materials and prices are snapshots. A later account library copies values into a project; changing the library never mutates saved projects silently. `ownedQuantity` is not a reservation against shared inventory.

## Validation and draft readiness

Use a portable, deterministic validator/migrator shared by browser and future Worker. The server validates independently of client claims. Return structured issues with code, field path, and severity; distinguish malformed/unsupported documents from valid drafts that cannot yet optimize.

- Validate records before applying defaults or traversing nested fields; reject null records, wrong types, duplicate IDs, dangling material references, and unsupported versions/discriminants.
- Validate all text including project notes; names must be nonblank. Use absent optional fields rather than null. Reject unknown fields for the supported version; preserve the original source on rejection rather than silently stripping future data.
- Enforce safe integer dimensions/counts/money, finite tax/transform values, and domain bounds. Before optimization, guard multiplication, area/volume calculations, expanded quantities, and cost totals against unsafe arithmetic. Individually safe operands do not guarantee safe results.
- Sheet part width and sheet stock width are required in v2. Linear cross-section requires both dimensions when present; generated boards require it. Missing actual stock cross-section produces unverified fit, never verified compatibility. Legacy irrelevant grain flags may be preserved but have no linear effect.
- Empty projects/material stock lists and missing prices are valid drafts. Impossible fit, no eligible stock, and missing prices block the affected optimization with actionable issues, not project saving.
- New timestamps must round-trip as canonical UTC ISO strings. Cloud receipt/update times are separately server-controlled. Never trust device clock order for concurrency.

Initial protective limits: IDs 128 characters, names/group 256 characters, notes 16,384 characters per field; at most 10,000 part rows, 1,000 materials, 10,000 total stock rows, 10,000 per-row quantity/owned/purchase count, and 100,000 expanded requested pieces. These are safety ceilings, not performance promises; benchmark and impose lower optimizer execution limits independently. Define geometry count/depth limits with the Phase 2 design schema. Limit the complete UTF-8 serialized project to 1,000,000 bytes initially, including design and projection snapshots. Reject oversize writes explicitly while retaining the prior saved version and the unsaved work. Any limit change must be documented and old data retained on incompatibility.

## Versions and migration

Document schema version, embedded design version, database migration version, local storage layout version, local edit generation, and server revision are independent concepts.

Migration is an explicit pure pipeline: parse unknown input, validate the source version, normalize documented legacy defaults, migrate, validate the target, then commit atomically. Keep golden v1 fixtures for early missing defaults. Preserve existing IDs and cutlist values; do not add `design` to migrated cutlist-only projects. Keep a recoverable pre-migration copy until successful reopen.

V1 compatibility does not imply v2 validity. Previously accepted data outside the tightened v2 contract is legacy-compatible data requiring repair, not necessarily corruption. The migration result reports every applicable issue and preserves the original bytes. Never silently invent dates/dimensions, truncate content, discard records, convert currency, or rewrite identities to pass validation.

| V1-to-v2 difference | Required handling |
|---|---|
| Missing/null legacy default fields | Normalize only the existing documented defaults: `createdAt = updatedAt`, `currency = CAD`, `minOffcutLinear.um = 304800`, `minOffcutSheet = { shortSideUm: 150000, longSideUm: 300000 }`, material `type = linear`. Validate container records first; an invalid source date still requires repair. |
| Valid date string in a noncanonical timezone/format | Normalize to UTC ISO only when unambiguous and the instant round-trips; otherwise explicit date repair. Empty/invalid timestamps require user-confirmed replacement. |
| Missing sheet part/stock width; sheet board-foot pricing | Explicit dimension/pricing repair. Preserve original rates and units for review; never reinterpret a rate as a piece price. |
| Currency outside CAD/USD/EUR/GBP | Explicit relabel with confirmation and no conversion, or retain legacy-only access. No silent case normalization or currency substitution. |
| New ID/text/count/expanded-piece/byte limits | Explicit repair of a working copy, or retain legacy-only access. ID repairs must atomically rebind all references; no automatic truncation or splitting. |
| Reversed offcut short/long settings | Explicit confirmation to reorder; retain original values until approved. |
| Unknown fields, invalid project notes, incompatible optional/null fields, new cross-section/design constraints | Report paths and require explicit repair/removal in a copy, or legacy-only access. Valid irrelevant linear width/grain fields remain preserved with no new linear-fit meaning. |
| Invalid references, duplicate IDs, wrong types or nonfinite/unsafe values | Recoverable validation failure; explicit repair with reference checks, never last-entry-wins. |

Absent optional fields keep the documented v1 semantics: `sheetLayout = cheapest`, `priceBasis = piece`, unlocked sheet grain, zero tax, and unlimited purchases. Material/stock IDs and valid cutlist values are preserved. No design is added to cutlist-only migrations. All target constraints, including the tables and limits above, run before commit; new constraints added later must add a compatibility case and golden fixture.

Legacy-only access means a recovery view and download of the exact original bytes without migration or v2 validation. It does not permit normal v2 editing/upload. Repair works on a separate candidate and cannot replace the original until explicitly accepted and durably committed. Unknown/newer project or design versions are likewise recoverable read-only payloads; an older client cannot save over them.

## Design projection integrity (Phase 2)

The exact geometry record schema remains a Phase 2 prerequisite. Its link lifecycle must distinguish current active references from historical provenance; both are portable inside the design document.

- Active links resolve current definition, contributing instance, material, and Part IDs in this project. A contributing live instance can belong to only one active generated row. Validate current dimensions and generated-board cross-sections.
- Last-applied projection provenance is an immutable bounded snapshot of source IDs and projected fields at the last accepted apply. Historical IDs may reference deleted or replaced sources; they are not required to resolve in current geometry. They cannot act as current material/geometry pointers.
- Deleting a source changes affected links to `pending-removal`; Make Unique or aggregation changes mark them `pending-reconcile`. The existing Part and last-applied snapshot remain saveable while the review is pending. Marking these states is part of the same local command/transaction as the geometry change.
- Manual deletion of a generated Part creates a `pending-part-deletion` link state retaining historical provenance, rather than an invalid active dangling Part reference. A preview must not silently recreate the row. Detach explicitly removes active ownership, retains the Part as manual, and retires the link; missing references in active links remain errors.
- Applying a reviewed projection atomically replaces current Parts and affected links/snapshots; removing a Part retires its link. Keeping manual rows during source deletion detaches them. Historical links are retired/removed once resolved; no unbounded provenance log is required.
- Every pending state must identify its reason and last-applied source/Part IDs so review can compare the retained Part, current design, and prior projection. Pending inconsistencies are saveable warnings; malformed links are validation errors. A copy preserves this lifecycle within its own project scope.

## Identity and backup operations

| Operation | Identity and behavior |
|---|---|
| Create | Fresh project UUID and fresh timestamps. |
| Duplicate / import as copy | Always fresh project UUID and timestamps, even without a local collision. Preserve child IDs within the new project scope and internal links; deep-copy content. Remove account/sync bindings. |
| Restore into existing project | Explicit confirmation; retain destination ID and creation timestamp, replace validated content, update content timestamp, and save against destination concurrency token. Backup revisions never authorize overwrite. |
| Export backup | Portable document only, including design and links; exclude owner, credentials, sync tokens, pending operations, and derived renderer state. |
| Attach local project to account | Phase 3 explicit upload; preserve project identity when available in that account. Existing remote identity requires comparison/conflict resolution, never implicit replacement. |

For a copy, active design links resolve inside the copied document; historical provenance follows the lifecycle above. If a future schema includes explicit project references, rebind those references in the copy. An imported document ID is not proof of ownership.

Local repository keys are `(namespace, projectId)`: `local` for unbound projects or an immutable authenticated account ID for account-bound copies. New Phase 2 records use `local`; reserve the namespace key now without implementing accounts. Phase 3 cached documents, summaries, recovery records, subscriptions, receipts, pending operations, and cursors are all account-scoped. The same project ID in two namespaces is valid. Route resolution must include the selected namespace; never fall back to another account's record on a miss.

Attaching a local project creates an account-bound copy and a durable mapping from the local identity to that account identity; it does not move/remove the original. On acknowledgment, the mapping records the accepted revision. Subsequent edits to the original are independent and do not auto-upload. Upload retry/resume uses the account-bound copy. Duplicating/importing as copy creates an unbound local project by default; explicit upload is separate.

On sign-out/account switch, immediately stop that account's subscriptions/network dispatch and hide its cache/recovery records from the active UI. Retain its unsent work and cache in the isolated namespace for resumption only after reauthentication as that account. A response in flight is processed only into its originating namespace. Offer export/explicit cache removal before discarding unsent work; never relabel it for the next account. Browser storage isolation is an application authorization boundary, not encryption against another user of the same browser profile.

## Local repository and recovery (Phase 2)

Routes/editor logic depend on an asynchronous per-project repository, not localStorage or a collection overwrite. Define `list`, `get`, `create`, `save`, `delete`, and change subscription. List returns lightweight summaries and per-record issues without loading every design. Get/save return typed success, not-found, conflict, validation, unsupported-version, quota, or storage-failure results. Delete also takes a concurrency token.

An editor's in-memory `editSequence` advances on domain edits. The persisted `localGeneration` advances only after a successful repository commit; save supplies the generation originally read and a mismatch returns conflict. Failed/quota writes advance neither committed generation nor acknowledged server revision. The editor records the edit sequence captured by each save and retains later edits as dirty when that save completes. `serverRevision` is the separately acknowledged remote version, not a local concurrency token. Commit per project using IndexedDB transactions; notifications invalidate other tabs' cached records but do not replace checks.

Phase 2 stores namespace and committed generation transactionally and defines the repository boundary for future sync metadata; it does not implement an uploader/outbox. In Phase 3, every account-bound local save atomically commits document, incremented local generation, and durable `needsSync` marker in the same IndexedDB transaction. A crash cannot leave committed changes falsely clean. Local-only saves need no sync marker. Applying remote content also checks the local generation so dirty work cannot be overwritten.

Read failures must never become an empty library. Preserve raw unreadable records, enumerate recoverable errors, and allow valid projects to open independently. Quarantine must retain bytes and identity where available and must not be included in ordinary overwrites. On conversion from the legacy whole-library key, read without changing it, recover each record independently, commit the new store, reopen/verify, and retain a recovery copy. Duplicate project IDs are a recovery conflict, not last-entry-wins.

Only acknowledge persistence after commit. On quota/write failure retain dirty editor state, show unsaved status, and offer export/retry. Never clear data automatically to make room. A failed import/migration leaves the destination unchanged. Repository behavior is identical for Cutlist and Design.

### Legacy-tab cutover (Phase 2)

LocalStorage and IndexedDB do not share a transaction. Already-open v1 tabs do not honor a new marker; notifications cannot force them to stop writing. Keep the legacy key intact, stop writing it from new clients, and make IndexedDB authoritative after verified cutover.

Under an IndexedDB migration-owner record, preserve exact initial legacy bytes/hash, attempt ID, and destination generations. Re-read the key after copying/reopening. Changed bytes become a separate recovery candidate, never silent overwrite/reimport; record completion only for the verified source hash. Resume interrupted attempts without duplicating imports. A later legacy write does not roll back IndexedDB authority.

Monitor legacy-key storage events, check on startup/focus and before migration completion, and poll every 60 seconds while foregrounded. Preserve each observed changed payload and SHA-256 hash in a recovery transaction before marking it recovered; deduplicate by hash. Retain whole-library bytes, including apparent omissions: an old stale collection cannot delete newer-store projects. Require explicit compare/restore-as-copy or destination-generation-checked repair; never auto-upload candidates. If recovery storage fills, retain the source, report incomplete recovery, and offer raw export.

Prompt users to export/save old-tab work and reload all old tabs. An uncooperative v1 tab cannot be forcibly fenced, and values overwritten by other old writes before observation cannot be guaranteed recoverable; state this limitation in migration feedback. Do not automatically delete the legacy key or recovery candidates after cutover.

## Cloud record and save protocol (Phase 3 only)

Use a Worker API with D1 as the authority for ownership and revisions. Start with one validated project JSON aggregate rather than separate relational rows for every component. A conceptual project row has:

| Field | Contract |
|---|---|
| `owner_id`, `project_id` | Composite primary key; owner references authenticated user. |
| `revision` | Positive server-controlled integer; increments on accepted mutation, including deletion. |
| `document_json` | Live validated project document as TEXT; nullable after deleted content expires. JSON validity plus application schema validation. Document `id` must exactly equal row/request `project_id`. |
| `document_schema_version` | Matches retained content; nullable when content is purged. |
| `name`, `part_count` | Server-derived listing projections, updated atomically; cleared on content purge. |
| `server_created_at`, `server_updated_at` | Server UTC timestamps; independent of portable content dates. |
| `document_created_at` | Original validated portable creation timestamp; retained after content purge and restored into `document.createdAt`. |
| `deleted_at` | Nullable server deletion timestamp; tombstone retains identity/revision. |

Index account listings by `(owner_id, deleted_at, server_updated_at, project_id)`. Use bound SQL parameters. Derive owner from the authenticated session; reject attempted owner changes. Every read, list, mutation, asset access, and restore is account-authorized. Phase 3 enforces a fixed limit of three live cloud projects per account atomically, including concurrent creates/restores; tombstones and local copies do not count. Phase 4 adds paid entitlements/billing and configurable tier limits. Enforce document/row size limits on both create and restore.

Save requests carry the document, `baseRevision` (zero only for create), and a client-generated `mutationId`. Perform an atomic compare-and-set under owner/project identity; accept only the expected revision on a live project. A mismatch yields a conflict with the current authorized revision. Return the accepted revision and server time. Do not use blind upserts or client timestamps to resolve conflicts.

Create initializes `document_created_at` from validated content. Saves/restores preserve it; reject ordinary saves changing it. A new copy gets fresh timestamps. After content expiry, restore uses retained destination `document_created_at`, never the backup's date or `server_created_at`.

Keep an account-scoped durable mutation receipt recording operation, project, request hash, accepted revision, and original acknowledgment. Repeating the same mutation ID and request returns that outcome; different content fails. Authenticate/authorize first, enforce bounded input parsing, and look up an existing receipt before current document-version/business validation. Thus a committed legacy request remains retryable after an upgrade. Hash SHA-256 over the exact immutable UTF-8 request body containing protocol version, mutation ID, operation, project ID, base revision, and payload; the client must persist/retry identical bytes. Transport headers and compression are not part of the hash. New operations use a new mutation ID.

Retain accepted and cancelled receipts for the account lifetime initially, deleting them with account purge. A receipt holds bounded metadata/acknowledgment only (maximum 4096 UTF-8 bytes), never full documents or conflict snapshots. Failed validation/conflicts do not consume a success receipt; they make no mutation. Do not expire receipts independently of the supported retry horizon; any future retention change requires a protocol revision and explicit expired-operation reconciliation. Set pending operations to needs-attention after bounded automatic retry attempts, retaining them for manual retry/reconciliation rather than generating new mutation IDs. Do not replay an original acknowledgment as current content; fetch current state separately.

Write the receipt, project mutation, account change event, and any quota update atomically in the same D1 database. A zero-row conditional update is a conflict, not success; transaction logic must explicitly enforce it. D1 batch rollback on SQL failure alone does not make a zero-row update an error. Keep each account's authoritative data/receipts/change stream together if database sharding is introduced; do not assume cross-database transactions.

The local account-scoped sync record stores project ID, last acknowledged server revision, acknowledged local generation/base content, dirty generation, immutable pending request bytes/mutation ID, and sync status. Claim dispatch using a transactionally stored per-project lease shared across tabs/workers: holder token, expiry, and increasing fencing generation. Only a current lease holder may claim the next request or update dispatch state. Claim/renew/release and request creation are IndexedDB transactions. If a lease expires during a network request, a successor retries the same pending request/ID; server receipts prevent duplicate application. Never create a successor request until the predecessor outcome is reconciled.

Atomically acknowledge an upload by recording its accepted server revision/base content and uploaded local generation, removing that exact pending request, and clearing `needsSync` only if no newer committed generation exists. Stale lease holders cannot mutate queue state. Edits made during upload remain dirty and become the next immutable request against the acknowledged revision. Persist all queue transitions before dispatch; retry transient failures with bounded exponential backoff and jitter. Authentication failures pause dispatch until reauthentication. Preserve pending work across reload and namespace switching. Remote content/base replacement and cursor acknowledgment also require transactional generation checks.

Conflicts preserve local and remote content and offer compare/keep remote/save local as a copy; replacing remote requires explicit resolution against its latest revision. No silent last-write-wins or automatic field merge is required initially. The design-to-cutlist field conflict workflow remains separate from cloud document conflicts.

### Discard and uncertain mutations (Phase 3 only)

Persist `never-dispatched` versus `may-have-reached-server` before dispatch. Only a never-dispatched operation may be discarded locally under the current lease. Aborting fetch, losing a response, closing a tab, signing out, or a negative receipt lookup cannot prove an in-flight write failed. Preserve immutable request bytes/ID and reconciliation metadata until a terminal outcome is durably recorded. Keep-remote, export/discard, and cache eviction follow this rule.

An authenticated primary receipt lookup can establish an accepted outcome. To abandon an uncertain request without replaying its write, use an account-authorized cancellation endpoint carrying its original mutation ID, request hash, and operation/project identity. Within the same D1 transaction/receipt-uniqueness boundary as writes, return an existing accepted outcome or insert a terminal `cancelled` receipt. Normal writes check receipts inside their transaction: cancellation winning prevents late/retried application; a write winning remains accepted. Cancellation is idempotent and does not change project revision, quota, or change events. Mismatched hashes fail. A missing receipt alone never authorizes discard.

Retain cancellation receipts for the account lifetime under the same bounded receipt/upgrade rules as accepted receipts. Persist terminal cancellation locally before clearing queue state. If already accepted, reconcile its acknowledgment and current remote state before completing keep-remote/eviction. Undoing accepted work requires a new explicitly confirmed revision-checked mutation and may conflict with subsequent edits. Offline/unauthenticated abandonment remains pending; export and hiding an account namespace are allowed, deleting the reconciliation record is not.

First-login migration requires explicit project selection and per-project confirmation of acknowledged uploads; local originals remain available. Durable account/project mappings and mutation receipts prevent duplicates across interrupted/repeated migration. Matching IDs alone never justify replacement. Sign-in does not silently upload the entire local library.

Deletion is a revision-checked mutation producing a tombstone; pending stale saves cannot recreate it. Retain minimal `(owner_id, project_id, revision, deleted_at, document_created_at)` tombstones for the account lifetime. Retain the last deleted document for 30 days using server time, then purge its content/listing projections and any unreferenced assets; keep revision/deletion/creation metadata and receipts. Delete does not imply a general revision-history archive. Service backups have separate operational expiry and must never re-expose purged content through normal reads.

Before expiry, restore uses retained content and the latest tombstone revision. After expiry, restore requires an explicitly supplied validated backup and the latest tombstone revision; without one, return content-expired and offer a new project. Both paths enforce live-project quota and create a new revision/change event atomically. Source backup ID is rebound to the destination project identity under explicit restore confirmation; content timestamps follow restore rules. A repeated create with base revision zero cannot overwrite a tombstone.

For an unbound local project, Delete removes that local record after confirmation/recovery handling. For an account-bound project, distinguish `Remove from this device` (cache eviction only, blocked on unsent work until export/discard confirmation) from `Delete everywhere` (revision-checked cloud delete). Dirty offline work blocks automatic application of a remote tombstone and becomes a conflict with export/save-as-copy/discard options. A cache eviction suppresses local redownload until explicit reopen, but the authorized cloud dashboard may still list the remote project. Clearing a pending local delete is not a remote restore after acknowledgment.

Account deletion immediately disables account access and dispatch, invalidates sessions, and schedules primary content/assets/receipts/events/tombstones for purge within 30 days; retained service backups must expire within 30 further days and remain inaccessible to application users. Track completion without retaining project content. Reauthentication for a newly created account must get a new immutable account ID; old caches/mappings cannot attach automatically. Recheck these operational retention guarantees before launch and disclose them in the privacy policy.

Use a primary read or D1 Sessions API/bookmarks when read replication is enabled so a refresh does not regress behind an acknowledged write. Do not use KV as the authority for projects, revisions, or mutation receipts.

## Remote discovery and reconciliation (Phase 3 only)

Use an account-scoped append-only change stream with monotonically increasing sequence numbers allocated transactionally with each accepted create/save/delete/restore. Events contain project ID, resulting revision, operation, and server timestamp, not complete documents. Mutations return their change sequence and consistency bookmark where applicable. Per-project revisions, timestamps, and D1 bookmarks are not substitutes for a change cursor.

An authorized initial snapshot captures a fixed account high-water sequence and all live project summaries with IDs/revisions, excluding lifetime tombstones. The live-project cap does not bound deleted history. Phase 3 captures at most three live summaries and the high-water sequence in one bounded consistent D1 read, retaining the immutable snapshot for 15 minutes. Use an account/protocol-bound opaque token and stable pagination; pages cannot change membership/order. Consume subsequent events after the snapshot high-water sequence.

Snapshot/change pages have at most 100 records and 256,000 UTF-8 response bytes, whichever is reached first; fetch document bodies separately. Bound summary/event fields so each record fits. Use indexed keyset queries with explicit limits, never unbounded SQL aggregation, OFFSET scans, or loading all rows before slicing. Reuse/resume one active snapshot per account; clean expired materializations and return reset-required for expired/superseded tokens. Before Phase 4 increases live-project limits, specify bounded materialization for larger snapshots; a single unbounded result/transaction is not an allowed fallback.

After a complete live snapshot, reconcile locally known account IDs absent from it through an authenticated status endpoint in batches of at most 100 IDs under the same response byte budget. Query only indexed account/project keys; return current live/tombstone/not-found status, revision, and retained creation metadata where present. Never enumerate all tombstones. Reads must be at least as fresh as the snapshot boundary. Explicit tombstone/not-found results permit clean-cache removal; dirty/pending records become durable conflicts. A missing page entry, failed request, or partial batch never proves deletion. Newer live results use local-generation checks and must not regress newer known revisions. Reconcile uncertain mutations before eviction, durably track completed batches, and resume interrupted scans. Lifetime tombstones are a storage-growth policy, not permission for unbounded request work.

Change pages return events in increasing sequence order, a fixed upper-bound sequence for the scan, and opaque continuation cursors bound to account/protocol. Fetch current documents for changed live records; a fetched revision may be newer than its event and older events must never regress local state. Fetches must be at least as fresh as the triggering event using primary reads or the corresponding session bookmark. Apply pages and advance the local cursor atomically only after each event's result or durable dirty/unsupported-version conflict record is stored. A missing ID on an ordinary listing page never implies deletion.

Retain events for at least 90 days. Expired/invalid snapshot tokens or event cursors return an explicit reset-required result; do not silently skip to current time. Recovery takes a new authoritative live snapshot and the bounded status reconciliation described above, for account-bound records only. Only an explicit tombstone/not-found status becomes a durable remote-missing conflict when dirty/pending, or cache removal when clean. Preserve pending request bytes and reconcile uncertain mutations against receipts before redispatch. Never infer deletion of unbound local originals.

Refresh on authenticated startup/sign-in, reconnect, window focus, explicit refresh, and every 60 seconds while an authenticated cloud view is foregrounded; debounce overlapping refreshes. Polling is sufficient for Phase 3; push collaboration is not required. Dirty local records are never replaced by discovery; preserve their base/local/current-remote states for conflict resolution. Unknown remote versions preserve the last editable local copy and expose a recoverable unsupported-version record, not a fabricated empty project.

## Size, assets, and derived data

D1 currently limits a string/BLOB/row to 2,000,000 bytes. The initial 1,000,000-byte document ceiling reserves headroom and applies locally so unsupported cloud uploads are not a surprise. Measure actual UTF-8 bytes, not character count. Avoid base64 assets, meshes, and unbounded undo history in the document. Design snapshots contain only last-applied projection fields needed to detect manual edits.

R2 is reserved for future larger immutable content/assets. An R2-backed document mode requires an explicit storage-envelope version, upload validation, immutable keys/checksums, authorization, and orphan cleanup. Publish the D1 pointer only after object upload succeeds; D1 and R2 do not share a transaction. Project backup must still export a complete portable bundle. Do not silently split the Phase 2 embedded design or add R2 implementation before Phase 3.

Optimizer output is a disposable cache outside the authoritative document, keyed by input revision/hash, optimizer version, and options/seed. Drop it on mismatch; authoritative inputs remain sufficient to recompute. Camera/display preferences need an explicit local-versus-portable scope in the Phase 2 plan; renderer objects never enter the schema.

## Required verification when implemented

- Golden v1 migration, documented default normalization, v2 round-trip, unknown versions/fields, repair-required legacy dates/sheet widths, and no-design preservation.
- Duplicate/copy with repeated child IDs and intact links; restore preserving destination identity; no upload authority from backup metadata.
- Corrupt record among valid records, unreadable legacy library, duplicate project IDs, interrupted migration, quota failure, and failure without overwriting source/destination.
- Concurrent tabs editing the same and different projects; stale deletes; edits during an in-flight save; acknowledged status only after durable commit.
- Boundary sizes/counts, invalid references, unsupported currencies, unsafe arithmetic, complete generated-board cross-sections, invalid design topology/link membership, and stale projection snapshots.
- Phase 3: cross-account denial, repeated upload/mutation, response lost after commit, mismatched reused mutation ID, two saves from one revision, concurrent quota checks, offline stale edits after deletion, account switching, and nonregressing reads.
- Crash between local commit and dispatch/acknowledgment; expired lease with two tabs; newer edits during upload; stale lease response; same project ID in two accounts; sign-out with unsent work and in-flight responses.
- Design autosave after source/Part deletion or Make Unique before projection review; pending-state copy/round-trip; explicit detach and atomic link reconciliation.
- Every legacy tightening/default above, exact-byte legacy export, receipt replay after schema upgrade, bounded receipt payloads, restore before/after content expiry, and local eviction versus delete-everywhere.
- Remote writes during paginated snapshot/change reads, missed/expired cursors, unsupported remote versions, remote tombstone with dirty work, and cursor advancement only after durable conflict/application.
- Legacy-tab writes during/after cutover, changed source on restart, duplicate recovery hashes, recovery quota failure, and stale legacy omissions without deleting migrated projects.
- Cancellation racing an in-flight write, late retry after cancellation, missing receipt while a write is in flight, offline keep-remote/eviction, and explicit revision-checked reversal of accepted work.
- Restore after content expiry preserves destination portable creation time independently of server/backup timestamps; account purge removes retained creation metadata too.
- Large lifetime tombstone history with only three live projects; bounded indexed status batches, response byte/row limits, snapshot expiry, concurrent writes, and interrupted reconciliation.
- If R2 mode is added: upload failure, failed pointer publication, orphan recovery, unauthorized asset access, and complete backup recovery.

Browser tests prove local behavior only. Worker/D1 integration tests must separately prove atomic revision/receipt/limit behavior; deployed Cloudflare verification is required before claiming cloud readiness.

## Platform references

Reviewed 2026-10-22; recheck limits and API behavior before Phase 3:

- [D1 JSON storage](https://developers.cloudflare.com/d1/sql-api/query-json/)
- [D1 platform limits](https://developers.cloudflare.com/d1/platform/limits/)
- [D1 batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [D1 read replication and sessions](https://developers.cloudflare.com/d1/best-practices/read-replication/)
- [KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/)
- [R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/)
