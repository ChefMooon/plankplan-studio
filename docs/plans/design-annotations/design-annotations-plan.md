---
title: "Design Annotations (Text + Dimensions) - Implementation Plan"
plan_profile: FULL
status: COMPLETED
verification_status: PASSED
current_phase: 9 / 9
created: 2026-11-11
last_updated: 2026-11-11
---

# Overall Plan Completion Status

* **Total Phases Completed:** 9 / 9
* **Summary of Outcome:** Phases 1–9 are complete; automated mandatory checks passed and the user attested completion of the remaining browser validation on 2026-11-11.

# Specification & Overview

### 1. Scope & Objective
- **Goal:** Annotate the 3D design (Design workspace) with Text notes and Dimension markers that persist with the project.
- **In-Scope:**
  - Tool rail: a horizontal separator below the existing tools, then Text (`n`) and Dimensions (`d`), with "Label · KEY" tooltips from the existing `tools` array.
  - Text tool: click 1 snaps to a vertex, edge or face as the anchor, with hover highlight. A leader line follows the cursor and click 2 places the label and opens a textarea. Enter or click-out commits, Shift+Enter inserts a newline, Escape cancels, and an empty note is discarded. In the Text tool, a click or double-click on an existing note edits it and a drag moves it.
  - Dimensions tool: click 1 and click 2 on vertices only, with a live length preview. Click 3 sets the offset position. The drag direction picks the measure (axis X, Y or Z length, or direct straight-line distance). The value uses the project `unitSystem` and updates live. The Dimensions tool drags existing dimensions.
  - Anchoring to part geometry with a local-space fallback point. Annotations follow move, rotate, scale, resize, set-primitive-dimensions, push-pull and Make Component. They are removed only when the whole part is deleted, and undo restores them.
  - Labels face the camera, have a fixed on-screen size and are drawn on top of parts. Hiding a part hides its annotations.
  - Select tool: click selects an annotation and Delete/Backspace removes it. Eraser: click removes. Move, Rotate and other tools: clicks pass through to the part behind.
  - Every annotation change is one undoable command. A Display drawer toggle shows or hides all annotations (persisted like other view prefs). Annotations are saved with the project and old projects (no `annotations` field) still load.
- **Out-of-Scope:** Lasso tool. Angle, radius and chained dimensions. Re-attaching anchors to other geometry. Text styling. Snapping to edge midpoints or face centres. Reusing the new snapping in Line or Tape Measure tools. Any change to cutlist projection or project thumbnail output. Copying annotations on duplicate-instance (decided). Splitting or refactoring `DesignScene.tsx` or `DesignWorkspace.tsx`.

**Assumptions (recorded):**
- Note text is at most 500 characters.
- A design holds at most 500 annotations.
- Annotation ids are non-empty strings of at most 128 characters, unique within the design.
- All annotation offsets and local points are integers in micrometers within +-1_000_000_000 (`DESIGN_LIMIT_UM`).
- The whole project JSON stays capped by `MAX_PROJECT_BYTES = 1_000_000` (`src/lib/planner/serialization.ts`). Nothing in this plan raises it.
- A dimension may span two different parts.
- Hiding a part (`hidden: true`) hides every annotation that references it.

### 2. Technical Constraints & Architecture

**Repository rules (AGENTS.md).** TypeScript/TSX, 2-space indent, semicolons, `@/` alias for `src` imports, PascalCase components, camelCase functions. Tests are `*.test.ts(x)` under `src/` but NOT under `src/routes/`, using Vitest + jsdom + React Testing Library + user-event. Do not edit `src/routeTree.gen.ts`. There is no backend. Commands: `npm run test` (vitest run), `npm run lint` (eslint .), `npm run build` (tsc -b && vite build). Run a single test file with `npm run test -- <path>`.

**Code style.** The existing design files are dense one-liners. New code goes in NEW files in normal readable style. Edits to `DesignScene.tsx`, `DesignWorkspace.tsx`, `DesignViewport.tsx`, `commands.ts` and `schema.ts` are minimal wiring only. Do not reformat or reflow existing lines.

**Verified architecture facts**
- `src/lib/planner/design/schema.ts`: `DesignDocumentV1` is on line 17. The top-level key allow-list is the `keys(value,[...'groups'],...)` call. The `groups` validation block is the model for `annotations`. `definitionById` is defined after that block. Helper names inside the file (`record`, `keys`, `integer`) are not exported.
- `src/lib/planner/design/commands.ts`:
  - `applyDesignCommand` clones the project, runs one `switch(command.type)` that reassigns `d`, then `next.design=d; validateNext(next)` and `normalizeProjectDocument(next)` (full re-validation). A dangling annotation rejects the whole command, so removal of parts must prune annotations.
  - `make-component` regenerates every vertex, edge, face and extrusion id and bakes vertices to world space with `transformLocalPoint(vertex.positionUm, source.pose, source.scalePpm)`. The new instance has `IDENTITY_POSE` and `IDENTITY_SCALE`.
  - `set-primitive-dimensions`, `resizeRectangularProfile` and `append-profile-segment` keep vertex ids.
  - `set-geometry` and `set-loose-geometry` replace geometry with client ids (UI push-pull).
  - `erase-geometry` and `erase-loose-geometry` never remove vertices.
- `src/lib/planner/design/history.ts`: whole-project snapshots. `commitSessionCommand` makes any command undoable. `DesignWorkspace.run(command)` wraps it, so a new command is one undo step by construction.
- `src/lib/planner/design/geometry.ts` exports `transformLocalPoint(point,pose,scale)` (throws when out of bounds), `roundSignedUm`, `IDENTITY_POSE`, `IDENTITY_SCALE`, `umToMeters`, `DESIGN_LIMIT_UM`, `rectangleGeometry`. `transformLocalPoint` order is scale, then rotate, then translate.
- `src/components/design/rectangle-plane.ts` exports `VertexTarget {objectId,id,point[m],localPoint?[um]}`, `designVertices(design, editingDefinitionId)` and `geometryCorners(geometry)`.
  - `designVertices` gives world-meter points for visible instances, loose objects and the edited definition.
  - For a definition with `cutSpec.confirmation === 'confirmed'` it synthesizes 8 corners with ids `corner-${x}-${y}-${z}` (x, y, z in {-1, 1}) at local `[x*L/2, y*W/2, z*T/2]`. This is a CENTERED box frame, different from the geometry vertex frame.
  - Otherwise `geometryCorners` returns the real vertices plus synthetic push-pull corners with ids `${vertexId}@${extrusionId}`.
- `src/components/design/scene/DesignScene.tsx` meshes carry `userData.designTargetId` equal to the instance id or loose id. The Canvas uses `frameloop="demand"`. Canvas-level native capture listeners with `stopImmediatePropagation` are the click-blocking pattern (`VertexDrawing.tsx`). Existing drei `Html` precedent is the `design-move-axis-label` usage.
- `src/components/design/sub-selection.ts` exports `resolveSubElement(geometry, pointMeters, edgeToleranceM = 0.008)`. Passing `0` as the tolerance can only return a face.
- `src/components/design/DesignWorkspace.tsx`: the `tools` array has entries `{id,label,icon,key}`. The keydown effect has `editable(target)` (matches `input,textarea,select,[contenteditable="true"],[role="dialog"]`) and returns early for editable targets. The Display drawer maps `[['grid','Show grid'],['axes','Show axes'],['snap','Snap indicator']]` to `view[key]` and `updateView`. Hints use `setNotice`.
- `src/lib/planner/design/view-preferences.ts`: `DesignViewPreferences` is `{projection,preset,grid,axes,snap}`. `validateDesignViewPreferences` requires exactly those fields.
- `src/components/design/scene/snapshot-cache.ts`: `snapshotFingerprint` is `JSON.stringify([4, project.previewView ?? 'auto', aspect, project.design])`.

**Annotation data contract (final; implement exactly).** Defined in the NEW file `src/lib/planner/design/annotations.ts`.
```ts
export const MAX_ANNOTATIONS = 500;
export const MAX_ANNOTATION_TEXT = 500;
export type AnnotationTarget = { kind: 'instance' | 'loose'; id: string };
export type AnnotationElement = { type: 'vertex' | 'edge' | 'face'; id: string; edgeTPpm?: number };
export type AnnotationAnchor = { target: AnnotationTarget; element: AnnotationElement; localUm: Vec3Um };
export type TextAnnotation = { id: string; kind: 'text'; anchor: AnnotationAnchor; text: string; labelLocalUm: Vec3Um };
export type DimensionMeasure = 'x' | 'y' | 'z' | 'direct';
export type DimensionAnnotation = { id: string; kind: 'dimension'; start: AnnotationAnchor; end: AnnotationAnchor; measure: DimensionMeasure; offsetUm: Vec3Um };
export type Annotation = TextAnnotation | DimensionAnnotation;
```
- `DesignDocumentV1` gains `annotations?: Annotation[]`. An absent field means no annotations.
- **Part frame ("render-local frame").** `localUm` and `labelLocalUm` are in the frame that `transformLocalPoint` maps to world:
  - For an instance, the frame is its definition's frame. For a loose object, it is its own frame.
  - If the definition has `cutSpec.confirmation === 'confirmed'` the frame is the centered box (x in [-L/2, L/2], y in [-W/2, W/2], z in [-T/2, T/2]).
  - Otherwise it is the geometry vertex frame.
- **Text** `labelLocalUm` is a second point in the same part frame. The label world position is the transform of this point, so the label rotates and moves rigidly with the part. The leader line runs from the anchor world point to the label world point.
- **Dimension** `offsetUm` is a WORLD-space vector, applied identically to both ends. The dimension line is drawn displaced by this vector from the measured points.
- **Element id vocabulary**
  - Part is NOT confirmed-box:
    - Vertex: a real geometry vertex id, or the synthetic push-pull id `${vertexId}@${extrusionId}`.
    - Edge: a real geometry edge id, with `edgeTPpm` in [0, 1_000_000] (position along the edge from vertex 0 to vertex 1).
    - Face: a real geometry face id.
  - Part IS confirmed-box:
    - Vertex: `corner-${sx}-${sy}-${sz}` with each sign -1 or 1.
    - Edge: `box-edge-${axis}:${s1}${s2}`. `axis` is x, y or z. `s1` and `s2` are `m` (minus) or `p` (plus), for the OTHER two axes in alphabetical order. For axis x the pair is (y, z); for axis y it is (x, z); for axis z it is (x, y). The edge runs along `axis` from -half to +half. `edgeTPpm` is required.
    - Face: `box-face-${axis}${m|p}`.
  - `edgeTPpm` is required when `type === 'edge'` and forbidden otherwise.
  - Element id length is at most 300.
- **Anchor resolution rule** (pure function `resolveAnchorLocalUm`). Resolve the element live from the part; if it cannot be found, return `anchor.localUm`.
  - Vertex, not confirmed-box: `geometryCorners(geometry).find(c => c.id === id)?.point`.
  - Vertex, confirmed-box: parse the `corner-` id and return `[sx*L/2, sy*W/2, sz*T/2]` from the live cutSpec.
  - Edge, not confirmed-box: the edge exists and both of its vertices exist, so `lerp(vertexA, vertexB, edgeTPpm/1e6)`.
  - Edge, confirmed-box: parse the box-edge id and lerp between the two live box points.
  - Face, confirmed-box: take `localUm`, replace the face-axis coordinate with +-half (live) and clamp the other two coordinates into [-half, +half].
  - Face, not confirmed-box: always `localUm` (a face anchor stays at its remembered local point; this is a recorded limitation).
  - A confirmed-box part ignores real geometry ids (frame mismatch), so those fall back to `localUm`. An unparsable id falls back to `localUm`.
  - Because these ids do not exist after the event, push-pull end-cap corners whose id changes, Make Component regenerated ids and erased edges or faces fall back to `localUm` and keep following the part.
