---
name: design-annotations
type: brainstorm
status: PLANNED
ready_for_planning: yes
created: 2026-11-11
plans:
  - docs/plans/design-annotations/design-annotations-plan.md
---
# Brainstorm Scope: Design annotations (Text notes + Dimensions)

## Goal
- Let people annotate a 3D design with text notes and dimension markers, so a model can be read as a diagram (notes such as "sand this side", measurements between corners).
- Affected users: anyone using the Design workspace to plan or communicate a build.
- Why it matters: today the only measurement is the temporary Tape Measure value; nothing persists on the model.

## In Scope
- **Tool rail:** a separator below the existing tools, then Text and Dimensions (Lasso is added there later).
- **Text tool:**
  - Click 1 snaps to a corner, edge, or face of a part (edge and face highlighted on hover) and sets the anchor.
  - A leader line follows the cursor; click 2 places the label and opens a text area.
  - Enter or clicking out commits; Shift+Enter adds a new line; Escape cancels (discards a new note, reverts an edit); an empty note is discarded.
  - After commit the text area background hides and the text is shown beside the line.
  - Tool shortcut keys and Delete do not fire while typing; an edit is one undo step.
- **Dimensions tool:**
  - Click 1 only on a vertex (start). A live length preview follows the cursor.
  - Click 2 only on a vertex (end).
  - The dimension is then dragged away from the model; click 3 sets its position.
  - The drag decides what is measured: roughly along an axis gives the X, Y, or Z length; perpendicular to the two points gives the straight-line distance.
  - Values use the project unit system and update live.
- **Anchoring:** annotations are attached to part geometry and follow the part when it is moved, rotated, scaled, or resized. If the exact corner, edge, or face can no longer be found (push-pull, Make Component, erased edge), the annotation sticks to the same spot on the part and keeps following it. It is removed only when the whole part is deleted; undo restores both.
- **Labels:** always face the camera, fixed on-screen size, always drawn on top of parts.
- **Who can touch annotations:**
  - Text tool: retype (double-click) and drag notes.
  - Dimensions tool: drag dimensions.
  - Select tool: click selects an annotation, Delete removes it.
  - Eraser: click removes.
  - Move, Rotate, and other tools: clicks pass through to the part behind.
- **Other:** undo/redo for every annotation change; a Display toggle to show or hide all annotations; annotations saved with the project.

## Out of Scope
- Lasso selection (separate, later feature).
- Angle, radius, and chained dimensions.
- Later: re-attaching an anchor to different geometry, text styling, snapping to edge midpoints and face centres, reusing the new snapping in Line and Tape Measure.
- Fences: cutlist projection and project thumbnails must not change (they ignore annotations today).

## Repository Context
- Confirmed: the tool rail is a flat `tools` array rendered in `src/components/design/DesignWorkspace.tsx:30-37,291`; no rail separator exists (`.design-control-separator` in `src/index.css:722` is sized for the horizontal bar).
- Confirmed: plain shortcut keys `d`, `n`, `a` are free.
- Confirmed: vertex snapping exists only inside the Rectangle tool (`VertexDrawing.tsx:65-77`, a non-exported closure, 12 px, supports an eligibility filter). No hover-snap exists for edges or faces. Line and Tape Measure snap to the grid only.
- Confirmed: a camera-facing HTML overlay already exists (drei `<Html>` in `DesignScene.tsx:661`); libraries are three, @react-three/fiber, @react-three/drei.
- Confirmed: vertex, edge, and face ids survive move, rotate, scale, `set-primitive-dimensions`, and `resizeRectangularProfile`.
- Confirmed: ids break or are ambiguous on Make Component (all ids regenerated, `commands.ts:120-128`), push-pull cap corners (synthetic `${vertexId}@${extrusionId}` ids change each push-pull, `rectangle-plane.ts:48`), erase of the anchored edge/face, and duplicate-instance (geometry shared, so an anchor needs the instance id).
- Confirmed: board corners for confirmed cut specs are synthetic `corner-x-y-z` ids, not real vertices (`rectangle-plane.ts:56`).
- Confirmed: no delete command cascades to annotations; `delete-instance` cleaning `groups` (`commands.ts:205`) is the precedent.
- Confirmed: design document validation is a strict allow-list (`schema.ts:30`); a new optional top-level field must be added there. No design-document migration exists; an optional field (like `groups?`) keeps old files loading.
- Confirmed: undo is whole-project snapshots (`history.ts:9-14`); a new command needs a union member and a switch case.
- Confirmed: cutlist projection and thumbnails enumerate only instances, definitions, and loose objects, so annotations are excluded by default.
- Likely: `DesignScene.tsx` and `DesignWorkspace.tsx` are very dense; new tools add to large files.
- Unknown: `append-profile-segment` effect on ids; whether any storage layer validates the design separately; serialization size limits.

## Acceptance Criteria
- Text and Dimensions appear below a separator in the tool rail, with shortcuts and tooltips.
- A note can be attached to a corner, edge, or face, typed, committed, and re-edited by double-click in the Text tool.
- A dimension can be placed with three clicks, shows the correct straight-line or axis length for the drag direction, and updates when the part is resized.
- Annotations follow their part through move, rotate, scale, resize, push-pull, and Make Component, and disappear with the part on delete.
- Labels stay readable and camera-facing while orbiting, panning, and zooming.
- Select can select and delete annotations; Eraser removes them; Move and Rotate click through.
- Every annotation change is undoable; the Display toggle hides and shows them; they survive save and reload; older projects still load.
- Cutlists and thumbnails are unchanged.

## Assumptions and Decisions
- Settled: everything under In Scope and Out of Scope.
- Assumption (not blocking): a dimension can span two different parts.
- Assumption (not blocking): hiding a part hides its annotations.
- Assumption (not blocking): in the Text tool, clicking an existing note edits it instead of starting a new one.
- Open (not blocking): whether duplicating a part copies its annotations.
- Open (not blocking): shortcut keys (suggested `d` for Dimensions, `n` for Text).
- Open (not blocking): a status hint when a note is double-clicked outside the Text tool.
- Open (not blocking): limits on note length and annotation count.

## Authorization and Handoff
- Limits: brainstorm only; no implementation, commits, or branch changes authorized.
- Ready for planning: yes

## Ledger
- Parked: Lasso tool (click-drag freeform selection of parts), to be explored after this ships.
- Suggestion not yet decided: split the dense scene and workspace files as part of this work, or leave as is.
- Risk noted: full edge and face hover-snapping is the largest piece of new work; a smaller "corners + any point on a part" version was offered and declined.
- Risk noted: a dimension whose corner was reshaped keeps measuring from its remembered spot without any visual flag (flagging was offered and declined).
