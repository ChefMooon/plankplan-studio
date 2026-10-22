# PlankPlan Studio 3D Workspace Guide

**Status:** Phase 2 owner decisions recorded; detailed implementation plan remains to be written.
**Last reviewed:** 2026-10-22
**Rendering direction:** Three.js; React Three Fiber/Drei are candidates, not yet an approved dependency decision.

This guide reviews the CM Modding Tools collision-box workspace and adapts the useful patterns to PlankPlan Studio. It complements the [initial feature proposal](plankplan-studio-3d-workspace-initial-features.md); it is not an implementation plan. The Phase 2 work must preserve the independent manual cutlist workflow.

## Product outcome and boundaries

Let a woodworker model a project, inspect its assembly, and intentionally derive or update useful cutlist parts. Dimensions, materials, fit warnings, and the effect of syncing the model into cutlist data must be reviewable.

- The 3D model is optional. Manual parts, materials, optimization, and shop outputs remain usable without it.
- Model edits never silently overwrite user-maintained cutlist data. Show a change preview and require explicit application.
- Free-form geometry may exist in the model without being cutlist-ready. A component must be converted to a supported board/panel representation or given explicit cut dimensions before it enters optimizer input.
- The MVP includes only the navigable Design shell. Rendering and editing are Phase 2.
- The decisions below close the storage, geometry-scope, cross-section, and component-link placement gates. Remaining interaction details are handed to the separate Phase 2 implementation plan.

## Reference review: CM Modding Tools

Reviewed the Collision Box Builder's `CollisionViewport`, `useCollisionBuilderState`, `CollisionShape`, shape list and property panel, and import/export utilities.

### Patterns to reuse

- Separate the canvas from workflow state, property editing, object lists, project controls, and persistence.
- Pair direct manipulation with exact numeric controls. The canvas is useful for placement; numeric dimensions and keyboard nudges are needed for precision and accessibility.
- Keep selection, visibility, camera presets, orientation aids, and object properties explicit.
- Derive scene objects from serializable domain data. Do not make Three.js meshes the only stored model.
- Keep route UI, scene rendering, commands, persistence, and cutlist projection in focused modules.

### Patterns to improve

- The reference maps screen-pixel deltas through a fixed divisor for object movement. Use ray/axis or ray/plane intersection so world movement is independent of zoom and camera angle.
- Avoid mixing min/max box bounds, pivots, Euler angles, and view-direction coordinate remapping. Define component-local and project/world coordinate frames and convert at explicit boundaries.
- Collision boxes are not woodworking parts. Preserve length, width, thickness, local grain direction, material choice, and cutlist identity as explicit domain concepts.
- A canvas alone is not an accessible editor. Provide semantic list/property operations, keyboard paths, focus behavior, and text status.
- Record one undoable model command per completed gesture, not one per pointer frame. Camera movement and panel state are not model history.
- On corrupt or unsupported project data, preserve the last valid project and offer recovery. Do not silently replace it with a blank model.

The reference is local browser storage and does not determine PlankPlan's persistence architecture.

## Workspace structure

```text
Project header and Design / Cutlist navigation
┌─────────────────┬───────────────────────────────┬──────────────────┐
│ Left tool rail  │ 3D viewport                   │ Right info rail  │
│                 │                               │ + active drawer  │
│                 │ selection / modeling / camera │                  │
├─────────────────┴───────────────────────────────┴──────────────────┤
│ Tool prompt, dimensions, validation, save and cutlist-sync status    │
└────────────────────────────────────────────────────────────────────┘
```

- Keep the viewport bounded and responsive. Panels may collapse on smaller screens while remaining keyboard reachable.
- Keep selection synchronized between the viewport, Components list, and Entity Info.
- Offer perspective and standard orthographic views, axis indicator, frame-selection/model, and reset view.
- Convey selected, hovered, hidden, locked, invalid, and unsynchronized states without color alone.
- Respect reduced motion; resize to the container; cap device pixel ratio and reduce rendering when hidden.

## Domain and scene responsibilities

### Source of truth

