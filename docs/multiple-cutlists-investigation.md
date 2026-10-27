# Multiple Cutlists per Project: Investigation

**Status:** Future opportunity; investigation only, not an approved specification or implementation plan.  
**Reviewed:** 2026-10-27  
**Next decision point:** After core cutlist usability testing.  
**Related:** [Roadmap](plankplan-studio-roadmap.md), [3D workspace guide](plankplan-studio-3d-workspace-guide.md), [data and persistence contract](plankplan-studio-data-persistence-contract.md).

## Outcome and verdict

A project could contain multiple named cutlists while retaining a shared 3D design and a shared catalog of materials and stock. This is **viable with constraints**, but it is a product and data-contract change, not just a navigation change. The right design depends on whether users need organizational sections, independent build batches, or alternative versions. Those cases have different meanings for stock availability, totals, and model links. Usability testing should establish which problem is real before choosing a schema or implementation scope.

The aim would be to preserve the standalone manual Cutlist workflow, give users explicit control over model-derived changes, and keep existing projects and backups usable. Multiple designs, cross-project inventory, cloud sync, and automatic stock purchasing are outside this investigation's proposed initial scope.

## What the application does today

- A `Project` has one `parts` array, one `materials` array, project-wide cutting/currency settings and editor order, and an optional `design`. There is no separate cutlist entity ([model.ts](../src/lib/planner/model.ts)). A part has an optional free-text `group`, but it remains in the same project-wide optimization; this is not an independent cutlist.
- The Cutlist route recalculates `optimizeMixedProject` from the current project when its state changes ([cutlist route](../src/routes/projects.%24projectId.cutlist.tsx)). The optimizer processes material/stock groups in one operation and accounts for owned and purchase-limited stock across those groups within that run ([combined.ts](../src/lib/planner/combined.ts)). The app does not reserve physical inventory between projects or track cuts already performed.
- Materials, stock dimensions, prices, `ownedQuantity`, and optional purchase `quantityLimit` are project-local. Stock assignments can be explicit; unassigned parts use ephemeral generic planning stock where supported ([part-stock.ts](../src/lib/planner/part-stock.ts)). Generic stock is not a persisted inventory item. Project stock quantities are planning inputs, not shared inventory reservations ([persistence contract](plankplan-studio-data-persistence-contract.md)).
- Design projection selects eligible instances, groups matching sources into part rows, and previews additions, updates, removals, splits, merges, and manual-field conflicts before applying. Links are stored in the design keyed by part ID, with last-applied snapshots. `projectionExcluded` is currently an instance-wide flag, and validation disallows one current instance in multiple linked rows ([projection.ts](../src/lib/planner/design/projection.ts), [schema.ts](../src/lib/planner/design/schema.ts)). These assumptions are for one destination collection.
- The IndexedDB repository stores a versioned project aggregate with project-level generation checks. Import/export, copy, restore, validation, recovery and size limits apply to the whole project ([repository](../src/lib/planner/repository.indexeddb.ts), [model](../src/lib/planner/model.ts), [serialization](../src/lib/planner/serialization.ts)).

## Distinguish the use cases

| Need | Example | Potentially sufficient approach | Consequence |
| --- | --- | --- | --- |
| Organize one build | Label cabinet boxes and doors while buying/cutting everything together. | Improve part groups, filtering, or grouped output within one cutlist. | One optimization can share stock and offcuts; filters must not be mistaken for separate totals. |
| Separate build batches | Cut cabinet boxes now and doors later. | Named independent cutlists with explicit stock assumptions. | Independent plans may each claim the same owned stock unless allocations or combined planning are defined. |
| Compare alternatives | Compare two versions of a door or material choice. | Named alternative scenarios or duplicated project; define what is shared. | Alternatives must not be added together or imply simultaneous stock use. |
| Separate shopping or shop output | Print one team's work or buy in stages. | Scoped output, potentially backed by groups or named cutlists. | Determine whether output is a subset of a jointly optimized plan or an independently optimized plan. |

A user saying “multiple cutlists” may mean any of these. A filtered view of a combined plan cannot always be cut independently: a stock piece may contain parts from more than one group. Conversely, adding independently optimized lists' totals can overstate stock requirements or count the same owned stock twice.

## Candidate direction, subject to testing

Keep **Project** as the unit of persistence, sharing, and backup. Consider one optional project design and one or more named cutlists, each with its own parts and model-to-part links, while project materials and stock definitions are shared. A cutlist should be usable without a model. Keep the current automatically updated plan and explicit Design review, now with a visible target cutlist.

This is a candidate rather than a settled decision. Start with one default cutlist and a simple experience for existing users; expose additional lists only if testing demonstrates the need. Do not assume that a part group must become a cutlist, that lists represent alternatives, or that the same model component must be allowed in multiple lists. Avoid treating independently computed plans as a combined purchasing recommendation.

### Design relationship

- A model could supply selected instances to a chosen cutlist. The user needs a clear inclusion/assignment mechanism and a preview naming its destination. Unassigned or excluded components should remain visible as such; loose or unsupported geometry still needs the existing eligibility checks.
- If each instance belongs to at most one active build list, enforce that across the project and explain moves between lists. If the same instance can appear in multiple alternatives, links, exclusion and stale state must be scoped by list or scenario; a global `projectionExcluded` flag and global uniqueness rule cannot express that. Overlap needs explicit semantics so users do not accidentally purchase the same component twice.
- Filtering selected instances must happen **before aggregation**: one generated row may currently represent several matching instances. Splitting those instances across lists changes quantities and can split/merge linked rows. Reconcile moves, shared-definition edits, Make Unique, manual field conflicts, deletion, detach/reinclude, and pending-part-deletion separately for each affected list.
- Preserve review-before-apply, manual rows, field-level conflict resolution, last-applied snapshots, stale-preview checks and atomic project saves. Define what happens when one list is deleted or duplicated, and whether its links are detached, removed, or copied. Do not silently generate or remove rows in other lists.

