# PlankPlan Studio: Product Specification

*A woodworking planner that turns project parts into the cheapest way to buy and cut the wood.*

**Status:** Draft v0.14
**MVP architecture:** Vite + React + TanStack Router, shipped as a static SPA on Cloudflare. No backend is required for MVP; add server-side services only if later account/database features need them.
**MVP visual source:** [PlankPlan Studio Design Guide](DESIGN.md)

### Changelog
- **v0.14:** Closed Phase 2 owner decisions: embed optional versioned design data in project schema v2, bound free-form modeling to planar profiles/simple extrusions without booleans or holes, add optional linear-part cross-section constraints for validated model-linked stock fit, and store component-to-Part links/projection snapshots in the design document.
- **v0.13:** Restored Phase 2 3D workspace guidance and initial feature proposal; identified owner decisions for design storage/migration, free-form geometry scope, and model-linked cross-section fit validation.
- **v0.12:** Confirmed all material and stock prices are entered and maintained manually; automatic lookup and store scraping are not planned.
- **v0.11:** Added a blue/navy v02 of the Stock Mix icon, preserved the warm-color v01, and updated the favicon and MVP references to the blue mark.
- **v0.10:** Kept the Stock Mix SVG as the initial app icon and replaced the brown-led interface styling with a blueprint-blue candidate palette; visual direction remains under review in `docs/DESIGN.md`.
- **v0.9:** Selected the Stock Mix SVG as the initial app icon and documented the first interface palette exploration in `docs/DESIGN.md`.
- **v0.8:** Confirmed Cloudflare static-SPA hosting for MVP; kept board-foot pricing but removed a generic rough-lumber length-waste percentage from MVP because the current linear part model cannot represent surfacing yield.
- **v0.7:** Added the MVP dashboard and Design/Cutlist navigation foundation; moved 3D project design to Phase 2 with Three.js; moved cloud accounts/sync and tiers to later phases.
- **v0.6:** Renamed the product from KerfCut Studio to **PlankPlan Studio**.
- **v0.5:** Offcut minimums confirmed. Inventory moved out of the paid tier and into the future features list. Added a scope-at-a-glance table.
- **v0.4:** Named the product **KerfCut Studio**. Free tier set to 3 cloud projects. Offcut minimums now differ by material type. Open questions updated.
- **v0.3:** Folded in decisions on PDF export, offcuts, sheet layout default, exact 1D mode, board-foot pricing, mobile/PWA, auth, free-tier limits, currency and tax, presets, and rendering. Added a decision log. Re-ordered milestones.
- **v0.2:** Replaced the three "modes" with typed materials. Added alternative materials per part. Added the `Optimizer` interface. Rewrote the optimizer section as a fully custom, zero-dependency, in-browser engine.
- **v0.1:** Initial draft.

---

## 1. Vision

**Design a project once, then get the cheapest way to buy and cut the wood.**

A web app where woodworkers define projects as a list of parts, assign materials, enter the stock they can buy (with prices), and export an optimized cut list and shopping list. The optimizer minimizes **total dollar cost**, not just waste.

### Goals
- Make cost-minimizing cut lists fast and easy for hobbyist woodworkers.
- Support boards, sheet goods, and projects that mix both, with no mode switching.
- Work in **imperial and metric**.
- Run **all calculations in the browser**, with a custom optimizer and minimal dependencies.
- Make the **results usable in the shop**, including on a phone.
- Ship a solid core first. Accounts, sync, and tiers come after.

### Non-goals (for now)
- Functional 3D modeling and model-to-parts generation are not part of the MVP; they are planned for Phase 2. The MVP includes the dashboard entry point, project navigation, and a 3D workspace shell only.
- All material and stock prices are entered or updated by the user. Automatic price lookup and store scraping are not planned.
- Payments and subscriptions
- Community plan library
- Offline/PWA support (planned for later, see 5.7)

### Scope at a glance

| Stage | What it covers | Details |
|---|---|---|
| **MVP (Phase 1)** | Projects, parts, typed materials, manually entered stock prices, 1D and 2D optimizers, cut list, shopping list, diagrams, offcut list, CSV/JSON/print exports, mobile-friendly results, local storage, dashboard and Design/Cutlist page foundation | 5.1 |
| **Post-MVP enhancements** | Alternative materials and custom PDF download; order relative to Phase 2 remains undecided | 5.2–5.3 |
| **Phase 2** | 3D project design and model creation with Three.js; model-to-parts/cutlist flow | 5.4 |
| **Phase 3** | Google/Microsoft sign-in, cloud save, cross-device sync | 5.5 |
| **Phase 4** | Free and paid tiers, billing | 5.6 |
| **Future** | Inventory, offline PWA, full board-foot type, and more | 5.7 |

---

## 2. Users & Use Cases

**Primary user:** hobby and DIY woodworker planning a build (workbench, bookshelf, cabinet).

