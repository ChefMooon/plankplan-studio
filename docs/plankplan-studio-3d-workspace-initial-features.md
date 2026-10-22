# PlankPlan Studio 3D Workspace: Initial Features

**Status:** Feature decisions closed; detailed Phase 2 implementation plan remains to be written.
**Last reviewed:** 2026-10-22
**Architecture context:** [3D Workspace Guide](plankplan-studio-3d-workspace-guide.md)

This document captures the agreed initial workspace tools and behaviors. The MVP Design area remains a shell; this proposal does not authorize Phase 2 implementation.

## Architecture decisions recorded

| ID | Decision | Consequence |
|---|---|---|
| d16-design-storage | Store an optional independently versioned design document inside Project JSON; bump project schema to v2 and migrate v1 without changing existing cutlist data. | Project backup/import stays atomic; migration and v1 round-trip tests are required. |
| d17-freeform-kernel | Initial free-form geometry is planar edges/faces and simple Push/Pull solids. No booleans, holes, or general self-intersecting geometry. | Unsupported operations fail without changing the last valid model. Store editable profiles and derive meshes. |
| d18-cross-section-contract | Add optional width/thickness constraints to linear Parts; generated board parts provide both and are validated against actual stock dimensions. | Existing manual parts remain compatible; model-linked board fit can be validated. |
| d19-cutlist-link-location | Store component-to-Part links and last-applied projection snapshots in the embedded design document, keyed to generated Part IDs. | Owner selected this to keep manual Part records free of model metadata; avoids putting provenance on Parts or deferring sync semantics. |

## Goals and boundaries

- Model woodworking projects using board/panel components and free-form geometry.
- Provide direct manipulation, exact dimension entry, familiar mouse controls, keyboard shortcuts, and accessible alternatives.
- Reuse linked components; duplicate instances and make one unique when edits should diverge.
- Derive cutlist data only from eligible geometry and apply model changes through an explicit preview.
- Keep manual cutlist projects useful without any 3D model.
- Do not add physical inventory counts or silently overwrite manual part data.

## Workspace layout

- **Left toolbar:** Select, Eraser, Line, Rectangle, Push/Pull, Move, Rotate, Scale, Paint, Orbit, Pan, Tape Measure.
- **Center viewport:** bounded 3D canvas, tool gestures, selection, axis/grid helpers, and contextual prompts/measurements.
- **Right info toolbar:** Entity Info, Components, Materials, Display (Settings), Model Info. Clicking opens a drawer; clicking another switches drawers; clicking the active item closes it.
- **Status area:** active tool, selected object, exact dimensions, validation state, persistence status, and cutlist synchronization state.

Drawers must be keyboard reachable, manage focus predictably, and not make the viewport unusable at narrow sizes. Icon buttons have accessible names/tooltips and visible focus.

## Left toolbar and default shortcuts

| Tool | Behavior | Shortcut |
|---|---|---|
| Select | Select whole component/object by default; Alt-click or repeated clicks reach faces/edges. | `Space` |
| Eraser | Remove selected geometry/instance; removal is undoable. Distinguish deleting an instance from deleting a definition. | `E` |
| Line | Draw planar edges; edges can bound planar faces. Snap to endpoints, midpoints, axes, and grid when enabled. | `L` |
| Rectangle | Draw a planar rectangular face, with exact width/height entry. | `R` |
| Push/Pull | Extrude or recess a planar face into a solid, with live and exact distance. Geometry not mapped to board/panel dimensions is not cutlist-ready. | `P` |
| Move | Move along axis/plane/free plane; show displacement and accept exact values. | `M` |
| Rotate | Rotate around selected/inferred pivot and constrained axis; show/accept exact angle. | `Q` |
| Scale | Per-axis or uniform physical scaling. Keep opposite face/edge fixed by default; allow pivot selection. Do not block on stock fit during the gesture. | `S` |
| Paint | Change viewport appearance only. Stock/material choice is separate in Materials or Entity Info. | `B` |
| Orbit | Orbit camera around target; never moves geometry. | `O` |
| Pan | Translate camera; never moves geometry. | `H` |
| Tape Measure | Measure between points; optional guides. Persistent measurement behavior remains for Phase 2 detail. | `T` |

