---
title: "PlankPlan Studio 3D Workspace - Implementation Plan"
plan_profile: FULL
status: IN_PROGRESS
verification_status: PARTIAL
current_phase: 7 / 7
created: 2026-10-22
last_updated: 2026-10-23
---

# Overall Plan Completion Status

- **Total Phases Executed:** 7 / 7 (Phase 1 COMPLETE; Phases 2–7 PARTIAL against release evidence gates)
- **Summary of Outcome:** Contract closure (Phase 1) is complete. Phases 2-6 delivered the optional local 3D workspace, persistence/recovery, modeling and reviewed cutlist integration, with acceptance evidence recorded per phase. Phase 7 automated test/build checks pass, lint passes after removing an unused non-component export, and an isolated in-app-browser smoke journey exposed and fixed initial camera over-zoom. The overall implementation and release verification remain PARTIAL: target Chrome/Edge, adversarial multi-tab/storage failure, performance-budget and actual assistive-technology evidence are outstanding. See [Phase 7 evidence](phase-7-evidence.md). These seven execution phases together deliver product-roadmap Phase 2; they do not refer to the roadmap's cloud phase.

# Specification & Overview

### 1. Scope & Objective

Build an optional, precise 3D woodworking editor that produces reviewable cutlist changes while preserving independent manual planning. Implement the entire initial tool set, linked components, actual-size stock choices, accessible alternatives, portable design data, and safe local persistence.

**Requirements authority:** [workspace guide](../../plankplan-studio-3d-workspace-guide.md), [initial features](../../plankplan-studio-3d-workspace-initial-features.md), and the authoritative [data/persistence contract](../../plankplan-studio-data-persistence-contract.md). Use [roadmap](../../plankplan-studio-roadmap.md) for delivery boundaries and [design guide](../../DESIGN.md) for visual direction. Resolve contradictions explicitly; do not treat target contracts as implemented behavior.

**In scope:** Three.js scene through React Three Fiber and selected Drei helpers; board/panel primitives; planar Line/Rectangle and simple Push/Pull; Select, Eraser, Move, Rotate, Scale, Paint, Orbit, Pan, Tape Measure; numeric input; snapping; camera presets; object/face/edge selection; contextual menus; shortcut help; five drawers; single-level definition/instance editing; Make Component, Duplicate, Make Unique; project stock presets; explicit model-to-cutlist preview/apply; cross-section-aware optimization; schema v2 including optional portable editorOrder; asynchronous IndexedDB repository; migration/recovery/copy/restore; local concurrency and unsaved-state feedback. Nested component assemblies are deferred beyond this initial release.

**Out of scope:** accounts, network synchronization, Workers/D1/R2, billing, shared inventory or new inventory counts, alternative-material sets, PWA delivery, collaboration, general CSG/booleans/holes/self-intersecting geometry, automatic joinery/surfacing allowances, custom PDF generation. Preserve existing stock ownership and purchase-limit behavior; this feature introduces no inventory system. No implementation is authorized by this planning artifact alone.

### 2. Technical Constraints & Architecture

#### Verified repository baseline (2026-10-22)

| Evidence | Current behavior and consequence |
| --- | --- |
| `src/lib/planner/model.ts`: `Project`, `Part`, `importProject`, `exportProject` | Schema v1; integer micrometer dimensions/cents; no embedded design or linear crossSection. Import has legacy defaults but lacks the target strict bounds/unknown-field policy. Extend through versioned validation/migration rather than a type cast. |
| `src/lib/planner/storage.ts`: `loadProjects`, `saveProjects`, `importProjectAsNew`, `createProject` | Whole-library localStorage under `plankplan-studio.projects.v1`; read failure returns an empty library; imported ID changes only on collision. Replace with per-project operations and explicit identity semantics. |
| `src/routes/index.tsx`, `src/routes/projects.$projectId.cutlist.tsx` | Dashboard and editor load/save entire collections. Both must adopt the same repository; changing Design alone cannot enforce concurrency or preserve other projects. |
| `src/routes/projects.$projectId.design.tsx`, `src/routes/design-preview.tsx` | Placeholder shells; standalone preview explicitly creates no project. Preserve that guarantee pending the preview decision below. |
| `src/lib/planner/linear.ts`: `optimizeLinear`, `validateLinearPlan` | Length/material accounting and capacity checks exist; no cross-section eligibility checks. Change optimizer candidates and independent verifier together. |
| `src/lib/planner/sheet.ts`, `combined.ts`, `exports.ts` | Existing sheet/mixed outputs consume current Part/Stock shapes. Preserve sheet width semantics and verify compatibility end to end. |
| `src/lib/planner/editor-order.ts`, model import handling | Editor ordering is existing data but absent from the target v2 schema. Explicit compatibility decision required before strict unknown-field rejection. |
| `package.json`, `src/test/setup.ts`, existing planner tests and `src/planner-workflow.test.tsx` | React 19, Vite/TypeScript, TanStack Router, Radix, Vitest/jsdom/RTL; no Three.js/R3F/Drei or browser automation dependency. Existing scripts: `npm run test`, `npm run lint`, `npm run build`. |

Checkout was clean during discovery. Revalidate owning files before execution; this is a point-in-time baseline. No runtime/test pass is claimed by this plan. Keep tests outside `src/routes/`; route tree generation stays tooling-owned. No worktree without owner permission.

#### Responsibility boundaries

- Keep route composition in the existing Design route; put reusable workspace UI under `src/components/` and renderer-free design logic under `src/lib/`. New module filenames are to be selected in Phase 1, not asserted as existing APIs.
- Separate schema/validation, pure geometry, commands/history, selection/tool sessions, renderer adapters, repository access, and projection reconciliation. Three.js objects and generated meshes never become portable project truth.
- Canonical dimensions are safe integer micrometers; visual paint and optimizer material choice are separate. Positions/transforms must be finite and bounded. Define conversion and rounding once; avoid world bounding boxes as cut dimensions.
- Preserve optional design absence for manual projects. Project/design/database versions, edit sequence, and committed generation remain distinct. Save acknowledgement follows durable commit, and newer edits remain dirty after older saves finish.
- Preview application checks both committed local generation and current editor edit sequence. Parts and design links update in one project transaction. Cross-tab notifications invalidate cached data and never replace transactional checks.

#### Assumptions and open decisions

Decision review, 2026-10-22: **8 auto-resolved, 10 owner-resolved, 0 owner decisions remaining, 0 remaining discovery-only decisions.** Owner round 4 approved D2, including the concrete records, geometry rules, transforms and protective limits below. No decision is deferred inside the initial implementation scope. Features explicitly deferred beyond this release remain out of scope. Implementation is underway; its verification status reflects recorded evidence and remaining release gates, not the decision closure.

| ID | Choice to close | Proposed direction / required evidence | Gate |
| --- | --- | --- | --- |
| D1 | RESOLVED: Three.js + React Three Fiber + selected Drei helpers | Owner selected the recommended integration, 2026-10-22. Verify exact stable package/peer compatibility at installation; custom domain and tool transaction logic remain renderer-independent. | Choice closed; installation/build checks pending |
| D2 | RESOLVED: exact DesignDocumentV1 contract below | Owner approved records, topology/tolerance, local-axis scale composition, cut projection/link lifecycle and protection limits, 2026-10-22. Implement this contract rather than arbitrary JSON or renderer meshes. | Choice closed; implementation/validation pending |
| D3 | RESOLVED: optional portable `editorOrder` retained in v2 | Owner selected preservation through backup/copy/restore, 2026-10-22; normative persistence contract amended. Preserve current ordering semantics and validate supported shape. | Choice closed; migration/round-trip tests pending |
| D4 | RESOLVED: single-level components, requested finished cut sizes, 2D sheet planning | Owner rounds 1-2, 2026-10-22: no nested instances; preserve requested dimensions without implicit allowances; panel thickness remains in design and is explicitly unverified by the sheet optimizer. | Product choices closed; implementation checks pending |
| D5 | RESOLVED through D2 and A3/A4/A6 | Approved topology/tolerance, extrusion/Eraser/conversion rules below; cancel interrupted operations, exact input wins, no new clipboard feature. Snap target ranking and platform-conflict handling are bounded implementation details with explicit tests. | Choices closed; tool/browser verification pending |
| D6 | RESOLVED: local per-project view preferences, temporary measurements, no saved guides | Owner rounds 2-3, 2026-10-22. Camera/grid/axes/snap are local device preferences outside portable design and model undo; no persistent guide entities. A5 preserves no-save standalone preview. | Choices closed; preference and tool checks pending |
| D7 | RESOLVED: Canada/US presets; Windows Chrome/Edge desktop mouse/keyboard first | Owner round 3, 2026-10-22. Regional source verification and measured performance evidence remain implementation/release gates, not unchosen product scope. Full touch modeling and additional platform guarantees deferred. | Catalog verification before Phase 6; browser measurements before release |

#### Automatically resolved details

Classification threshold: each selection below preserves existing behavior or implements an explicit source requirement, is local and reversible, and introduces no dependency, portable field, retention change or new product scope. All have **owner control: auto**, **reversibility: easy**, **confidence: high**. None removes an owner gate.