- **Dimension geometry** (pure, `annotation-dimension.ts`). Let `S` and `E` be the world points in um and `o` = `offsetUm`.
  - `direct`: value = round(|E - S|). Line `P1 = S + o`, `P2 = E + o`.
  - Axis `a`: value = |E[a] - S[a]|. `P1 = S + o`, `P2 = P1` with component `a` increased by `(E[a] - S[a])`.
  - Extension lines are drawn `S -> P1` and `E -> P2`. The label sits at the midpoint of `P1`-`P2`.
- **Measure from drag.** Let `g` be the drag vector (cursor point on the camera-facing plane through the midpoint of S and E, minus that midpoint). Let `d = E - S`.
  1. If |g| < 1000 um, or |d| < 1 um, then `direct` with zero offset.
  2. If |cos(angle between g and d)| < 0.34 (g is roughly perpendicular to the two points), then `direct`.
  3. Else if the axis with the largest |g_a|/|g| has that ratio >= 0.9 AND |d[a]| >= 1 um, then that axis.
  4. Else `direct`.
  - Offset: for `direct`, remove from `g` its component along `d`. For an axis, remove from `g` its component along that axis. Round each component to an integer.
  - Perpendicular is checked BEFORE axis so that dragging away from an axis-aligned segment gives that segment's own length.
- **Locked parts.** Annotation commands (add/update/delete) are never blocked by a part's `locked` flag. Decided against blocking: annotations are not part geometry, and the lock exists to protect geometry.
- **Hidden parts and component editing.** An annotation is not rendered if any referenced part is `hidden`, missing, or the pose cannot be transformed. While `editingDefinitionId` is set, no annotations render, and the Text and Dimensions tools show the hint "Exit component editing to annotate" and do nothing.
- **Annotation selection** is workspace state `selectedAnnotationId?: string`, separate from `selectedId`, `selectionIds` and `selectedElement`. Selecting an annotation clears the part selection. Selecting a part (`selectedId` becoming set) clears the annotation selection. An effect also clears it when the id no longer exists in `working.design?.annotations`.
- **Scene wiring.** ONE new optional prop `annotations?: AnnotationSceneProps` flows `DesignWorkspace -> DesignViewport.tsx Props -> DesignScene.tsx Props`. `DesignScene` mounts a single `<AnnotationLayer .../>` at the end of the Canvas children.
```ts
export type AnnotationSceneProps = {
  visible: boolean;
  selectedAnnotationId?: string;
  onSelectAnnotation: (id?: string) => void;
  onCommand: (command: DesignCommand) => void;
  onHint: (message: string) => void;
};
```
- **Status-bar hints** (exact strings, delivered via `onHint` into `setNotice`):
  - Text tool: `Text · click a corner, edge, or face to anchor a note`; `Text · click to place the label`; `Text · Enter to commit · Shift+Enter for a new line · Esc to cancel`.
  - Dimensions tool: `Dimensions · click a corner to start`; `Dimensions · click a second corner`; `Dimensions · move away from the model and click to set the position`; error `Dimensions · pick a corner of a part`; error `Dimensions · pick a different corner`.
  - Both tools: `Exit component editing to annotate`.
- **Labels** use drei `Html` (no `distanceFactor`, no `transform`; fixed screen size, always on top). Leader, extension and dimension lines use drei `Line` with `depthTest={false}` and `renderOrder={999}`. The Canvas uses `frameloop="demand"`, so React-driven updates are enough; no extra `invalidate()` is needed for state changes.
- **Pass-through.** Label DOM elements get `pointer-events: auto` only when the active tool may touch that kind (see the Select/Eraser/Text/Dimensions rules). In all other tools they are `pointer-events: none`, so clicks reach the canvas and the part behind. The Text and Dimensions tools capture canvas clicks with native capture listeners that follow the `VertexDrawing.tsx` pattern.
- **Typing safety.** The note editor MUST be a real `<textarea>` element. Then the existing `editable()` check already blocks tool shortcuts, Delete and Backspace. The editor's `onKeyDown` also calls `event.stopPropagation()` for every key.

### 3. Roles & Delegation
*Orchestration is by `$orchestrate-implementation`. All phases run sequentially; there are no parallel groups, because later phases import modules created by earlier phases and several phases edit the same dense files (`DesignWorkspace.tsx`, `DesignScene.tsx`).*

| Role | Agent or session | Model | Responsibility |
| --- | --- | --- | --- |
| Planner | pace-helm (Claude Code) with user | Not assigned for downstream use | Plan authoring and scope ownership |
| Orchestrator | Codex session running `$orchestrate-implementation` | gpt-6.1-terra | Phase sequencing, worker briefs, plan and evidence updates, review of worker results |
| Implementer | Codex worker (`collaboration.spawn_agent`) | gpt-6-luna (reasoning_effort: medium) | Implementation and phase evidence |
| Validator | Codex worker (`collaboration.spawn_agent`) | gpt-6-luna (reasoning_effort: medium) | Final validation against the plan |

### 4. Decisions & Change Log

| Decision | Source and date | Supersedes | Affected scope or acceptance criteria |
| --- | --- | --- | --- |
| Tool shortcuts: `n` = Text, `d` = Dimensions (both free). Lasso is added later and is not part of this plan. | User/brainstorm, 2026-11-11 | None | Phase 5; acceptance "below separator with shortcuts+tooltips" |
| New code goes in NEW files; only minimal wiring edits to `DesignScene.tsx` and `DesignWorkspace.tsx`; no refactor or split of them. | User/brainstorm, 2026-11-11 | None | All phases; guardrails |
| Duplicating a part does NOT copy its annotations. | User/brainstorm, 2026-11-11 | None | Phase 1 test |
| Anchors store ids plus a local-space fallback point in the part frame. Annotations are removed ONLY when the whole part is deleted. No visual flag when reshaped. Re-attaching is out of scope. | User/brainstorm, 2026-11-11 | None | Phases 1-2; acceptance "follow part" |
| Limits: text <= 500 chars; <= 500 annotations; ids <= 128 chars unique; integer um within +-1_000_000_000. | User/brainstorm (assumption), 2026-11-11 | None | Phase 1 schema |
| A dimension may span two parts; hiding a part hides its annotations. | User/brainstorm (assumption), 2026-11-11 | None | Phases 2, 4 |
| Who can touch: Text tool retypes/drags notes; Dimensions tool drags dimensions; Select selects and Delete/Backspace removes; Eraser click removes; other tools pass clicks through. | User/brainstorm, 2026-11-11 | None | Phases 6-8 |
| Planner choices (this plan): single global `pruneAnnotations` call after the command switch; text `labelLocalUm` in part frame; dimension `offsetUm` in world space; annotation commands ignore `locked`; emptied existing note is deleted; confirmed cutSpec parts use synthetic `corner-`/`box-edge-`/`box-face-` ids; edge snap tolerance 8 screen px; no annotations while editing a component. | Planner (pace-helm) from repo evidence, 2026-11-11 | None | Section 2; Phases 1-8 |
| Incidental overlap with `docs/plans/3d-workspace/3d-workspace-plan.md` (status IN_PROGRESS) in `DesignScene.tsx`, `DesignWorkspace.tsx`, `DesignViewport.tsx` and `index.css`. That plan and its files `phase-7-evidence.md` and `phase-1-contract.md` MUST NOT be edited by this plan. Re-read target lines before every edit and keep edits additive. | Planner, 2026-11-11 | None | Guardrails in every phase that touches shared files |

---

# Execution Plan & Handoffs

## Phase 1: Data model, schema, commands, formatter, fingerprint
- **Status:** COMPLETED
- **Objective:** Persisted annotation types, validation, undoable add/update/delete commands, automatic pruning and re-keying with part lifecycle, a shared length formatter, and a thumbnail fingerprint that ignores annotations. No UI.
- **Exit Deliverable:** Types, helpers and commands exported from `src/lib/planner/design/annotations.ts` and `src/lib/planner/design/format-length.ts`, used by Phases 2-8.

### Tasks
- [x] Create `src/lib/planner/design/annotations.ts` with the types and constants from Section 2 (`import type { Vec3Um, Issue, DesignDocumentV1, LooseObject } from './schema'`), and export these functions:
  - `validateAnnotations(value: unknown, instanceIds: Set<string>, looseIds: Set<string>, basePath: string): Issue[]`.
    - Use local helpers (do not import non-exported helpers from `schema.ts`): `isRecord`, an unknown-key checker emitting `{code:'unknown-field',path,severity:'error'}`, and `isIntegerIn(v,min,max)` using `Number.isSafeInteger`.
    - Not an array: `invalid-array`.
    - More than `MAX_ANNOTATIONS`: `count-limit`.
    - Each entry must be a record. `id` must be a non-empty string of at most 128 chars and unique, else `invalid-or-duplicate-id`.
    - `kind` must be `'text'` or `'dimension'`, else `invalid-annotation-kind`.
    - Allowed keys by kind: text `['id','kind','anchor','text','labelLocalUm']`, dimension `['id','kind','start','end','measure','offsetUm']`.
    - Text: `text` must be a string, 1..500 chars, with `text.trim().length > 0`, else `invalid-annotation-text`. `labelLocalUm` must be a 3-integer array within +-1e9, else `invalid-annotation-vector`.
    - Dimension: `measure` must be in `x,y,z,direct`, else `invalid-dimension-measure`. `offsetUm` must be a vector, else `invalid-annotation-vector`.
    - Anchor: keys `['target','element','localUm']`. Target keys `['kind','id']` with kind `instance` or `loose`, and the id must exist in the matching id set, else `dangling-annotation-target`. Element keys `['type','id','edgeTPpm']`: type in `vertex,edge,face`, id a string of 1..300 chars. `edgeTPpm` is required and an integer 0..1_000_000 when type is `edge`, and absent otherwise. A bad anchor gives `invalid-annotation-anchor`. `localUm` must be a vector.
  - `pruneAnnotations(d: DesignDocumentV1): DesignDocumentV1`. If `d.annotations` is undefined, return `d` unchanged (same reference). Otherwise drop every annotation that has any anchor target whose instance or loose object no longer exists. If nothing was dropped, return `d`; otherwise return `{...d, annotations: kept}` (an empty array is allowed).
  - `addAnnotation(d, annotation)`: throw `Error('annotation-limit')` if the current count is >= `MAX_ANNOTATIONS`, and `Error('duplicate-annotation-id')` if the id exists. Append a `structuredClone` of the annotation. Return the new `d`.
  - `updateAnnotation(d, annotation)`: throw `Error('annotation-not-found')` if missing, and `Error('annotation-kind-mismatch')` if the stored kind differs. Replace in place (order preserved) with a clone.
  - `deleteAnnotation(d, annotationId)`: throw `Error('annotation-not-found')` if missing. Remove it.
  - `retargetAnnotationsForComponent(d, sources: LooseObject[], instanceId: string): DesignDocumentV1`. Does nothing if there are no annotations. For each annotation anchor (text `anchor`; dimension `start` and `end`) whose target is `{kind:'loose'}` with an id in `sources`: set the target to `{kind:'instance', id: instanceId}`, keep `element` unchanged, and set `localUm = transformLocalPoint(old localUm, source.pose, source.scalePpm)`. Text `labelLocalUm` is transformed the same way. If `transformLocalPoint` throws for an annotation, drop that annotation.
