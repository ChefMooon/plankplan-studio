---
title: "PlankPlan Studio MVP - Implementation Plan"
plan_profile: FULL
status: COMPLETE
verification_status: COMPLETE_WITH_GAPS
current_phase: 3 / 3
created: 2026-10-22
last_updated: 2026-10-22
---

# Overall Plan Completion Status

* **Total Phases Completed:** 3 / 3
* **Summary of Outcome:** The MVP workflow now includes browser-local project editing, validated linear and sheet plans, mixed-material results, shop outputs, and the Design shell. Automated acceptance checks passed. Entry-time usability, actual browser print preview, cross-browser behavior, and deployed Cloudflare behavior remain explicitly unverified.

# Specification & Overview

### 1. Scope & Objective
- **Source:** [`docs/plankplan-studio-product-spec.md`](../../plankplan-studio-product-spec.md), Draft v0.12.
- **Visual source:** [`docs/DESIGN.md`](../../DESIGN.md); the current Stock Mix brand asset is `src/assets/plankplan-studio-stock-mix-v02.svg` (v01 is preserved).
- **Roadmap:** [`docs/plankplan-studio-roadmap.md`](../../plankplan-studio-roadmap.md) tracks post-MVP releases and future ideas separately.
- **Goal:** Deliver a browser-based woodworking planner that produces cost-minimizing, validated cut plans and usable shop outputs.
- **In-Scope:** MVP section 5.1 plus the basic 3D feature page foundation: local projects and parts, typed materials and manually entered stock prices, imperial/metric units, linear and sheet optimization, mixed-material results, warnings, cut/shopping lists, diagrams, offcuts, CSV/JSON/print exports, local storage, mobile-friendly results, a home page that exposes both product functions, and a navigable 3D workspace shell.
- **Out-of-Scope:** Functional 3D modeling/rendering or model-to-parts generation (spec 5.4 / roadmap Phase 2); alternative-material choice optimization and comparison (spec 5.2); standalone PDF generation (spec 5.3; browser print-to-PDF remains MVP); accounts and cloud sync (spec 5.5); tiers and billing (spec 5.6); other future ideas in spec 5.7.

### 2. Technical Constraints & Architecture
- The source specifies a client-side SPA, custom TypeScript optimizer with no runtime dependencies, Web Worker execution, integer micrometers and cents, and independent plan validation.
- The MVP uses the current Vite + React + TanStack Router SPA and ships as a static site on Cloudflare Pages. Keep project data and optimization in the browser; no backend is in MVP scope. Revisit Workers/D1 only if later account/database features require them.
- Board-foot stock pricing is in MVP, using entered width, thickness, and length to calculate purchase cost. A generic rough-lumber usable-length percentage and cross-section/yield guarantee are out of scope because linear parts currently specify length only; explicit end squaring is handled through project trim.
- Exact 1D optimization is a test/benchmark tool in the source, not a user-facing "proven optimal" feature. Include small-case exact benchmarks in MVP validation, not a badge or product mode.

### 3. Roles & Delegation

| Role | Agent or session | Model | Responsibility |
| --- | --- | --- | --- |
| Planner | Not assigned | Not assigned | Maintain this plan and MVP scope. |
| Implementer | Not assigned | Not assigned | Implement approved phase work. |
| Validator | Not assigned | Not assigned | Verify phase outcomes against their ledgers. |

### 4. Decisions & Change Log

