# 3D Workspace Phase 1 Contract and Module Map

**Status:** Contract closure only; no application implementation or runtime verification is claimed.
**Authority:** The approved serialized records and geometry rules in [the plan's D2 contract](./3d-workspace-plan.md#d2-approved-concrete-design-schema), plus the [canonical data/persistence contract](../../plankplan-studio-data-persistence-contract.md). This document makes their implementation seams explicit; it does not revise their meaning.

## Compatibility and portable document boundary

The portable project remains `ProjectDocumentV2` as defined by the canonical contract. `design` is optional and, when present, is exactly `DesignDocumentV1`; absence stays absence for migrated cutlist-only projects. `editorOrder` remains optional portable project content, with resolver semantics from the canonical contract. Project schema version, design schema version, IndexedDB layout/migration version, local committed generation, editor edit sequence, and any future server revision are separate values. Unknown fields, versions, and discriminants are never stripped to make an input pass. Failed parse/migration/validation preserves original bytes for recovery and does not mutate a destination.

Use the D2 records verbatim: `Geometry`, `Definition`, `Instance`, `LooseObject`, `CutSpec`, `Sources`, `ProjectionSnapshot`, `ActiveLink`, `PendingLink`, and `DesignDocumentV1`. Optional fields are omitted, never serialized as `null`. No renderer object, generated mesh, selection, tool draft, measurement, history, camera, or view preference belongs in the project. Local view preferences are a separately keyed device record and are excluded from project backup, document byte measurement, command history, and model save acknowledgement.

Project-wide child IDs remain project-scoped. Design IDs are unique in each record collection as specified by D2; every current reference must resolve in the containing project/design, with historical `lastApplied` provenance the sole exception. `partLinks` map keys are generated Part IDs. Current links cannot claim one instance more than once. The only link discriminants are `active`, `pending-removal`, `pending-reconcile`, and `pending-part-deletion`; retired links are removed, not serialized as another state. The exact current/historical reference semantics, reasons, primary-state precedence, detach exclusion, deterministic split/merge identity rule, and snapshot field allowlist remain those in D2. Links/snapshots are not metadata on `Part`.

These serialized fragments show the allowed lifecycle shapes. They are examples, not additional fields or alternate rules:

```json
{
  "partLinks": {
    "part-17": {
      "state": "active",
      "current": { "definitionId": "def-4", "instanceIds": ["inst-8", "inst-9"] },
      "lastApplied": {
        "sources": { "definitionId": "def-4", "instanceIds": ["inst-8", "inst-9"] },
        "fields": {
          "name": "Side rail", "materialId": "mat-1",
          "length": { "um": 900000 }, "width": { "um": 40000 },
          "crossSection": { "width": { "um": 40000 }, "thickness": { "um": 19000 } },
          "grainLocked": false, "quantity": 2
        }
      }
    }
  }
}
```

After all contributing sources are deleted, retain review state and historical comparison fields without dangling current references:

```json
{
  "partLinks": {
    "part-17": {
      "state": "pending-removal", "reasons": ["source-deleted"],
      "lastApplied": { "sources": { "definitionId": "def-4", "instanceIds": ["inst-8"] }, "fields": { "name": "Side rail", "materialId": "mat-1", "length": { "um": 900000 }, "crossSection": { "width": { "um": 40000 }, "thickness": { "um": 19000 } }, "quantity": 1 } }
    }
  }
}
```

When a contributor is made unique or otherwise changes a group, `pending-reconcile` retains `lastApplied` and a `current` source set only when every current reference resolves; use `reasons` such as `made-unique` or `definition-edited`. If the user manually deleted the Part, the map entry remains under that historical Part ID as `pending-part-deletion`, with a reason `part-deleted`, `lastApplied`, and no `current` when there is no complete valid current membership. If a source was detached while contributors survive, the manual Part remains unlinked: remove its map entry and persist `projectionExcluded: true` on each surviving contributor. The excluded instances have no current link membership. A later explicit Include clears exclusion and starts a new preview with a fresh generated Part ID; it does not reclaim the manual row.

Canonical serialization is the shared recursive UTF-16-key-sorted compact JSON serializer with unchanged array order and ECMAScript primitive serialization specified by the persistence contract. Its UTF-8 output is the sole complete-document measurement and must be at most 1,000,000 bytes. Normal import raw input has its independent 2,000,000-byte pre-parse ceiling. Recovery of a legacy whole-library payload is exact-byte and is not truncated or forced through the single-document import cap. Existing project limits and all D2 geometry limits apply before commit. A schema-valid model-only or unconfirmed-cut-spec design is saveable; optimizer readiness and link warnings do not become parse/serialization failures.

### Repository and transaction interfaces

These are TypeScript-shaped contracts for implementation, not current exported APIs. Result types are discriminated; callers must handle every case. All methods are asynchronous. Inputs/outputs are validated portable data, not storage engine records.

```ts
type NamespaceId = 'local' | (string & {}); // future immutable account namespace; Phase 2 uses local
type ProjectKey = { namespaceId: NamespaceId; projectId: string };
type ProjectSummary = Pick<ProjectDocumentV2, 'id' | 'name' | 'updatedAt'> & {
  localGeneration: number;
  schemaVersion: number;
  issueCount: number;
};
type ConcurrencyToken = { localGeneration: number };
type ReadResult<T> =
  | { ok: true; value: T; token: ConcurrencyToken }
  | { ok: false; kind: 'not-found' | 'unsupported-version' | 'validation' | 'storage-failure'; issue?: Issue; recoveryId?: string };
type WriteResult =
  | { ok: true; value: ProjectDocumentV2; token: ConcurrencyToken }
  | { ok: false; kind: 'not-found' | 'conflict' | 'validation' | 'unsupported-version' | 'quota' | 'storage-failure'; issue?: Issue; recoveryId?: string };
type DeleteResult =
  | { ok: true }
  | { ok: false; kind: 'not-found' | 'conflict' | 'storage-failure'; issue?: Issue };
type ListResult = { ok: true; summaries: ProjectSummary[]; issues: RecoveryIssue[] } |
  { ok: false; kind: 'storage-failure'; issues: RecoveryIssue[] };
interface ProjectRepository {
  list(namespaceId: NamespaceId): Promise<ListResult>;
  get(key: ProjectKey): Promise<ReadResult<ProjectDocumentV2>>;
  create(namespaceId: NamespaceId, document: ProjectDocumentV2): Promise<WriteResult>;
  save(key: ProjectKey, document: ProjectDocumentV2, expected: ConcurrencyToken): Promise<WriteResult>;
  delete(key: ProjectKey, expected: ConcurrencyToken): Promise<DeleteResult>;
  subscribe(namespaceId: NamespaceId, listener: (changed: ProjectKey[]) => void): () => void;
}
```

`Issue` has stable `code`, field `path`, and `severity`; recovery issues add a `recoveryId` and available source identity. `list` returns lightweight summaries/per-record issues and must not deserialize every design to produce summaries. Repository reads never turn failure into an empty project list. `get` and `save` distinguish unsupported future versions and validation failure from not-found. A conflict means the expected generation no longer matches. `delete` is guarded by the same generation token. Storage notifications only invalidate caches; they are not a concurrency mechanism.

Each project mutation uses one IndexedDB read/write transaction covering the project record and committed generation; an operation that changes related recovery/migration metadata includes those stores in the same transaction where the persistence contract requires atomicity. No whole-library overwrite API is exposed. Generation increments exactly once on successful content commit and never on validation, quota, or storage failure. `create` requires a fresh project ID in the selected namespace. `save` requires the route's project ID to match the document ID and the originally read generation. Successful acknowledgement reports the committed generation, not a requested or in-memory value.

Recovery is a distinct store/API boundary, never an ordinary project overwrite:

```ts
type RecoveryRecord = {
  recoveryId: string;
  namespaceId: NamespaceId;
  sourceKind: 'legacy-library' | 'legacy-project' | 'import' | 'unsupported-document';
  sourceHash?: string; // SHA-256 of exact original bytes when available
  sourceBytes: ArrayBuffer;
  sourceProjectId?: string;
  status: 'available' | 'repair-candidate' | 'recovered';
  observedAt: string;
};
type MigrationOwner = {
  ownerToken: string;
  attemptId: string;
  sourceHash: string;
  startedAt: string;
  destinationGenerations: Record<string, number>;
};
```

The recovery record preserves exact source bytes and identity when available. Repair edits a separate candidate; accepting it is an explicit validated import/create/restore operation. The legacy migration owner holds the captured initial source hash/bytes and attempt identity while copying; completion is recorded only after destination writes are reopened and verified against that source hash. If source bytes change, preserve the changed payload/hash as another recovery candidate; never silently re-import it or let stale legacy omissions delete destination projects. Recovery and migration never replace a destination without its appropriate identity/concurrency checks.

### Edit sequence, save acknowledgement, and route ownership

The project editor owns a monotonically increasing in-memory `editSequence` for domain mutations. It captures `(editSequence, localGeneration)` when starting a save. A successful response updates the committed generation to the repository result and acknowledges only the captured edit sequence; if the current sequence advanced meanwhile, the editor remains dirty. A failed save leaves the previous committed generation and dirty in-memory document untouched. Each route instance subscribes to namespace invalidation and reloads/reconciles through `get`; a notification cannot authorize overwrite. Dashboard, Cutlist, and Design use the same repository, namespace resolution, error/recovery semantics, and generation checks.

Projection preview records both the editor `editSequence` and repository `localGeneration` from which it was built. Apply is enabled only while both still match and the reviewed disposition is complete. Applying rechecks both values and commits resulting `parts` and `design.partLinks`/snapshots in one project transaction. Any intervening editor edit, external generation, validation error, or storage failure rejects the apply and preserves the prior durable project and dirty editor work. Manual Cutlist edits use the same project command/save path and participate in field-level conflict comparison; there is no second writer.

## Domain and UI module ownership

The following names are the selected file/module seams for implementation. They are new-module targets, not claims that such files currently exist. Keep domain modules independent of React, Three.js, Fiber, and Drei.

| Module target | Owns | Must not own |
| --- | --- | --- |
| `src/lib/planner/model.ts` | Project v2 type integration, project-level validation/migration/export/import boundary; preserve existing Part/material/stock contracts and optional `editorOrder` | Geometry algorithms, repository transactions, renderer state |
| `src/lib/planner/serialization.ts` | Canonical serializer and canonical UTF-8 byte measurement shared by save/export/import; raw-input bounded reader stays separate | Domain mutation, storage writes |
| `src/lib/planner/design/schema.ts` | Approved DesignDocumentV1 record types, strict structural/reference/limit validation and structured issues; saveable draft versus malformed distinctions | Three.js types, geometry mutations |
| `src/lib/planner/design/geometry.ts` | Pure integer-coordinate topology predicates, planar/simple-loop/extrusion validity, local geometry transforms and safe extent arithmetic | React, renderer meshes, persistence |
| `src/lib/planner/design/commands.ts` | Typed domain intents and atomic immutable before/after command application; component/instance property ownership and link lifecycle updates | Pointer/raycast interpretation, repository API |
| `src/lib/planner/design/history.ts` | Bounded in-memory undo/redo command stack; one entry per completed gesture/explicit domain action; restore full prior valid state on undo | Portable data, camera/preferences, persistence acknowledgement |
| `src/lib/planner/design/projection.ts` | Pure eligible-source grouping, local cut dimension/grain projection, deterministic aggregation keys and preview diff/identity proposals | Writes, generated IDs before review acceptance, meshes |
| `src/lib/planner/repository.ts` | Async repository interface/results, route-neutral operation contract | IDB-specific implementation |
| `src/lib/planner/repository.indexeddb.ts` | IndexedDB transaction implementation for project records, generations, summaries, recovery and migration owner | UI policy, geometry/projection logic |
| `src/lib/planner/recovery.ts` | Legacy source capture/hash, recovery enumeration/export, resumable cutover coordination and explicit repair handoff | Implicit destructive repair or silent destination replacement |
| `src/lib/planner/view-preferences.ts` | Validation/defaulting and separate namespace/project-keyed local view preferences | Project JSON, model history/save status |
| `src/lib/planner/stock-presets.ts` | Shared verified regional preset source consumed by Design/Cutlist (catalog verification is Phase 6 gate) | Project mutation by reference to built-in data |
| `src/lib/planner/linear.ts` | Cross-section-aware candidate eligibility and independent verifier, retaining manual length-only legacy behavior | Design or renderer imports |
| `src/components/design/` | Reusable workspace controls/drawers/status and semantic list/property alternatives | Canonical document ownership or IDB calls |
| `src/components/design/scene/` | Fiber/Drei adapters, derived resources, raycast/selection translation and scene lifecycle | Portable schema, direct project writes, commands/history rules |
| `src/routes/projects.$projectId.design.tsx` | Lookup/error/loading composition, workspace UI assembly, route navigation | Duplicate persistence/model rules |
| `src/routes/projects.$projectId.cutlist.tsx`, `src/routes/index.tsx` | Migrate to shared async repository and existing workflow surfaces | Whole-library localStorage production writes |

Existing `src/lib/planner/storage.ts` may remain temporarily as legacy-source migration input; it is not the target repository. `src/routeTree.gen.ts` remains tooling-generated. Phase 2 owns project schema/repository/recovery. Phase 3 owns geometry/commands/history/projection. Phase 4 owns scene adapter and workspace frame. Phase 5 owns modeling interactions. Phase 6 owns regional catalog, optimization eligibility and reviewed Cutlist integration. Phase 7 owns integrated resilience, accessibility and performance evidence.

## Command ownership and atomicity

`DomainCommand` applies a validated domain intent to the current portable document and returns either a complete next document plus a single history record, or structured rejection with the previous document untouched. It never persists by itself. The route/editor session coordinates command application, history, `editSequence`, and the repository save scheduler. Scene/tool code submits typed intents; only command application may mutate persistent design data.

| Action | Domain ownership and atomic result |
| --- | --- |
| Primitive create/dimension edit, planar Line/Rectangle, eligible Push/Pull, Eraser, Move/Rotate/Scale, Paint, conversion | Validate the whole proposed geometry/document first. Commit one coherent command or keep the last valid document. Pointer-frame previews are transient session data. Unsupported/invalid operations produce no history entry. |
| Definition edit | Mutate shared definition geometry/cutSpec once; all linked instances reflect it while retaining pose/scale/overrides. Explicit cutSpec confirmation invalidates in that same command; affected links become pending-reconcile. |
| Instance edit/delete, Duplicate, Make Component, Make Unique, material reassignment/deletion | Update all affected definitions/instances, exclusions and link lifecycle as one validated command. Make Unique clones definition properties/geometry and preserves selected instance transform/overrides/exclusion; Duplicate shares definition and creates independent transform. No partial dangling references. |
| Manual Part edit/delete | A Cutlist command updates Part content. Deleting a linked Part changes its link to pending-part-deletion in the same command. Manual edits are retained and later projection conflicts are field-by-field; unlinked rows are unaffected. |
| Preview/apply, detach, include | Preview is pure/read-only. Apply atomically updates Parts and links/snapshots and consumes precisely the reviewed IDs/dispositions. Detach preserves the selected manual Part, excludes surviving contributing instances, and retires link ownership atomically. Include clears exclusion only for selected instances and requires a new preview. |
| Undo/redo | Operates on complete validated domain states, including geometry, cutSpec confirmation, Parts, links, and projection exclusions. One completed gesture/action is one history entry; camera, drawer, preference, transient measurement and save events are not history. |
| Save | Separate persistence transaction only after valid domain state. Repository commits the whole project and generation atomically. Save acknowledgement does not create undo history and never clears edits newer than the captured edit sequence. |

Instance-specific transforms (`pose`, `scalePpm`, `hidden`, `locked`, instance material/appearance overrides, `projectionExcluded`) belong to `Instance`; shared geometry, name, base `cutSpec`, base material and appearance belong to `Definition`; loose geometry has no projection/material-link semantics until conversion. Paint is appearance-only. Primitive base geometry dimensions and its board/panel `cutSpec` change together. Instance scale composes in local axes before pose; each effective cut dimension rounds once to nearest micrometer, halves upward. No world bounds, renderer transforms, negative scales, or implicit allowance fields enter cut dimensions. These ownership rules preserve D2 and D4b/D4c.

## Feature-to-phase implementation and evidence gates

| Feature/gate | Implementation home | Required evidence phase |
| --- | --- | --- |
| Strict v2 + embedded optional v1 design validation; migration; canonical bytes; `editorOrder` | model, serialization, design/schema, repository, recovery | Phase 2 tests: v1 compatibility/recovery, unknown versions/fields, no-design, canonical byte boundaries, copy/restore and generation conflict |
| Topology, transforms, scale precision, primitives, Make Component/Unique, duplicate, command/history/link transitions | design geometry/commands/history/projection | Phase 3 domain fixtures/tests, including limits, ±1 um tolerance, explicit confirmation, exclusion, pending causes and repeated manual overrides |
| Fiber/Drei dependency compatibility, lazy scene, lifecycle, camera, selection sync, local view preferences | scene adapter, workspace components, preference module | Phase 4 installation/build plus browser WebGL lifecycle, resource and accessibility measurements |
| All 12 tools, exact numeric entry, snap, interruption, shortcuts, context menu, drawers, measurement | workspace/session/scene adapters and commands | Phase 5 RTL and Windows Chrome/Edge pointer/keyboard matrix; jsdom alone is insufficient |
| Canada/US actual-size presets, cross-section optimizer verification, explicit projection UI/apply | shared presets, `linear.ts`, projection and Cutlist bridge | Phase 6 authoritative regional sources and tests for normal/turned/undersized/missing cross-section, stale/atomic preview and sheet-thickness warning |
| Performance budgets, accessibility, recovery/concurrency and full regression checks | integrated app/browser/repository | Phase 7 measured hardware/browser record and mandatory `npm run test`, `npm run lint`, `npm run build` |

The initial tools map individually to the typed command/session path, with scene adapters translating hit/gesture data into intents: Select (selection/session; Phase 5), Eraser (topology/removal commands; Phase 5), Line and Rectangle (planar profile commands; Phase 5), Push/Pull (eligible extrusion commands; Phase 5), Move/Rotate/Scale (pose/local-axis scale commands; Phase 5), Paint (appearance-only command; Phase 5), Orbit/Pan (camera adapter and local preferences, no model command; Phase 4), and Tape Measure (transient measurement session, no model command/history; Phase 5). Numeric input and snapping are session intent modifiers, with exact valid numeric values taking precedence (Phase 5). Object/face/edge selection and keyboard alternatives share semantic selection state (Phases 4-5). The five drawers map to reusable workspace UI: Materials, Entity Info, Components, Display, and Model Info (Phase 5; scene-backed selection arrives Phase 4). Make Component, Duplicate, shared-definition edit and Make Unique map to atomic domain commands (Phase 3) with UI affordances in Phase 5. Preview/apply and its field dispositions map to pure projection plus repository transaction (Phase 3 domain contract, Phase 6 end-to-end UI). Backup, import, copy and restore are repository/recovery identity operations (Phase 2). Shortcut help, contextual menus and interruption/focus behavior are workspace interaction ownership (Phase 5).

D1 package versions and Fiber/React peer compatibility are verified immediately before Phase 4 installation from official package documentation/metadata. D7 catalog and browser/performance work remain Phase 6/7 evidence gates, not unresolved owner choices. No executable validators or fixtures are added in Phase 1; they are owned by Phase 2 (serialized boundary) and Phase 3 (geometry/command invariants) so contract closure does not pull implementation phases forward.