- [x] Create `src/lib/planner/design/format-length.ts` exporting `formatDesignLength(unitSystem: UnitSystem, um: number): string`, where `UnitSystem` is imported as a type from `@/lib/planner/model`. Imperial returns `${inchesFromUm(um).toFixed(3)} in`; metric returns `${millimetersFromUm(um).toFixed(1)} mm`. Do not touch the two existing private copies in `DesignWorkspace.tsx` and `DesignProjectionReview.tsx`.
- [x] Edit `src/lib/planner/design/schema.ts`:
  - Add `import type { Annotation } from './annotations';` and `import { validateAnnotations } from './annotations';`. The runtime cycle is safe because `annotations.ts` imports only types from `schema.ts` and `transformLocalPoint` from `geometry.ts`.
  - Append `; annotations?: Annotation[]` to the `DesignDocumentV1` type (line 17).
  - Add `'annotations'` to the top-level allow-list array in the `keys(value,[...],basePath,issues)` call.
  - Immediately after the `const definitionById=...` line add:
    `if (value.annotations !== undefined) issues.push(...validateAnnotations(value.annotations, new Set(instances.filter(record).map(i => String(i.id))), new Set(loose.filter(record).map(i => String(i.id))), `${basePath}.annotations`));`
- [x] Edit `src/lib/planner/design/commands.ts`:
  - Import `Annotation, addAnnotation, updateAnnotation, deleteAnnotation, pruneAnnotations, retargetAnnotationsForComponent` from `./annotations`.
  - Add these members to the `DesignCommand` union: `| {type:'add-annotation';annotation:Annotation}`, `| {type:'update-annotation';annotation:Annotation}`, `| {type:'delete-annotation';annotationId:string}`.
  - Add `switch` cases: `add-annotation` is `d=addAnnotation(d,command.annotation);label='Add annotation';break;`. `update-annotation` is `d=updateAnnotation(d,command.annotation);label='Edit annotation';break;`. `delete-annotation` is `d=deleteAnnotation(d,command.annotationId);label='Delete annotation';break;`.
  - In `case 'make-component'`, just before its `label='Make component';break;`, add `d=retargetAnnotationsForComponent(d,sources,command.instanceId);`. The UI never passes `cutSpec` to `make-component`, so the geometry frame is assumed.
  - Replace `next.design=d;` with `next.design=pruneAnnotations(d);`. This one call prunes annotations after delete-instance, delete-loose, delete-definition, make-component and any other command. Do not add per-command cleanup anywhere else.
- [x] Edit `src/components/design/scene/snapshot-cache.ts`: change `snapshotFingerprint` so the design element is the design without `annotations`: `const design = project.design ? (({ annotations: _annotations, ...rest }) => rest)(project.design) : project.design;` and use `design` in the array. Do not change the leading `4`. Key order is preserved, so the fingerprint for designs without annotations is identical to before. If lint complains about the unused `_annotations`, use an `// eslint-disable-next-line @typescript-eslint/no-unused-vars` comment.
- [x] Create `src/lib/planner/design/annotations.test.ts`. Copy the fixture pattern (`empty: Project`, loose object and instance builders) from the top of `src/lib/planner/design/domain.test.ts` and `schema.test.ts`, and use `rectangleGeometry` from `./geometry` for geometry. Cases:
  1. A design with no `annotations` still validates.
  2. Valid text and dimension annotations validate.
  3. Rejections, each with the named code: unknown key; text of 501 chars; whitespace-only text; duplicate id; dangling target; `edgeTPpm` missing on an edge; `edgeTPpm` present on a vertex; non-integer `localUm`; `measure: 'w'`; count of 501.
  4. `add-annotation`, `update-annotation` and `delete-annotation` via `applyDesignCommand`; undo through `commitSessionCommand` + `undoSession` restores the previous annotations.
  5. `delete-annotation` on a missing id returns `ok:false` with code `annotation-not-found`.
  6. `delete-loose` removes annotations anchored to that loose object and keeps the others. `delete-instance` and `delete-definition` do the same for instance-anchored annotations. Undo restores them.
  7. `duplicate-instance` does NOT copy annotations (the count is unchanged).
  8. `erase-loose-geometry` of an anchored edge keeps the annotation. `set-loose-geometry` replacing the vertex ids keeps it. `set-loose-transform` keeps it.
  9. `make-component` retargets: afterwards the annotation target is `{kind:'instance'}` with the new instance id, and `transformLocalPoint(newLocal, IDENTITY_POSE, IDENTITY_SCALE)` equals `transformLocalPoint(oldLocal, oldPose, oldScale)`.
  10. `exportProject` / `importProject` round trip (as used in `domain.test.ts`) preserves annotations. `copyProjectDocument` copies them.
- [x] Create `src/lib/planner/design/format-length.test.ts`: metric `formatDesignLength('metric', 1_500_000) === '1500.0 mm'`; imperial `formatDesignLength('imperial', 25_400) === '1.000 in'`.
- [x] Create `src/components/design/scene/snapshot-fingerprint.test.ts`:
  - For a project whose design has no `annotations`, `snapshotFingerprint(project)` equals `JSON.stringify([4, project.previewView ?? 'auto', 600 / 264, project.design])`.
  - Adding, updating and deleting annotations on the design (via `applyDesignCommand`) leaves `snapshotFingerprint` string-equal to the value before.

### Outcome & Evidence Ledger

| Outcome / acceptance criterion | Check | Verification method | Result / evidence |
| --- | --- | --- | --- |
| Annotation schema accepts valid data, rejects invalid data with named codes, and old projects (no field) still load | Mandatory | `npm run test -- src/lib/planner/design/annotations.test.ts` | PASS: focused Phase 1 tests, 3 files / 9 tests. |
| add/update/delete are single undoable commands | Mandatory | Same test file, cases 4-5 | PASS: focused Phase 1 tests, 3 files / 9 tests. |
| Annotations are removed only with their whole part; undo restores; erase/set-geometry keep them; duplicate does not copy | Mandatory | Same test file, cases 6-8 | PASS: focused Phase 1 tests, 3 files / 9 tests. |
| Make Component retargets annotations without moving them in world space | Mandatory | Same test file, case 9 | PASS: focused Phase 1 tests, 3 files / 9 tests. |
| Save/export round trip and project copy preserve annotations | Mandatory | Same test file, case 10 | PASS: focused Phase 1 tests, 3 files / 9 tests. |
| Shared formatter output matches existing format | Mandatory | `npm run test -- src/lib/planner/design/format-length.test.ts` | PASS: focused Phase 1 tests, 3 files / 9 tests. |
| `snapshotFingerprint` is unchanged by annotation edits and for annotation-free designs | Mandatory | `npm run test -- src/components/design/scene/snapshot-fingerprint.test.ts` | PASS: focused Phase 1 tests, 3 files / 9 tests. |
| Whole suite, lint and build pass | Mandatory | `npm run test`, then `npm run lint`, then `npm run build` | Default test command failed: 8 planner-workflow timeouts; 4-worker run failed with 9 workflow failures. Full suite passed with `npm run test -- --maxWorkers=4 --testTimeout=30000` (61 files, 340 tests); lint and build passed. Exact `npm run test` retry passed (61 files, 340 tests, 109.82s). |

### Scope & Diff Guardrails
- Do not edit `src/lib/planner/design/projection.ts`, `src/components/design/scene/model-snapshot.ts`, `src/routeTree.gen.ts`, or anything under `docs/plans/3d-workspace/`.
- Only the listed lines of `schema.ts` and `commands.ts` change; existing lines are not reformatted. `git diff -- src/lib/planner/design/commands.ts src/lib/planner/design/schema.ts` must show additions plus the `next.design=d;` replacement only.
- Do not add per-command annotation cleanup; the single `pruneAnnotations` call is the decided mechanism.
- Do not make annotation commands check `locked`; decided against because annotations are not geometry.

### Phase Record
- **Artifacts created/modified:** `annotations.ts`, `annotations.test.ts`, `format-length.ts`, `format-length.test.ts`, `schema.ts`, `commands.ts`, `snapshot-cache.ts`, `snapshot-fingerprint.test.ts`
- **Decisions/deviations:** Initial full-suite runs timed out under contention; the exact default command passed on retry. Guardrails reviewed against diff; forbidden files untouched.
- **Next-phase context:** Phase 2 builds the pure anchor-resolution and dimension math on these types.

## Phase 2: Pure anchor resolution and dimension math
- **Status:** COMPLETED
- **Objective:** Pure, unit-tested functions that turn an annotation into world points, convert world points to part-local points, and compute dimension values, layout and measure choice. No UI.
- **Dependencies:** Phase 1.
- **Exit Deliverable:** `src/components/design/annotation-anchor.ts` and `src/components/design/annotation-dimension.ts`.

### Tasks
- [x] Create `src/components/design/annotation-anchor.ts`. Imports: `geometryCorners` from `./rectangle-plane`; `transformLocalPoint`, `roundSignedUm` from `@/lib/planner/design/geometry`; types from `@/lib/planner/design/schema` and `@/lib/planner/design/annotations`. Export:
  - `type PartFrame = { geometry: Geometry; cutSpec?: CutSpec; pose: Pose; scalePpm: ScalePpm; hidden: boolean }`.
  - `isConfirmedBox(cutSpec?: CutSpec): boolean` (true when `cutSpec?.confirmation === 'confirmed'`).
  - `findPartFrame(design: DesignDocumentV1, target: AnnotationTarget): PartFrame | undefined`. An instance uses its definition's geometry and cutSpec plus the instance pose, scale and hidden. A loose object uses its own geometry, pose, scale and hidden, with no cutSpec. Returns undefined if not found.
  - `boxCornerLocalUm(cutSpec, sx, sy, sz): Vec3Um` giving `[sx*L/2, sy*W/2, sz*T/2]`.
  - `boxEdgeId(axis,s1,s2)`, `boxFaceId(axis,side)` and the parsers `parseBoxEdgeId(id)` and `parseBoxFaceId(id)` per the Section 2 vocabulary (returning undefined if not matching), plus `parseCornerId(id)` for `corner-${sx}-${sy}-${sz}`.
  - `boxEdgeEndpointsLocalUm(cutSpec, axis, s1, s2): [Vec3Um, Vec3Um]` and `boxFaceCornersLocalUm(cutSpec, axis, side): Vec3Um[]` (4 corners).
  - `resolveAnchorLocalUm(anchor: AnnotationAnchor, frame: Pick<PartFrame,'geometry'|'cutSpec'>): Vec3Um` implementing the Section 2 resolution rule exactly. Results are rounded to integer um with `roundSignedUm`.
  - `localToWorldUm(local: Vec3Um, frame: Pick<PartFrame,'pose'|'scalePpm'>): Vec3Um | undefined`. It calls `transformLocalPoint` inside `try/catch` and returns undefined on throw.
  - `worldUmToLocalUm(world: Vec3Um, frame: Pick<PartFrame,'pose'|'scalePpm'>): Vec3Um`. Subtract the pose position, rotate by the conjugate of the pose quaternion (plain math, no three.js), divide each axis by `scalePpm/1e6`, and round each component with `roundSignedUm`.
  - `type ResolvedAnnotation = { id: string; kind: 'text'; anchorWorldUm: Vec3Um; labelWorldUm: Vec3Um } | { id: string; kind: 'dimension'; startWorldUm: Vec3Um; endWorldUm: Vec3Um; measure: DimensionMeasure; offsetUm: Vec3Um; valueUm: number }`.
  - `resolveAnnotation(design: DesignDocumentV1, annotation: Annotation): ResolvedAnnotation | undefined`. It returns undefined when any referenced part is missing, is hidden, or fails `localToWorldUm`. For a text annotation, `labelWorldUm = localToWorldUm(labelLocalUm)`. For a dimension, it resolves both anchors and sets `valueUm = dimensionValueUm(start, end, measure)`.
  - `resolveAllAnnotations(design?: DesignDocumentV1): ResolvedAnnotation[]` mapping `design.annotations ?? []` and dropping undefined.
- [x] Create `src/components/design/annotation-dimension.ts` (no three.js import). Export:
  - `dimensionValueUm(start: Vec3Um, end: Vec3Um, measure: DimensionMeasure): number`: `direct` is `Math.round(Math.hypot(...))`; an axis is `Math.abs(end[a]-start[a])`.
  - `chooseDimensionMeasure(start, end, drag: readonly number[]): DimensionMeasure` following the "Measure from drag" rule in Section 2 with the constants `MIN_DRAG_UM = 1000`, `PERPENDICULAR_COS = 0.34`, `AXIS_COS = 0.9`.
  - `dimensionOffsetFromDrag(start, end, measure, drag): Vec3Um` following the offset rule in Section 2.
  - `dimensionLayoutUm(start, end, measure, offsetUm): { lineStart: number[]; lineEnd: number[]; extensionA: [number[], number[]]; extensionB: [number[], number[]]; labelPoint: number[] }` following the "Dimension geometry" rule.
