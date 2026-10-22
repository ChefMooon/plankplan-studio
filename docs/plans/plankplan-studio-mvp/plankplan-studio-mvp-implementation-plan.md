---
title: "PlankPlan Studio MVP - Implementation Plan"
plan_profile: FULL
status: DRAFT
verification_status: NOT_RUN
current_phase: 1 / 3
created: 2026-10-22
last_updated: 2026-10-22
---

# Overall Plan Completion Status

* **Total Phases Completed:** 0 / 3
* **Summary of Outcome:** Draft execution sequence for MVP section 5.1 plus the agreed app/page foundation in the PlankPlan Studio product specification. No implementation or validation has been performed under this plan.

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

## Planning Assumptions and Deferred Decisions

The items below do not block starting MVP implementation; resolve each before planning the later phase that depends on it. Use the current blueprint-blue candidate in `docs/DESIGN.md` as the MVP interface starting point and refine it during screen implementation.
- The feature spec is a proposed target, not evidence that these capabilities already exist.
- The current linear model validates part length only. Board width/thickness remain pricing inputs for per-board-foot stock, not a guarantee that rough material can yield every part cross-section.
- Better Auth/Workers/D1 compatibility remains a Phase 3 question and does not block the static MVP.
- Roadmap items are not implementation commitments; their order and release targets remain undecided unless explicitly stated in the roadmap.
- The MVP 3D workspace shell reserves the future design surface but does not imply a functioning Three.js scene, model editing, or model-to-cutlist conversion.

---

# Execution Plan & Handoffs

## Phase 1: Data, Optimizer Foundations, and Linear Workflow
- **Status:** NOT_STARTED
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
| Project inputs use documented units and money representation and serialize with a schema version. | Mandatory | Unit and serialization tests for imperial/metric conversion, fractions, rounding boundaries, cents, import/export, and versioned project data. | PENDING |
| Every emitted linear plan accounts for each part once and respects stock, kerf, trim, quantities, owned stock, and price. | Mandatory | Independent validator tests plus adversarial and property-based fixtures. | PENDING |
| Linear plans are no more expensive than the specified naive baseline on representative fixtures. | Mandatory | Deterministic benchmark fixtures; record heuristic gap against exact mode on small cases. | PENDING |
| A user can create, edit, duplicate, delete, save, reopen, and inspect a local linear project. | Mandatory | UI and persistence tests for required project and results flows. | PENDING |
| A user can reach both product functions from the home page and navigate between a project's Design and Cutlist areas. | Mandatory | UI tests for both entry actions, project navigation, keyboard operation, visible availability state, and return paths. | PENDING |
| MVP screens follow the Stock Mix visual direction and remain legible at target widths. | Mandatory | Review the implemented dashboard and project shell against [`docs/DESIGN.md`](../../DESIGN.md) at wide and narrow viewport sizes; verify focus and status cues. | PENDING |
| Users can manually enter and update prices, and the product performs no automatic price lookup or store scraping. | Mandatory | Review the material/stock editing flow and repository integrations for manual price entry only. | PENDING |
| The MVP 3D workspace is a stable, understandable scaffold that does not claim unavailable modeling behavior. | Mandatory | UI review of empty, narrow, and wide viewport states; verify the placeholder and future-control regions remain clear without visual clipping or dead controls. | PENDING |

### UI Validation
- **Viewport(s):** Desktop/tablet editing; phone results.
- **Interactions/states:** Home page with both function entry points; project Design/Cutlist navigation; 3D workspace empty state; create/edit parts and materials, change units, save/reopen, inspect warnings and results; editing uses the specified phone card fallback.
- **Requested measurements:** Assess source targets of under five minutes for project entry and under 200 ms for an initial valid plan / about two seconds for a final result on projects up to about 100 parts. Record fixture and environment with results.
- **Preview limitations/fallbacks:** Browser preview verifies renderer behavior; it does not establish deployed hosting behavior.

### Phase Record
- **Artifacts created/modified:** Pending.
- **Decisions/deviations:** Record static Cloudflare deployment setup and verify board-foot pricing applies no hidden yield adjustment.
- **Next-phase context:** Preserve the project/optimizer contract and independent validator for sheet layouts.

## Phase 2: Sheet Optimization and Mixed-Material Projects
- **Status:** NOT_STARTED
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
| Every sheet layout is in bounds, non-overlapping, grain compliant, and represented by a feasible guillotine cut order. | Mandatory | Independent validator tests over edge cases and generated fixtures. | PENDING |
| Mixed projects produce correct per-material plans, purchase quantities, warnings, and combined totals. | Mandatory | Unit tests for mixed materials, owned stock, quantity limits, missing prices, tax display, and invalid-fit cases. | PENDING |
| CSV, JSON, print output, and phone results preserve information needed in the shop. | Mandatory | Export assertions and UI review at desktop and phone widths, including browser print preview. | PENDING |
| The 1D and 2D optimizer outputs are valid and comparable against naive baselines. | Mandatory | Deterministic fixture suite; exact 1D mode used only for small-case benchmark measurement. | PENDING |

### UI Validation
- **Viewport(s):** Desktop/tablet editing and phone results.
- **Interactions/states:** Sheet rotation and grain lock, cheapest/simplest layout setting, mixed-material totals, warnings, exports, print flow.
- **Requested measurements:** Confirm result tables and diagrams do not overflow target phone widths; record optimizer timing for representative projects.
- **Preview limitations/fallbacks:** Browser print review cannot establish output across all browsers and printers.

### Phase Record
- **Artifacts created/modified:** Pending.
- **Decisions/deviations:** Pending.
- **Next-phase context:** Phase 3 completes MVP acceptance and release readiness; no post-MVP features enter the MVP scope by default.

## Phase 3: MVP Quality, Performance, and Release Readiness
- **Status:** NOT_STARTED
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
| MVP scope includes the two-function app shell and 3D page scaffold, without pulling in functional modeling, alternative materials, custom PDF generation, accounts, tiers, or other future ideas. | Mandatory | Review changed behavior and artifacts against section 5.1, this plan's added UI foundation, and its scope boundaries. | PENDING |
| Every displayed plan passes independent validation and every representative plan is no more expensive than its naive baseline. | Mandatory | Required automated suites and documented fixture results. | PENDING |
| MVP success criteria have explicit measured or reviewed evidence, with gaps visible. | Mandatory | Review each criterion in product-spec section 10 against benchmark output, tests, and UI evidence. | PENDING |

### UI Validation
- **Viewport(s):** Desktop and tablet editing; phone results and print preview.
- **Interactions/states:** Complete project entry-to-print workflow, empty/invalid states, optimizer warnings, export and recovery flows.
- **Requested measurements:** Confirm project-entry and optimizer timing targets with documented test conditions; check shop output legibility at phone width and print.
- **Preview limitations/fallbacks:** Clearly separate automated/browser evidence from user-performed shop usability and cross-browser printer checks.

### Phase Record
- **Artifacts created/modified:** Pending.
- **Decisions/deviations:** Record unmet success criteria and approved scope changes.