| Decision | Source and date | Supersedes | Affected scope or acceptance criteria |
| --- | --- | --- | --- |
| Keep implementation sequencing and verification for MVP here; track post-MVP and future capabilities in a separate roadmap. | User direction, 2026-10-22 | Earlier five-phase plan that included post-MVP releases | This plan now covers product-spec section 5.1 plus the agreed page foundation. |
| Browser print-to-PDF is MVP; a generated downloadable PDF is post-MVP. | Feature spec sections 5.1 and 5.3, 2026-10-22 | None | MVP export acceptance includes print CSS/browser Save as PDF, not a custom PDF writer. |
| MVP includes the information architecture and navigable page shell for both product functions; the 3D page is an honest nonfunctional scaffold until roadmap Phase 2. | User direction, 2026-10-22 | Earlier MVP boundary that deferred all 3D surface work | Add two-function home entry and project-level Design/Cutlist navigation; do not add modeling behavior to MVP. |
| The initial page is a project dashboard with entry actions for the 3D workspace and cutlist; each project has Design/Cutlist navigation. | User direction, 2026-10-22 | None | Phase 1 UI structure and interaction checks. |
| MVP is a static Cloudflare SPA; add backend services only for later account/database needs. | User direction, 2026-10-22 | Earlier unconfirmed deployment assumption | Phase 1 remains client-side/local-only; later Workers/D1 work requires its own compatibility review. |
| Keep board-foot pricing but defer generic rough-lumber yield/waste percentages until the model can represent the dimensions and yield being reduced. | Product decision, 2026-10-22 | Earlier proposal to reduce usable length by a percentage | Phase 1 tests only supported price math and explicit trim; do not apply a hidden yield factor. |
| Use a precision-focused workshop visual direction with clear grids/readable numbers and restrained wood accents. | User direction, 2026-10-22 | None | MVP UI styling and mockup. |
| Use the blue/navy v02 Stock Mix mark as the initial app icon, preserving v01, and explore a blueprint-blue interface palette. | User direction, 2026-10-22 | Earlier brown-led icon palette | Apply the candidate in `docs/DESIGN.md` to MVP screens and mockup; keep the source icon versioned and editable. Final interface palette remains under review. |
| Users enter and maintain all stock prices manually; automatic lookup and store scraping are not planned. | User direction, 2026-10-22 | None | Provide manual price fields and user-maintained price data; do not add network integrations or scraping for prices. |
| Keep functional 3D modeling out of the MVP; restore and maintain its Phase 2 inputs separately. | User direction, 2026-10-22 | None | MVP scope and completed evidence remain unchanged. Use the 3D workspace guide and initial-features proposal as inputs to a separate Phase 2 plan. |
| d16-design-storage: embed optional independently versioned design data in Project JSON, bump project schema v1 to v2, and migrate v1 projects with all existing data preserved and no design field. | Owner choice, 2026-10-22 | Separate project-scoped storage | Embedding keeps design and cutlist backup/import atomic; requires v1-to-v2 migration, v1 import support, and project/design validation. High confidence from existing whole-project JSON storage. |
| d17-freeform-kernel: start with planar edges/faces and simple Push/Pull solids; exclude booleans, holes, and general self-intersection. Store editable profiles and derive meshes. | Owner choice, 2026-10-22 | Full editable-solid/CSG engine | Bounds topology and dependency scope to the requested initial tools; reject unsupported operations without changing valid model data. High confidence from requested tools and Three.js scene direction. |
| d18-cross-section-contract: add optional width/thickness constraints to linear parts; require both on generated board parts and validate them against actual stock dimensions. | Owner choice, 2026-10-22 | Keep length-only validation; mark fit unverified; or block sync | Additive optional constraints preserve legacy/manual length-only parts while enabling fit validation for model-linked boards; requires schema migration and optimizer/validator updates. High confidence from existing stock width/thickness fields and identified fit gap. |
| d19-cutlist-link-location: store component-to-Part links and last-applied projection snapshots inside the embedded design document, keyed to generated Part IDs. | Owner choice, 2026-10-22 | Store provenance on generated Parts or defer the exact shape | Keeps manual Part records free of model metadata and closes the persisted-link schema choice before Phase 2 planning. |
| d20-phase2-material-identity: use the existing single selected `materialId` as the material part of the model-to-cutlist aggregation key; defer alternative material-choice sets. | Automatically resolved, 2026-10-22 | Aggregate on choice-set identity or add multiple material choices to model projection | The current `Part` model has one `materialId`; alternatives are a deferred product capability. This preserves current optimizer semantics. High confidence from `src/lib/planner/model.ts` and product-spec scope. |

## Planning Assumptions and Deferred Decisions