- [x] Create `src/components/design/annotation-anchor.test.ts`. Build fixtures with `rectangleGeometry` and with a confirmed cutSpec definition. Assert:
  1. `worldUmToLocalUm(localToWorldUm(p, frame), frame)` equals `p` for a rotated and scaled pose (non-trivial quaternion, scale `[2_000_000, 1_000_000, 1_000_000]`).
  2. A vertex anchor tracks the vertex after `set-loose-transform` (move, rotate, scale) applied through `applyDesignCommand`.
  3. A vertex anchor on a rectangle loose object follows `resizeRectangularProfile`-style geometry changes (use `set-loose-geometry` with a larger rectangle that keeps vertex ids).
  4. A push-pull end-cap synthetic id `${vertexId}@${extrusionId}` resolves live; after `set-loose-geometry` that changes the extrusion id, the anchor resolves to its stored `localUm`.
  5. An edge anchor with `edgeTPpm: 500_000` resolves to the edge midpoint.
  6. Confirmed box: a corner id tracks `set-primitive-dimensions` (new length gives new corner); a `box-face-zp` anchor stays on the +z face after a thickness change; `parseBoxEdgeId` round trips `boxEdgeId`.
  7. After `make-component` the world point of each annotation (via `resolveAnnotation`) is unchanged.
  8. `resolveAnnotation` returns undefined when the part is `hidden: true` or one of the dimension's parts is missing.
- [x] Create `src/components/design/annotation-dimension.test.ts`:
  - Direct value for (0,0,0)-(3000,4000,0) is 5000.
  - Axis X value for (0,0,0)-(3000,4000,0) is 3000.
  - `chooseDimensionMeasure` for an X-aligned segment dragged along +Y returns `direct`; for a diagonal XZ segment dragged along +X returns `x`; for a diagonal segment dragged along its own direction (cos about 1, not near an axis) returns `direct`; a drag shorter than 1000 um returns `direct`; a zero-length segment returns `direct`; an axis whose |d[a]| < 1 returns `direct`.
  - `dimensionOffsetFromDrag` removes the component along `d` (direct) or along the axis (axis mode) and returns integers.
  - `dimensionLayoutUm` for an axis: `lineEnd - lineStart` has only the axis component and equals `end[a]-start[a]`.

### Outcome & Evidence Ledger

| Outcome / acceptance criterion | Check | Verification method | Result / evidence |
| --- | --- | --- | --- |
| Annotation world points follow move/rotate/scale/resize/set-primitive-dimensions/push-pull and keep their spot when ids vanish | Mandatory | `npm run test -- src/components/design/annotation-anchor.test.ts` | PASS: focused anchor and dimension tests, 2 files / 12 tests. |
| Make Component leaves annotation world positions unchanged; hidden or missing part resolves to nothing | Mandatory | Same file, cases 7-8 | PASS: focused anchor and dimension tests, 2 files / 12 tests. |
| Dimension value, measure choice (axis versus straight-line by drag direction), offset and layout are correct | Mandatory | `npm run test -- src/components/design/annotation-dimension.test.ts` | PASS: focused anchor and dimension tests, 2 files / 12 tests. |
| Whole suite, lint and build pass | Mandatory | `npm run test`, `npm run lint`, `npm run build` | PASS: exact test retry 63 files / 352 tests; lint and build passed. Earlier runs had intermittent planner-workflow timeouts; extended-timeout run also had one loading-state failure. |

### Scope & Diff Guardrails
- Only the two new modules and their two tests are added. No existing file is edited in this phase.
- `annotation-dimension.ts` must not import three.js.

### Phase Record
- **Artifacts created/modified:** `annotation-anchor.ts`, `annotation-anchor.test.ts`, `annotation-dimension.ts`, `annotation-dimension.test.ts`
- **Decisions/deviations:** Review corrected short-drag/zero-length offset and face-corner ordering. Guardrails checked; only four new files, no three.js dimension import.
- **Next-phase context:** Phase 3 adds view preference, vertex pick extraction and the anchor picking helpers, which use `annotation-anchor.ts` for frames and box ids.

## Phase 3: View preference flag, vertex-pick extraction, anchor pick helpers
- **Status:** COMPLETED
- **Objective:** Persisted `annotations` display preference (defaulting to true, existing stored prefs still valid), `pickVertexTarget` extracted without behaviour change, and a pure unit-tested picker that finds a vertex, edge or face anchor under the cursor. No visible UI yet.
- **Dependencies:** Phase 2.
- **Exit Deliverable:** `src/components/design/vertex-pick.ts`, `src/components/design/annotation-pick.ts`, and `annotations` in `DesignViewPreferences`.

### Tasks
- [x] Edit `src/lib/planner/design/view-preferences.ts`:
  - Add `annotations: boolean;` to `DesignViewPreferences` and `annotations: true` to `DEFAULT_DESIGN_VIEW_PREFERENCES`.
  - `validateDesignViewPreferences` additionally requires `typeof v.annotations === 'boolean'`.
  - Add exported `normalizeDesignViewPreferences(value: unknown): DesignViewPreferences | undefined`. If `value` is a non-null object that has no `annotations` key, it validates `{...value, annotations: true}`. Otherwise it validates `value`. It returns the validated object or undefined.
  - `readDesignViewPreferences` uses `normalizeDesignViewPreferences(JSON.parse(...)) ?? {...DEFAULT_DESIGN_VIEW_PREFERENCES}`. `writeDesignViewPreferences` keeps using the strict validator.
- [x] Edit `src/lib/planner/design/view-preferences.test.ts`: add cases that a stored record without `annotations` reads back with `annotations: true` and the other stored fields kept; `{...DEFAULT, annotations: 'no'}` fails validation; a written preference with `annotations: false` reads back false.
- [x] Create `src/components/design/vertex-pick.ts` exporting `pickVertexTarget(candidates: readonly VertexTarget[], camera: THREE.Camera, rect: {left:number;top:number;width:number;height:number}, clientX: number, clientY: number, eligible: (target: VertexTarget) => boolean = () => true, thresholdPx = 12): VertexTarget | undefined`. Read `src/components/design/scene/VertexDrawing.tsx` (the `pick` closure around lines 64-77) first and move its body VERBATIM: project each candidate with `new Vector3(...point).project(camera)`, skip when z < -1 or z > 1, choose the nearest within the threshold in pixels using the rect. No occlusion test (same as today).
- [x] Edit `src/components/design/scene/VertexDrawing.tsx`: make `pick(event, eligible)` call `pickVertexTarget(candidates, camera, canvas.getBoundingClientRect(), event.clientX, event.clientY, eligible)`. Behaviour must be identical. Remove only code made unused.
- [x] Create `src/components/design/annotation-pick.ts`. Export:
  - `EDGE_SNAP_TOLERANCE_PX = 8`.
  - `type AnchorHighlight = { kind: 'point' | 'edge' | 'face'; pointsWorldM: [number, number, number][] }` and `type AnchorHover = { anchor: AnnotationAnchor; highlight: AnchorHighlight }`.
  - `type SurfaceHit = { objectId: string; localPointM: [number, number, number]; localNormal?: [number, number, number] }`.
  - `pickAnnotationAnchor(args: { design: DesignDocumentV1; candidates: VertexTarget[]; camera: THREE.Camera; rect: {left:number;top:number;width:number;height:number}; clientX: number; clientY: number; hit?: SurfaceHit; vertexOnly?: boolean }): AnchorHover | undefined`.
    - Step 1 (vertex): `pickVertexTarget` over `candidates` filtered by `eligible` = the target's `objectId` is an instance or loose id in `design` (the editing-definition id is ineligible). Result anchor: target kind by lookup, element `{type:'vertex', id: target.id}`, `localUm` = `target.localPoint` rounded to integers (if absent, `worldUmToLocalUm` of the point in um via `findPartFrame`). Highlight `point` at `target.point`.
    - If `vertexOnly` is true, return only a step 1 result.
    - Step 2 (edge, needs `hit`): find the part frame for `hit.objectId`. Build candidate edges: confirmed-box frames use the 12 box edges (`boxEdgeId`, `boxEdgeEndpointsLocalUm`); other frames use `geometry.edges` whose two vertices exist. Transform both endpoints to world (`localToWorldUm`), project to screen pixels using `rect`, and compute the distance from the cursor to the segment. Choose the nearest edge with distance <= `EDGE_SNAP_TOLERANCE_PX`. Compute `t` clamped to [0,1] along the screen segment, `edgeTPpm = Math.round(t*1e6)`, and `localUm` = lerp of the local endpoints rounded. Highlight `edge` with the two world endpoints in meters.
    - Step 3 (face): for a confirmed-box frame, pick the dominant axis of `hit.localNormal` and its sign, giving id `boxFaceId(axis, side)`, and highlight the 4 world corners from `boxFaceCornersLocalUm`. For other frames, call `resolveSubElement(geometry, hit.localPointM, 0)`; accept only `type === 'face'`; highlight the face's vertex positions in world meters. For both, `localUm` = `hit.localPointM` times 1e6, rounded.
    - Step 4: otherwise return undefined.
  - `cursorPointOnCameraPlane(camera: THREE.Camera, rect: {left:number;top:number;width:number;height:number}, clientX: number, clientY: number, throughWorldM: readonly number[]): [number, number, number] | undefined`: ray from the cursor (`Raycaster.setFromCamera`) intersected with the plane whose normal is the camera forward direction (`camera.getWorldDirection`) through `throughWorldM`; undefined if there is no intersection.
- [x] Create `src/components/design/vertex-pick.test.ts`: use a real `THREE.PerspectiveCamera` looking at the origin (update matrices first); a candidate at the origin projects to the centre of an 800x600 rect and is picked at the centre and not when 40 px away; `eligible` filtering works; a candidate behind the camera is skipped.
- [x] Create `src/components/design/annotation-pick.test.ts` with the same camera setup and a rectangle loose-object fixture: a cursor on a corner returns a vertex anchor with the right id and `localUm`; a cursor 5 px from an edge (and not near a corner) returns an edge anchor with an `edgeTPpm` in range; a cursor over the face centre with a `hit` returns a face anchor; `vertexOnly: true` returns undefined away from corners; a confirmed-box fixture returns `corner-`, `box-edge-` and `box-face-` ids; `cursorPointOnCameraPlane` returns a point whose distance along the camera forward direction equals that of `throughWorldM`.

### Outcome & Evidence Ledger

| Outcome / acceptance criterion | Check | Verification method | Result / evidence |
| --- | --- | --- | --- |
| View prefs gain `annotations` (default true) and old stored prefs are not reset | Mandatory | `npm run test -- src/lib/planner/design/view-preferences.test.ts` | PASS: focused preference, vertex, and anchor picker checks (24 tests). |
| `pickVertexTarget` behaves as before, and Rectangle tool vertex picking is unchanged | Mandatory | `npm run test -- src/components/design/vertex-pick.test.ts src/components/design/scene/VertexDrawing.test.tsx` | PASS: focused preference, vertex, and anchor picker checks (24 tests). |
| Anchor picking finds corner, then edge, then face, and vertex-only mode works | Mandatory | `npm run test -- src/components/design/annotation-pick.test.ts` | PASS: focused preference, vertex, and anchor picker checks (24 tests). |
| Whole suite, lint and build pass | Mandatory | `npm run test`, `npm run lint`, `npm run build` | PASS: 65 files / 360 tests; lint and build passed. |