### Shared stock and optimization

Sharing stock **definitions and prices** is straightforward conceptually. Sharing **availability** requires a policy:

1. **Independent estimates:** each cutlist uses the shared stock quantities independently. Simple and useful for alternatives, but two plans can both use the same owned pieces. Label totals and availability as per-list estimates; never sum them as a combined stock plan.
2. **Explicit allocations:** users assign quantities of owned and limited stock to build lists. This supports independent batches, but requires validation when lists or quantities change, and decisions about unallocated stock, later edits and over-allocation. Allocation alone does not account for reusable offcuts or work actually completed.
3. **Combined optimization:** select lists to plan together using stock quantities once. This can use stock across list boundaries, but results must show the participating lists and make clear that individual list outputs may depend on shared stock pieces. Per-list cost and waste attribution need a defined rule.

These approaches can coexist later, but none is currently implemented. Recommended starting hypothesis: share the catalog, make each list's planning scope and stock assumptions explicit, and defer allocations or combined optimization until usability evidence shows which is needed. Do not silently decrement owned stock just because a plan is calculated; modeling estimates is not a record of actual cutting.

## Affected boundaries and compatibility

- **Portable schema and migration:** `Project` validation is strict about fields and schema version. A new representation needs a versioned contract and safe migration of v1/v2 data into a default list, preserving part IDs, groups, order, settings, material references, design links, exclusions, and pending states. Define ID uniqueness and limits across lists. Old versions reject unsupported future documents; design explicit error and backup/recovery behavior rather than relying on old clients to read them.
- **Persistence and concurrency:** retain atomic generation-checked saves for the aggregate, including any multi-list projection update. Concurrent edits to different lists can still conflict at project level; test stale previews, retries, quota failures and old tabs. Revisit the 1 MB canonical project limit and count/performance limits with realistic fixtures; do not weaken safeguards without evidence.
- **Settings and stock references:** decide which cutting settings, units, currency, tax, prices and owned quantities are project-wide versus per-list. Project-wide changes must visibly affect all dependent plans; deleting or changing a shared material or stock option needs an impact check across all lists and the design. Define whether per-list overrides are necessary rather than adding them by default.
- **Optimizer and results:** adapt the planner to an explicit list or selected set, ensuring limits and owned quantities are applied once within the stated scope. Preserve generic stock behavior, fit warnings, mixed-material results and validation. Specify order/priority if allocating finite stock among lists, and distinguish independent costs from combined costs.
- **UI and navigation:** consider create, rename, select, duplicate and delete, list-specific empty states, selected-list context in Design review and Cutlist, and clearly scoped summaries, print and exports. Preserve existing responsive, keyboard and confirmation patterns. Avoid implying that a name or filter alone changes optimization scope.
- **Exports and identity:** decide whether JSON remains a complete project backup and whether single-list export/import is needed. CSV and print must identify the list or combined scope. Test project copy and restore, list duplication, stable source/part IDs and references, imported legacy backups, and invalid or future versions. Linked rows must not unexpectedly refer to a different list after copy or restore.
- **Future cloud contract:** any schema change should be reconciled with the documented future account/sync contract, but must not require implementing cloud services for local multiple-list support.

## Questions for usability testing and later product decisions

1. What triggers the need for another list: build stage, material, purchasing trip, another person, alternative design, or something else? Would grouping and scoped print solve it?
2. Should lists be independent batches, mutually exclusive alternatives, or both? If both, how are these types named and distinguished?
3. Must an instance appear in more than one list? Is its quantity shared, duplicated, or derived from separate selections? What should happen when a component is moved, deleted, excluded, or edited?
4. Are material definitions, prices and stock quantities shared? Should stock availability be an independent estimate, allocated, or optimized jointly? How are shared boards, offcuts, costs, and incomplete allocations presented?
5. Which settings and results should vary by list? Should a user see a combined shopping list, a single-list report, or both, and what should each mean?
6. What happens to links and manual edits on list duplication/deletion, design changes, restore, and conflicting edits? Which backward compatibility and supported-version behavior is required?

## Verification to plan if this proceeds

Use representative manual-only, design-linked, mixed-material and multi-batch fixtures. Cover migration and canonical round trips; legacy import and recovery; copy/restore and list identity; per-list and cross-list link integrity; aggregation splits/merges and conflict choices; stale previews and concurrent saves; stock limits, generic stock, owned quantities and combined/independent totals; deletion and duplicate semantics; CSV/print scope; accessibility and responsive navigation; and project size/performance limits. Include real-browser backup, reload, multiple-tab and storage-failure journeys. Test scenarios with shared stock pieces to ensure separate reports cannot be mistaken for independently executable plans.

## Suggested next step

During upcoming usability sessions, observe the workarounds users use to organize or stage real builds and ask them to explain how they expect stock, costs and the design to behave. Record concrete examples and frequency. If groups and scoped outputs suffice, improve those first. If independent batches or alternatives recur, use the evidence to write a decision-complete specification before choosing a versioned schema and implementation plan.