The items below do not block starting MVP implementation; resolve each before planning the later phase that depends on it. Use the current blueprint-blue candidate in `docs/DESIGN.md` as the MVP interface starting point and refine it during screen implementation.
- The feature spec is a proposed target, not evidence that these capabilities already exist.
- The current linear model validates part length only. Board width/thickness remain pricing inputs for per-board-foot stock, not a guarantee that rough material can yield every part cross-section.
- Better Auth/Workers/D1 compatibility remains a Phase 3 question and does not block the static MVP.
- Roadmap items are not implementation commitments; their order and release targets remain undecided unless explicitly stated in the roadmap.
- The MVP 3D workspace shell reserves the future design surface but does not imply a functioning Three.js scene, model editing, or model-to-cutlist conversion.
- Phase 2 design guidance is maintained in [`docs/plankplan-studio-3d-workspace-guide.md`](../../plankplan-studio-3d-workspace-guide.md) and [`docs/plankplan-studio-3d-workspace-initial-features.md`](../../plankplan-studio-3d-workspace-initial-features.md). Major owner decisions are recorded there and here. Do not extend this completed MVP plan with 3D implementation tasks; prepare a separate Phase 2 plan. That plan must include v1-to-v2 migration/round-trip/recovery tests, topology operation validation, cross-section fit tests, and cutlist conflict handling.

---

# Execution Plan & Handoffs

## Phase 1: Data, Optimizer Foundations, and Linear Workflow
- **Status:** COMPLETE
- **Objective:** Establish project/material/part foundations, unit handling, a deterministic validated 1D optimizer, and a usable local linear-project workflow.
- **Exit Deliverable:** Validated linear planning and local persistence/results that provide the stable contracts needed by sheet optimization.

### Tasks
- [ ] Keep the MVP on the current Vite/React/TanStack Router client-side SPA and verify it can be deployed as a static Cloudflare site; record any platform-specific build configuration required.
- [ ] Define project, material, stock, and part models; versioned JSON import/export; unit and fraction parsing; integer micrometer and cent conversions.
- [ ] Build an independent plan validator and optimizer test harness before relying on generated plans.
- [ ] Implement 1D cost optimization, baseline packing, right-sizing and bounded search, kerf/trim, per-piece and board-foot pricing, owned stock, quantity limits, and warnings.
- [ ] Implement board-foot pricing from entered stock dimensions without an automatic rough-lumber yield or length-discount factor; use explicit project trim for end squaring.
- [ ] Let users enter and update material/stock prices manually; do not add automatic lookup, store scraping, or price-fetching integrations.
- [ ] Build project/parts/material editing, imperial and metric presets, local storage, and linear cut/shopping lists, SVG diagrams, cost summaries, and offcuts.
- [ ] Build the app home with the project list and two clear entry actions: open the 3D workspace preview and start a usable cutlist project; show each function's MVP availability before entry.
- [ ] Add project-level Design and Cutlist navigation plus an accessible 3D workspace shell with a stable viewport placeholder and reserved tool/property areas. Keep the placeholder explicit; do not imply that geometry editing or Three.js rendering works in MVP.

### Outcome & Evidence Ledger