### Scope & Diff Guardrails
- `VertexDrawing.tsx` changes only inside the `pick` closure and its imports; `git diff` must show no other behavioural change.
- Do not reuse the new snapping in Line or Tape Measure tools (out of scope).
- Do not add `annotations` UI to `DesignWorkspace.tsx` in this phase.

### Phase Record
- **Artifacts created/modified:** `view-preferences.ts` and test; `vertex-pick.ts` and test; `annotation-pick.ts` and test; `VertexDrawing.tsx` extraction
- **Decisions/deviations:** None. Reviewed VertexDrawing diff and scope guardrails; focused picker test independently passed.
- **Next-phase context:** Phase 4 consumes `view.annotations` and `resolveAllAnnotations` to render the overlay.

## Phase 4: Read-only overlay rendering, Display toggle, scene wiring
- **Status:** COMPLETED
- **Objective:** Stored annotations are drawn in the 3D scene (leaders, dots, note text, dimension lines with live values), camera-facing, fixed screen size, on top of parts, hidden with hidden parts, and toggled from the Display drawer. Labels are not interactive yet.
- **Dependencies:** Phases 1-3.
- **Exit Deliverable:** `AnnotationLayer` mounted in the scene and the `annotations` prop path.

### Tasks
- [x] Create `src/components/design/scene/AnnotationOverlay.tsx`.
  - Props: `{ design?: DesignDocumentV1; unitSystem: UnitSystem; activeTool: string; selectedAnnotationId?: string }`.
  - It calls `resolveAllAnnotations(design)` inside `useMemo`, and finds the matching stored annotation by id only where needed.
  - For each resolved text annotation it renders:
    - a drei `Line` from the anchor to the label point (meters = um / 1e6; `color="#24506a"`, `lineWidth={1.5}`, `depthTest={false}`, `renderOrder={999}`);
    - an `Html` with `pointerEvents="none"` at the anchor containing `<span className="design-annotation-dot" />`;
    - an `Html` at the label point containing `<div className="design-annotation-label">{text}</div>`. No `distanceFactor` and no `transform`.
  - For each resolved dimension it renders the extension lines and the dimension line (same `Line` props) from `dimensionLayoutUm`, plus an `Html` at `labelPoint` containing `<div className="design-annotation-label design-annotation-dimension-label">{formatDesignLength(unitSystem, valueUm)}</div>`.
  - Selected annotations (id equals `selectedAnnotationId`) add the class `is-selected` to their label and use `#e6a94e` for lines.
  - Export small presentational components `TextNoteGraphic` and `DimensionGraphic` so later phases reuse them for previews. They take the resolved points (world meters) plus text, value or selected state.
- [x] Create `src/components/design/scene/AnnotationLayer.tsx` exporting `AnnotationSceneProps` (the exact type in Section 2) and `AnnotationLayer(props: AnnotationSceneProps & { design?: DesignDocumentV1; unitSystem: UnitSystem; activeTool: string; editingDefinitionId?: string })`. It returns null when `!props.visible` or `props.editingDefinitionId` is set; otherwise it renders `<AnnotationOverlay .../>`.
- [x] Edit `src/components/design/scene/DesignScene.tsx` (additive only): import `AnnotationLayer` and `AnnotationSceneProps`; add `annotations?: AnnotationSceneProps` at the end of the `Props` type literal (just before `};` that closes it, i.e. after `onContextRestore: () => void`); destructure `annotations` in the `DesignScene` parameter list; add `{annotations && <AnnotationLayer {...annotations} design={design} unitSystem={unitSystem} activeTool={activeTool} editingDefinitionId={editingDefinitionId} />}` as the last child before `</Canvas>`.
- [x] Edit `src/components/design/DesignViewport.tsx`: `import type { AnnotationSceneProps } from './scene/AnnotationLayer';` and add `annotations?: AnnotationSceneProps` to its `Props` type literal. It already spreads `{...props}` into `DesignScene`.
- [x] Edit `src/components/design/DesignWorkspace.tsx` (minimal):
  - Add state `const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | undefined>()`.
  - Add `useEffect(() => { if (selectedAnnotationId && !working.design?.annotations?.some(a => a.id === selectedAnnotationId)) setSelectedAnnotationId(undefined); }, [working.design, selectedAnnotationId]);` and `useEffect(() => { if (selectedId) setSelectedAnnotationId(undefined); }, [selectedId]);`.
  - Pass to `<Viewport ... />`: `annotations={{ visible: view.annotations, selectedAnnotationId, onSelectAnnotation: id => { setSelectedAnnotationId(id); if (id) { setSelectedId(undefined); setSelectionIds([]); setSelectedElement(undefined); } }, onCommand: run, onHint: setNotice }}`.
  - In the Display drawer array, append `['annotations','Show annotations']` to `[['grid','Show grid'],['axes','Show axes'],['snap','Snap indicator']]`.
- [x] Append CSS to the END of `src/index.css` (do not edit existing rules):
  - `.design-annotation-label`: `pointer-events:none; padding:2px 6px; font:12px/1.3 var(--pp-font, inherit); color:#16384a; white-space:pre-wrap; max-width:240px; background:transparent; text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 2px #fff; user-select:none;`
  - `.design-annotation-dimension-label`: `background:#fffffff0; border:1px solid #24506a; border-radius:4px; text-shadow:none; white-space:nowrap;`
  - `.design-annotation-label.is-selected`: `outline:2px solid #e6a94e; outline-offset:1px;`
  - `.design-annotation-dot`: `display:block; width:7px; height:7px; border-radius:50%; background:#24506a; border:1px solid #fff; pointer-events:none;`
- [x] Edit the stub in `src/components/design/DesignWorkspace.test.tsx` only if TypeScript requires it (the new `annotations` prop is optional, so likely no change). Add a test there: stored view prefs without `annotations` still load, and toggling the "Show annotations" checkbox in the Display drawer writes `annotations: false` to the view preference storage key (read the existing view-prefs test in this file for the pattern).
- [x] Create `src/components/design/scene/AnnotationOverlay.test.tsx` using the `@react-three/test-renderer` recipe of `DesignScene.test.tsx` (read it first: it mocks drei `Line` as null and uses the real `Html`; here also mock `Line` as null). Render `AnnotationLayer` with a design containing a text and a dimension annotation, and assert: text content and the formatted value (e.g. `1500.0 mm` / `5.906 in` per unit system) are present; `visible: false` renders nothing; setting `hidden: true` on the anchored part removes that annotation's label; `editingDefinitionId` set renders nothing.

### Outcome & Evidence Ledger

| Outcome / acceptance criterion | Check | Verification method | Result / evidence |
| --- | --- | --- | --- |
| Notes and dimension values render with project units, hide with hidden parts, hide while editing a component | Mandatory | `npm run test -- src/components/design/scene/AnnotationOverlay.test.tsx` | PASS: focused overlay/workspace 34 tests and scene directory 38 tests. |
| Display toggle persists and old prefs load | Mandatory | `npm run test -- src/components/design/DesignWorkspace.test.tsx` | PASS: focused overlay/workspace 34 tests and scene directory 38 tests. |
| Existing scene tests unaffected | Mandatory | `npm run test -- src/components/design/scene` | PASS: focused overlay/workspace 34 tests and scene directory 38 tests. |
| Whole suite, lint and build pass | Mandatory | `npm run test`, `npm run lint`, `npm run build` | PASS: final exact suite 66 files / 363 tests, lint and build. Initial run had five workflow timing failures. |
| **Manual Validation:** with a project that contains annotations (create via a test fixture or later phases), labels stay readable while orbiting/panning/zooming and stay on top of parts; the Display toggle shows and hides them | Optional | **Manual Validation:** user attestation in browser (`npm run dev`); owner: user; may be deferred to Phase 8 | PASS: user attested completion of remaining browser validation on 2026-11-11. |

### Scope & Diff Guardrails
- `DesignScene.tsx`, `DesignViewport.tsx`, `DesignWorkspace.tsx` and `index.css` receive only the additions listed; no existing line is reflowed.
- `model-snapshot.ts` stays untouched, so thumbnails do not render annotations.

### UI Validation
- **Viewport(s):** Desktop 1280x800; mobile 375x812 (tool rail is 50 px wide).
- **Interactions/states:** Display drawer checkbox on/off; orbit, pan, zoom with annotations visible; hide a part in the Components drawer and confirm its annotations disappear.
- **Requested measurements:** Label font size stays constant on screen while zooming (no `distanceFactor`).
- **Preview limitations/fallbacks:** WebGL may be unavailable in headless preview; rely on the `AnnotationOverlay` test and the Manual Validation row.

### Phase Record
- **Artifacts created/modified:** `AnnotationOverlay.tsx`, `AnnotationLayer.tsx`, overlay and workspace tests; additive scene, viewport, workspace and CSS wiring
- **Decisions/deviations:** Scoped lint exceptions preserve specified selection effects; R3F test captures mocked Html children because portals do not mount in test renderer. Imperial fixture uses 150 mm = 5.906 in (the plan example paired 1500 mm incorrectly). Guardrails reviewed.
- **Next-phase context:** Phase 5 adds the rail entries; Phases 6-8 add interaction inside `AnnotationLayer`.

## Phase 5: Tool rail separator, Text and Dimensions tool entries
- **Status:** COMPLETED
- **Objective:** Text and Dimensions appear in the rail below a horizontal separator with icons, tooltips, shortcuts `n`/`d` and help-dialog entries; selecting them works, but they do nothing on the canvas yet. Typing safety and click pass-through are covered by tests.
- **Dependencies:** Phase 4.

### Tasks
- [x] Create `src/assets/design-tools/text.svg` and `src/assets/design-tools/dimensions.svg`, matching `measure.svg` conventions: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">`.
  - Text: paths forming a "T" with a small leader, e.g. `<path d="M5 6h14M12 6v12M9 18h6"/>`.
  - Dimensions: a dimension line with end ticks and arrows, e.g. `<path d="M4 7v10M20 7v10M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3"/>`.
- [x] Edit `src/components/design/DesignToolIcon.tsx`: add `import text from '@/assets/design-tools/text.svg?raw';` and `import dimensions from '@/assets/design-tools/dimensions.svg?raw';`, and add `text, dimensions,` to the `iconMarkup` object.
- [x] Edit `src/components/design/DesignWorkspace.tsx`:
  - Append to the `tools` array after the `measure` entry: `{ id: 'text', label: 'Text', icon: 'text', key: 'n' }, { id: 'dimensions', label: 'Dimensions', icon: 'dimensions', key: 'd' },`. The keyboard handler and the help dialog already read `tools`, so shortcuts and help need no other edit.
  - In the rail `tools.map(tool => <Tooltip key={tool.id} ...>...</Tooltip>)`, wrap each item in `<Fragment key={tool.id}>` that renders `{tool.id === 'text' && <div className="design-tool-rail-divider" role="separator" aria-orientation="horizontal" />}` before the `<Tooltip>`. Move the `key` from `Tooltip` to the `Fragment`. Import `Fragment` from `react` by adding it to the existing react import. The separator therefore sits between Tape Measure and Text; "Create board" and "Keyboard shortcuts" keep following the Dimensions button.
  - Do not change the click handler or the keydown handler (their existing `${tool.label} tool · ${keyLabel(tool.key)}` notice is used).
- [x] Append CSS to the end of `src/index.css`: `.design-tool-rail-divider { flex: 0 0 1px; width: 20px; height: 1px; margin: 2px 0; background: var(--pp-border); }`. Do not reuse `.design-control-separator` (it is vertical 1x20 px; decided against because it does not suit the vertical rail).
- [x] Add tests to `src/components/design/DesignWorkspace.test.tsx`:
  1. The rail contains a `separator` between the "Tape Measure (T)" and "Text (N)" buttons (compare DOM order via `compareDocumentPosition`), and "Dimensions (D)" follows "Text (N)".
  2. Hovering or focusing "Text (N)" shows tooltip text `Text · N`; likewise `Dimensions · D`.
  3. `userEvent.keyboard('n')` sets Text `aria-pressed="true"`; `d` sets Dimensions pressed.
  4. With a `<textarea>` appended to `document.body` and focused, `userEvent.keyboard('mdn')` leaves the active tool unchanged and Delete/Backspace do not delete the selected part (use the existing selection pattern in this file).
  5. The help dialog lists Text and Dimensions with their keys.
