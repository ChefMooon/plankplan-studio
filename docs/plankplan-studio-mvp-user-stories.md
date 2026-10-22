# PlankPlan Studio MVP User Stories

**Status:** Draft | **Source:** [PlankPlan Studio Product Specification](plankplan-studio-product-spec.md) | **Plan:** [PlankPlan Studio MVP Implementation Plan](plans/plankplan-studio-mvp/plankplan-studio-mvp-implementation-plan.md) | **Design:** [PlankPlan Studio Design Guide](DESIGN.md)

These stories express MVP outcomes in user language and add acceptance criteria to the product specification. They do not expand MVP scope. Phase 2 stories are listed separately as a future anchor; their detailed acceptance criteria remain open.

## MVP Stories

### US-MVP-01: Choose a project workflow

As a woodworker, I want the home page to show my projects and the two ways to start, so I can resume a project or choose how to begin.

**Acceptance criteria**
- The dashboard shows existing local projects and a clear way to create or import one.
- The dashboard follows the initial Stock Mix visual direction in [`DESIGN.md`](DESIGN.md), while keeping the two workflow actions easy to distinguish.
- It offers “Open 3D workspace preview” and “Start a cutlist project” as distinct entry actions.
- It clearly says that cutlist planning is usable in the MVP and that the 3D area is a workspace shell.
- Opening the general 3D preview gives an honest empty state; when opened from a saved project, it retains that project and links to its Cutlist area. It does not expose controls that appear functional but do nothing.

**Trace:** Product spec 5.1 and 7; MVP plan Phase 1; UI/UX spec dashboard and shell.

### US-MVP-02: Create and maintain a local project

As a woodworker, I want to create, rename, duplicate, delete, save, reopen, and import/export a project, so my planning work persists without an account.

**Acceptance criteria**
- I can create a project with a name and select imperial or metric units.
- Changes persist in local storage and remain after closing and reopening the app.
- I can export a versioned JSON backup and import a valid backup with clear validation feedback.
- Destructive deletion is clear and confirmed before data is removed.

**Trace:** Product spec 4, 5.1, and 10; MVP plan Phases 1 and 3.

### US-MVP-03: Define parts, materials, and available stock

As a woodworker, I want to enter project parts and the material/stock I can buy, so the optimizer works with my real build and local prices.

**Acceptance criteria**
- I can add, edit, and remove parts, groups, quantities, and dimensions in a keyboard-friendly table.
- The fields reflect whether the selected material is linear or sheet stock.
- I can use common imperial/metric presets or define custom materials and multiple priced stock options.
- I enter and update stock prices manually; the app does not perform automatic price lookup or scrape store sites.
- I can mark stock as owned for this project and set relevant kerf, trim, offcut, currency, tax, and sheet-layout settings.
- Invalid, missing, or unpriced inputs are identified before or during optimization with actionable messages.

**Trace:** Product spec 3–5.1; MVP plan Phase 1.

### US-MVP-04: Optimize linear parts

As a woodworker cutting boards, I want a cost-aware linear cut plan, so I can buy the right stock and reduce waste.

**Acceptance criteria**
- The plan respects part quantities, stock lengths, kerf, trim, stock limits, owned stock, and supported price models.
- Every part appears exactly once in a valid plan; impossible fits and missing prices produce clear warnings.
- The plan includes stock quantities, cut order, waste, and usable offcuts.
- The optimizer provides a valid plan promptly and can continue improving within the documented time budget.

**Trace:** Product spec 6.1–6.5 and 10; MVP plan Phases 1 and 3.

### US-MVP-05: Optimize sheet parts

As a woodworker cutting sheet goods, I want a cuttable sheet layout and sequence, so I can follow the plan with ordinary shop tools.

**Acceptance criteria**
- Each sheet placement fits within usable stock, respects kerf and grain locks, and does not overlap other parts.
- Every layout has a feasible guillotine cut order.
- I can choose the cheapest layout or the simplest-cuts setting.
- Usable sheet offcuts and impossible fits are reported accurately.

**Trace:** Product spec 3, 5.1, 6.2, 6.6, and 10; MVP plan Phase 2.

### US-MVP-06: Plan a mixed-material project

As a woodworker building with boards and sheet goods, I want each material optimized by its proper method and combined into one project summary.

**Acceptance criteria**
- The project can include both linear and sheet materials without switching project modes.
- Each material receives its appropriate plan and the project view combines costs, quantities, warnings, and totals.
- Owned stock, missing prices, and parts that fit no available stock remain visible in the combined result.

**Trace:** Product spec 3, 5.1, 6.3, and 10; MVP plan Phase 2.

### US-MVP-07: Use the plan in the shop

As a woodworker, I want clear cut and shopping lists, diagrams, cost summaries, and offcut details, so I can buy and cut from the plan.

**Acceptance criteria**
- Results show per-stock cut order, shopping quantities and costs, cost/waste summary, and usable offcuts.
- Cutting diagrams correspond to the validated plan.
- CSV, project JSON, and print-friendly output are available.
- Cut lists, diagrams, and shopping lists remain readable and usable on a phone and in print.

**Trace:** Product spec 5.1, 7, and 10; MVP plan Phases 2 and 3.

## Phase 2 Story Anchor (Not MVP Acceptance)

### US-P2-01: Design a project in 3D and derive a cutlist

As a woodworker, I want to create and edit a 3D project model and turn its components into cutlist inputs, so design and material planning form one workflow.

**Direction already chosen:** Three.js is the rendering technology; Phase 2 follows a solid MVP. The project remains usable through the manual Cutlist workflow.

**Acceptance criteria to define before Phase 2 planning:** model construction/editing, dimension constraints, component identity, material assignment, model-to-parts synchronization, validation of changes, and behavior when a component cannot be cut from available stock.

**Trace:** Product spec 5.4 and 7; roadmap Phase 2.