Model data must be serializable and renderer-independent. Three.js meshes/materials/controls are derived visualization. Domain dimensions use integer micrometers, as in the optimizer; money remains integer cents. Convert to render units using a fixed documented scale and round explicitly when values return to domain state.

The existing model is `Project` schema version 1. A `Part` stores length and optional width, but no required thickness, local grain axis, or design-link identity. `StockOption` can hold width/thickness for pricing, but the optimizer does not use them to validate that a board cross-section can produce a part. Any Phase 2 design schema or cutlist extension must state compatibility and migration behavior.

The [data and persistence contract](plankplan-studio-data-persistence-contract.md) defines the authoritative target v2 cutlist fields, validation, identity, migration/recovery, and repository boundary. It is a target, not current behavior. Phase 2 implements local safeguards; cloud implementation remains Phase 3.

### Candidate responsibility boundaries

- **Design domain:** versioned design data, component/instance identities, dimensions, transforms, constraints, validation, commands, and projection into parts.
- **Workspace UI:** active tool, selection mode, shortcuts, drawers, status, and accessible numeric controls.
- **Scene view:** derives meshes and helpers, raycasts, displays hover/selection, and submits intents. It does not own persistent project truth.
- **Persistence/import/export:** validates and migrates project/design data and preserves it through backup/restore.
- **Cutlist bridge:** records source-to-part relationships, previews changes, protects manual edits, and applies reviewed updates.

**Decision:** Embed an optional, independently versioned design document in each project JSON. Bump the project schema from v1 to v2. Migrate v1 projects that meet the target contract with valid fields preserved and no design document; retain other legacy payloads in exact-byte recovery for explicit repair under the contract compatibility table; export v2 projects atomically with their design data. Import must migrate supported v1 payloads, validate both project and design data, and leave current data untouched on failure.

## Coordinates and part dimensions

- Selected world axes: **X = width, Y = height, Z = depth**. Define a named front direction and handedness in the implementation plan.
- Each board/panel also needs a stable local frame with length, width, thickness, and grain direction. Do not derive cut dimensions from a rotated world-space bounding box.
- Component dimensions are distinct from assembly transform. Moving a part does not change cut length; rotating it changes orientation, not physical dimensions.
- Scale changes physical dimensions, including per-axis scaling. The default anchor is the opposite face/edge; let the user choose another pivot. Stock-fit validation is downstream, not a restriction on the Scale gesture.
- Show nominal dimensional-lumber labels (e.g. `2×4`) while storing and using verified actual dimensions for model size and fit.
- Define finished-size vs rough-stock semantics and where trim, kerf, joinery allowances, and surfacing apply. Never add them implicitly.
- Preserve Imperial/Metric display and input while storing canonical integer dimensions.

## Component definitions and instances

- A component definition holds shared geometry and definition-level properties. An instance has a stable ID and independent transform.
- Duplicating a component creates another linked instance with an independent position/orientation.
- Editing a shared definition changes its geometry for every instance; instance transforms remain independent. Show instance count and make shared-edit mode visible.
- Make Unique clones the definition and links only the selected instance to the clone; its geometry, supported definition properties, and current transform remain intact.
- Double-clicking an instance enters definition edit mode. Exit is explicit and returns to assembly selection.
- For cutlist projection, matching instances aggregate only when they share a definition and have matching effective cut dimensions and the same selected `materialId`. Otherwise they produce separate part rows. Supporting multiple acceptable material choices per part remains outside the Phase 2 starting contract.
- If an instance/definition is deleted or made unique, preview the effect on generated cutlist rows; do not silently delete or duplicate manually edited parts.

### Stable cutlist link

Store stable source references and the last-applied projection snapshot in the embedded design document, keyed to generated Part IDs. Each link records its component definition ID and contributing instance IDs. Instance IDs determine quantity; the definition ID identifies shared geometry. Make Unique creates a new definition ID and splits that instance into a distinct generated part row. Manual Part records remain free of model metadata and unchanged unless the user explicitly applies a reviewed projection.

## Model-to-cutlist contract