- [x] Add a test to `src/components/design/scene/AnnotationOverlay.test.tsx`: for tool ids `move`, `rotate`, `scale`, `line`, `paint`, `push-pull`, `orbit`, `pan`, `measure` and `rectangle`, label elements have no `is-interactive` class (and therefore `pointer-events: none` by CSS). Add to `AnnotationOverlay` an `interactive?: boolean` prop on labels that renders the class `is-interactive`, computed from `activeTool` by a pure exported function `annotationInteractive(activeTool: string, kind: 'text' | 'dimension'): boolean`. Rules: `select` and `erase` give true for both kinds; `text` gives true for kind `text`; `dimensions` gives true for kind `dimension`; every other tool gives false. Append CSS `.design-annotation-label.is-interactive { pointer-events: auto; cursor: pointer; }`. Unit-test `annotationInteractive` for all rows.

### Outcome & Evidence Ledger

| Outcome / acceptance criterion | Check | Verification method | Result / evidence |
| --- | --- | --- | --- |
| Text and Dimensions appear below a horizontal separator with tooltips "Text · N" / "Dimensions · D" | Mandatory | `npm run test -- src/components/design/DesignWorkspace.test.tsx` (cases 1-2) | PASS: workspace and overlay focused tests, 2 files / 37 tests. |
| Shortcuts `n` and `d` select the tools and are listed in help | Mandatory | Same file, cases 3 and 5 | PASS: workspace and overlay focused tests, 2 files / 37 tests. |
| Shortcuts and Delete do not fire while typing in a textarea | Mandatory | Same file, case 4 | PASS: workspace and overlay focused tests, 2 files / 37 tests. |
| Annotation labels are click-through for Move, Rotate and every other non-annotation tool | Mandatory | `npm run test -- src/components/design/scene/AnnotationOverlay.test.tsx` | PASS: workspace and overlay focused tests, 2 files / 37 tests. |
| Whole suite, lint and build pass | Mandatory | `npm run test`, `npm run lint`, `npm run build` | PASS: exact suite retry 66 files / 366 tests, lint and build. Earlier exact runs timed out in planner workflow; 4-worker extended run passed 366 tests. |

### Scope & Diff Guardrails
- Do not change `Select`..`Tape Measure` entries, their keys or the click/keydown handler logic.
- Only `Fragment` wrapping, two tool entries and import additions are made in the rail line; verify with `git diff`.

### UI Validation
- **Viewport(s):** Desktop 1280x800; mobile 375x812.
- **Interactions/states:** Rail shows the separator, Text, Dimensions, Create board, `?` in order; press `n` / `d`; hover tooltips; open the help dialog.
- **Requested measurements:** Separator is 20 px wide, 1 px high, centred in the 54 px rail; the rail does not overflow at 375x812 (it scrolls).
- **Preview limitations/fallbacks:** Tooltips need hover; use the DOM test as fallback.

### Phase Record
- **Artifacts created/modified:** Text and Dimensions SVGs, `DesignToolIcon.tsx`, `DesignWorkspace.tsx` and tests, `AnnotationOverlay.tsx` and test, `index.css`
- **Decisions/deviations:** Scoped React Refresh lint suppression for the plan-required exported predicate. Rail diff and shortcut handler guardrails reviewed.
- **Next-phase context:** Phase 6 implements the Text tool inside `AnnotationLayer`.

## Phase 6: Text tool interaction
- **Status:** COMPLETED
- **Objective:** Full Text-tool flow: hover-snap to corner, edge or face, anchor click, leader follows cursor, label click, textarea, commit/cancel rules, editing, retyping and dragging of existing notes, each as one undoable command.
- **Dependencies:** Phases 3-5.

### Tasks
- [x] Create `src/components/design/scene/AnnotationPlacement.tsx` (hooks `useThree` for `camera`, `gl`, `scene`). It is mounted by `AnnotationLayer` when `activeTool === 'text' || activeTool === 'dimensions'` (and not editing a component). In this phase it implements only `activeTool === 'text'`. Read `VertexDrawing.tsx` and `VertexDrawing.test.tsx` first and copy exactly which native events (`pointerdown`, `pointerup`, `click`) are intercepted in the capture phase with `stopImmediatePropagation`, and how listeners are added and removed on `gl.domElement`.
  - State machine (React state): `{step:'idle'}`, `{step:'anchored', anchor: AnnotationAnchor}`, `{step:'typing', anchor, labelLocalUm: Vec3Um, draft: string, editId?: string}`; plus `hover?: AnchorHover` and `cursorWorldM?: [number,number,number]`.
  - Candidates: `designVertices(design)` in a `useMemo`. Surface hit: a helper `raycastSurface(event)` in the same file that builds a `Raycaster` from the cursor (`setFromCamera`), collects meshes from `scene.traverse` whose `userData.designTargetId` is a string, calls `intersectObjects(meshes, false)`, and returns `{objectId, localPointM: hit.object.worldToLocal(hit.point.clone()).toArray(), localNormal: hit.face?.normal.toArray()}` for the first hit, or undefined.
  - `pointermove` (passive, not stopped): in `idle` and `anchored`, compute `hover = pickAnnotationAnchor({... hit, vertexOnly:false})`. In `anchored`, also compute `cursorWorldM = cursorPointOnCameraPlane(camera, rect, x, y, anchorWorldM)`.
  - Click handling (capture-phase `click`): in `idle`, if `hover`/pick at the click position exists, go to `anchored`; otherwise call `onHint('Text · click a corner, edge, or face to anchor a note')`. In `anchored`, compute the cursor point with `cursorPointOnCameraPlane` through the anchor world point, convert with `worldUmToLocalUm` using the anchor target's frame to get `labelLocalUm`, and go to `typing` (a new note). In `typing`, canvas clicks never start a new note: in the capture-phase `pointerdown`, if the step is `typing` set `swallowNextClick.current = true`; the click handler returns early and clears the flag when it is set.
  - Rendering: in `idle` render the hover highlight (`point` as a small `Html` dot or `Line` for edge and face outline; colour `#e6a94e`, `depthTest={false}`). In `anchored` render `TextNoteGraphic` leader from the anchor to `cursorWorldM`. In `typing` render the leader to the label point and, at the label point, an `Html` containing the editor.
  - Editor `<textarea className="design-annotation-editor" autoFocus maxLength={500} rows={1} value={draft}>` rendered by a small component `AnnotationEditor` in this file.
    - `onKeyDown`: always `event.stopPropagation()`. `Enter` without Shift: `preventDefault()` and commit. `Escape`: `preventDefault()` and cancel. `Shift+Enter`: default newline.
    - `onBlur` commits. A `settled` ref guards against double settlement (commit then blur).
    - `onPointerDown` and `onClick`: `stopPropagation()`.
    - Commit for a new note: `text = draft.trim()`; if empty, discard (no command); otherwise `onCommand({type:'add-annotation', annotation:{id: crypto.randomUUID(), kind:'text', anchor, text, labelLocalUm}})`.
    - Commit for an edit (`editId` set): if `text` is unchanged, no command. If empty, `onCommand({type:'delete-annotation', annotationId: editId})`. Otherwise `onCommand({type:'update-annotation', annotation:{...existing, text}})`.
    - Cancel: close the editor and discard the draft; no command (a new note is discarded, an edit reverts).
    - After commit or cancel the step returns to `idle`.
  - `onHint` strings from Section 2 are emitted on each step change; an effect on `activeTool` emits the idle hint when the tool becomes `text`, and resets the state to `idle` when the tool changes. A window `keydown` listener cancels the current gesture on `Escape` when the event target is not editable.
  - When `editingDefinitionId` is set, `AnnotationLayer` does not mount `AnnotationPlacement` and emits `onHint('Exit component editing to annotate')` once on tool activation.
- [x] Edit `src/components/design/scene/AnnotationOverlay.tsx` so existing notes can be edited and moved when `annotationInteractive(activeTool,'text')` is true and `activeTool === 'text'`:
  - Note labels receive handlers. A pointer press starts a possible drag: record the start client position and register `window` `pointermove` and `pointerup` listeners (do NOT use pointer capture; jsdom lacks it). Moving more than 3 px starts a drag: compute `cursorPointOnCameraPlane` through the note's current label world point, convert to part-local with `worldUmToLocalUm` and show a live preview position. On pointer up after a drag, call `onCommand({type:'update-annotation', annotation:{...existing, labelLocalUm: newLocal}})`. On pointer up without a drag (a click), open the editor for that note: set the Text-tool state to `typing` with `editId` and `draft = existing.text`. A `dblclick` on the label does the same if not already editing.
  - To share the editing state between `AnnotationOverlay` and `AnnotationPlacement`, lift the Text-tool state into `AnnotationLayer` (a `useState` for `editing?: { annotationId: string; draft: string }`) and pass it down. The overlay does not draw the note's normal label while `editing` matches its id (the editor takes its place).
  - The overlay needs `onCommand`, `onHint`, `onSelectAnnotation` and the pointer helpers, so extend its props accordingly. Pass them from `AnnotationLayer`.
- [x] After commit, the plain label has a transparent background (it is `.design-annotation-label`, which has `background: transparent`), and the editor has `.design-annotation-editor { background:#fff; border:1px solid #24506a; border-radius:4px; font:12px/1.3 inherit; min-width:140px; resize:none; padding:2px 6px; pointer-events:auto; }`. Append this CSS to the end of `src/index.css`.
- [x] Create `src/components/design/scene/AnnotationPlacement.test.tsx`. Follow the `VertexDrawing.test.tsx` recipe (mock `@react-three/fiber` `useThree`/`useFrame` and drei `Line`; real `PerspectiveCamera`; `getBoundingClientRect` mocked to 800x600), and render `AnnotationLayer` with `activeTool='text'` on a design with one rectangle loose object. Cases:
  1. Click a corner, then click elsewhere: a textarea appears; type `Hello`, press Enter: `onCommand` is called once with `add-annotation` whose anchor element is the vertex, whose text is `Hello` and whose target is the loose object.
  2. Shift+Enter inserts a newline and does not commit; then Enter commits `a\nb`.
  3. Escape cancels: no command.
  4. Whitespace-only text with Enter: no command.
  5. Blur (click-out) commits once (assert exactly one command even after the following canvas click).
  6. A canvas click while typing does not start a second note.
  7. With an existing text annotation, clicking its label opens the editor with the text; editing and pressing Enter calls `update-annotation`; emptying it calls `delete-annotation`; Escape reverts without a command; committing unchanged text sends no command.
  8. Double-click on an existing label opens the editor.
  9. Dragging an existing label by more than 3 px calls `update-annotation` with a changed `labelLocalUm` and the same `anchor` and `text`; a movement under 3 px is treated as a click.
  10. Typing `n`, `d` or Delete in the textarea does not bubble to document handlers (add a `document` `keydown` spy and assert it is not called).
  11. An end-to-end command check: apply the emitted `add-annotation` command with `applyDesignCommand` and confirm `validateDesignDocument` returns no issues.

### Outcome & Evidence Ledger