| Outcome / acceptance criterion | Check | Verification method | Result / evidence |
| --- | --- | --- | --- |
| Project inputs use documented units and money representation and serialize with a schema version. | Mandatory | Unit and serialization tests for imperial/metric conversion, fractions, rounding boundaries, cents, import/export, and versioned project data. | PASS — integer µm/cents model, schema-v1 validation/import/export, fractional-inch and metric conversion tests; `npm run test` (8 files, 28 tests). |
| Every emitted linear plan accounts for each part once and respects stock, kerf, trim, quantities, owned stock, and price. | Mandatory | Independent validator tests plus adversarial and property-based fixtures. | PASS — independent validator covers material assignment, part quantities, stock capacity, kerf/trim, owned quantities, purchase limits, and cost; adversarial boundary tests pass. Sheet materials are excluded from the linear engine with an explicit Phase 2 warning. |
| Linear plans are no more expensive than the specified naive baseline on representative fixtures. | Mandatory | Deterministic benchmark fixtures; record heuristic gap against exact mode on small cases. | PASS, LIMITED FIXTURE SET — exact small-case oracle and naive one-board-per-part comparison pass on the included deterministic fixture. Broader real-project quality comparison remains for Phase 3. |
| A user can create, edit, duplicate, delete, save, reopen, and inspect a local linear project. | Mandatory | UI and persistence tests for required project and results flows. | PASS — workflow tests cover create/edit/save/reopen/duplicate/delete/import and plan outputs; localStorage remains browser-only. |
| A user can reach both product functions from the home page and navigate between a project's Design and Cutlist areas. | Mandatory | UI tests for both entry actions, project navigation, keyboard operation, visible availability state, and return paths. | PASS — dashboard entry, project Design/Cutlist route, return navigation, and standalone preview persistence boundary covered by workflow tests. Keyboard/screen-reader audit remains for Phase 3. |
| MVP screens follow the Stock Mix visual direction and remain legible at target widths. | Mandatory | Review the implemented dashboard and project shell against [`docs/DESIGN.md`](../../DESIGN.md) at wide and narrow viewport sizes; verify focus and status cues. | PASS, BROWSER REVIEW — dashboard and workspace reviewed at desktop and 390×844; no horizontal clipping observed. Formal contrast, screen-reader, and 400% zoom checks remain for Phase 3. |
| Users can manually enter and update prices, and the product performs no automatic price lookup or store scraping. | Mandatory | Review the material/stock editing flow and repository integrations for manual price entry only. | PASS — manual stock price fields; unpriced stock cannot be purchased by the optimizer and has an explicit warning. No price-fetching integration added. |
| The MVP 3D workspace is a stable, understandable scaffold that does not claim unavailable modeling behavior. | Mandatory | UI review of empty, narrow, and wide viewport states; verify the placeholder and future-control regions remain clear without visual clipping or dead controls. | PASS, BROWSER REVIEW — standalone and project Design placeholders label Phase 2 availability and link to Cutlist; no inactive modeling controls are presented. |

### UI Validation
- **Viewport(s):** Desktop/tablet editing; phone results.
- **Interactions/states:** Home page with both function entry points; project Design/Cutlist navigation; 3D workspace empty state; create/edit parts and materials, change units, save/reopen, inspect warnings and results; editing uses the specified phone card fallback.
- **Requested measurements:** Assess source targets of under five minutes for project entry and under 200 ms for an initial valid plan / about two seconds for a final result on projects up to about 100 parts. Record fixture and environment with results.
- **Preview limitations/fallbacks:** Browser preview verifies renderer behavior; it does not establish deployed hosting behavior.

### Phase Record
- **Artifacts created/modified:** `src/lib/planner/` integer-unit project model, schema-v1 import/export, board-foot pricing, independent validator, linear optimizer, benchmark tests, and local storage; dashboard, cutlist editor/results, project Design shell, and standalone preview routes; Stock Mix favicon and blueprint styles; Cloudflare Pages SPA fallback at `public/_redirects`.
- **Decisions/deviations:** Phase 1 supports linear optimization only. Sheet models can be stored and edited, but are explicitly excluded from the linear optimizer until Phase 2. Browser build plus `_redirects` configuration is the available static-host evidence; no deployment was performed. Board-foot calculation uses entered dimensions and rate without a yield adjustment.
- **Validation:** `npm run test` passed (8 files, 28 tests); `npm run build` passed; targeted ESLint passed on changed implementation files; full `npm run lint` remains blocked by the existing unrelated `src/components/ui/button.tsx:67` rule violation; `git diff --check` passed. The deterministic 100-part benchmark measured 10.3 ms in the recorded agent run. Cloudflare deployment, full keyboard/screen-reader/400% zoom, and broad benchmark/property-based coverage remain unverified and carry into Phase 3.
- **Next-phase context:** Preserve the project/optimizer contract and independent validator for sheet layouts. Keep local storage and manual prices; do not add backend services or 3D modeling.