| ID | Options reviewed → selected option | Rationale and evidence | Resulting tasks / acceptance |
| --- | --- | --- | --- |
| A1-module-boundaries | Route-local monolith versus focused shared modules → focused renderer-free logic in `src/lib/` and reusable workspace UI in `src/components/`, route composition in existing Design route | AGENTS.md modularity rules and existing planner helper organization; avoids coupling persistence to meshes | Phases 1, 3-5 keep these boundaries; no domain imports from rendering |
| A2-ui-primitives | New menu/drawer library versus installed primitives → reuse installed Radix patterns and current controls where appropriate | `package.json` already includes `radix-ui`; `src/components/ui/select.tsx` uses it. Avoid an unnecessary dependency | Phase 5 menus and drawer focus behavior reuse installed primitives; preserve keyboard/focus checks |
| A3-gesture-cleanup | Commit partial work on interruption versus cancel unfinished transaction → cancel on Escape, lost capture/window blur, tool switch or right-click; open requested menu only after cancellation | Initial features require valid explicit commits and last-valid-state protection. Interruption is not confirmation | Phase 5 tests assert no history/domain change on interruption; normal pointer-up completes one valid gesture, even outside canvas when captured |
| A4-input-precedence | Snapping can override typed values versus exact entry wins → exact valid numeric entry wins; temporary snap modifiers never alter persistent snap setting | Explicit initial-features requirement and existing canonical dimension helpers | Phase 5 tests compare canonical values with snap enabled; snap target ordering and modifier compatibility remain implementation details to specify/test |
| A5-preview-scope | Turn `/design-preview` into a new editable demo versus preserve current entry → retain no-project/no-save preview; update obsolete wording/CTA as real Design ships | `src/routes/design-preview.tsx` explicitly promises no project/model save; no requested demo expansion | Phases 4/7 do not create records from standalone preview; project Design gets the editor |
| A6-clipboard | Add OS clipboard serialization/permissions versus omit unavailable Paste → do not introduce a clipboard feature; hide Paste unless an independently approved clipboard capability exists | Initial features say Paste 'when available'; no clipboard implementation in current workspace; Duplicate is already required | Phase 5 menus omit unavailable Paste; no clipboard permission or serialization dependency |
| A7-test-placement | Route-adjacent tests versus existing test organization → pure-domain tests beside helpers, UI workflows under `src/` outside routes, real browser for WebGL/IndexedDB | AGENTS.md and `src/planner-workflow.test.tsx`; current Vitest/jsdom cannot prove real canvas/multitab behavior | All seven ledgers retain separate browser requirements; no new test dependency selected automatically |
| A8-preset-reuse | Independent Design preset catalog versus shared project stock source → extract/reuse one preset source for Cutlist and Design after regional validation | Existing `stockPresets` in `projects.$projectId.cutlist.tsx` already supply imperial/metric actual dimensions; duplicated catalogs would drift | Phase 6 shares catalog logic, preserves existing saved custom stocks, and copies choices into projects. Existing values are evidence of behavior, not proof of regional correctness |

#### Owner decision register

All ten rows are RESOLVED by owner answers. The subsequent owner-authorized adversarial-review amendments below refine D2 before implementation. Alternatives remain recorded for rationale, not as open choices. Confidence below concerns design reasoning; implementation evidence remains pending. Reopen a material choice only when new evidence reveals a conflict, and synchronize affected criteria explicitly.

