# 3D Workspace Phase 7 Evidence

**Status:** Partial; the mandatory target-browser, performance and actual assistive-technology gates remain open.
**Run date:** 2026-10-23 (local America/Toronto)
**Node:** v22.23.1 (meets repository's documented Node 22.22.2 minimum)
**Evidence scope:** Final repository checks and isolated smoke journeys; not a release certification.

## Repository checks

| Command | Result |
| --- | --- |
| `npm run test -- --reporter=dot` | PASS — 26 files, 121 tests. Vitest emitted a Three.js CommonJS deprecation warning. The jsdom setup includes a no-op `ResizeObserver` so the route workflow test stays focused on route composition; Canvas/WebGL behavior remains a browser check. |
| `npm run lint` (first run) | Initially failed on `src/components/ui/button.tsx:67`, where an unused-by-repository `buttonVariants` export violated `react-refresh/only-export-components`. The export was removed; Button behavior and internal use remain unchanged. |
| `npm run build` | PASS — TypeScript and Vite production build completed after final changes. Main JS chunk: 551.23 kB minified / 166.39 kB gzip; lazy `DesignViewport` chunk: 972.46 kB / 260.39 kB gzip. Vite emitted its >500 kB chunk advisory. |
| Final rerun after Phase 7 fixes | PASS — `npm run test -- --reporter=dot` passed 26 files / 121 tests; `npm run lint` completed without findings; `npm run build` passed. The targeted workflow suite passed 6/6 tests before the final full suite. |

## Isolated browser smoke journey

The default `http://127.0.0.1:5173` origin exposed an existing project and legacy recovery record. No project or recovery controls were touched there. Browser writes were instead performed only at `http://127.0.0.1:5174`, a separate origin with an initially empty local project store. The test-created `Untitled project` remains only in that isolated origin; see Process lifecycle below.

Browser automation was the Codex in-app browser. It rendered WebGL and exposed a semantic accessibility tree. Its exact browser version, operating-system hardware profile and GPU model were unavailable; it is not claimed as Windows Chrome or Edge evidence. The captured app viewport was approximately 1265×712; requested target viewport, browser zoom and theme matrix were not run.

Observed workflow:

1. Empty dashboard showed no projects; creating a test cutlist project opened Cutlist. Opening its Design tab preserved the model-empty state until a board was created.
2. Created a board, selected it from the semantic Selection list, and observed Entity Info with component state and exact dimensions. Reload restored the board from local storage and showed the saved project state.
3. Before correction, the board filled almost the entire viewport because the camera used `zoom: 85`. Changed the camera's initial zoom to `1`; after reload, the board was framed and grid extent was visible. This is a browser-discovered defect and focused fix in `src/components/design/scene/DesignScene.tsx`.
4. Opened searchable Keyboard shortcuts; focus initially moved to its search field and returned to the trigger on Close. Typing `r` in the search input filtered help without changing the active Rectangle tool. Shift+F10 opened the workspace action menu with focus on its first item; Escape dismissed it and restored focus to the viewport.
5. Added a project-owned Canadian `1×6` stock entry, assigned its material to the board, and opened Review cutlist changes. The preview exposed the stock cross-section mismatch. Chose “Apply design values”; the UI acknowledged “Reviewed cutlist changes saved with their design links.” Reopening Cutlist showed the generated Board row and an explicit “does not fit available stock length or cross-section” warning.

These interactions are smoke evidence for this isolated in-app-browser session only. No screenshots are retained as artifacts. No actual screen reader or assistive-technology application was used.

## Unrun mandatory release evidence

- Windows Chrome and Edge versions/hardware, mouse and keyboard matrix, requested 1440×900 / 1024×768 / 390×844 viewports, 200% zoom, both themes and reduced-motion behavior.
- Multi-tab same-project conflicts, legacy-key writer during/after cutover, interrupted migration/save/reload, storage denial/quota and recovery export/import adversarial flows.
- Invalid/oversize import and future schema-version browser flows; WebGL context loss/restore; interrupted pointer operations and stale cutlist apply in browser.
- Large-at-supported-limit fixture timing for load/save/projection/drag, hidden-tab work, repeated mount/unmount GPU resource counts, and calibrated budgets. The plan has no owner-approved numeric budgets/hardware fixture yet; no performance claim is made.
- Actual keyboard/screen-reader walkthrough, including selection/editing, camera alternatives, recovery, and conflict review. Semantic DOM inspection is not a substitute for assistive-technology validation.
- Full portable create/review/optimize/export/import-as-copy/restore/reopen identity comparison. The smoke flow applied a generated cutlist row but did not export/import or restore it.

## Process lifecycle

The Vite preview processes were started on ports 5173 and 5174 for inspection. Port 5173 exposed pre-existing local data and was not modified. Port 5174 was isolated for the browser workflow and contains the test project/material/board created during it. Both Vite processes were stopped; a listener check confirmed neither port is active. The isolated test project remains in the 5174 origin because project deletion is permanent in the app and no restore/trash path was available. It is not in the user's normal 5173 origin. Do not treat or delete user projects as test artifacts.