| Outcome / acceptance criterion | Check | Verification method | Result / evidence |
| --- | --- | --- | --- |
| Text tool: anchor to corner (and edge/face via picker), place label, type, Enter commits; Shift+Enter newline; Escape cancels; empty discarded; click-out commits once | Mandatory | `npm run test -- src/components/design/scene/AnnotationPlacement.test.tsx` (cases 1-6) | PASS: AnnotationPlacement focused tests, 10 tests. |
| Existing notes: click or double-click retypes (one `update-annotation`), emptying deletes, drag moves | Mandatory | Same file, cases 7-9 | PASS: AnnotationPlacement focused tests, 10 tests. |
| Typing does not trigger shortcuts and key events do not escape the textarea | Mandatory | Same file, case 10, plus Phase 5 case 4 | PASS: AnnotationPlacement focused tests, 10 tests. |
| Emitted commands are valid against the schema | Mandatory | Same file, case 11 | PASS: AnnotationPlacement focused tests, 10 tests. |
| Whole suite, lint and build pass | Mandatory | `npm run test`, `npm run lint`, `npm run build` | PASS: final exact suite 67 files / 376 tests, lint and build. Earlier full runs had workflow/drag timeouts and a workflow pointer failure. |
| **Manual Validation:** in the browser, with the Text tool, hover highlights a corner/edge/face, the leader follows the cursor, the second click opens the textarea, text shows beside the line after commit, Ctrl+Z removes the note in one step, and double-click re-edits | Optional | **Manual Validation:** user attestation in browser (`npm run dev`); owner: user; may be deferred to Phase 8 | PASS: user attested completion of remaining browser validation on 2026-11-11. |

### Scope & Diff Guardrails
- `DesignScene.tsx` and `DesignWorkspace.tsx` receive no new edits in this phase (all logic lives in the new files). `git diff --stat` must show those two files unchanged relative to Phase 5.
- Text anchors are created through `pickAnnotationAnchor` with `vertexOnly: false`. Do not implement edge-midpoint or face-centre snapping (out of scope).
- Do not add a pointer-capture API call (jsdom lacks it).

### UI Validation
- **Viewport(s):** Desktop 1280x800; mobile 375x812 (pointer only).
- **Interactions/states:** Text tool idle hover on corner, edge and face; anchored with leader; typing; committed; selected; drag; retype; Escape.
- **Requested measurements:** Edge snap radius is 8 px; vertex radius is 12 px; the textarea is at most 240 px wide when text is long.
- **Preview limitations/fallbacks:** WebGL pointer interaction may not be drivable headlessly; rely on the `AnnotationPlacement` tests and the Manual Validation row.

### Phase Record
- **Artifacts created/modified:** `AnnotationPlacement.tsx` and test, `AnnotationLayer.tsx`, `AnnotationOverlay.tsx`, `index.css`
- **Decisions/deviations:** Review corrected edge/face outlines and capture-phase pointer sequence; focused coverage expanded to all planned interactions. No DesignScene or DesignWorkspace edits in this phase.
- **Next-phase context:** Phase 7 adds the `dimensions` branch to `AnnotationPlacement` and dimension dragging to the overlay.

## Phase 7: Dimensions tool interaction
- **Status:** COMPLETED
- **Objective:** Three-click dimension creation with live preview (vertices only), measure chosen by drag direction, and dragging existing dimensions with the Dimensions tool.
- **Dependencies:** Phases 2-6.

### Tasks
- [x] Edit `src/components/design/scene/AnnotationPlacement.tsx`: add the `activeTool === 'dimensions'` branch with state `{step:'idle'}`, `{step:'started', start: AnnotationAnchor}`, `{step:'ended', start, end}`, plus `hover` and `cursorWorldM`. The listeners are the same capture-phase set as the Text branch.
  - `pointermove`: in `idle`, `started` and `ended`, compute the vertex hover with `pickAnnotationAnchor({..., vertexOnly:true})` (no surface hit needed). In `started`, preview a straight `direct` line from the start world point to the hover vertex or the cursor camera-plane point, with the live value label from `dimensionValueUm`. In `ended`, compute `cursorWorldM` on the camera plane through the midpoint of start and end, then `drag = cursorWorld(um) - midpoint(um)`, `measure = chooseDimensionMeasure(startWorld, endWorld, drag)`, `offsetUm = dimensionOffsetFromDrag(startWorld, endWorld, measure, drag)`; render a `DimensionGraphic` preview with the live value.
  - Click 1 (`idle`): a vertex pick goes to `started`; no vertex gives `onHint('Dimensions · pick a corner of a part')`.
  - Click 2 (`started`): a vertex pick whose `target.kind`, `target.id` and `element.id` all equal the start's gives `onHint('Dimensions · pick a different corner')` and stays in `started`; any other vertex pick goes to `ended`; no vertex gives the pick-a-corner hint and stays. The synthetic ids `corner-...` and `${vertexId}@${extrusionId}` are allowed targets (decided; they resolve live or fall back to `localUm`).
  - Click 3 (`ended`): `onCommand({type:'add-annotation', annotation:{id: crypto.randomUUID(), kind:'dimension', start, end, measure, offsetUm}})` and return to `idle`.
  - Escape (window listener, non-editable target) cancels back to `idle`. Hints per step use the Section 2 strings.
  - A start and end on different parts are allowed.
- [x] Edit `src/components/design/scene/AnnotationOverlay.tsx`: when `activeTool === 'dimensions'`, dimension labels are interactive and draggable. A pointer press starts a possible drag (same window-listener approach as notes). While dragging more than 3 px, compute `drag = cursorPointOnCameraPlane(through the current dimension midpoint) - midpoint(startWorld, endWorld)`, recompute `measure` and `offsetUm` with the same pure functions, and render the live preview from those values. On pointer up after a drag, call `onCommand({type:'update-annotation', annotation:{...existing, measure, offsetUm}})`. A click without a drag does nothing in the Dimensions tool.
- [x] Add cases to `src/components/design/scene/AnnotationPlacement.test.tsx` (same recipe, `activeTool='dimensions'`, design with a rectangle loose object so corners are available, and a second design with two parts):
  1. Click vertex A, vertex B, then a point offset perpendicular to the segment: exactly one `add-annotation` with `kind:'dimension'`, `measure:'direct'`, and anchors with element type `vertex`.
  2. For a diagonal segment and a third click displaced along world X: `measure:'x'`; and for a drag along Y/Z the matching axis or `direct` per the pure function (assert against `chooseDimensionMeasure` results).
  3. Clicking away from any corner for click 1 or 2 emits the hint `Dimensions · pick a corner of a part` and no command.
  4. Clicking the same corner twice emits `Dimensions · pick a different corner` and no command.
  5. Escape after click 1 returns to idle with no command.
  6. A dimension across two different parts (loose A corner to loose B corner) is accepted and the emitted command validates with `validateDesignDocument`.
  7. Dragging an existing dimension label more than 3 px emits `update-annotation` with a new `offsetUm` (and a recomputed `measure`); dragging a text label while in the Dimensions tool does nothing (text labels are not interactive).
  8. After a `set-loose-geometry` that stretches the part, `resolveAnnotation(...).valueUm` changes (live update; reuse the Phase 2 fixture).

### Outcome & Evidence Ledger

| Outcome / acceptance criterion | Check | Verification method | Result / evidence |
| --- | --- | --- | --- |
| Dimension is created with 3 clicks; vertices only; value measure follows drag direction | Mandatory | `npm run test -- src/components/design/scene/AnnotationPlacement.test.tsx` (dimension cases 1-6) | PASS: AnnotationPlacement focused tests, 15 tests. |
| Dimensions tool drags existing dimensions as one undoable update; text labels are inert in this tool | Mandatory | Same file, case 7 | PASS: AnnotationPlacement focused tests, 15 tests. |
| Dimension value updates when the part is resized | Mandatory | Same file, case 8 | PASS: AnnotationPlacement focused tests, 15 tests. |
| Whole suite, lint and build pass | Mandatory | `npm run test`, `npm run lint`, `npm run build` | PASS: exact suite retry 67 files / 381 tests; lint and build passed. Initial suite had six workflow timing failures. |
| **Manual Validation:** in the browser, create a dimension on a board across its length, drag along the axis (axis length shown), drag perpendicular (straight-line distance shown), resize the board via Entity Info and confirm the value updates; toggle imperial/metric units in the project and confirm the unit changes | Optional | **Manual Validation:** user attestation in browser; owner: user; may be deferred to Phase 8 | PASS: user attested completion of remaining browser validation on 2026-11-11. |

### Scope & Diff Guardrails
- No edits to `DesignScene.tsx` or `DesignWorkspace.tsx` in this phase.
- Angle, radius and chained dimensions are not implemented. Do not add edge or face targets to the Dimensions tool (vertex only).

### UI Validation
- **Viewport(s):** Desktop 1280x800.
- **Interactions/states:** idle hover on a corner; after click 1 with a live straight-line preview; after click 2 with a drag preview; committed; drag of an existing dimension; orbit with a dimension visible.
- **Requested measurements:** The live value label matches the committed label for the same cursor position; the value shows `mm` with 1 decimal in metric and `in` with 3 decimals in imperial.
- **Preview limitations/fallbacks:** As Phase 6.

### Phase Record
- **Artifacts created/modified:** `AnnotationPlacement.tsx`, `AnnotationOverlay.tsx`, `AnnotationPlacement.test.tsx`
- **Decisions/deviations:** None. Phase scope restricted to three listed files; guardrails reviewed.
- **Next-phase context:** Phase 8 finishes Select, Delete and Eraser behaviour, the workspace keyboard wiring and the final checks.

## Phase 8: Select, Delete, Eraser, final integration and validation
- **Status:** COMPLETED
- **Objective:** Select-tool selection (with highlight), Delete/Backspace removal, Eraser removal, deselect on canvas click, full acceptance verification, and the repository-wide gates.
- **Dependencies:** Phases 1-7.

### Tasks
- [x] Edit `src/components/design/scene/AnnotationOverlay.tsx`: when `annotationInteractive(activeTool, kind)` is true and the tool is `select`, a click on a label calls `onSelectAnnotation(id)`; when the tool is `erase`, a click on a label calls `onCommand({type:'delete-annotation', annotationId: id})`. Labels `stopPropagation()` on click and pointer down so the canvas never sees the event. The erase and select clicks are plain `onClick` handlers on the label (leader and dimension lines are not clickable; decided).
- [x] Edit `src/components/design/scene/AnnotationLayer.tsx`: when `selectedAnnotationId` is set and the active tool is `select`, register a `pointerdown` listener (bubble phase, not stopping propagation) on `gl.domElement` that calls `onSelectAnnotation(undefined)` (a canvas press means the press was not on a label, which are separate DOM nodes). Remove it on cleanup. This needs `useThree` in `AnnotationLayer`, which already sits inside the Canvas.
- [x] Edit `src/components/design/DesignWorkspace.tsx`: in the keydown effect, in the Delete/Backspace branch, add before the existing instance/loose deletion logic: `if ((event.key === 'Delete' || event.key === 'Backspace') && selectedAnnotationId) { event.preventDefault(); run({ type: 'delete-annotation', annotationId: selectedAnnotationId }); setSelectedAnnotationId(undefined); return; }` (use the same key-check style as the existing line). It sits after the existing `editable(target)` early return, so it never fires while typing. If the effect has an explicit dependency array, add `selectedAnnotationId`. Escape keeps its current behaviour.
- [x] Update the viewport stub in `src/components/design/DesignWorkspace.test.tsx` (read the existing stub first): render buttons that call `props.annotations?.onSelectAnnotation('a1')` and `props.annotations?.onCommand({type:'delete-annotation', annotationId:'a1'})`. Add tests:
  1. Select annotation `a1`, press Delete: the design loses the annotation and the status shows the `Delete annotation` label with `unsaved changes`; Ctrl+Z (use the existing undo shortcut in this file) restores it.
  2. Selecting a part clears the annotation selection (pressing Delete then deletes the part, not the annotation). Selecting an annotation clears the part selection.
  3. Delete does nothing to a selected annotation while a textarea is focused.
  4. The eraser path (`onCommand` delete) removes the annotation.