Tools show active state and contextual prompts. `Escape` cancels the current transaction; `Enter` commits only a valid active operation. Exact typed dimensions take precedence over snapping. Model operations create one undo command per completed gesture; camera movement/drawer changes do not.

### Shortcut actions

| Action | Shortcut | Behavior |
|---|---|---|
| Undo | `Ctrl+Z` / `Cmd+Z` | Undo model commands. |
| Redo | `Ctrl+Shift+Z` / `Cmd+Shift+Z`; support `Ctrl+Y` / `Cmd+Y` where expected | Redo model commands. |
| Duplicate selected component/object | `Ctrl+Shift+D` / `Cmd+Shift+D` | Avoid plain `Ctrl+D` (browser bookmark). |
| Make Component | `G` | Available only for eligible selection. |
| Delete selection | `Delete` / `Backspace` | Ignore while typing in editable controls; undo where possible. |
| Open context menu | `Shift+F10` / Menu key | Same contextual menu as right-click. |
| Toggle snap temporarily | `Alt` while dragging | Pending platform conflict check; persistent snap state remains visible. |

Single-key shortcuts work only when the workspace has focus and focus is not in a text input, select, editable control, or dialog. Do not override browser/system shortcuts. Show shortcuts in tooltips and a searchable help dialog. Check conflicts before release; provide pointer and keyboard paths independently.

## Mouse controls and selection modifiers

| Input | Behavior |
|---|---|
| Left click | Use active tool; in Select mode, select the whole object/component by default. |
| Alt + left click | Select a face/edge. |
| Repeated left clicks | Cycle overlapping geometry beneath the pointer. |
| Shift + left click | Add an unselected entity; subtract it if already selected. |
| Ctrl + left click | Add the clicked entity to selection. |
| Shift + Ctrl + left click | Subtract the clicked entity. This combination takes precedence over Shift alone. |
| Middle-button drag | Orbit the camera around the current target. |
| Shift + middle-button drag | Pan the camera. |
| Scroll wheel | Zoom toward/away from the pointer location, with bounded distance. |
| Right click | Open contextual workspace menu; suppress native browser menu only inside the viewport. |
| Double click component | Enter shared definition edit mode; show that edits affect all instances and provide a clear exit. |

These gestures are scoped to the 3D workspace. Outside it, preserve browser behavior. Provide keyboard alternatives for mouse-only operations, including face/edge selection and camera navigation.

## Workspace context menu

The menu depends on the hit target and current selection:

- **Object/component:** Select, Edit Component, Make Component (when eligible), Make Unique (for a shared instance), Duplicate, Rename, Hide/Show, Erase.
- **Face/edge:** Select and applicable face/edge operation; show conversion commands only for eligible geometry.
- **Empty viewport:** Paste when available, Select All, Frame Model, Reset View, Display settings.
- Hide unavailable commands. Keep the menu within viewport bounds, focus it on open, support arrow navigation plus Enter/Space, close on Escape/outside click, and return focus on close.
- Provide menu actions through other controls where applicable; right-click is not the only access path. Destructive actions require recovery through undo or clear confirmation.

## Right-side drawers

| Drawer | Initial contents |
|---|---|
| Entity Info | Selection type/name; dimensions and transform; visual appearance; stock/material choice; visibility/lock; component definition/instance state; linked cutlist row and sync status. |
| Components | Searchable hierarchy/list of definitions and instances; selection, visibility, expand/collapse, instance count; Make Component, duplicate, Make Unique, rename, remove. |
| Materials | Project materials, appearance swatches, dimensional-lumber presets, and editable project stock defaults. Keep appearance separate from optimizer stock choice. |
| Display (Settings) | Grid/axes, snap enablement/increment, helpers, camera projection, measurement display, viewport-only settings. Persistence scope to be specified. |
| Model Info | Project/model name and unit display; dimensions/counts; validation warnings; save and cutlist-sync status. Avoid duplicate ownership of project settings. |

### Project stock options

- Offer common dimensional-lumber presets for a user to add to project stock options. Show nominal labels (e.g. `2×4`) with actual dimensions used for geometry and fit.
- Project defaults are editable stock options containing a material, actual dimensions, and optional manually entered price.
- These are reusable stock choices with no on-hand counts. Inventory tracking stays out of scope.
- Customizing a preset in one project does not mutate the built-in preset or another project.
- Verify the exact regional preset catalog, nominal/actual dimensions, and available lengths before shipping.