1. A cutlist-ready component has a stable mapping to a part or a deterministic aggregation group. Free-form shapes without explicit cut dimensions remain model-only.
2. Projection derives local cut dimensions and quantity, not dimensions from world placement.
3. Material choices come from project material/stock options. Viewport paint is appearance only and never changes optimizer stock selection.
4. Preview additions, updates, removals, row split/merge effects, and warnings before applying changes.
5. Preserve unlinked manual parts. Track the last generated projection so manual changes to linked fields can be detected and reported as conflicts.
6. Resolve conflicts field-by-field or offer preserve/manual vs apply/design choices. Never silently overwrite either side. Removed instances and Make Unique operations must show how counts and row links change.
7. **Approved cross-section contract:** add optional `crossSection: { width, thickness }` constraints to linear parts. Legacy/manual linear parts may omit these and retain length-only behavior; every model-generated board part supplies both dimensions. Validate required width/thickness against selected stock's actual width/thickness, allowing the board to turn 90 degrees across its length axis. If stock cross-section data is missing, report fit as unverified; do not claim verified compatibility. Sheet-part width keeps its existing meaning.

### Stock options

- Project stock defaults are reusable options with a material, actual dimensions, and optional user-entered price. They have no on-hand quantity in this feature.
- Dimensional lumber presets carry a familiar nominal label plus verified actual dimensions. Presets are copied into project scope when customized; editing one project does not mutate the preset or another project.
- The initial regional preset catalog and allowed lengths require a verified list before release. This document does not invent nominal-to-actual values.

## Editing and interaction safeguards

- **Approved geometry scope:** board/panel primitives and simple free-form planar edges/faces plus Push/Pull solids. Exclude boolean union/subtract, holes, and general self-intersecting geometry from the first release. Reject unsupported operations without changing the last valid model. Store editable profiles/extrusion parameters as domain data and derive Three.js geometry. Do not add a separate CSG/solid kernel unless a concrete supported operation proves it necessary.
- Whole object/component is selected by default. Alt-click selects a face/edge; repeated clicks cycle overlapping geometry. Provide a keyboard-accessible equivalent.
- Selection modifiers: Shift-click adds an unselected entity or subtracts a selected one; Ctrl-click adds; Shift+Ctrl-click subtracts.
- Mouse: middle drag orbits; Shift+middle drag pans; wheel zooms; right-click opens a workspace context menu; double-click enters component edit mode.
- Context menu is target-aware, bounded to the viewport, keyboard navigable (`Shift+F10`/Menu key), and does not invoke the browser menu within the viewport. Offer applicable actions only; Escape closes it and restores focus.
- Numeric fields are canonical for exact values. Snapping never changes an explicitly typed value. Invalid edits preserve last valid data and explain the constraint.
- `Escape` cancels the current tool transaction first; `Enter` commits only when a valid operation/value is active. Shortcuts never fire in text-entry controls or override browser/system commands.
- One coherent edit gesture is one undoable domain command. Camera, drawers, and display preferences do not enter model undo history.
- Erase/remove actions are undoable; destructive actions without recovery require confirmation.

## Performance, resilience, and accessibility

- Share/instance reusable geometry as appropriate; dispose GPU resources on design changes/unmount. Do not rebuild the whole scene for unrelated panel state.
- Set renderer size from its container and cap pixel ratio. Measure representative models before adding custom optimizations.
- Validate IDs, finite dimensions/transforms, supported geometry and versions at import boundaries. A failed migration/import leaves the current project untouched.
- Give toolbar icons accessible names/tooltips, visible focus, semantic controls, keyboard selection/nudging, textual selected dimensions, and non-color-only warnings.
- Ensure context menus/drawers manage focus and keyboard navigation; maintain a non-canvas path for component selection and dimension edits.
- Avoid trapping pointer gestures or blocking browser zoom outside the viewport. Test mouse and keyboard alternatives with actual assistive technology before release.

## Phase 2 planning sequence