- [x] Add overlay tests in `src/components/design/scene/AnnotationOverlay.test.tsx`: Select-tool click on a label calls `onSelectAnnotation(id)`; Erase-tool click on a label calls `onCommand` with `delete-annotation`; in Move and Rotate the label has no `is-interactive` class (click-through); the selected label has `is-selected`; a canvas `pointerdown` with a selection calls `onSelectAnnotation(undefined)`.
- [x] Add one integration test file `src/lib/planner/design/annotations.integration.test.ts`: starting from a project with one loose rectangle, apply in sequence through `commitSessionCommand`: `add-annotation` (text), `add-annotation` (dimension), `set-loose-transform` (move and rotate), `set-loose-geometry` (push-pull style extrusion id change), `make-component`, and finally `delete-instance`. After each step, assert the document validates (`validateDesignDocument`), the annotations resolve (until the last step), the world position of every annotation after the Make Component step equals that before it, and after the final delete `annotations` is empty. Then undo all steps (`undoSession`) and confirm the annotations are restored in order. Also assert `snapshotFingerprint` is the same after every annotation-only command.
- [x] Run the full gates and record outputs in the ledger: `npm run test`, `npm run lint`, `npm run build`. Fix any failures inside this plan's scope only.
- [x] Check the diff guardrails (see below) with `git diff --name-only` against the starting commit and record the result.
- [x] Update this plan file: set all phase statuses and the ledger Result/evidence cells with real command output; set `status`, `verification_status` and `current_phase` accurately. Never record a pass without evidence.

### Outcome & Evidence Ledger

| Outcome / acceptance criterion | Check | Verification method | Result / evidence |
| --- | --- | --- | --- |
| Select tool selects an annotation (highlight), Delete/Backspace removes it, undo restores | Mandatory | `npm run test -- src/components/design/DesignWorkspace.test.tsx src/components/design/scene/AnnotationOverlay.test.tsx` | PASS: focused workspace 37 tests, overlay/integration 6 tests, projection/snapshot 4 tests. |
| Eraser click removes an annotation | Mandatory | Same overlay test (Erase case) and workspace case 4 | PASS: focused workspace 37 tests, overlay/integration 6 tests, projection/snapshot 4 tests. |
| Move/Rotate and other tools click through labels | Mandatory | Same overlay test | PASS: focused workspace 37 tests, overlay/integration 6 tests, projection/snapshot 4 tests. |
| Full lifecycle: follow move/rotate/push-pull/Make Component, disappear with part, undo restores, save/reload keeps them, old projects load, fingerprint unchanged | Mandatory | `npm run test -- src/lib/planner/design/annotations.integration.test.ts` | PASS: focused workspace 37 tests, overlay/integration 6 tests, projection/snapshot 4 tests. |
| All tests pass | Mandatory | `npm run test` | PASS: independent final run, 68 files / 387 tests passed (63.41s). |
| Lint passes | Mandatory | `npm run lint` | PASS: independent final run, exit code 0 with no diagnostics. |
| Build passes | Mandatory | `npm run build` | PASS: independent final run, TypeScript and Vite build succeeded. Vite reported the non-failing `three.module` chunk size advisory (582.35 kB). |
| Forbidden files untouched | Mandatory | Review tracked and untracked changes against `src/routeTree.gen.ts`, `src/lib/planner/design/projection.ts`, `src/components/design/scene/model-snapshot.ts`, `docs/plans/3d-workspace/`; `git diff --check` | PASS: no forbidden paths modified or untracked; `git diff --check` emitted no whitespace errors. |
| Cutlist projection and thumbnails unchanged | Mandatory | `npm run test -- src/components/design/scene/snapshot-fingerprint.test.ts src/components/design/scene/snapshot-cache.test.ts src/components/design/DesignProjectionReview.test.tsx` | PASS: independent focused regression, 3 files / 4 tests passed (2.62s). |
| **Manual Validation:** in the browser (`npm run dev`) walk through the whole flow. (1) Rail shows the separator, Text and Dimensions with `N`/`D` tooltips. (2) Create a note on a corner, edge and face; type, commit, double-click to retype, drag to move. (3) Create a dimension (axis and straight-line by drag direction) and resize the part to see it update. (4) Move, rotate, scale, push-pull and Make Component the parts and check the annotations follow. (5) Delete a part and check its annotations vanish, then undo. (6) Select tool click and Delete; Eraser click; Move/Rotate click through labels. (7) Toggle Show annotations in the Display drawer. (8) Save, reload and reopen the project; open an older project. (9) Check the project thumbnail and cutlist look unchanged | Optional | **Manual Validation:** user attestation required; owner: user; not marked passed without the user's confirmation | PASS: user attested completion of remaining browser validation on 2026-11-11. |

### Scope & Diff Guardrails
- Do not edit `src/routeTree.gen.ts`, cutlist projection files (`src/lib/planner/design/projection.ts`), `model-snapshot.ts`, or `docs/plans/3d-workspace/` (including `3d-workspace-plan.md`, `phase-7-evidence.md`, `phase-1-contract.md`).
- `DesignScene.tsx`, `DesignWorkspace.tsx`, `DesignViewport.tsx`: `git diff` must show only additive wiring (props, imports, tools entries, Fragment wrap, Display toggle row, one keydown branch, state and effects). No file split and no reflow.
- Existing private `formatProjectLength` copies stay untouched.

### UI Validation
- **Viewport(s):** Desktop 1280x800; mobile 375x812.
- **Interactions/states:** Selected annotation highlight; Delete; Eraser; click-through with Move and Rotate; Display toggle; save and reload.
- **Requested measurements:** None beyond Phases 4-7.
- **Preview limitations/fallbacks:** WebGL interactions are verified by the user in the Manual Validation row; automated coverage is the unit and component tests above.

### Phase Record
- **Artifacts created/modified:** `AnnotationOverlay.tsx`, `AnnotationLayer.tsx`, `DesignWorkspace.tsx` and corresponding tests; `annotations.integration.test.ts`
- **Decisions/deviations:** Integration assertions expanded after review to verify resolution and document validity after each lifecycle and undo step. Guardrails reviewed.

## Phase 9: Browser-bug fixes
- **Status:** COMPLETED
- **Objective:** Fix browser annotation placement, editor, dimension labels, vertex markers and review findings. Execute F1–F5 sequentially with one Luna worker each.
- **Dependencies:** Phases 1–8.

### Tasks
- [x] F1: Shared centered AnnotationHtml with noninteractive wrapper style and real drei Html test.
- [x] F2: Robust focused text editor, empty draft handling, tool/part state reset and real textarea interaction tests.
- [x] F3: Correct dimension label cascade and preview/committed values with real Html and CSS guard tests.
- [x] F4: Shared demand-rendered vertex markers for hover and selected anchors, retaining edge/face highlights; test VertexDrawing and placement states.
- [x] F5: Guard drags versus clicks; clean drag listeners on cancel/unmount/tool changes; share editable helper; notify on Make Component annotation loss. Add focused tests.
- [x] Run final full suite, lint, build and independent final validation.

### Outcome & Evidence Ledger

| Outcome / acceptance criterion | Check | Verification method | Result / evidence |
| --- | --- | --- | --- |
| F1: centered Html wrappers pass through pointer events, including real drei Html | Mandatory | Focused AnnotationHtml and overlay/placement tests | PASS: 3 files / 21 tests; connected real drei portal asserts wrapper style and centering. Initial disconnected harness failed, corrected. |
| F2: focused editor accepts typing, commits once, handles blur and resets state | Mandatory | Focused placement/workspace tests with real textarea | PASS: 2 files / 56 tests; focused lint clean. Browser reproduction unavailable to worker; cause remains hypothesis. |
| F3: preview and committed dimension values render, with correct CSS | Mandatory | Real Html value tests and CSS cascade guard | PASS: 3 files / 25 tests; real drei portal transitions in both units and CSS source guard. Not browser-verified. |
| F4: hover and selected markers render for each state without intercepting events | Mandatory | Placement marker and VertexDrawing tests | PASS: 2 files / 38 tests; added anchored-hover case after review. Browser check pending user. |
| **Manual Validation:** Hover and click vertices to confirm hover and chosen markers remain visible. | Optional | **Manual Validation:** browser walkthrough; owner: user; attestation required | PASS: user attested completion on 2026-11-11. |
| F5: drag guard, listener cleanup, shared editable helper and loss notice | Mandatory | Focused placement, overlay, workspace and annotations tests | PASS: 5 files / 76 tests; final independent build also passed (see full-gates row). |
| Full suite, lint and build | Mandatory | `npm run test`, `npm run lint`, `npm run build` (independent sequential final run) | PASS: `npm run test` exited 0, 71 files / 403 tests passed (80.74s). `npm run lint` exited 0 with no diagnostics. `npm run build` exited 0; TypeScript and Vite build succeeded. Vite emitted the non-failing `three.module` chunk advisory (582.35 kB). |
| Independent Phase 9 implementation review | Mandatory | Inspect F1–F5 source, focused tests, event cleanup, pointercancel, state reset, marker states, Make Component loss notice, and phase guardrails | PASS: reviewed AnnotationHtml and connected Html tests; editor focus/blur/commit/reset paths; dimension preview and CSS regression guard; hover/selected VertexMarker and VertexDrawing tests; click-versus-drag handling, pointercancel and effect cleanup, shared editable-target helper, and Make Component loss notice with workspace test. No implementation defect identified. Browser behavior remains covered only by automated/component tests here. |
| Diff guardrails and whitespace | Mandatory | `git status --short`, tracked and untracked path review, `git diff --check`; inspect DesignScene/DesignWorkspace/DesignViewport changes | PASS: no changes (tracked or untracked) in `src/routeTree.gen.ts`, `src/lib/planner/design/projection.ts`, `src/components/design/scene/model-snapshot.ts`, or `docs/plans/3d-workspace/`. `git diff --check` emitted no errors. Scene/workspace/viewport edits are wiring and the Phase 9 editable-helper/loss-notice additions; no file split or unrelated reflow observed. |
| **Manual Validation:** (1) Dimensions: create one, see the live length while moving and the final length label, in both unit systems; (2) Text: click a corner, click to place, a text box appears focused, type, Enter commits and the text shows, Ctrl+Z removes it in one step; typing n/d/e never switches tools; (3) hovering vertices shows a marker and the chosen vertex stays marked; (4) no flicker when hovering near vertices; orbit/pan still work. | Optional | **Manual Validation:** browser walkthrough, owner: user; attestation required | PASS: user attested completion on 2026-11-11. |

### Scope & Diff Guardrails
- F1–F5 are strictly sequential; preserve all earlier phase evidence. No commits or worktrees. Do not edit `docs/plans/3d-workspace/`; shared scene/workspace edits remain minimal.
- The user attested the remaining browser rows on 2026-11-11; verification is PASSED.

### UI Validation
- **Viewport(s):** desktop and mobile as prior phases.
- **Interactions/states:** user browser walkthrough above; focus, live labels, vertex hover and selected markers, orbit/pan.
- **Requested measurements:** 14 px markers; drag threshold >4 px.
- **Preview limitations/fallbacks:** Real browser reproduction is recorded separately from DOM tests; remaining browser validation was attested by the user on 2026-11-11.

### Phase Record
- **Artifacts created/modified:** AnnotationHtml, DimensionHtml tests, VertexMarker, annotation placement/overlay/layer and tests, VertexDrawing and tests, shared editable helper, workspace and tests, CSS.
- **Decisions/deviations:** User follow-up, 2026-11-11: adds Phase 9 and requires PARTIAL verification pending browser attestation; prior validation is historical for affected behavior.

- **Follow-up browser diagnosis (2026-11-11):** Real browser showed dimension label DOM inside canvas fallback content with zero bounds. AnnotationHtml now explicitly portals to the canvas parent. Browser confirmed existing dimension, live dimension preview, focused editor and committed note; temporary note was undone and preview cancelled. Full suite: 71 files / 404 tests passed; lint and build passed. The user attested completing the remaining manual walkthrough on 2026-11-11.