## Components and instances

- **Make Component** converts eligible selected geometry into a named reusable definition and replaces it with an instance. Ineligible selections remain unchanged with an explanation.
- **Duplicate** creates a new instance linked to the same definition, with independent transform and predictable placement; show its linked state.
- **Edit definition** changes shared geometry for all linked instances; transforms remain independent. Show instance count and the shared-edit state.
- **Make Unique** clones the definition and links only the selected instance to the new definition. Preserve its geometry, supported definition properties, and transform. Undo/redo restores prior links.
- Double-click enters definition editing. Camera changes are never mistaken for model edit mode.
- Component instances aggregate into a cutlist quantity only if they share a definition, matching effective cut dimensions, and the same selected `materialId`; otherwise use separate rows. Alternative material-choice sets are outside the initial model-to-cutlist contract.
- Definition edits, Make Unique, instance/definition deletion, and row splits/merges appear in a sync preview. Never silently delete or duplicate manually edited parts.

## Cutlist synchronization and fit

- Free-form geometry without explicit cut dimensions is model-only. Convert it to a board/panel component or enter explicit cut dimensions before synchronization.
- Model position and world-space bounding boxes do not determine cut length; use local length/width/thickness and grain axis.
- Preview additions, updates, removals, aggregation splits/merges, missing material choices, and fit warnings before applying.
- Preserve unlinked manual parts. Track the previous generated projection to detect edits to linked fields. Show conflicts and require an explicit keep-manual/apply-design choice per conflicting field.
- Model-linked linear parts carry width/thickness cross-section constraints. Legacy/manual linear parts may omit these and remain length-only. Generated parts are checked against actual stock dimensions; missing stock dimensions produce an unverified-fit warning. Scale updates projected dimensions and appears in the reviewed cutlist preview.
- Component deletion never silently deletes a linked part. Preview detach/remove/keep effects and preserve manually edited data.

## Geometry scope

Initial geometry includes both board/panel primitives and free-form planar edges/faces plus simple Push/Pull solids. Booleans, holes, and self-intersecting geometry are out of scope. Supported-operation and rejection rules belong in the Phase 2 implementation plan; do not assume Three.js alone provides general constructive solid geometry.

Implementation details to define: planar closure tolerance, rejected topology cases, Push/Pull through existing geometry, Eraser granularity, nested components, face/edge conversion UX, exact context menu commands, shortcut conflicts, pointer release outside the canvas, right-click during unfinished operations, measurement persistence, and display preference persistence.

## Acceptance criteria

- Every enabled tool has an active state, accessible name, clear commit/cancel behavior, shortcut, and undo contract.
- Mouse/keyboard selection modifiers behave consistently; shortcuts never fire during text editing.
- Camera gestures do not edit geometry, and camera state stays outside model undo history.
- Context menu is contextual, bounded, keyboard operable, and only suppresses the native menu inside the workspace.
- Shared definition edits update all linked instance geometry without changing independent transforms; Make Unique isolates later edits and is undoable.
- Project stock presets/defaults use actual dimensions for geometry and fit; no quantity tracking is introduced.
- Cutlist preview identifies changes and conflicts; applying it cannot silently overwrite manual changes.
- Model-linked linear Parts contain optional width/thickness constraints; generated parts provide them and fit is validated against actual stock dimensions. Missing stock dimensions produce an unverified-fit warning.
- Project schema-v1 data migrates to v2 without losing or changing cutlist fields; an absent design remains absent, while v2 export/import preserves the optional versioned design and its component-to-Part links and projection snapshots.
- Unsupported geometry operations leave the last valid design intact and explain the unsupported operation.
- A cutlist projection preview reports additions, updates, removals, aggregation changes, and field-level conflicts; applying a preview cannot overwrite unresolved manual edits.

## Related documents

- [3D Workspace Guide](plankplan-studio-3d-workspace-guide.md) records architectural constraints, owner decisions, and Phase 2 sequencing.
- [Product Specification](plankplan-studio-product-spec.md) and [Roadmap](plankplan-studio-roadmap.md) define the Phase 2 product boundary.
