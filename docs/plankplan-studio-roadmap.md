# PlankPlan Studio Roadmap

**Status:** Directional; release dates are not committed.
**Requirements source:** [`PlankPlan Studio Product Specification`](plankplan-studio-product-spec.md)
**Current execution plan:** [`PlankPlan Studio MVP Implementation Plan`](plans/plankplan-studio-mvp/plankplan-studio-mvp-implementation-plan.md)
**MVP document register:** [`PlankPlan Studio MVP`](plankplan-studio-mvp.md)
**MVP visual direction:** [`PlankPlan Studio Design Guide`](DESIGN.md)

This roadmap records product horizons beyond the MVP. The MVP plan is limited to product-spec section 5.1 plus the explicitly agreed page foundation. Product phases align with product-spec v0.14: Phase 2 is 3D, Phase 3 is accounts/sync, and Phase 4 is tiers/billing. Release dates are not set. Roadmap entries are not implementation authorization. Revisit scope and dependencies before planning each horizon.

## Now: MVP

Tracked and verified in the separate [MVP implementation plan](plans/plankplan-studio-mvp/plankplan-studio-mvp-implementation-plan.md).

- Local projects, parts, materials, stock options, and manual pricing.
- Imperial and metric inputs; linear, sheet, and mixed-material optimization.
- Validated cut plans, diagrams, shopping lists, cost summaries, warnings, and usable offcuts.
- Local storage, JSON project backup, CSV, print CSS/browser Save as PDF, and mobile-friendly results.
- The home page and project navigation expose both Design and Cutlist; the MVP includes only a navigable 3D workspace shell and honest empty state.
- No accounts, cloud sync, billing, alternative-material optimization, or custom PDF writer in this horizon.

## Phase 2: 3D Project Design and Model Creation

After the cutlist workflow is solid, expand the core journey so users can create a project design in 3D and turn that design into a parts list and cutlist. This is a major product feature and the main follow-on flow after MVP.

- **Rendering technology:** Three.js.
- **Core outcome:** Create/edit a 3D project model whose dimensions and components can produce or update the project's cutlist inputs.
- **MVP foundation:** Home-page entry and project-level Design/Cutlist navigation plus a nonfunctional workspace shell are planned in the MVP. Three.js scene rendering and modeling interactions begin in this phase.
- **Planning inputs:** [3D workspace guide](plankplan-studio-3d-workspace-guide.md) and [initial features proposal](plankplan-studio-3d-workspace-initial-features.md) capture the reviewed tool set, component behavior, stock options, interaction rules, and cutlist synchronization safeguards.
- **Planning status:** The owner resolved design-data storage/migration, free-form geometry scope, model-linked cross-section fit validation, and component-to-cutlist link placement on 2026-10-22. Prepare a separate Phase 2 implementation plan from the linked guide and feature proposal; do not add these tasks to the MVP plan.
- Keep the cutlist planner useful on its own; 3D design should feed into the existing project/parts/optimizer workflow rather than replace it.

## After Phase 2: Product Maturity and Cloud Capabilities

These capabilities come after the product has a solid cutlist and 3D design experience. They are not near-term work; sequence them only after validating the product and the need for cloud features.

The following MVP-adjacent improvements remain in product-spec sections 5.2 and 5.3. Their sequence relative to Phase 2 is undecided.

#### Alternative Materials

- Multiple acceptable materials per part, dimension overrides, and pinned choices.
- Cheapest material assignment and comparison view.
- Depends on stable MVP project models and mixed-material results.

#### Downloadable PDF

- Free PDF download using a small custom writer, with the print view as fallback.
- Depends on stable cut lists, diagrams, shopping lists, and offcut output.
- Distinct from MVP browser print-to-PDF.

### Phase 3: Accounts and Cloud Sync

- Google and Microsoft sign-in, cloud projects, cross-device sync, local-to-account migration, and per-user materials/prices.
- Compatibility and architecture review for the current app, Cloudflare Workers/D1, and the auth choice is a prerequisite; the feature spec explicitly leaves this to be confirmed.
- Decide conflict handling, recovery, privacy boundaries, and deletion behavior before committing to rollout.

### Phase 4: Plans and Billing

- Free/paid cloud project limits and billing integration.
- Depends on accounts, cloud persistence, and a clear entitlement model. The optimizer remains available without a paid tier per the feature spec.
- Manually maintained price profiles and multi-project batching are listed as paid ideas but have no detailed scope here; plan them separately before implementation. Price profiles compare user-entered prices and do not fetch or scrape store data.

## Later: Product Opportunities

These ideas are recorded in product-spec section 5.7 or follow from the requested product direction. They have no committed order, release, or acceptance criteria yet.

### Other Candidate Features

- Offline-capable PWA and sync-on-reconnect after cloud sync exists.
- Inventory and reuse of offcuts across projects.
- Full random-width board-foot material support and richer rough-lumber loss.
- Multi-project batching and manually maintained store price profiles.
- Hardware and finish costs.
- Shareable/public project templates and a community plan library.
- Part-level edge banding, joinery allowances, and labels.
- Cross-material substitution and optional email/password sign-in.
- User-facing “proven optimal” badge, only if exact 1D behavior and messaging are sufficiently clear.

## Roadmap Maintenance

- Keep detailed requirements and decisions in the feature spec; keep MVP tasks and verification in the MVP plan.
- Promote a candidate into a release only after its user outcome, scope, dependencies, and acceptance criteria are clear.
- Revisit the roadmap after MVP feedback and before Phase 2 planning, when detailed 3D interaction and model-to-parts behavior must be specified. Do not infer dates from phase order alone.