## Phase 2: Sheet Optimization and Mixed-Material Projects
- **Status:** COMPLETE
- **Objective:** Add guillotine sheet optimization and combine independent material plans into a coherent mixed-project result.
- **Dependencies:** Phase 1 project model, optimizer interface, local persistence, and independent validation approach.
- **Exit Deliverable:** Valid mixed linear/sheet plans with complete shop outputs, ready for MVP release validation.

### Tasks
- [ ] Implement 2D guillotine packing, kerf-aware cut trees, rotation/grain constraints, strip-only mode, sheet right-sizing, and sheet offcut reporting.
- [ ] Extend independent validation to placement bounds, overlap, cut-tree feasibility, grain locks, stock limits, and cost totals.
- [ ] Combine material-specific plans, warnings, quantities, costs, waste summaries, and display-only tax.
- [ ] Add CSV export, project JSON backup import/export, print-friendly CSS/browser Save as PDF, and mobile-readable results.
- [ ] Verify common imperial/metric board and sheet presets and real-project fixtures.

### Outcome & Evidence Ledger

| Outcome / acceptance criterion | Check | Verification method | Result / evidence |
| --- | --- | --- | --- |
| Every sheet layout is in bounds, non-overlapping, grain compliant, and represented by a feasible guillotine cut order. | Mandatory | Independent validator tests over edge cases and generated fixtures. | PASS, FIXTURE SET — independent tree/placement validator and tests cover overlap, grain-lock rotation, rotation-only fits, full-length strip cuts, bounds, stock limits, and repeat quantities; full suite passes. Broader randomized/property fixtures remain for Phase 3. |
| Mixed projects produce correct per-material plans, purchase quantities, warnings, and combined totals. | Mandatory | Unit tests for mixed materials, owned stock, quantity limits, missing prices, tax display, and invalid-fit cases. | PASS, CORE CASES — combined linear/sheet totals and display-only tax tested; engine-level tests cover owned stock, purchase caps, missing prices and invalid fits. Additional full mixed-project adversarial cases remain for Phase 3. |
| CSV, JSON, print output, and phone results preserve information needed in the shop. | Mandatory | Export assertions and UI review at desktop and phone widths, including browser print preview. | PASS, INTERACTION COVERAGE — quoted CSV contents, versioned JSON replacement flow, CSV download action, and browser print invocation are tested; print CSS keeps results visible. Phone and browser print preview review remains for Phase 3. |
| The 1D and 2D optimizer outputs are valid and comparable against naive baselines. | Mandatory | Deterministic fixture suite; exact 1D mode used only for small-case benchmark measurement. | PASS, LIMITED FIXTURES — linear exact/naive and sheet naive baselines pass included fixtures; adversarial sheet fixture compares $15 larger-sheet plan against $20 one-sheet-per-part baseline. General optimality is not claimed. |

### UI Validation
- **Viewport(s):** Desktop/tablet editing and phone results.
- **Interactions/states:** Sheet rotation and grain lock, cheapest/simplest layout setting, mixed-material totals, warnings, exports, print flow.
- **Requested measurements:** Confirm result tables and diagrams do not overflow target phone widths; record optimizer timing for representative projects.
- **Preview limitations/fallbacks:** Browser print review cannot establish output across all browsers and printers.

### Phase Record
- **Artifacts created/modified:** `src/lib/planner/sheet.ts` guillotine/strip engines and independent validator; mixed-plan aggregation; sheet data/presets, layout controls, diagrams and cut order; CSV export and browser print styling; import collision/replacement handling; test fixtures in planner and workflow suites.
- **Decisions/deviations:** Cheapest compares strip and guillotine candidates; Simplest cuts uses true strip-only layouts. Heuristic stock choice is judged against deterministic naive fixtures but does not claim global optimality. 3D workspace implementation and documentation remain out of scope.
- **Validation:** `npm run test` passed (12 files, 40 tests); `npm run build` passed; targeted ESLint passed; `git diff --check` passed. Full `npm run lint` reports only the existing unrelated `src/components/ui/button.tsx:67` fast-refresh error. Browser print preview and broad phone/real-project review remain for Phase 3.
- **Next-phase context:** Phase 3 completes MVP acceptance and release readiness; no post-MVP features enter the MVP scope by default.