| Use case | Example |
|---|---|
| Plan a single project | "I'm building a bookshelf. What do I buy and how do I cut it?" |
| Compare cost options | "Is 2 × 10' boards cheaper than 3 × 8'?" |
| Mixed-material project | "Table with 2x4 legs and a plywood top" |
| Compare materials | "Shelves: 1x12 pine or 3/4" plywood, whichever is cheaper" |
| Reuse scrap | "I already own an offcut. Use it first." (In the MVP, enter it as owned stock for that project.) |
| Read the plan in the shop | Open the cut list and diagrams on a phone while cutting |
| Combine projects (future) | "Optimize the shelf and the bench together" |

---

## 3. Material Types (replaces "modes")

There are no modes. A project is one list of parts, and each **material** has a **type** that decides how its parts are cut:

| Material type | Stock | Problem | Parts need | Examples |
|---|---|---|---|---|
| `linear` | Boards sold by length (priced per piece or per board foot) | 1D cutting stock | length | 2x4, 1x6, dowels, hardwood boards |
| `sheet` | Sheets sold by width × length | 2D guillotine packing | length × width | 3/4" plywood, MDF, 4x8 sheets |
| `boardFoot` (**future**) | Random-width/length hardwood sold by board foot | Separate problem, not in MVP | TBD | Rough-sawn oak, walnut |

**"Combined" is automatic.** A project with 2x4 legs and a plywood top has one linear material and one sheet material. Each is optimized by its own engine, and the costs are summed.

**Project templates.** On creation, offer starting points: *Lumber project*, *Panel project*, *Mixed project*. These only pre-fill sensible materials and columns. They don't lock anything.

**UI consequence.** The parts table shows a **length** column for linear materials and **length × width** for sheet materials, based on the part's selected material.

**Hardwood in the MVP.** Hardwood is handled as a `linear` material priced per board foot (see StockOption). The full random-width `boardFoot` type stays a future feature.

---

## 4. Core Concepts (Data Model)

### Project
- `id`, `name`, `notes`, `unitSystem` (imperial | metric), `kerf`, `trim`, `minOffcutLinear`, `minOffcutSheet`, `currency`, `taxRate` (optional, percent), `createdAt`, `updatedAt`, `schemaVersion`
- Has many Parts, and references Materials

