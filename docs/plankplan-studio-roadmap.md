# PlankPlan Studio Roadmap

**Status:** Directional; release dates are not committed.
**Requirements source:** [`PlankPlan Studio Product Specification`](plankplan-studio-product-spec.md)
**Current execution plan:** [`PlankPlan Studio MVP Implementation Plan`](plans/plankplan-studio-mvp/plankplan-studio-mvp-implementation-plan.md)
**MVP document register:** [`PlankPlan Studio MVP`](plankplan-studio-mvp.md)
**MVP visual direction:** [`PlankPlan Studio Design Guide`](DESIGN.md)

This roadmap records product horizons beyond the MVP. The MVP plan is limited to product-spec section 5.1 plus the explicitly agreed page foundation. Product phases align with product-spec v0.17: Phase 2 is 3D, Phase 3 is accounts/sync, and Phase 4 is tiers/billing. Release dates are not set. Roadmap entries are not implementation authorization. Revisit scope and dependencies before planning each horizon.

## Now: MVP

Tracked and verified in the separate [MVP implementation plan](plans/plankplan-studio-mvp/plankplan-studio-mvp-implementation-plan.md).

- Local projects, parts, materials, stock options, and manual pricing.
- Imperial and metric inputs; linear, sheet, and mixed-material optimization.
- Validated cut plans, diagrams, shopping lists, cost summaries, warnings, and usable offcuts.
- Local storage, JSON project backup, CSV, print CSS/browser Save as PDF, and mobile-friendly results.
- The home page and project navigation expose Design and Cutlist. The optional project Design workspace is implemented; release verification remains partial in the [3D workspace implementation plan](plans/3d-workspace/3d-workspace-plan.md).
- No accounts, cloud sync, billing, alternative-material optimization, or custom PDF writer in this horizon.

## Phase 2: 3D Project Design and Model Creation

This horizon adds the local project Design workflow and deliberate 3D-to-cutlist projection. The implementation is present, with Phase 7 browser, accessibility and performance release evidence still incomplete.

- **Rendering technology:** Three.js.
- **Core outcome:** Create/edit a 3D project model whose dimensions and components can produce or update the project's cutlist inputs.
- **MVP foundation:** Home-page entry and project-level Design/Cutlist navigation are present. Project Design renders a Three.js scene and supports the documented initial modeling tools; standalone `/design-preview` remains illustrative and never creates or saves a project.
- **Planning inputs:** [3D workspace guide](plankplan-studio-3d-workspace-guide.md) and [initial features proposal](plankplan-studio-3d-workspace-initial-features.md) capture the reviewed tool set, component behavior, stock options, interaction rules, and cutlist synchronization safeguards.
- **Planning and implementation status:** Owner decisions were closed on 2026-10-22; the sequential implementation plan is in progress. Phases 1-6 delivered contract, schema/repository, geometry/projection, rendering, interactions and Cutlist integration with partial evidence; Phase 7 records remaining release checks. Consult the plan before treating behavior as fully verified.
- Follow the [data and persistence contract](plankplan-studio-data-persistence-contract.md) for target v2, copy/restore identities, recoverable local storage and per-project IndexedDB operations. Old legacy tabs are not fenced from later localStorage writes; migration retains and rechecks the source but cannot make those tabs stop writing. No accounts or cloud services are included.
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
- Implement the [data and persistence contract](plankplan-studio-data-persistence-contract.md): D1 JSON aggregates with authenticated ownership, revision comparison, durable idempotent mutations, explicit account uploads, isolated pending writes, tombstones, and conflict recovery. Last-write-wins is superseded.
- Enforce the fixed three-live-cloud-project limit per account before billing exists. Verify transactional local save/sync markers, cross-tab leases, account namespaces, durable receipts, bounded live snapshots/status batches and change-cursor discovery, uncertain-mutation cancellation/reconciliation, deletion/restore expiry with retained creation metadata, and read consistency under the contract. Validate the documented retention/account-purge guarantees operationally before rollout; any R2 mode needs its own envelope. Full offline PWA and collaborative editing remain later scope.

### Phase 4: Plans and Billing

- Paid entitlements, configurable free/paid project limits, and billing integration; the fixed three-project Phase 3 enforcement already exists before this phase.
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