## Phase 3: MVP Quality, Performance, and Release Readiness
- **Status:** COMPLETE_WITH_GAPS
- **Objective:** Close MVP validation against the spec's success criteria and resolve functional or usability gaps in the agreed MVP scope.
- **Dependencies:** Phases 1 and 2.

### Tasks
- [ ] Complete warning and failure-path coverage, including parts that exceed available stock, missing prices, and materials with no stock options.
- [ ] Exercise complete real-project workflows and compare plans with naive baselines; record exact 1D gaps on small cases.
- [ ] Measure optimizer responsiveness and result usability against the source's stated targets; fix only in-scope issues.
- [ ] Confirm optimizer runtime dependencies remain zero and every displayed plan passes the independent validator.
- [ ] Review MVP acceptance against section 5.1 and success criteria in section 10 of the product spec; record evidence and any unmet criteria.

### Outcome & Evidence Ledger

| Outcome / acceptance criterion | Check | Verification method | Result / evidence |
| --- | --- | --- | --- |
| MVP scope includes the two-function app shell and 3D page scaffold, without pulling in functional modeling, alternative materials, custom PDF generation, accounts, tiers, or other future ideas. | Mandatory | Review changed behavior and artifacts against section 5.1, this plan's added UI foundation, and its scope boundaries. | PASS — implementation stays client-side/local with manual price entry, print CSS, and an explicit nonfunctional Design shell. No backend, functional modeling, alternative-material optimizer, custom PDF writer, accounts, or tiers were added. |
| Every displayed plan passes independent validation and every representative plan is no more expensive than its naive baseline. | Mandatory | Required automated suites and documented fixture results. | PASS, INCLUDED FIXTURES — 43 tests pass; entry-bench mixed linear/sheet plan passes both validators and costs CAD $122 vs CAD $348 naive. Small 1D exact case is CAD $52 vs CAD $52 heuristic (0¢ gap). This is fixture evidence, not a global optimality guarantee. |
| MVP success criteria have explicit measured or reviewed evidence, with gaps visible. | Mandatory | Review each criterion in product-spec section 10 against benchmark output, tests, and UI evidence. | COMPLETE WITH GAPS — 100-part linear run measured 10.8 ms; responsive browser review found and fixed the 900px overflow, then confirmed no document overflow and tabs within bounds at 900px and 390px. Entry time under five minutes was not measured; actual print preview/printer variations, screen-reader/400% zoom, broad randomized optimizer quality, and deployed Cloudflare behavior remain unverified. |

### UI Validation
- **Viewport(s):** Desktop and tablet editing; phone results and print preview.
- **Interactions/states:** Complete project entry-to-print workflow, empty/invalid states, optimizer warnings, export and recovery flows.
- **Requested measurements:** Confirm project-entry and optimizer timing targets with documented test conditions; check shop output legibility at phone width and print.
- **Preview limitations/fallbacks:** Clearly separate automated/browser evidence from user-performed shop usability and cross-browser printer checks.

### Phase Record
- **Artifacts created/modified:** Added `src/lib/planner/release-readiness.test.ts`, strengthened the 100-part benchmark to verify output, added sheet-specific oversized-part warnings, and fixed responsive workspace geometry in `src/index.css` for tablet and phone widths.
- **Decisions/deviations:** Kept optimizer validation deterministic and test-local. The plan completed with explicit unverified release evidence rather than claiming external deployment or universal shop/browser acceptance.
- **Validation:** `npm run test -- --maxWorkers=2` passed (13 files, 43 tests); `npm run build` passed; targeted ESLint passed; `git diff --check` passed. `npm run lint` fails only on the existing `src/components/ui/button.tsx:67` fast-refresh rule violation. Visual review at 900px and 390px confirmed no horizontal document overflow and project tabs remain within the toolbar. Cloudflare Pages deployment and actual print preview were not performed.