### Material
- `id`, `name` (e.g., "2x4 SPF", "3/4" Birch Plywood")
- `type`: `linear` | `sheet` (later `boardFoot`)
- `nominalSize` and `actualSize` (a 2x4 is 1.5" × 3.5")
- `thickness`
- `stockOptions[]`

### StockOption (what you can buy)
- **Linear:** `length` and pricing, which is either:
  - `perPiece`: a fixed `price`, or
  - `perBoardFoot`: `ratePerBF`, `boardWidth`, `boardThickness`. The app computes the piece price as `rate × (thickness × width × length) / 144` in imperial board-foot terms (inches and feet; metric inputs are converted).
- **Sheet:** `width`, `length`, `price`
- Optional: `maxQty` (limit), `isOwned` (free inventory or scrap, price = 0)
- A material can have **multiple stock options** (e.g., 8', 10', 12' boards; full and half sheets)
- Users enter and maintain all prices manually. The product does not automatically look up prices or scrape store sites.

### Part
- `id`, `label`, `quantity`, `group` (e.g., "Legs", "Shelves"), `notes`
- **`materialChoices[]`**: an ordered list of acceptable materials (see below)
- Dimensions: **linear** = `length`. **sheet** = `length`, `width`.
- Phase 2 model-linked linear parts may add optional `crossSection: { width, thickness }`. Legacy/manual linear parts may omit it; model-generated board parts must provide both dimensions. The optimizer validates supplied cross-sections against actual stock width/thickness. This does not model rough-lumber defects, surfacing yield, or grain/runout.
- `grainLocked` (boolean, sheets only): prevents rotation
- Without linear `crossSection`, the optimizer retains length-only fit semantics and must not claim cross-section compatibility.

### MaterialChoice (alternative materials)
A part lists one or more acceptable materials. The first is the default and the others are alternatives.

```ts
type MaterialChoice = {
  materialId: string;
  // Optional per-material dimension overrides, because the same shelf
  // may be 11.25" wide in 1x12 but any width cut from plywood.
  length?: number;
  width?: number;
  grainLocked?: boolean;
};

type Part = {
  id: string;
  label: string;
  quantity: number;
  materialChoices: MaterialChoice[]; // length >= 1
  crossSection?: { width: number; thickness: number }; // canonical micrometers; model-linked linear parts require both
  pinned: boolean; // true = user locked the first choice; optimizer won't switch
  // ...dimensions, group, notes
};
```

For Phase 2, Project schema v2 adds an optional independently versioned `design` document. Schema-v1 projects migrate by preserving their current data and leaving `design` absent. Model-generated linear Part records include both cross-section dimensions; stable source IDs and last-applied projection snapshots are kept in the design document, keyed to generated Part IDs. The exact design/component record shape is defined by the separate Phase 2 implementation plan; do not serialize Three.js objects.

### Global Settings
- `kerf` (saw blade width), with default and per-project override
- `trim` (waste removed from each end of a board or edge of a sheet)
- **Minimum offcut sizes** (smallest leftover worth listing), set separately by material type and adjustable in Settings:
  - `minOffcutLinear`: **12" / 300 mm** long (boards)
  - `minOffcutSheet`: shorter side **6" / 150 mm** and longer side **12" / 300 mm** (sheets)
- `sheetLayout`: **Cheapest** (default; ties go to the simpler layout) or **Simplest cuts only**
- `unitSystem`, display precision (e.g., nearest 1/16")
- `currency` and optional `taxRate`

### Internal Units
All optimizer math uses **integer micrometers (µm)** to avoid floating-point errors. Fractions and metric input are converted at the edges, and rounding is documented and tested. Money is stored as integer cents. **Tax is applied for display only** (it scales cost proportionally, so it doesn't change the optimal plan).

---

## 5. Feature List

### 5.1 MVP (Phase 1: core, no accounts)

**Project & parts**
- [ ] Create, edit, duplicate, delete projects
- [ ] Add, edit, delete parts in a spreadsheet-style table (inline editing, keyboard-friendly)
- [ ] Group parts and set quantities
- [ ] Imperial (fractions like `3 1/2"`) and metric input; toggle at any time
- [ ] Project currency and optional tax %

**Materials & stock**
- [ ] Material library with **imperial (US/Canada) and metric presets** (common lumber lengths, plus sheet sizes such as 4x8 ft and 1220 × 2440 mm)
- [ ] Add custom materials and set their type (linear or sheet)
- [ ] Per-material stock options with **manual price entry**, per piece or per board foot
- [ ] Board-foot stock price is calculated from the entered width, thickness, and length. MVP does not apply an automatic rough-lumber surfacing/yield discount; users set explicit end trim in project settings.
- [ ] Mark stock as "owned" (free). This is a manual, per-project way to reuse scrap you already have. It is not a full inventory (see 5.7).

**Optimization** (details in section 6)
- [ ] 1D linear optimizer: cost-minimizing, kerf and trim aware
- [ ] 2D sheet optimizer: guillotine-only layouts with a usable cut order
- [ ] Mixed projects: each material is optimized by its own engine and the results are combined
- [ ] Warnings: part larger than any stock, missing price, no stock option for a material

**Outputs**
- [ ] **Cut list**: per stock piece, which parts to cut, in order
- [ ] **Shopping list**: quantity of each stock option to buy, with line costs, subtotal, optional tax, and total
- [ ] **Cutting diagrams** (SVG): visual layout per board or sheet
- [ ] Cost summary: total, per material, waste %
- [ ] **Usable offcuts list** (above the minimum offcut size for that material type)
- [ ] Export: **CSV**, JSON, and a print-friendly view (**print CSS**, browser "Save as PDF"). No PDF library in the MVP.
- [ ] **Mobile-friendly results view** (cut list, diagrams, shopping list readable and usable on a phone)

**Editing experience**
- [ ] Desktop and tablet first for editing. On phones, a card-style fallback for the parts table.

**Persistence (pre-account)**
- [ ] Save projects in browser local storage
- [ ] Import and export a project as a JSON file (a backup, and a bridge to accounts later)

**App shell**
- [ ] Client-side single-page app (SPA) with TanStack Router. Server rendering and marketing pages are added only when needed.
- [ ] Initial page is a project dashboard with two entry actions: open the 3D workspace preview or start a cutlist project. Clearly communicate which function is available in the MVP.
- [ ] Inside a project, provide Design and Cutlist navigation. The MVP Design area is a navigable 3D workspace shell with a clear empty state; it does not render or edit 3D models.

### 5.2 Post-MVP Enhancement: Alternative Materials
- [ ] Add multiple material choices per part, with optional per-choice dimension overrides
- [ ] "Pin" a part to a material so the optimizer won't change it
- [ ] Optimizer picks the cheapest combination of choices
- [ ] Comparison view: "Plan A (all pine) $X vs. optimized mix $Y", showing which parts switched

### 5.3 Post-MVP Enhancement: PDF Download (free for everyone)
- [ ] One-tap **Download PDF** using a **small custom PDF writer** (rectangles, lines, and text with the built-in PDF fonts; no dependencies)
- [ ] PDF includes the cut list, cut order, diagrams, shopping list, and offcuts
- [ ] Fall back to the print view if anything in the project can't be rendered (e.g., unsupported characters)

### 5.4 Phase 2: 3D Project Design and Model Creation
- [ ] Create and edit a woodworking project as a 3D model using Three.js.
- [ ] Define a model structure whose components and dimensions can produce or update the project's parts list and cutlist inputs.
- [ ] Preserve a direct path from the model to the existing cutlist optimizer, results, and shop outputs.
- [ ] Keep the MVP's manual parts/cutlist workflow usable independently of 3D design.

The [3D workspace guide](plankplan-studio-3d-workspace-guide.md) and [initial features proposal](plankplan-studio-3d-workspace-initial-features.md) capture the selected tool/interaction direction and closed Phase 2 storage, geometry-scope, cross-section, and component-link decisions, with migration acceptance details.

### 5.5 Phase 3: Accounts & Sync
- [ ] Sign in with **Google and Microsoft (OAuth)** first. No passwords or reset emails at launch.
- [ ] Auth built on **Better Auth** with Cloudflare D1. Confirm current Workers/D1 and TanStack Start support before committing.
- [ ] Save projects to the cloud and sync across devices
- [ ] Migrate local-storage projects into an account on first login
- [ ] Per-user material and price library ("my prices")
- [ ] Project list with search, sort, and tags

### 5.6 Phase 4: Tiers
- [ ] **Free:**
  - Unlimited **local** projects with no account
  - **3 cloud-saved projects**
  - Full optimizer, alternative materials, and all exports (CSV, JSON, **PDF**)
- [ ] **Paid:**
  - Unlimited cloud projects
  - User-maintained price profiles (compare manually entered totals across stores)
  - Multi-project batching
- [ ] Billing integration (e.g., Stripe) and plan limits enforcement
- [ ] Optional lumber-store affiliate links

Inventory is a future feature (see 5.7), so which tier it belongs to is decided when it is built. The optimizer is never gated. It runs in the browser, so it can't be enforced anyway and costs nothing per run.

### 5.7 Future Ideas
- [ ] **Offline-capable PWA.** Because projects and the optimizer already live in the browser, this should be cheap: service worker, cached app shell, and sync-on-reconnect once accounts exist.
- [ ] "**Proven optimal**" badge in the UI, powered by the exact 1D mode
- [ ] Full `boardFoot` material type (random-width hardwood and richer rough-lumber loss)
- [ ] Multi-project batching
- [ ] **Inventory:** leftover and scrap tracked across projects. Includes a "keep this offcut" button on the results page that adds a leftover to your inventory, and automatic use of inventory stock (at zero cost) when optimizing new projects. Tier placement to be decided.
- [ ] User-maintained store price profiles using manually entered and updated prices; no automated lookup or scraping
- [ ] Hardware and finish costs in the project total
- [ ] Shareable and public project templates; community plan library
- [ ] Part-level edge banding, joinery allowances, and labels
- [ ] Cross-material substitution (e.g., a 3/4" × 3.5" rail ripped from plywood instead of a 1x4)
- [ ] Optional email/password sign-in

---

## 6. Optimizer (Custom, Zero-Dependency, In-Browser)

### 6.1 Principles
- **Fully custom, pure TypeScript.** No runtime dependencies in the optimizer (no solver, no packing libraries).
- **Runs entirely in the browser**, in a **Web Worker**, so the UI stays responsive and the MVP needs no server. Cloudflare only serves the static bundle.
- **No DOM or framework imports.** The optimizer lives in its own folder or package (e.g., `packages/optimizer`) so it can be tested in Node and reused later.
- **Deterministic.** Randomized search uses a small seeded PRNG (e.g., mulberry32), so the same input and seed always give the same plan.
- **Anytime.** The engine always has a valid plan and keeps improving until a time limit (default ~2s, adjustable) or the user cancels. Progress and best-so-far are streamed to the UI.
- **Integer math** (µm and cents), so results are exact and comparable.
- **Validated.** Every plan is checked by an independent validator before display.

### 6.2 Objective
Compare plans in this order (lexicographic):
1. **Total cost** (lowest). Owned stock costs 0. Cost is before tax.
2. **Total waste** (lowest).
3. **Simplicity** (fewest stock pieces, then fewest cuts).
4. **Usable offcut** (prefer one large leftover over many small ones).

With the default sheet setting (**Cheapest**), simplicity breaks ties, so an easier-to-cut layout wins when two plans cost the same. With **Simplest cuts only**, the sheet engine uses only strip-based layouts.

### 6.3 The Optimizer Interface
One interface for every engine, so engines can be swapped, compared, and tested against each other.

```ts
// All lengths in integer µm, all money in integer cents.

type OptimizeOptions = {
  kerf: number;
  trim: number;
  minOffcutLinear: number;
  minOffcutSheet: { short: number; long: number };
  sheetLayout: 'cheapest' | 'simplestCuts';
  timeLimitMs: number;
  seed: number;
  signal?: AbortSignal;
  onProgress?: (p: { bestCost: number; elapsedMs: number }) => void;
};

interface Optimizer<Req, Plan> {
  readonly id: string; // e.g. "linear-heuristic-v1"
  optimize(req: Req, opts: OptimizeOptions): Promise<Plan>;
}

// ---- Linear (1D) ----
type LinearRequest = {
  parts: { id: string; length: number; qty: number }[];
  stock: { id: string; length: number; price: number; maxQty?: number; owned?: boolean }[];
};
type LinearPlan = {
  bins: { stockId: string; cuts: { partId: string; length: number }[]; waste: number }[];
  offcuts: { stockId: string; length: number }[]; // leftovers >= minOffcutLinear
  totalCost: number;
  warnings: Warning[];
};

// ---- Sheet (2D) ----
type SheetRequest = {
  parts: { id: string; length: number; width: number; qty: number; grainLocked: boolean }[];
  stock: { id: string; length: number; width: number; price: number; maxQty?: number; owned?: boolean }[];
};
type SheetPlan = {
  sheets: {
    stockId: string;
    placements: { partId: string; x: number; y: number; w: number; h: number; rotated: boolean }[];
    cutTree: CutNode; // guillotine tree, i.e. the cut order
    waste: number;
  }[];
  offcuts: { stockId: string; w: number; h: number }[]; // free rectangles meeting minOffcutSheet (short and long side)
  totalCost: number;
  warnings: Warning[];
};

// ---- Project level ----
interface ProjectOptimizer {
  optimize(project: Project, opts: OptimizeOptions): Promise<ProjectPlan>;
}
// ProjectPlan = chosen material per part + one plan per material + totals + warnings.
```

The worker exposes `ProjectOptimizer` through a small message API (`start`, `cancel`, `progress`, `result`).

### 6.4 Shared Foundations
- **Kerf model (linear):** each part consumes `length + kerf`. A board of usable length `L = stockLength - 2×trim` fits a set of parts when `Σ(length_i + kerf) ≤ L + kerf`. The last cut needs no trailing kerf.
- **Kerf model (sheet):** every guillotine split removes a `kerf`-wide strip along the cut line.
- **Board-foot pricing:** converted to a per-piece price before optimization. The optimizer only ever sees piece prices.
- **Preprocessing:** expand quantities into items, drop zero-quantity parts, and merge identical parts for display only.
- **Pre-checks** (fail fast with a clear message): part larger than every stock option, material with no stock, missing price, part that only fits one stock option.
- **Offcuts:** leftover space inside a stock piece is already reused by later cuts during packing. After packing, leftovers that meet the minimum offcut size for that material type (`minOffcutLinear` or `minOffcutSheet`) are listed in the plan.
- **Plan validator** (independent code path): verifies that every part is placed exactly once, nothing overlaps or leaves the stock, kerf and trim are respected, grain locks are honored, `maxQty` isn't exceeded, and cost totals match. The validator is also the test oracle.

### 6.5 Linear (1D) Engine
**Goal:** the cheapest mix of boards, using as few dependencies as possible, with no solver.

1. **Baseline: First-Fit-Decreasing.** Sort parts longest first and pack them using each single stock length. This gives an immediate valid plan.
2. **Right-sizing.** For each packed board, replace it with the **cheapest stock option whose usable length still fits its cuts**. Prefer owned stock. Respect `maxQty`. This one step captures most of the savings where longer boards cost more or less per foot.
3. **Multi-start across stock mixes.** Run steps 1–2 with different packing orders and starting stock lengths (longest-first, cheapest-per-length-first, and so on), and keep the best.
4. **Local search (ruin-and-recreate).** Repeat until the time limit:
   - Remove 1–3 boards at random, or the most wasteful ones.
   - Re-insert their parts using best-fit, trying a few random orders.
   - Right-size again.
   - Accept if the objective improves. Occasionally accept equal moves to escape plateaus.
   - Also try swap moves between boards to free a whole board or shrink one to a cheaper size.
5. **Exact mode (a test tool first).** A hand-written **branch-and-bound over cutting patterns** for small cases:
   - Enumerate maximal patterns per stock option by depth-first search.
   - Search pattern counts to cover all parts at minimum cost.
   - Use a lower bound of `total required length × lowest cost per unit length`, pruning anything that can't beat the best-so-far.
   - Use a node and time budget. If it can't prove optimality in time, return the best plan found.
   - **Where it ships:** in the optimizer package, used by the **test suite and benchmarks** to measure how close the heuristic gets to optimal. It is **not exposed in the UI at first**. Once proven, it can power a "proven optimal" badge (see 5.7).

**Expected scale:** < 100 parts, < 20 distinct lengths, 2–5 stock options. The heuristic path finishes in milliseconds, and exact mode is realistic for most real projects.

### 6.6 Sheet (2D) Engine
**Goal:** guillotine-only layouts, because every cut must run edge to edge on a table saw, track saw, or panel saw. Layouts like MaxRects are intentionally not used.

1. **Guillotine packer.** Maintain a list of free rectangles. For each part (largest first), choose a free rectangle using a scoring rule, place the part in its corner, and split the remainder with a guillotine cut minus kerf.
   - **Placement rules:** best short-side fit, best long-side fit, best area fit.
   - **Split rules:** shorter-axis, longer-axis, min-area, max-area.
   - **Rotation:** allowed only when `grainLocked` is false.
2. **Multi-start sweep.** Try every combination of part order (area, longer side, shorter side, perimeter), placement rule, and split rule. Keep the best.
3. **Strip-based layout ("simplest cuts").** A 2-stage layout: rip the sheet into full-length strips, then crosscut each strip. It is easy to cut in a home shop, sometimes with slightly more waste. The engine always evaluates it:
   - **Cheapest** (default): both layout types compete. Cost decides, and **ties go to the simpler layout**, which is often the strip layout because sheets are sold whole.
   - **Simplest cuts only:** only strip layouts are considered.
4. **Randomized local search.** Perturb the part order, swap placements, and re-run the packer until the time limit. Accept improvements in the objective.
5. **Stock selection.** After packing, **right-size** the last sheets: replace a mostly empty sheet with a cheaper or smaller stock option (e.g., a half sheet) if everything still fits. Mix sheet sizes when the stock list allows it.
6. **Cut sequence.** The guillotine tree gives the cut order for each sheet: first rip, then crosscut, with each step and dimension listed.
7. **Edge cases:** parts that fit a sheet in only one orientation, grain-locked parts that restrict packing, and parts exactly equal to a sheet size (with trim).

### 6.7 Alternative Materials Engine
Used when parts have more than one `materialChoice`.

1. **Start** with the first (default) choice for every part, then optimize each material. Record the total.
2. **Group** unpinned parts by their set of choices.
3. **Hill climb:** for each group, try moving it to each alternative. Only the two affected materials need re-optimization, and results are **cached per (material, parts set)**, so this stays fast. Keep the move if total cost drops.
4. Repeat until no move helps or the time limit is reached. Optionally try pairs of moves to escape local optima.
5. Output the chosen material per part, plus a **comparison** against the all-defaults plan, so the user sees what changed and what it saves.

For small projects, the number of choice combinations is small enough to enumerate exhaustively as a bonus mode.

### 6.8 Testing & Quality
- **Unit tests:** unit and fraction parsing, kerf math, board-foot price conversion, each engine's edge cases.
- **Property tests (hand-rolled generators):** for random inputs, every plan must pass the validator, and cost must not exceed the plain First-Fit-Decreasing baseline.
- **Fixture projects** with known-optimal or hand-verified answers (bookshelf, workbench, cabinet carcass).
- **Cross-checks:** the exact 1D mode is the benchmark. It must never be worse than the heuristic, and the test suite records the heuristic's gap to it.
- **Benchmarks:** record time and cost on a fixed set so regressions are visible.
- **Visual check:** render diagrams for fixtures and review them by eye.

### 6.9 Performance & Safety
- Target: valid plan in **< 200 ms** and best plan within **~2 s** for typical projects (up to ~100 parts).
- Work in the Web Worker. The UI can cancel, and the worker returns best-so-far.
- Time and node budgets guard every search so nothing can hang the tab.

---

## 7. Key Screens

1. **Project Dashboard**: list/recent projects, create from template, import, and two clear entry actions: open the 3D workspace preview or start a cutlist project.
2. **Project Workspace**: project-level **Design** and **Cutlist** navigation. The MVP Design area is a nonfunctional 3D workspace shell with a clear empty state; 3D rendering/model creation arrive in Phase 2.
3. **Cutlist Editor**
   - Tab: **Parts** (editable table; the material picker adds alternatives; card layout on phones)
   - Tab: **Materials & Stock** (materials with type, sizes, prices per piece or per board foot)
   - Tab: **Settings** (units, currency and tax, kerf, trim, minimum offcut sizes, sheet layout)
4. **Results** (designed to be mobile-friendly)
   - Cost summary and warnings
   - Shopping list with subtotal, tax, and total
   - Cut list with SVG diagrams and cut order
   - Usable offcuts
   - Material comparison (when alternatives are used)
   - Export buttons (CSV, JSON, print; PDF download post-MVP)
5. **Material Library**: presets (imperial and metric) and custom materials.
6. **3D Design** (Phase 2, Three.js), followed by accounts/sync (Phase 3) and billing (Phase 4).

### UX principles
- Fast data entry (tab and enter between cells, paste from spreadsheets).
- Fractions parse naturally (`3 1/2`, `3-1/2"`, `89mm`).
- Re-optimize on demand, or live with a short debounce, with changes shown visibly.
- Clear, plain-language warnings.
- Results first: large type, high contrast, and tap-friendly for shop use.
- Apply the current Stock Mix and blueprint-blue visual exploration from [`docs/DESIGN.md`](DESIGN.md): blue interface emphasis, cool neutral surfaces, precise grids, and readable numeric information. The interface palette remains subject to user review.

---

## 8. Technical Architecture

### Frontend
- **TanStack Router / Query**, **Vite**, **React**, TypeScript. Start as a **client-side SPA**. Adopt TanStack Start server features later if marketing pages or SEO need them.
- State: TanStack Query for server data, a lightweight store (e.g., Zustand) for the editor
- Tables: TanStack Table, or a simple custom grid if it covers the need
- Diagrams: hand-written SVG rendered in React
- Printing: print CSS (MVP). Downloadable PDF via a custom writer post-MVP.
- 3D project design/model creation: Three.js (Phase 2); model-to-parts behavior remains to be specified.
- Optimizer in a **Web Worker**, importing only the dependency-free optimizer package

### Dependency policy
- **Optimizer package: zero runtime dependencies.** Custom fraction and unit parsing, PRNG, validator, and engines.
- **PDF: no library.** Print CSS first, then a small custom writer.
- App-level dependencies are kept to the stack above, plus small, well-justified additions (e.g., a schema validator like Zod). Each new dependency needs a reason. Three.js is the selected rendering technology for Phase 2.

### Hosting & Backend (Cloudflare)
- **MVP:** Deploy the client-side SPA as a static site on Cloudflare Pages. Project data and optimization remain in the browser; no backend is required.
- **Later:** Add Cloudflare Workers and **D1** (SQLite) for users, projects, materials, and prices only if Phase 3 accounts/sync require them. No optimization runs server-side.
- **KV** for sessions or cached presets, if needed
- **R2** for future file storage (exports, images)
- Auth: **Better Auth** with D1 and Google/Microsoft OAuth (Phase 3)

### Data & Sync (Phase 3)
- Projects stored as a validated JSON document per project, with a `schemaVersion` and migrations.
- Last-write-wins sync to start. Conflict handling can be refined later.
- Because the optimizer is client-side, the server only stores inputs and (optionally) the latest plan.

---

## 9. Milestones

| # | Milestone | Outcome |
|---|---|---|
| M1 | Scaffold, units, data model | TanStack + Vite SPA on Cloudflare; custom fraction and metric parsing; typed model; currency and tax |
| M2 | Optimizer foundations | Interfaces, µm/cents conversion, PRNG, **plan validator**, test harness |
| M3 | 1D engine v1 | First-Fit-Decreasing, right-sizing, local search, board-foot pricing; fixtures and property tests |
| M4 | Parts and materials UI + 1D results | Editable tables, presets (imperial and metric), local storage, shopping list, cut list, SVG diagrams, offcut list |
| M5 | 2D engine v1 | Guillotine packer, multi-start sweep, strip layout, cut sequence, right-sizing sheets |
| M6 | Mixed projects, exports, mobile results | Combined plans, CSV, JSON, print CSS, mobile-friendly results view |
| M7 | MVP validation and polish | Exact 1D benchmark tool, warnings, real-project testing, responsive shop outputs |
| Phase 2 | 3D project design and model creation | Three.js-based design surface and path from model components to cutlist; detailed scope to be planned |
| Post-MVP (order TBD) | Alternative materials | `materialChoices`, hill-climb selector, comparison view |
| Post-MVP (order TBD) | PDF download | Custom minimal PDF writer; free for everyone |
| Phase 3 | Accounts and sync | Better Auth, Google/Microsoft sign-in, D1 storage, cross-device projects |
| Phase 4 | Tiers | Plan limits (cloud project cap) and billing |
| Later | PWA / offline | Service worker, cached app shell, sync-on-reconnect |

---

## 10. Success Criteria (MVP)

- A real project (parts, materials, prices) can be entered in **under 5 minutes**.
- A valid plan appears in **< 200 ms**, and the final plan within **~2 s**, for projects up to ~100 parts.
- **Every plan passes the independent validator.** Every part is accounted for, with kerf and grain respected.
- Every sheet layout is **guillotine-cuttable**, with a clear cut order.
- The plan is **cheaper or equal** to a naive baseline on all test projects.
- The heuristic's gap to the exact benchmark is measured on small fixtures, with the result recorded.
- Cut list, shopping list, and diagrams are **readable and usable on a phone** and when printed.
- The optimizer package has **zero runtime dependencies**.

---

## 11. Decision Log

| # | Topic | Decision |
|---|---|---|
| 1 | PDF export | MVP uses print CSS only. A custom minimal PDF writer follows post-MVP. **PDF download is free.** |
| 2 | Offcuts | MVP lists usable offcuts above minimum sizes that differ by material type (boards 12" / 300 mm; sheets 6" × 12" / 150 × 300 mm), adjustable in Settings. **Confirmed.** A "keep this offcut" button comes later with inventory (a future feature). |
| 3 | Sheet layout default | Cheapest layout, ties go to the simpler one, plus a "Simplest cuts only" toggle. |
| 4 | Exact 1D optimizer | Built first as a **test tool**. UI exposure ("proven optimal") comes later. |
| 5 | Hardwood | Linear stock can be priced per board foot. MVP uses entered stock width/thickness/length for price and does not apply generic rough-lumber yield discounts; full random-width `boardFoot` support is deferred. |
| 6 | Mobile | Desktop/tablet-first editing, mobile-friendly results. Offline PWA is a planned future feature. |
| 7 | Auth | Better Auth on Workers and D1, with Google and Microsoft sign-in first. |
| 8 | Free tier | Free: unlimited local projects, 3 cloud projects, full optimizer and all exports including PDF. Paid: unlimited cloud projects, user-maintained manual price profiles, batching. Inventory is a future feature, so its tier is decided later. |
| 9 | Naming | **PlankPlan Studio** (previously KerfCut Studio). "Studio" leaves room for the Phase 2 3D design feature. Domain and trademark check still to do. |
| 10 | Currency and tax | Project currency, plus optional tax % applied for display. |
| 11 | Presets | Imperial (US/Canada) and metric presets from the start. |
| 12 | Rendering | Client-side SPA until server rendering is needed. |
| 13 | Inventory | Future feature, not part of the MVP or the tiers yet. The MVP's per-project "owned" stock flag covers reusing scrap by hand. |
| 14 | 3D design | Phase 2 creates and edits a project model in Three.js and feeds model components into the existing cutlist workflow. The MVP provides only the dashboard entry point, project navigation, and a 3D workspace shell. |
| 15 | Initial page | MVP opens to a project dashboard with actions for the 3D workspace and cutlist; projects expose Design and Cutlist navigation. |
| 16 | Rough-lumber allowance | MVP keeps board-foot price calculation but excludes a generic usable-length waste percentage. Linear parts have length only, while surfacing changes cross-sectional dimensions and defects may remove usable material; explicit end-squaring is represented by trim. Revisit yield modeling when part/stock dimensions can support it. [AHEC measurement guidance](https://www.americanhardwood.org/en/american-hardwood/grading-sawn-lumber/measurement); [NHLA grading rules](https://www.nhla.com/services/nhla-grading-rules). |
| 17 | MVP hosting | Host the MVP as a static SPA on Cloudflare Pages with browser-local project storage and optimization; add Workers/D1 only if later account/database needs require them. |
| 18 | Visual direction | Start with a precision-focused workshop tool: clear grids and readable numbers with restrained wood tones and texture as accents. |
| 19 | Initial app icon | Use the blue/navy v02 Stock Mix SVG as the initial app icon; preserve the original warm-color v01 as a prior version. |
| 20 | Interface palette exploration | Try a blueprint-inspired blue interface palette while retaining the Stock Mix mark; this visual direction remains under review in `docs/DESIGN.md`. |
| 21 | Price sourcing | Users manually enter and maintain all material and stock prices; automatic price lookup and store scraping are not planned. |
| 22 | Design persistence | Store an optional versioned design document inside Project JSON; migrate schema v1 to v2 without changing existing project/cutlist data. Keep project backup/import atomic. **Confirmed, 2026-10-22.** |
| 23 | Initial free-form geometry | Support planar edges/faces and simple Push/Pull solids. Exclude booleans, holes, and general self-intersection from the initial feature scope; invalid/unsupported operations preserve the last valid model. **Confirmed, 2026-10-22.** |
| 24 | Model-linked cross-section fit | Add optional width/thickness constraints to linear parts; generated board parts require both and are checked against actual stock dimensions. Legacy manual parts remain length-only if those fields are absent. **Confirmed, 2026-10-22.** |
| 25 | Component-to-cutlist link location | Store links and the last-applied projection snapshot in the embedded design document, keyed to generated Part IDs; keep manual Part records free of model metadata. **Confirmed, 2026-10-22.** |

---

## 12. Open Questions

1. **Better Auth check:** confirm current Cloudflare Workers/D1 and TanStack support before Phase 3.
2. **3D implementation plan:** create a separate Phase 2 plan from the [3D workspace guide](plankplan-studio-3d-workspace-guide.md) and [initial features proposal](plankplan-studio-3d-workspace-initial-features.md). Owner gates are closed; detail schema migration, topology validation, sync conflicts, and verification.
3. **Rough-lumber yield modeling (deferred):** if added after MVP, define board/part width and thickness requirements, surfacing assumptions, defect handling, and how usable dimensions affect cost and cut planning. Do not model this as a length-only percentage by default.