1. Define exact independently versioned design records and invariants, including stable local frames, topology/size limits, component references, projection links, and snapshots. Implement the data/persistence contract locally: per-project asynchronous repository with concurrency tokens, recoverable legacy storage conversion, and v1-to-v2 migration. Preserve valid cutlist fields; retain legacy data outside target constraints for explicit repair. Add round-trip/recovery tests; no cloud services.
2. Define local component frames, cross-section constraints, stable design/instance/part links, and conflict-resolution rules. Preserve length-only behavior for legacy manual parts.
3. Implement validated domain commands and model-to-parts projection independently of the renderer.
4. Build a read-only scene from domain fixtures; prove camera, resize, component selection, and performance behavior.
5. Add the approved modeling tools, component instances, material/stock UI, keyboard/mouse interactions, undo/redo, and accessible alternatives.
6. Add reviewed cutlist preview/apply, import/export migration/recovery, adversarial tests, and accessibility/performance evidence.

## Decision record

| ID | Selected decision | Alternatives considered and rationale | Evidence / confidence |
|---|---|---|---|
| d16-design-storage | Embed optional versioned design data in Project JSON; bump schema to v2 and migrate v1 without changing existing fields. | Separate project-scoped storage was considered; embedding keeps project identity, backup, and import/export atomic with fewer synchronization failure modes. | Owner answer, 2026-10-22; current projects serialize whole projects with `schemaVersion`; high confidence. |
| d17-freeform-kernel | Support planar edges/faces and simple Push/Pull solids; exclude booleans/holes initially; persist editable profiles and derive meshes. | Full CSG editing adds topology behavior, dependency, validation, and effort beyond the requested initial tools. | Owner answer, 2026-10-22; requested tools require planar creation and extrusion but not booleans; high confidence. |
| d18-cross-section-contract | Add optional width/thickness constraints to linear parts; require both for generated boards and validate them against actual stock. | Warning-only and blocking-sync alternatives were considered. Additive constraints preserve existing manual parts while enabling verified fit for model-linked parts. | Owner answer, 2026-10-22; current `Part` is length-only while `StockOption` already stores actual width/thickness for board-foot stock; high confidence. |
| d19-cutlist-link-location | Store component-to-Part links and last-applied projection snapshots in the embedded design document, keyed to generated Part IDs. | Storing metadata on Parts was considered but would mix model provenance into manual records; deferring would leave sync and migration shape unresolved. | Owner answer, 2026-10-22; the schema already embeds design data; high confidence. |
| d20-phase2-material-identity | Use the existing single selected `materialId` as the material part of the aggregation key; do not include alternative material-choice sets in the initial model projection. | A multi-choice set could support substitution but changes optimizer/material semantics and is already deferred beyond MVP; the current `Part` model has one `materialId`. | Automatically resolved; current `src/lib/planner/model.ts` contract and product-spec deferral of alternatives; high confidence. |

Active projection links resolve within the same project and reject duplicate live-instance membership and dangling current references. Historical last-applied provenance may reference deleted/replaced sources under the [contract's design-link lifecycle](plankplan-studio-data-persistence-contract.md#design-projection-integrity-phase-2). Source deletion, Make Unique, and manual Part deletion create saveable pending-review states, not invalid active dangling links. Detach preserves a manual Part; reviewed apply updates Parts and links atomically. Snapshots contain only last-applied projected fields, not entire duplicate designs. Applying a projection checks both the current committed local generation and editor edit sequence; stale previews must be regenerated. The full UTF-8 project fits the contract byte budget.

## Deferred implementation details

The separate Phase 2 plan should settle exact regional preset values, conversion UI for free-form geometry, topology error behavior, tool-specific snapping, measurement/display persistence, nested component behavior, context-menu commands, and detailed field-conflict UI. Specify these before their implementation tasks begin.

## Sources reviewed

- CM Modding Tools Collision Box Builder components and model: `CollisionViewport.tsx`, `ShapesListSidebar.tsx`, `ShapePropertiesPanel.tsx`, `useCollisionBuilderState.ts`, `types.ts`, and `persistence.ts` (reviewed 2026-10-22).
- PlankPlan Studio: [Product Specification](plankplan-studio-product-spec.md), [MVP](plankplan-studio-mvp.md), [MVP UI/UX Specification](plankplan-studio-mvp-ui-ux-spec.md), [Roadmap](plankplan-studio-roadmap.md), and `src/lib/planner/model.ts`.