| ID / classification | Options and recommendation | Why / evidence / confidence | Reversibility / gate |
| --- | --- | --- | --- |
| D1-renderer — RESOLVED by owner, 2026-10-22 | Selected Three.js + React Three Fiber, with selectively used Drei helpers. Alternatives: Fiber without Drei; direct Three.js adapter; defer for a renderer spike | Existing React 19 application and renderer-independent domain make Fiber a reasonable fit. Official [installation docs](https://r3f.docs.pmnd.rs/getting-started/installation) pair Fiber 9 with React 19; [performance docs](https://r3f.docs.pmnd.rs/advanced/scaling-performance) describe demand rendering; [Drei controls docs](https://drei.docs.pmnd.rs/controls/introduction) describe camera integration. Helpers still require exact gesture tests. Direct Three.js reduces framework dependencies but requires manual lifecycle/event glue. Confidence: medium; installation/build compatibility not yet tested | Moderate / before dependency installation and scene implementation |
| D3-editor-order — RESOLVED by owner, 2026-10-22 | Selected retention of optional portable `editorOrder` in v2 through explicit contract amendment. Alternatives: migrate to local-only UI metadata; retire saved ordering only with explicit compatibility policy; defer | `model.ts` serializes it; `editor-order.ts` intentionally separates display order from canonical arrays; Cutlist uses it for keyboard/pointer reorder and duplicate placement. Current target v2 omits it. Retention best preserves backup/reopen behavior, but changes normative schema. Confidence: high | Moderate / before strict v2 migration |
| D4a-nesting — RESOLVED by owner, 2026-10-22 | Selected single-level components for initial release. Alternatives: nested component instances now with cycle/depth and projection rules; defer | Initial features describe definitions/instances but explicitly leave nesting undecided. Single-level keeps selection/shared edits/projection manageable; nesting adds assembly reuse and requires hierarchy transforms and cycle checks. Confidence: medium | Moderate / before exact design schema |
| D2-design-schema — RESOLVED by owner, 2026-10-22 | Approved DesignDocumentV1 types and invariants below: editable topology/extrusions, linked definitions and local-axis scaled instances, cutSpec, bounded current/historical projection links. Alternatives reviewed: revise fields/semantics/limits; defer; renderer-owned meshes or general CSG rejected for scope/domain reasons | Owner explicitly approved the concrete proposal after upstream product choices. Confidence: medium; implementation unverified | Hard / approval gate closed; implementation checks pending |
| D4b-dimension-semantics — RESOLVED by owner, 2026-10-22 | Selected requested finished cut dimensions with only existing explicit kerf/trim downstream. Alternatives: explicit rough-stock/finished-size allowance fields now; defer | Guide forbids implicit allowances; existing optimizer inputs are requested cut dimensions. Recommendation avoids adding allowance features while preserving exact inputs. Confidence: high | Moderate / before D2 projection fields |
| D4c-sheet-thickness — RESOLVED by owner, 2026-10-22 | Selected keeping panel thickness in design and visibly report sheet-thickness compatibility as unverified; existing 2D optimizer keeps length/width/grain semantics. Alternative: extend portable sheet Part/fit schema to enforce thickness now; defer | Current Part and target v2 have no sheet thickness constraint; StockOption thickness is optional and sheet optimizer is 2D. Silent claims of verified panel thickness would be false. Enforcing it now is a material contract expansion. Confidence: high | Hard if portable fields change / before D2 and Phase 6 fit |
| D6a-view-preferences — RESOLVED by owner, 2026-10-22 | Selected camera/display/snap preferences local per project and outside portable design/history. Alternative: portable versioned view settings, or session-only settings; defer | Guide excludes camera/panel state from model history, but persistence scope remains explicitly open. Local preferences avoid backup size/schema coupling; portable settings travel with projects. Confidence: medium | Moderate / before Phase 4 preferences |
| D6b-measurements — RESOLVED by owner, 2026-10-22 | Selected transient Tape Measure results with no persistent guides initially. Alternatives: portable undoable guide entities; local-only persistent guides; defer | Initial features make guides optional and leave persistence open. Persistent guides add schema and editing behavior; transient readings deliver measurement with smaller scope. Confidence: medium | Moderate / before D2 if guide records are portable, otherwise Phase 5 |
| D7a-region — RESOLVED by owner, 2026-10-22 | Selected Canada/US dimensional-lumber catalog initially, both display units. Alternatives: another single region, multiple regional catalogs, or defer region selection (custom actual-size stock still available) | Current presets/CAD default suggest North American use but do not establish owner intent or validate catalog values. Region changes nominal/actual mapping and lengths; unit system must not silently select region. Confidence: medium | Moderate / before Phase 6 catalog release |
| D7b-release-envelope — RESOLVED by owner, 2026-10-22 | Selected Windows Chrome/Edge desktop mouse/keyboard editing first, with responsive narrow-screen numeric/list access; record hardware before measuring enforceable budgets. Alternatives: full touch modeling in this release; broader browser/hardware guarantees; defer commitment | Initial gestures require mouse buttons/modifiers; viewport checks alone do not define touch parity or performance guarantees. No measured scene exists. Numeric timing targets would be invented today. Confidence: medium | Moderate / before release criteria; touch scope before tool implementation |

**Dependency order:** D4a + D4b + D4c + D6b → D2 exact schema → validation/migration/commands → UI integration. D1 → renderer dependencies/adapter. D3 → canonical schema amendment/legacy migration. D6a → preference storage boundary. D7a → catalog verification; D7b → supported input/platform matrix → measured performance budgets. Ask at most three owner decisions per round and do not ask D2 until its upstream scope is settled.

**D5 reconciliation:** A3/A4/A6 settle routine interruption/input/menu defaults. D2 owner approval settles exact topology serialization/tolerance, extrusion limits, conversion and Eraser rules below. Numeric snap target prioritization may be specified/tested locally so long as typed values and source selection/modifier contracts are preserved. Platform shortcut testing must retain independent pointer/numeric paths without overriding browser/system shortcuts.

Targeted discovery used for recommendations: existing ordering fields/helper/consumer, current preset consumer and workflow assertions, current standalone preview, installed dependencies, and official rendering docs. No implementation experiment was run and no dependency installed. No further speculative discovery is needed before the first owner round.

#### D2: Approved concrete design schema

**Classification:** Owner decision, approved 2026-10-22 in round 4; hard to reverse because it defines portable data. **Recommendation confidence:** medium; the representation is consistent with the source constraints, but geometry implementation and browser performance are unverified. **Alternatives reviewed:** renderer-owned meshes lose editable intent and violate the domain boundary; a general solid/CSG kernel expands approved scope; baking every instance into separate geometry loses shared-definition semantics. Owner approved the renderer-free profile/extrusion records, rules and protective limits, subsequently amended by the owner-authorized adversarial-review changes recorded below; there is no remaining schema approval gate.

The following types define the proposed serialized records, not existing application APIs. All optional fields use absence, never null. Existing project ID/text/byte limits apply; unknown fields and discriminants are rejected recoverably. All ID references below resolve within the containing project/design, except historical projection provenance.

```ts
type Vec3Um = [number, number, number]; // signed safe integer micrometers
type Quaternion = [number, number, number, number]; // x,y,z,w; finite, unit length
type ScalePpm = [number, number, number]; // positive integer parts per million
type Pose = { positionUm: Vec3Um; rotation: Quaternion };
type Appearance = { color: string }; // canonical #RRGGBB; no assets/textures
type Vertex = { id: string; positionUm: Vec3Um };
type Edge = { id: string; vertexIds: [string, string] };
type Face = { id: string; vertexIds: string[] }; // ordered simple planar outer loop
type Extrusion = { id: string; faceId: string; distanceUm: number };
type Geometry = {
  vertices: Vertex[];
  edges: Edge[];
  faces: Face[];
  extrusions: Extrusion[];
};
type CutSpec = {
  kind: 'board' | 'panel' | 'explicit';
  lengthUm: number;
  widthUm: number;
  thicknessUm: number;
  grainAxis: 'length' | 'width' | 'none';
  confirmation: 'confirmed' | 'requires-confirmation';
};
type Definition = {
  id: string;
  name: string;
  geometry: Geometry;
  cutSpec?: CutSpec; // absent = model-only
  materialId?: string; // absent = material not selected; saveable draft
  appearance: Appearance;
};
type Instance = {
  id: string;
  definitionId: string;
  name?: string;
  pose: Pose;
  scalePpm: ScalePpm;
  hidden: boolean;
  locked: boolean;
  projectionExcluded?: true; // persistent detach; absence = eligible subject to cutSpec/material
  materialId?: string; // override; otherwise inherit definition material
  appearance?: Appearance; // override; never changes optimizer material
};
type LooseObject = {
  id: string;
  name: string;
  geometry: Geometry;
  pose: Pose;
  scalePpm: ScalePpm;
  appearance: Appearance;
  hidden: boolean;
  locked: boolean;
}; // model-only until converted to a component
type ProjectedFields = Pick<Part,
  'name' | 'materialId' | 'length' | 'width' |
  'crossSection' | 'grainLocked' | 'quantity'>;
type Sources = { definitionId: string; instanceIds: string[] };
type ProjectionSnapshot = {
  sources: Sources; // historical IDs, allowed to outlive geometry
  fields: ProjectedFields; // last accepted design projection, not manual choices
};
type LinkReason = 'source-deleted' | 'definition-edited' | 'instance-scaled' |
  'material-changed' | 'made-unique' | 'part-deleted';
type ActiveLink = {
  state: 'active';
  current: Sources;
  lastApplied: ProjectionSnapshot;
};
type PendingLink = {
  state: 'pending-removal' | 'pending-reconcile' | 'pending-part-deletion';
  reasons: LinkReason[];
  current?: Sources; // only if every supplied current reference resolves
  lastApplied: ProjectionSnapshot;
};
type DesignDocumentV1 = {
  schemaVersion: 1;
  definitions: Definition[];
  instances: Instance[];
  looseObjects: LooseObject[];
  partLinks: Record<string, ActiveLink | PendingLink>; // key = generated Part ID
};
```

**Coordinates and transforms.** Use right-handed world axes X width, Y up/height, Z depth, floor XZ, Front camera on +Z looking at origin. In component-local coordinates, +X is length, +Y width, +Z thickness. A board/panel primitive begins at local `[0,0,0]`, its rectangular profile lies in XY and it extrudes along +Z; its assembly pose determines world orientation. One scene unit is one meter (`um / 1_000_000`). Persist positions as integer micrometers, positive per-axis scale as integer ppm (identity `[1_000_000,1_000_000,1_000_000]`), and normalized quaternions. Transform points by scale, then rotation, then translation. No negative/zero scale, reflection or arbitrary shear matrix in this version. Accepted finite quaternions must have norm within 0.000001 of one; commands normalize before serialization, validators reject values outside tolerance. Rotate is rigid assembly orientation; Scale operates along the selected object's local axes, uniformly or per-axis. Multi-object scale applies a common factor to each object's local axes; it does not skew a rotated object through a world-axis parent scale. Show that axis policy in the tool prompt.

Instance scale remains independent of definition geometry: effective cut dimensions are each base dimension times its corresponding local scale, rounded once to the nearest micrometer (positive half values round upward). Definition edits update base geometry/dimensions for all instances while retaining their poses/scales. Make Unique clones the definition and retains the selected instance's pose/scale/material/appearance overrides; Duplicate links the same definition. Selecting a different default Scale anchor/pivot adjusts position to keep the chosen anchor fixed; no persistent pivot field is needed. Primitive dimension edits update geometry and cutSpec in the same command. Generic topology edits clear an automatically derived board/panel cutSpec if its rectangular eligibility is lost and mark links pending. Explicit cutSpec retains its dimensions/grain and sets its required `confirmation` to `requires-confirmation` after every definition geometry change, whether linked or unlinked. This is a saveable warning and blocks projection of every affected instance; pending links alone never establish confirmation. An explicit confirm-cut-dimensions action (with reviewed values) sets `confirmed`; preview/apply cannot confirm implicitly. Primitive creation and synchronized primitive dimension edits produce confirmed board/panel specs; validators require board/panel specs to be confirmed and consistent with their eligible rectangular geometry. Explicit specs may carry either confirmation state. Move/rotate, instance scale, appearance/material changes and visibility do not invalidate definition cut confirmation. Make Unique copies confirmation; shared geometry edits invalidate the shared explicit spec for all instances. Undo/redo restores dimensions and confirmation together.

**Topology and editing.** Geometry IDs are stable and unique within their collection in that Geometry; hit/selection addresses include object/definition and collection kind, so vertex IDs need not be globally unique. Faces reference ordered vertices connected by explicit edges; allow one simple outer loop, no holes. Closure/planarity tolerance is **1 micrometer** in domain space; do not reuse screen-pixel hit/snap tolerance as geometry tolerance. Valid face loops have at least three distinct vertices, no repeated closing vertex, nonzero area, no crossings, and consistent boundary winding; each edge has distinct endpoints and no duplicate undirected edge exists. Each face may have at most one extrusion. Nonzero signed distance extrudes along its ordered normal; changing the distance edits that simple prism, rather than performing a boolean. Cap/side selections are derived handles `(extrusionId, cap-or-edge)`; meshes and generated triangles are not stored. Push/Pull may move the end cap without crossing or collapsing the base; side-face extrusion, holes and through-geometry boolean operations are rejected unchanged with an explanation. Push/Pull never combines or trims another object. Separate overlapping assembly components are allowed and receive warnings; this is not a collision-free assembly constraint.

Line and Rectangle edit planar edge/face geometry; Rectangle accepts exact local side dimensions. Erasing a loose edge also removes dependent non-extruded faces in one undoable command; if it supports an extrusion, require removal of that whole extrusion/associated face through the eligible solid action instead of leaving an invalid shell. Erasing a face with an extrusion removes the extrusion and face together, leaving nondependent edges. Erasing an instance removes only that instance; definition deletion is a distinct Components action that lists affected instances and is undoable. Commands validate the entire proposed result before commit. Multiple disjoint profiles can exist in one definition, but a cutSpec must be explicit unless the whole definition is one eligible rectangular board/panel. Make Component converts eligible loose selection into definition-local geometry with an instance, rebasing selected world geometry into one rigid local frame; source geometry is replaced atomically, with one undo record. No definition contains component-instance children. Rebase/scale operations that cannot preserve planar/profile invariants at integer precision are rejected rather than approximately saved.

**Cut projection.** Only instances without `projectionExcluded` and with a supported cutSpec whose confirmation is `confirmed` and selected effective material project; loose geometry remains model-only. Board/panel primitives generate cutSpec automatically; other components require explicit cut dimensions or conversion to a verified rectangular primitive. `kind: board` requires linear material, `panel` sheet material, and `explicit` follows the selected material kind. Projection uses local cutSpec × instance scale, never a world bounding box. Linear cutSpec requires grainAxis length; generated linear output supplies `crossSection.width/thickness` and omits legacy linear `width`/grain flags; sheet output supplies length/width and grainLocked according to local grain. For sheet width-axis grain, swap projected length/width into the optimizer grain convention before locking; include effective dimensions/grain outcome in the aggregation comparison so unlike requirements never merge. Panel thickness stays in design and is explicitly unverified in sheet planning. Hidden/locked instances still count as modeled physical parts; visibility/locking do not silently change quantities.

Aggregate only matching definition ID, effective dimensions (including design thickness), effective materialId, and grain outcome; quantity is contributing instance count. Projected name comes from definition name; instance labels are UI labels. Manual group/notes are never owned by the projection. Allow non-destructive material deletion only by an atomic command that updates definition/instance assignments and existing manual/generated Part references under explicit user choices; do not leave dangling current material references. Unassigned material is a saveable non-projectable state. Selection, tool sessions, typed drafts, measurement readings, history, camera/display/snap preferences and derived meshes remain outside DesignDocumentV1.

**Links and conflicts.** Active keys resolve a current Part; their current Sources resolve one definition and all contributing instances assigned to it. No live instance belongs to multiple current links, including pending links with current Sources. LastApplied is historical and bounded; its field values are the design projection at the last accepted apply even when the user chose a different manual value. Three-way comparison thus continues to preserve retained manual overrides in later previews. When current sources/Part cease to resolve, change link state in the same command; omit invalid `current` rather than storing active dangling references. Simultaneous pending causes use the reasons array; primary-state precedence is `pending-part-deletion`, then `pending-removal` if no contributors remain, otherwise `pending-reconcile`. Definition edit/scale/material changes make affected links pending-reconcile. Source deletion preserving surviving contributors uses pending-reconcile; deleting the last contributor uses pending-removal. Part absence is permitted only in pending-part-deletion. Make Unique leaves the old row reviewable and never auto-generates a new Part. Preview matches surviving source membership to reuse a prior Part ID for a one-to-one update; splits/merges require explicit row disposition and deterministic existing-row selection (lexicographic Part ID), with fresh IDs reserved once for new preview rows. New previews are invalidated by editSequence/generation changes; applying consumes that exact reviewed result and commits Parts/links atomically. Detach/removal deletes the retired link from the document; do not append provenance history. Explicit detach atomically preserves the Part as manual, sets `projectionExcluded: true` on every surviving contributing instance (from current and last-applied membership), and retires the link. Excluded instances cannot appear in any current link and never generate additions, including after geometry/material edits or reload. Historical membership may still mention them. Review must resolve any other affected links atomically. Keeping a manual row when all sources were deleted needs no exclusion record. An explicit Include in cutlist action clears exclusion for selected instances and opens a fresh review; it never silently reclaims the detached manual Part. Make Unique and Duplicate preserve exclusion; new primitives default to eligible. Deleting an instance naturally removes its exclusion. Copy/import/restore/cloud transfer preserve it. This bounded per-instance state replaces an accumulating detached-source history.

**Protection limits.** Proposed maximums per design: **1,000 definitions, 5,000 instances, 1,000 loose objects; 20,000 vertices, 40,000 edges, 10,000 faces and 2,000 extrusions across all stored Geometry records; 512 vertices per face; 5,000 source IDs per link.** No component nesting (depth one). Coordinate components are signed integers within ±1,000,000,000 um; cut dimensions are positive integers at most 1,000,000,000 um; scale ppm components are 1–1,000,000,000. Validate effective transformed extents and dimensions against the same coordinate/dimension bounds. These protective ceilings are subordinate to the existing **1,000,000 UTF-8 bytes per complete project**, measured by the contract's canonical project serialization rule. These limits are not capacity/performance promises. Use overflow-safe predicates for integer topology and derived arithmetic; operations that exceed bounds fail without changing saved or dirty prior-valid data. Geometry rounding/tolerance behavior must have boundary tests at ±1 um. Unknown newer project/design data stays recoverable read-only.

**Local preference record (D6a, already approved).** Store a separate optional namespace/project-keyed device record containing finite bounded camera position/target, projection mode, grid/axes/helper visibility, snap enablement/increment and measurement-display choices. Validate/fallback individual preferences without rewriting the portable project. No camera references to renderer objects; copies/imports start at defaults. Preference write failure must not falsely mark project content unsaved or saved; model save status is independent. No guides are stored.

**Implementation and verification effects:** After owner approval, Phase 1 turns this proposal into exact interfaces/validators and fixture examples without changing meaning; Phase 2 rejects unsupported topology/limits/nesting with recovery; Phase 3 verifies geometry/profile/scale precision and all link states; Phases 5-6 expose local-axis scaling, eligibility/reconfirmation and explicit fit/conflict feedback. Mandatory tests include no dimensions changed by move/rotate, scaled-instance/shared-edit composition, width-axis sheet grain, manual overrides surviving repeated apply, simultaneous pending causes, reference-preserving Make Unique/copy, all limit boundaries, and per-project preference isolation. No runtime verification is claimed here.

**Risks:** storage cutover is substantial and touches all editors; old v1 tabs cannot be fenced; geometry tooling is larger than a scene viewer; browser WebGL and assistive-technology behavior cannot be proven by jsdom; document limits constrain model complexity; strict v2 validation requires deliberate legacy repair rather than silent normalization. No unsupported schedule or throughput promise is made.

#### Adversarial-review amendments (owner authorized 2026-10-22)

- Persist cut-spec confirmation on the definition's CutSpec, retaining explicit values across geometry changes and all round trips; projection requires confirmed state independently of link status.
- Persist detach as per-instance projection exclusion, with explicit re-inclusion; save/reload or cloud transfer must not regenerate detached rows.
- Use the persistence contract's single canonical compact serializer for document bytes, local writes, backups and future cloud storage/validation. Raw input bounds are separate from the document budget.
- These amend the approved, unimplemented DesignDocumentV1 target; no released design payload exists to migrate. Future changes to released formats require versioned compatibility handling. Implementation remains unauthorized by this artifact alone.

### 3. Roles & Delegation

FULL profile reflects distinct dependent phases and is intended for later `orchestrate-implementation` execution. This planning session spawns no agents.

| Role | Agent or session | Model | Responsibility |
| --- | --- | --- | --- |
| Planner | Current Codex session | GPT-6 | Evidence, draft plan, and decision gates |
| Implementer | Not assigned | Not assigned | Sequential phase delivery and evidence |
| Validator | Not assigned | Not assigned | Independent acceptance review and browser validation |

### 4. Decisions & Change Log

| Decision | Source and date | Supersedes | Affected scope or acceptance criteria |
| --- | --- | --- | --- |
| d16: optional embedded design, project schema v2 | Owner decisions recorded in guide, 2026-10-22 | Separate design persistence alternatives | Phases 1-2; no-design migration and atomic backups |
| d17: planar profiles/simple extrusion, no general CSG | Owner decisions recorded in guide, 2026-10-22 | General solid-kernel scope | Phases 1, 3, 5 |
| d18: optional linear crossSection, required for generated boards; permit 90-degree cross-section turn | Owner decisions recorded in guide, 2026-10-22 | Length-only model-generated fit | Phases 3, 6 |
| d19: links/snapshots live in design, not manual Part metadata | Owner decisions recorded in guide, 2026-10-22 | Part-owned provenance | Phases 1, 3, 6 |
| d20: single selected materialId in aggregation key | Guide's automatically resolved decision, 2026-10-22 | Alternative material-choice sets | Phase 3 projection |
| A1-A8: local implementation defaults resolved; options/evidence recorded above | Repository and source review, 2026-10-22 | Corresponding routine ambiguity within D5/D6 and implementation tasks; no owner choice superseded | Shared modules/primitives/catalog; transaction cancellation and exact input; no-save preview; no new clipboard scope; existing test layout |
| D1-renderer RESOLVED: Three.js + Fiber + selected Drei helpers | Owner round 1 answer, 2026-10-22 | Open renderer choice; direct Three.js/Fiber-only/defer alternatives retained above | Phase 4 dependencies/lifecycle; renderer-independent domain remains required. Medium recommendation confidence; package/build verification pending |
| D3-editor-order RESOLVED: keep optional portable editorOrder in v2 | Owner round 1 answer, 2026-10-22 | Contract omission; local-only/retirement/defer alternatives retained above | Normative contract amended; Phase 2 migration and backup/copy/restore preserve ordering. High confidence |
| D4a-nesting RESOLVED: single-level definitions/instances initially | Owner round 1 answer, 2026-10-22 | Open nesting scope; nested-now/defer alternatives retained above | No nested instances in definitions; domain/import/UI reject them explicitly; Phase 2/3/5 tests verify rejection. Nested assemblies deferred. Medium recommendation confidence |
| D4b-dimension-semantics RESOLVED: requested finished cut dimensions | Owner round 2 answer, 2026-10-22 | Rough-stock allowance fields/defer alternatives retained in register | Phases 1/3/6: no automatic surfacing/joinery allowance; existing explicit project kerf/trim remain optimizer inputs. High confidence |
| D4c-sheet-thickness RESOLVED: retain 2D sheet planning, thickness unverified | Owner round 2 answer, 2026-10-22 | New portable sheet-thickness constraint/defer alternatives retained in register | Panel thickness stays in design; no sheet Part thickness field or filter added. Preview/results explicitly warn thickness compatibility is unverified even if length/width fit. High confidence |
| D6b-measurements RESOLVED: transient readings only | Owner round 2 answer, 2026-10-22 | Portable/local persistent guides/defer alternatives retained in register | Phases 1/5: no guide schema/storage/history; Tape Measure readings are session state and do not dirty the model. Medium recommendation confidence |
| D6a-view-preferences RESOLVED: local per project | Owner round 3 answer, 2026-10-22 | Portable/session-only/defer alternatives retained in register | Store camera/display/snap preferences in device-local namespace/project metadata; exclude from portable exports and model undo. Copy/import starts with defaults. Medium confidence |
| D7a-region RESOLVED: Canada/US presets | Owner round 3 answer, 2026-10-22 | Other/multiple regions/defer alternatives retained in register | Share verified North American nominal/actual presets across Design/Cutlist; units do not select region; custom stock remains available. Medium confidence; catalog source verification pending |
| D7b-release-envelope RESOLVED: Windows Chrome/Edge mouse/keyboard first | Owner round 3 answer, 2026-10-22 | Broader browsers/full touch/defer alternatives retained in register | Mandatory browser validation targets Windows Chrome and Edge; narrow-screen list/numeric controls remain usable, full touch geometry gestures deferred. Medium confidence; scene measurements pending |
| D2-design-schema RESOLVED: approve documented concrete schema, geometry rules, transforms and limits | Owner round 4 answer, 2026-10-22 | Pending D2 proposal; alternatives retained above | All phases consume the approved D2 contract. Decision closure complete; no implementation started and no acceptance evidence claimed |

# Execution Plan & Handoffs

## Phase 1: Close Design Contracts and Implementation Gates

- **Status:** COMPLETE (contract artifacts; implementation verification pending)
- **Objective:** Make schema, renderer boundary, geometry limits, and compatibility decisions concrete before they determine stored data.
- **Exit Deliverable:** Decision-complete domain contract and module ownership map in [phase-1-contract.md](./phase-1-contract.md), together with the approved schema and invariants below.

### Tasks

- [x] Translate approved D1-D7 decisions into the module/interface map. Verify exact stable dependency compatibility against primary sources immediately before Phase 4 installation; reopen owner choices only if new evidence establishes a material incompatibility.
- [x] Define the exact serialized design records/discriminants, optionality, uniqueness/references, geometry invariants, local/world transforms, scale policy/composition, grain/cut semantics, protective limits, safe arithmetic and complete-project byte ceiling in the approved D2 contract; index implementation ownership in [phase-1-contract.md](./phase-1-contract.md).
- [x] Specify all persisted link states, historical versus current references, bounded snapshot fields, lifecycle examples, and deterministic grouping/row identity rules in D2 and [phase-1-contract.md](./phase-1-contract.md).
- [x] Specify repository result/operation contracts, recovery record and migration-owner shape, source-hash behavior, `editorOrder`, notifications, and editSequence/localGeneration semantics in [phase-1-contract.md](./phase-1-contract.md), consistent with the canonical persistence contract.
- [x] Specify command atomicity, undo/redo/save semantics, projection application history, manual Cutlist edits, and definition-versus-instance property ownership in [phase-1-contract.md](./phase-1-contract.md).
- [x] Carry D1/D3/D4a into exact implementation ownership: Fiber/selected Drei scene adapter, optional portable editorOrder, and no component-instance children inside definitions.
- [x] Apply A1-A8 and approved D2 contracts. Executable validators and boundary fixtures are assigned to Phases 2-3 so contract closure does not implement or pre-empt their owning phases.
- [x] Assign remaining catalog/browser/performance evidence gates to Phases 6-7; these are not unresolved product choices.

### Outcome & Evidence Ledger

| Outcome / acceptance criterion | Check | Verification method | Result / evidence |
| --- | --- | --- | --- |
| Exact schema and compatibility decisions permit implementation | Mandatory | Review every D1-D4 answer and schema field/invariant against all three source documents; record owner decisions and any contract amendment, including editorOrder | COMPLETE — approved D2 contract plus module map in [phase-1-contract.md](./phase-1-contract.md); no canonical contract amendment required |
| Pending link states are portable without active dangling references | Mandatory | Walk through serialized examples for source deletion, Make Unique, manual Part deletion, detach, copy, and unresolved review; check schema accepts valid pending states and rejects malformed active links | CONTRACT COMPLETE — examples and reference rules recorded in [phase-1-contract.md](./phase-1-contract.md); executable acceptance/rejection validation is Phase 2 |
| All initial features have an implementation and validation home | Mandatory | Trace each tool, drawer, interaction, backup/recovery and cutlist acceptance item to Phases 2-7; record remaining gates and owners | COMPLETE — feature-to-phase ownership and evidence gates recorded in [phase-1-contract.md](./phase-1-contract.md) |

### Phase Record

- **Artifacts created/modified:** Added [phase-1-contract.md](./phase-1-contract.md); linked it here. Canonical persistence and product contracts were not changed in this phase.
- **Decisions/deviations:** All ten owner choices and eight routine selections remain resolved. D2 contract is unchanged. No executable validators/fixtures were added; schema and geometry fixtures belong to Phases 2-3. Dependency peer compatibility is a pre-install gate for Phase 4.
- **Next-phase context:** Phase 2 consumes the approved schema/repository contracts. Renderer-independent work must not depend on scene objects. Contract completion is not runtime or implementation verification.

## Phase 2: Schema V2 and Recoverable Per-Project Persistence

- **Status:** PARTIAL — implementation and automated checks are in place; mandatory browser evidence remains outstanding.
- **Objective:** Safely persist complete projects and migrate existing manual workflows to the shared asynchronous repository.
- **Dependencies:** Phase 1 schema, identity and compatibility gates.
- **Exit Deliverable:** Validated v2 documents, durable per-project saves, explicit recovery and working manual Cutlist/dashboard routes.

### Tasks

- [ ] Refactor `model.ts` validation/import/export into portable versioned boundaries; validate containers before defaults, reject unknown fields/versions with original bytes retained, and implement every v1 compatibility-table case. Keep missing design absent.
- [ ] Implement canonical project serialization shared with the future Worker: recursive sorted object keys, unchanged array order, compact UTF-8 output and exact document-byte validation per the persistence contract; separate bounded raw input from normalized document size.
- [ ] Implement the approved renderer-free design schema and structured issues with code/path/severity. Enforce text/count/dimension/reference limits, document bytes and safe derived arithmetic; distinguish malformed documents from saveable optimization-incomplete drafts.
- [ ] Once D2 is approved, implement the concrete types/invariants above, including boundary fixtures for geometry limits, transform/scale precision, simultaneous pending reasons and persistent manual field overrides across repeated projection applies. Do not substitute mesh serialization or widen topology scope.
- [ ] Preserve optional editorOrder through migration, export, copy and restore; keep display ordering independent of canonical arrays. Test nested component records are rejected with recovery rather than flattened or silently accepted.
- [ ] Replace `storage.ts` collection writes with asynchronous IndexedDB list/get/create/save/delete/subscription boundaries. Use `(local, projectId)` keys and generation-checked transactions for saves/deletes; summaries must not deserialize every design. Preserve dirty newer edits after an earlier save completes.
- [ ] Implement resumable legacy cutover: retain exact whole-library bytes/hash and independent record recovery; detect duplicate IDs; migration-owner/attempt records; destination generation checks; reopen verification; retain source/recovery copies. Recover unreadable records without hiding valid projects.
- [ ] Detect changed legacy payloads on storage events/startup/focus, before completion and every 60 seconds foregrounded; preserve and deduplicate each observed hash transactionally. Never use omissions to delete IndexedDB projects. Explain old-tab limits and support export/reload, compare and explicit restore-as-copy/repair.
- [ ] Implement explicit create/copy/import-as-copy/restore/export identity semantics; copy always gets fresh project identity/timestamps and preserves project-scoped child IDs/links; restore preserves destination identity/creation date and checks generation. Reject failures without destination mutation.
- [ ] Adapt dashboard, Cutlist, project Design lookup and workflow tests to async loading/error/conflict/recovery states. Remove production whole-library writes; acknowledge save only after commit. Provide retry/raw export and preserve dirty work on quota failure.

### Outcome & Evidence Ledger

| Outcome / acceptance criterion | Check | Verification method | Result / evidence |
| --- | --- | --- | --- |
| Canonical bytes and durable review state survive round trips | Mandatory | Golden serialization fixtures with reordered object keys, unchanged arrays, multibyte text and exact 999,999/1,000,000/1,000,001-byte documents; bounded whitespace-heavy input; save/export/import byte equality. Round-trip linked/unlinked unconfirmed cut specs and detached instances through copy/restore; retain entered dimensions, block projection and prevent regenerated rows | PARTIAL — canonical order, UTF-8 byte boundaries, and copy/restore design/link round trips pass; projection behavior is Phase 3. `src/lib/planner/serialization.test.ts`, `src/lib/planner/model.test.ts` |
| Golden migration and portable design survive round trips | Mandatory | `npm run test`: add cases beside planner model/storage tests covering every contract compatibility row, early defaults, no-design, unknown fields/versions, byte/count boundaries, identity and all pending link states | PASS — v1 defaults/editorOrder, no-design, unknown version/field, identity, pending links and structural design cases covered; full suite 18 files / 62 tests. |
| Saves and cutover cannot silently replace newer work | Mandatory | Repository tests with transactional IndexedDB-capable test support: same/different project saves, stale delete, edits during save, interrupted/repeated migration, changed hashes, duplicate IDs, quota and reopen failures; verify retained exact bytes and generations | PARTIAL — generation conflicts, different-project isolation/reopen, repeated migration, concurrent same-hash attempts, changed-source preservation/retry, duplicate IDs and original-byte export pass. Quota and interrupted browser transaction failure remain unverified. |
| Existing manual workflow remains functional through async UI | Mandatory | Extend `src/planner-workflow.test.tsx` for create/edit/optimize/export/reopen, recovery among valid projects, import/restore cancellation and save-failure feedback; run `npm run test` | PASS — dashboard/Cutlist workflow assertions pass in `npm run test -- --reporter=dot` (18 files / 62 tests); import-as-new and restore identity helpers are tested. |
| Actual cross-tab storage behavior matches repository guarantees | Mandatory | Real browser with two new-client tabs and one legacy-key writer: same-project conflict, different-project independence, cutover write during/after migration, reload/retry; retain browser/version and transaction/recovery evidence | PENDING — automated fake-IndexedDB concurrency test passes; still requires Chrome/Edge two-tab run with a legacy writer, simultaneous same-project edits, source change during cutover, reload and recovery verification. Old legacy tabs are not fenced from later localStorage writes; source is retained and rechecked before completion. |

### Scope & Diff Guardrails

- Never remove the legacy key/recovery payloads automatically; never convert read failure into an empty library. No cloud outbox or services. Keep existing MVP plan historical.

### UI Validation

- **Viewports:** 1440×900, 1024×768, 390×844; existing light/dark themes.
- **Interactions/states:** async load, missing project, unsupported/recovery record, storage unavailable, quota error, conflict, dirty/save/retry, copy versus restore.
- **Requested measurements:** No horizontally clipped recovery actions; save status changes only after commit; later edits remain dirty.
- **Preview limitations/fallbacks:** jsdom cannot certify native IndexedDB multi-tab behavior; use a real browser and retain exportable fixtures if automation is unavailable.

### Phase Record

- **Artifacts created/modified:** `model.ts`, `serialization.ts`, `design/schema.ts`, repository and IndexedDB adapter, recovery/migration adapter, dashboard/Cutlist/Design routes, focused tests; `fake-indexeddb` added as a test dependency.
- **Decisions/deviations:** Migration attempts use a hash-keyed IndexedDB owner lease and attempt record; the completed marker is committed only by the current owner after re-reading the legacy source. IndexedDB cannot atomically fence an arbitrary old tab's later localStorage write, so raw legacy/recovery payloads are retained and browser cutover remains unverified. `npm run test -- --reporter=dot`: 18 files / 62 tests passed. `npm run build`: passed. `npm run lint`: one existing error at `src/components/ui/button.tsx:67` (`react-refresh/only-export-components`).
- **Next-phase context:** Pure commands and projection consume validated v2 data and repository generation tokens.

## Phase 3: Geometry Commands, Components and Pure Cutlist Projection

- **Status:** PARTIAL
- **Objective:** Implement testable modeling and reconciliation rules independently of WebGL.
- **Dependencies:** Phases 1-2 domain/schema contracts; D5 topology rules before topology command implementation.
- **Exit Deliverable:** Validated command/history engine, component lifecycle and deterministic projection/conflict functions.

### Tasks

- [x] Implement local frames/conversion/rounding, board/panel creation, planar edge/face closure and simple extrusion according to approved tolerances. Reject nonplanar/degenerate/self-intersecting/unsupported topology atomically.
- [x] Implement command sessions with provisional state, valid commit, Escape cancel and one undo record per gesture. Cover move/rotate/physical scale with pivot rules, paint-only appearance, Eraser granularity, rename/hide/lock and exact numeric edits; exclude camera/drawers from history.
- [x] Implement Make Component eligibility, linked duplicate with predictable placement, shared definition editing and Make Unique. Preserve independent transforms and approved property ownership; mark affected projection links pending in the same command.
- [x] Limit component creation/editing to single-level definitions/instances; provide an explanation when selection would introduce nesting. Cover rejection without domain mutation in unit and UI tests. (Domain/schema rejection is tested; UI feedback remains with workspace integration.)
- [x] Implement cutlist eligibility/conversion and explicit cut dimensions; group by definition, effective local cut dimensions and selected materialId. Exclude model-only geometry; keep grain and sheet semantics explicit.
- [x] Implement pure preview of add/update/remove/split/merge/detach and field conflicts comparing last-applied fields, current Part and new design projection. Define stable row-ID reuse and decisions for both manual/design changes; unresolved conflicts cannot be applied.
- [x] Persist and enforce cut-spec confirmation and per-instance projection exclusion. Detach/re-include and geometry edits update these states atomically with affected links; preserve values across undo/redo, copy and restore.
- [x] Implement atomic apply intent and stale checks for localGeneration plus editSequence, including deletion/Make Unique/manual row deletion lifecycle and preservation of unlinked manual Parts. Define undo behavior without bypassing concurrent-save checks.

### Outcome & Evidence Ledger

| Outcome / acceptance criterion | Check | Verification method | Result / evidence |
| --- | --- | --- | --- |
| Geometry precision and command history meet contract | Mandatory | `npm run test`: pure-domain fixtures for rotated boards, unit round trips, scale/pivots, closure tolerance, invalid extrusion and cancellation; assert unchanged prior state on failure and one undo per completed gesture | PASS — focused suite: 2 files / 25 tests; includes signed rounding, rotated projection invariance, ±1 µm planarity boundary, overflow, pivoted scale, provisional invalid/cancel/repair, and one-entry undo/redo |
| Components share geometry while retaining independent transforms | Mandatory | Unit cases for duplicate/shared edit/Make Unique/undo/redo, invalid component selection, removed instances and link-state transitions; verify serialized reopen | PASS — tests cover duplicate, multi-object Make Component rebase, Make Unique, shared edit, link transitions, undo/redo; schema rejects nested/invalid refs |
| Confirmation and detach remain effective after reopen | Mandatory | Geometry edit of linked/unlinked explicit specs; save/reload, Make Unique, Duplicate, shared edits and undo/redo; reject unconfirmed projection without losing dimensions. Detach then repeated preview/apply/reload/copy/restore produces no duplicate; only explicit re-inclusion permits new reviewed rows | PASS — explicit confirmation state survives export/import; detach exclusion survives export/import and copy; excluded geometry projects only after explicit Include and a fresh preview |
| Projection preserves manual data and handles identity changes | Mandatory | Table-driven cases for same/different dimensions/materials, scale, row split/merge, simultaneous manual/design field edits, source/Part deletion, detach and stale previews; assert deterministic output, no unresolved apply, atomic link/Part result | PASS — tests cover scale, sheet grain, split/merge, manual field conflict choices, deleted-Part no-regeneration, detach/include, stale apply and manual field preservation; apply intent validates the full result |

### Scope & Diff Guardrails

- No mesh-derived cut sizes, implicit allowances, boolean operations or renderer imports in domain modules. No live cutlist writes while previewing a command.

### Phase Record

- **Artifacts created/modified:** Added renderer-free `geometry.ts`, `commands.ts`, `history.ts`, `projection.ts`, `domain.test.ts` and strengthened approved D2 validation in `schema.ts` under `src/lib/planner/design/`.
- **Decisions/deviations:** Implemented signed/positive rounding, bounded transforms and local-pivot scaling, overflow-safe planar topology, rectangular primitive creation/resizing and extrusion edits, multi-object Make Component rebase (rejecting nonuniform scales that cannot preserve the simple geometry), component/instance lifecycle, Eraser granularity, material/appearance/property commands, immutable command sessions/history, cut confirmation and durable exclusion, projection grouping/split/merge identity, required row/field decisions, and stale-guarded atomic apply intents. Commands and apply intents validate the complete resulting project, including its byte budget. No renderer imports or live persistence writes were introduced. UI feedback/browser integration remains with later workspace phases.
- **Verification:** `npm run test -- --run src/lib/planner/design/domain.test.ts src/lib/planner/design/schema.test.ts` passed (2 files, 25 tests). `npm run build` passed. Full-suite/lint and browser checks were not run.
- **Next-phase context:** Scene adapters submit intents to these APIs; they do not duplicate validation/history rules. Phase 4 can consume the domain fixtures. UI invalid-selection feedback and real-browser workflows remain unverified and must be covered during workspace integration.

## Phase 4: Read-Only Scene and Accessible Workspace Frame

- **Status:** PARTIAL — implementation and focused automated checks are in place; mandatory real-browser evidence remains outstanding.
- **Objective:** Prove scene lifecycle, cameras and synchronized selection before adding direct modeling gestures.
- **Dependencies:** Approved D1/D2 and Phase 3 domain fixtures; D6 preview/preference decision.
- **Exit Deliverable:** Bounded scene, toolbar/drawer shell, accessible selection and repeatable browser fixtures.

### Tasks

- [x] Add approved Three.js, React Three Fiber and selected Drei helpers with compatible stable versions and TypeScript support; update lockfile deliberately. Verify package peers and production build. Lazy-load project scene code so manual Cutlist need not initialize WebGL; implement resource disposal, container resize, DPR cap and hidden-tab rendering reduction. Browser gesture checks remain pending below.
- [x] Compose existing project Design route with left tool rail, center canvas, right info rail/drawers and status. Keep unavailable tools explicitly unavailable until implemented; implement project lookup/load/recovery without creating a design merely by visiting.
- [x] Render domain board/panel/profile geometry with axes/grid, hover/selected/locked/hidden/invalid states; synchronize viewport/list/Entity Info selection and text status.
- [x] Implement perspective and standard orthographic views, frame model/selection/reset, orbit/pan and bounded pointer-centered zoom. Keep camera state outside model undo and document data per D6.
- [x] Persist validated camera/display/snap state in project-keyed local preferences per D6a; keep preferences outside project export/history/save acknowledgements, and start copies/imports at default view settings.
- [x] Implement keyboard-operable drawer switching/toggling, focus retention, accessible names/tooltips, numeric selection/property surfaces and renderer-unavailable/context-loss feedback. Preserve model data and allow manual Cutlist navigation when rendering fails.

### Outcome & Evidence Ledger

| Outcome / acceptance criterion | Check | Verification method | Result / evidence |
| --- | --- | --- | --- |
| Scene reflects domain and releases resources | Mandatory | Browser fixtures: rotated boards, linked instances, planar profiles; resize/unmount/remount/context loss/hidden tab; record draw activity and GPU resource counters before/after repeated cycles and bundle output | PARTIAL — final production build emits a lazy renderer chunk (972.46 kB minified / 260.39 kB gzip); canvas uses demand rendering, DPR ≤1.5, hidden-tab unmount and R3F-managed resource disposal. Isolated IAB showed a board and grid after the Phase 7 camera zoom correction. WebGL lifecycle/GPU counters/screenshots unverified. |
| Cameras never mutate model/history | Mandatory | Domain snapshot/history comparison before and after all camera gestures/presets; browser checks at multiple zoom/angles, including zoom bounds and frame selection | PARTIAL — camera state is local UI state and uses no domain command; presets/frame actions and bounded OrbitControls are implemented. Pointer/zoom behavior and model snapshot comparison unverified in a real browser. |
| Selection and frame remain accessible | Mandatory | RTL role/focus tests plus browser keyboard walkthrough: list/viewport/Entity Info synchronization, drawer open/switch/close, visible focus and no canvas-only selection dependency | PARTIAL — RTL covers tool availability, drawer selection, synchronized semantic properties and no design creation on entry; browser keyboard/focus walkthrough pending. |

### UI Validation

- **Viewports:** 1440×900, 1024×768, 390×844; both themes and reduced motion.
- **Interactions/states:** empty model, selected/hidden/locked entity, narrow drawers, camera presets, loading and WebGL failure.
- **Requested measurements:** Canvas CSS bounds equal its container; no page overflow or unreachable tool controls; capture scene resource/frame-time baseline for D7, with hardware/browser/fixture counts.
- **Preview limitations/fallbacks:** jsdom tests semantic UI only. Real WebGL browser screenshots and camera checks remain mandatory; a mocked canvas cannot satisfy them. Vite was started at `http://127.0.0.1:5173/`, confirmed running, and stopped before handoff. Browser navigation verified the missing-project recovery state only; no disposable browser fixture was available, and the existing recovery record was left untouched, so no Design scene screenshot, WebGL lifecycle, camera interaction, or GPU resource check was completed.

### Phase Record

- **Artifacts created/modified:** `src/routes/projects.$projectId.design.tsx`; `src/components/design/**`; `src/lib/planner/design/view-preferences.ts`; focused view/workspace tests; scoped `src/index.css`; `package.json` and lockfile. Standalone preview remains no-project/no-save per D6.
- **Decisions/deviations:** Installed `three@0.186.1`, `@types/three@0.186.0`, `@react-three/fiber@9.8.2`, and `@react-three/drei@10.7.9`. Official Fiber installation docs state Fiber 9 pairs with React 19; npm peer metadata confirms Fiber 9.8.2 allows React/ReactDOM `>=19 <19.4`, and Drei 10.7.9 requires React 19, Fiber 9 and Three ≥0.159. See [Fiber installation](https://r3f.docs.pmnd.rs/getting-started/installation) and [Drei controls](https://drei.docs.pmnd.rs/controls/introduction). Actual browser/gesture evidence remains a release gate.
- **Checks:** `npm run build` passed; focused view-preference/workspace tests passed (4/4); targeted Design↔Cutlist workflow passed (1/1); scoped ESLint passed. Full `npm run lint` and `npm run test` are not clean due Phase 3/previous issues recorded to the orchestrator: lint errors in `src/components/ui/button.tsx` and `src/lib/planner/design/commands.ts`; one model serialization fixture uses invalid `#abc` appearance. Latest full test totals: 20 passing files and 1 failing file (88 passed, 1 failed).
- **Next-phase context:** Code boundaries are ready for gesture work, but camera semantics and scene lifecycle need real-browser verification before relying on them as proven behavior.

## Phase 5: Modeling Tools and Component Editing Workflows

- **Status:** PARTIAL
- **Objective:** Deliver every initial tool with exact, undoable and keyboard-accessible editing.
- **Dependencies:** Phases 3-4; D5/D6 fully closed for enabled behaviors.
- **Exit Deliverable:** Complete modeling interactions and component management, ready for stock and sync integration.

### Tasks

- [x] Connect Select/Eraser/Line/Rectangle/Push-Pull/Move/Rotate/Scale/Paint/Orbit/Pan/Tape Measure to domain sessions. Implement live prompts, valid Enter commit, Escape cancel, exact numeric input over snapping, visible snap state and approved guide/measurement persistence. Some gestures remain constrained to XY or a single axis as documented in the result ledger.
- [x] Keep Tape Measure readings transient per D6b: no saved guides, no model dirty flag or history entry from measuring; clear the active reading on tool cancellation/exit. Enter may finish a displayed measurement without a model mutation.
- [x] Use ray/axis or ray/plane intersection for transforms; pointer capture and deterministic cancellation handle release outside canvas, blur, lost capture, tool switch and right-click during unfinished work. Camera and model gestures cannot compete. Current transform gestures have the documented XY/Z/uniform constraints.
- [x] Implement selection modifier precedence exactly as initial-features table, repeated hit cycling, face/edge alternatives, shared-definition edit entry/exit and explicit pivot selection. Locked entities cannot be edited. Browser/system conflict checks remain a Phase 7 release gate.
- [ ] Implement Components search/hierarchy/counts, Make Component, duplicate, Make Unique, rename, hide/show and removal; show shared-edit implications and eligibility explanations.
- [x] Scope shortcuts to workspace focus outside editable controls/dialogs: all tool keys, undo/redo variants, Ctrl/Cmd+Shift+D, G, Delete/Backspace, Shift+F10/Menu; resolve Alt platform conflicts and provide searchable shortcut help. Browser/system shortcut conflicts remain unverified.
- [x] Implement contextual menu for eligible object/face/edge/empty targets using Radix patterns: viewport-bounded placement, arrow navigation, focus return, Escape/outside close, unavailable commands hidden. Show Paste only if clipboard semantics are actually supported; preserve native menu outside viewport. No clipboard feature was added.
- [x] Apply A3 interruption behavior: cancel provisional work before right-click menu or tool switch; cancel on blur/lost capture; captured normal pointer-up outside canvas may commit the valid active gesture. Do not create a clipboard feature under this plan (A6).

### Outcome & Evidence Ledger

| Outcome / acceptance criterion | Check | Verification method | Result / evidence |
| --- | --- | --- | --- |
| Every tool supports precise and reversible edits | Mandatory | Browser interaction matrix covering all 12 tools: pointer and numeric/keyboard paths, exact dimensions, Enter/Escape, invalid input, undo/redo and pointer interruption; compare saved domain data after reopen | PARTIAL — Line/Rectangle/Measure use captured planar gestures mapped to canonical µm, optional 10 mm snapping, Alt temporary snap-off and exact typed Line length/Rectangle X width precedence. Move, Z-axis Rotate and uniform Scale support component instances and loose geometry, with explicit origin/geometry-center pivots and world/local axes; exact Move/Rotate/Scale entry overrides drag values and snapping. Alt-click resolves a nearest face/edge for sub-selection; Push/Pull requires a selected face except exact primitive thickness updates. Eraser and Paint use history-backed commands for eligible component and loose geometry targets. Line can append to one selected editable loose profile or definition, snaps to endpoints within 8 mm, closes a valid loop into a face, and rejects branches, crossings, invalid loops or unsupported multi-profile joins without changing the model. Each successful segment is one undoable domain command. No real browser/WebGL evidence. |
| Geometry scope and conversion are enforced | Mandatory | Fixtures for open/nonplanar/self-intersecting profiles, holes and through-geometry extrusion; assert explanatory rejection, last-valid-state retention and eligible conversion with explicit cut dimensions | PENDING |
| Shortcuts, modifiers and menus respect focus/browser behavior | Mandatory | RTL tests for editable/dialog guards and menu focus; browser matrix for modifier precedence, overlapping hit cycle, context menus at each viewport corner, system shortcut conflicts and viewport-only suppression | PARTIAL — Shortcuts now match the initial feature table, are workspace-scoped and guarded in editable controls/dialogs. Shift/Ctrl/Shift+Ctrl selection precedence, Alt-click face/edge selection and repeated-click overlap cycling are wired. Searchable help and the Radix context menu have RTL coverage; browser corner placement and system shortcut conflicts remain unverified. |
| Linked edits and uniqueness remain understandable | Mandatory | Browser workflow with multiple instances: edit definition, independent move/scale, Make Unique, undo/redo; inspect count/shared-edit status and pending sync state | PARTIAL — Component creation, duplication, eligible Make Unique, rename, hide/show, erase, remove/search and shared-instance counts use domain commands. Double-click enters shared-definition editing only from Select; linked-instance filtering and explicit edit status are shown. Full hierarchical UI and integrated multi-instance browser verification remain outstanding. |

### UI Validation

- **Viewports:** 1440×900, 1024×768, 390×844; both themes, browser zoom 200%, reduced motion.
- **Interactions/states:** each active tool; selection subtypes; invalid operation; shared edit; exact-entry error; keyboard-only creation/editing and camera paths.
- **Requested measurements:** No clipped prompts/menu actions; numeric results match canonical dimensions at multiple camera angles/zoom levels; one history entry per gesture; menus stay within viewport bounds.
- **Preview limitations/fallbacks:** Real pointer capture, raycasting and keyboard/browser conflicts require browser execution; document unsupported platform combinations and available alternatives. Record preview process lifecycle.

### Phase Record

- **Artifacts created/modified:** `src/components/design/DesignWorkspace.tsx`, gesture/session helpers and tests, `src/components/design/scene/DesignScene.tsx`, and the project Design route include typed domain-command/history integration, generation-checked local saves, tool selection/key bindings, board creation, searchable component list, component lifecycle actions, exact input, undo/redo, help, and contextual actions. Empty Design remains non-mutating. No clipboard behavior was added.
- **Decisions/deviations:** Phase remains PARTIAL for browser validation and scoped behavior. Planar Line/Rectangle/Measure and transform gestures use captured XY ray-plane interactions; snapping and exact-entry precedence follow the contract; cancellation clears provisional state. Selection modifier precedence, repeated-hit cycling, Alt face/edge sub-selection, shared-definition editing, and origin/center pivots are implemented. Transform gestures remain XY Move, single-axis Rotate and uniform Scale; the component hierarchy tree and fully keyboard-operable canvas editing are incomplete. Push/Pull is limited to selected-face simple extrusion or exact primitive thickness changes. Geometry fixtures and targeted browser geometry rejection coverage remain open. Shared-component actions and searchable focus-managed help/Radix menus are present. No clipboard capability was added.
- **Verification:** Focused Phase 5 workspace/gesture checks passed 46/46; the final full repository run passed 26 files / 121 tests, `npm run lint` passed after removing the unused non-component Button export, and `npm run build` passed with a 972.46 kB minified / 260.39 kB gzip lazy renderer chunk advisory. Phase 7's isolated in-app-browser smoke confirmed semantic selection/help/context menu and create/reload/review/apply, but is not the Windows Chrome/Edge interaction matrix. See [Phase 7 evidence](phase-7-evidence.md).
- **Next-phase context:** Phase 6/7 can rely on the implemented domain-command interfaces; browser pointer geometry, target browser conflicts and accessibility/performance release evidence remain open.

## Phase 6: Stock Fit and Reviewed Cutlist Integration

- **Status:** PARTIAL
- **Objective:** Turn eligible modeled components into reviewed, compatible planner inputs without overwriting manual work.
- **Dependencies:** Phases 2-5; D7 regional catalog choice/evidence and approved sheet/rough-size semantics.
- **Exit Deliverable:** End-to-end Design → review → apply → optimize → backup/reopen workflow.

### Tasks

- [x] Complete Materials/Entity Info/Display/Model Info drawer contents: selected material versus paint, local dimensions/grain, component/link state, project-owned stock defaults, validation/counts/save/sync status. Reuse project setting ownership rather than a second currency/units source.
- [x] Add verified regional nominal-label presets copied into project stock options with actual dimensions and optional manual prices; customization never mutates built-ins/other projects. Do not add on-hand counts in this UI.
- [x] Verify Canada/US catalog values and common lengths against authoritative regional sources per D7a; record sources with catalog data. Support both display units and custom stock without treating display-unit changes as region selection.
- [x] Share the approved preset catalog with existing Cutlist preset controls (A8); region is independent of display units. Preserve saved custom stock values rather than replacing them when the catalog changes.
- [x] Add linear crossSection eligibility in `linear.ts` candidate generation and independent verifier; allow a 90-degree turn about length. Reject known insufficient stock; expose missing actual dimensions as unverified, never verified fit. Apply the Phase 1 policy for optimization readiness and warnings. Preserve length-only legacy/manual behavior and sheet width meaning.
- [x] Verify `sheet.ts`, `combined.ts`, exports and Cutlist editor retain manual semantics, safe arithmetic and current ownership/purchase constraints. Invalidate disposable optimizer results when inputs change.
- [x] Enforce D4b/D4c: preserve requested finished cut dimensions, add no implicit allowances or sheet Part thickness field, and retain panel thickness in design. Show explicit unverified-thickness text in model-linked sheet preview and resulting cutlist fit feedback; tests must distinguish verified 2D placement from unverified thickness.
- [x] Connect Phase 3 projection to a preview showing additions/updates/removals, split/merge, missing material/fit issues, per-field keep-manual/apply-design choices and explicit detach/remove/keep effects. Unresolved manual Part deletion cannot trigger silent recreation.
- [x] Recompute/reject stale previews after any intervening editor edit or committed generation change. Apply reviewed Parts and links/snapshots atomically through repository, preserve unlinked manual rows, and retain dirty work/previous saved document on failure. Surface stale/conflict/retry states without presenting success.

### Outcome & Evidence Ledger

| Outcome / acceptance criterion | Check | Verification method | Result / evidence |
| --- | --- | --- | --- |
| Stock fit is correct without regressing manual planning | Mandatory | `npm run test`: cross-section normal/turned/exact/undersize/missing-dimension cases; independent verifier rejects infeasible plans; existing linear/sheet/combined/export and ownership tests remain valid | PASS — unit tests cover rotated fit, known undersize, missing stock dimensions and verifier unverified status. Legacy length-only behavior remains valid. Final full suite passes 26 files / 121 tests; real-browser confirmation remains in Phase 7. |
| Preview/apply preserves manual work and link lifecycle | Mandatory | RTL/workflow tests and browser flow for manual field edits, deletion, Make Unique, aggregation split/merge, field choices, detach, stale generation/edit sequence and quota failure; verify atomic Parts+links and reopened state | PARTIAL — review/apply RTL verifies a materialized panel's callback payload contains its Part and link together; separate tests reject a changed repository generation and preserve the review with failure feedback. The UI uses explicit per-row/per-conflict choices, sequence/generation guards and retry feedback; quota and full conflict lifecycle browser journeys remain for Phase 7. |
| Presets and drawer data have correct ownership | Mandatory | Review recorded regional source values; tests for preset copies and project isolation; browser confirms actual dimensions drive geometry/fit, paint does not change material and units do not rescale geometry | PARTIAL — source-backed CA/US catalog tests verify actual sizes, unit display conversion and independent project copies. Cutlist uses the shared catalog and keeps selected region independent from units. Browser verification of geometry/material/paint remains for Phase 7. |
| Portable workflow works end to end | Mandatory | Build model, review/apply, optimize mixed project, export backup/import as copy, restore into existing, reopen pending-review states; compare IDs, timestamps, dimensions and links against approved identity contract | PENDING |

### UI Validation

- **Viewports:** 1440×900, 1024×768, 390×844; both themes and keyboard-only review.
- **Interactions/states:** all five drawers; ready/model-only/unverified/invalid/sync-pending; conflicted/stale preview; apply failure and success.
- **Requested measurements:** Field labels and before/after values remain readable; no clipped apply/detach controls; status acknowledges only committed writes; fit states include text.
- **Preview limitations/fallbacks:** Browser validation complements pure projection tests; preserve before/after exported projects as evidence. Report process lifecycle.

### Phase Record

- **Artifacts created/modified:** Added `src/lib/planner/stock-presets.ts` and focused catalog tests; integrated the catalog into Cutlist; added cross-section candidate and verifier checks in `linear.ts`; completed Materials/Model Info controls and the Design-to-Cutlist review/apply surface in `DesignWorkspace.tsx`; routed apply saves through the IndexedDB project repository; displayed unverified sheet thickness feedback. Updated the existing Cutlist workflow assertion to match actual-size regional catalog naming.
- **Decisions/deviations:** The catalog records nominal names but stores actual dimensions: CA metric cross-sections use AWC/NRCan sources and US inch cross-sections use AWC plus US retail listings. Regional 8 ft / 12 ft lengths are stored from listed 96 / 144 in product dimensions (2,438.4 / 3,657.6 mm on metric display), not rounded 2,400 / 3,600 mm; each preset carries separate product length source metadata. Canadian length metadata references [Home Depot Canada 2x4x12 product](https://www.homedepot.ca/product/pro-direct-2-inch-x-4-inch-x-12-ft-spf-standard-dimensional-lumber/1001802967) and [2x4 length range](https://www.homedepot.ca/s/en/home/categories/building-materials/lumber-and-composites/dimensional-lumber-and-studs/2x4x12). US 8 ft / 12 ft listing URLs are also recorded per preset. UI display units only change labels and do not select a region. Preset copies start with zero owned quantity and optional user price; no new inventory fields were added. Missing linear stock cross-section data keeps the plan available as a length plan but marks optimization not ready/valid. A known undersize is rejected by both candidate packing and independent validation. Sheet thickness remains in design, with explicit unverified feedback. No browser process was started per orchestration sequencing; quota, browser and end-to-end export/reopen acceptance remain pending.
- **Next-phase context:** Release checks exercise complete workflows and resilience, not isolated mocked tools.

## Phase 7: Release Resilience, Accessibility and Performance Evidence

- **Status:** PARTIAL — repository checks and isolated-browser smoke evidence are recorded; mandatory browser matrix, resilience, performance and actual assistive-technology checks remain open.
- **Objective:** Close browser-only risks and document actual supported behavior and limits.
- **Dependencies:** Phases 1-6; D7 performance fixtures/budgets approved before claiming readiness.

### Tasks

- [ ] Run integrated adversarial journeys: invalid/oversize imports, unsupported future design/project versions, simultaneous tabs, old-tab writes after cutover, reload during migration/save, storage denial/quota, context loss, pending-link autosave, interrupted pointer operations and stale sync apply. An isolated-browser smoke journey covered create/reload, semantic selection, keyboard help/context menu and reviewed apply only; see [Phase 7 evidence](phase-7-evidence.md).
- [ ] Measure representative empty/small/large-at-supported-limit designs on the recorded target browser/hardware: load/save/projection latency, drag frame-time, hidden-tab work and GPU resources across repeated mount/edit/unmount. Compare approved budgets; optimize measured bottlenecks without changing correctness. No numeric performance budget or target hardware record is yet approved.
- [ ] Execute browser checks in Windows Chrome and Edge using mouse/keyboard per D7b; record versions/hardware and calibrated performance budgets from Phase 4 fixtures before release checks. Keep narrow-screen list/numeric workflows usable; full touch modeling and additional browser/platform guarantees are deferred, not implied by responsive layout.
- [ ] Complete keyboard and assistive-technology checks for tool help, lists, properties, drawers, menus, shared-edit announcements, validation, recovery and preview field decisions. Browser semantic inspection does not substitute for the actual screen-reader walkthrough.
- [x] Run all required repository checks: `npm run test`, `npm run lint`, `npm run build`. Record commands, runtime versions and results; inspect route generation and final diff for unintended changes. The first lint run caught an unused exported helper; after removing that export, final checks are recorded in [Phase 7 evidence](phase-7-evidence.md).
- [x] Update workspace documentation/roadmap and user-facing placeholder/help text to match delivered tools, topology limits, storage recovery, nominal/actual sizes, explicit cutlist sync and local-only status. Record evidence and unresolved limits in this folder without rewriting MVP history.

### Outcome & Evidence Ledger

| Outcome / acceptance criterion | Check | Verification method | Result / evidence |
| --- | --- | --- | --- |
| Repository checks pass for final scope | Mandatory | `npm run test`, `npm run lint`, `npm run build` using supported Node version; record output and final changed-file review | PASS — final commands and results are in [Phase 7 evidence](phase-7-evidence.md); lint passes after removing the unused non-component `buttonVariants` export. |
| Real-browser resilience and performance meet agreed envelope | Mandatory | Execute task matrices above in a WebGL/IndexedDB-capable browser; attach fixtures, screenshots, timings/resource counts, browser/hardware and failure/recovery outcomes | PARTIAL — the Codex in-app browser rendered WebGL and completed a limited isolated create/reload/select/review/apply smoke workflow. It exposed an initial camera `zoom: 85` defect, fixed at `zoom: 1`. Exact browser version/hardware and Chrome/Edge, multi-tab/storage-failure, context-loss, performance/resource and calibrated-budget evidence remain outstanding. |
| Accessible workflows are usable with actual assistive technology | Mandatory | **Manual Validation:** Owner or designated tester attests keyboard and screen-reader walkthrough for selecting/editing components, camera alternatives, tool transactions, recovery and conflict review; record environment and findings | PARTIAL — semantic selection, searchable keyboard help focus return, shortcut input guarding, and Shift+F10 menu/Escape focus return were inspected in the in-app browser. No screen reader or actual assistive technology was used; canvas-only operation alternatives and full keyboard/AT workflows remain unverified. |
| Product behavior and limitations are accurately documented | Mandatory | Trace final delivered behavior against initial-feature acceptance criteria and this plan; inspect docs/UI text for obsolete placeholder claims and unsupported cloud/geometry/fit assertions | PASS for documented implementation scope — the workspace guide, feature proposal, roadmap and dashboard/standalone preview copy now distinguish the project editor from the illustrative no-save preview and describe local-only behavior, reviewed cutlist changes, geometry/tool limits and verification gaps. Release validation remains incomplete. |

### UI Validation

- **Viewports:** 1440×900, 1024×768, 390×844; 200% zoom, both themes, reduced motion; target browser/platform matrix established in D7.
- **Interactions/states:** Full create/model/review/optimize/export/recover journey; keyboard/screen reader; renderer unavailable; concurrent save conflict.
- **Requested measurements:** Capture viewport/drawer/menu geometry and representative screenshots, focus order/return, textual announcements and agreed performance metrics.
- **Preview limitations/fallbacks:** jsdom/build success is not proof of WebGL, assistive-technology or cross-tab correctness. Missing mandatory evidence keeps verification PARTIAL/NOT_RUN as appropriate; failed mandatory checks mean FAILED. State any unrun check and its owner. Stop preview processes unless continuing operation was requested, and report their final status.

### Phase Record

- **Artifacts created/modified:** `docs/plans/3d-workspace/phase-7-evidence.md`; updated this plan ledger, the workspace guide, initial-features status, roadmap and dashboard/preview labels. Corrected the scene's initial camera zoom after isolated browser observation. Removed `buttonVariants` from `src/components/ui/button.tsx` exports after `npm run lint` found that its unused non-component export violated the configured fast-refresh rule; no repository consumer referenced it.
- **Decisions/deviations:** Phase remains PARTIAL. Browser evidence used only an isolated Codex in-app browser origin after the default local origin revealed pre-existing user project/recovery data; that data was left untouched. Both preview processes were stopped and ports 5173/5174 have no listeners. The test-created project remains in the isolated 5174 origin because the app exposes no restore/trash path for its permanent delete action; it is not in the normal 5173 origin. Target Chrome/Edge, browser/hardware metadata, approved performance budgets, multi-tab/storage failure/context-loss behavior, full portable backup/restore and actual assistive-technology validation remain release gates. See the evidence artifact for precise results and owner handoff.
