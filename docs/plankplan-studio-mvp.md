# PlankPlan Studio MVP

**Status:** Planning foundation in progress
**Last reviewed:** 2026-10-22

This is the entry point and document register for the PlankPlan Studio MVP. It records scope, the agreed initial-page direction, and where each type of product detail lives. Detailed requirements belong in the product specification; implementation and verification belong in the MVP plan.

## MVP Goal

Let a hobby or DIY woodworker create a project, define its parts/materials/stock, optimize a linear, sheet, or mixed-material cut plan, and use the resulting shopping list, cut list, diagrams, and exports in the shop.

The MVP also establishes the app structure for the later 3D workflow: users can enter a Design workspace shell, while actual Three.js model creation and model-to-cutlist behavior remain Phase 2 work.

## MVP Scope

- Local projects, parts, materials, manually entered stock prices, and imperial/metric input; no automatic price lookup or store scraping.
- Validated 1D and 2D optimization, mixed-material results, warnings, diagrams, offcuts, and cost summaries.
- CSV and JSON export, browser print-to-PDF, local storage, and mobile-friendly results.
- A project dashboard with both entry actions, plus Design/Cutlist navigation inside projects.
- A navigable 3D workspace shell with a clear empty state; no geometry editing, Three.js rendering, or model-to-parts conversion in MVP.
- Static single-page app hosted on Cloudflare; no MVP backend.
- Board-foot price calculation from entered stock dimensions, without a generic rough-lumber yield/length-discount percentage.

## Initial Page Decision

**Chosen structure:** Project dashboard first, with two primary entry actions; inside a project, use Design and Cutlist navigation.

The dashboard lists recent/local projects and offers “Open 3D workspace preview” and “Start a cutlist project.” It makes availability clear: cutlist planning is usable in the MVP; the 3D destination is a workspace preview/shell. The dashboard-level preview is not saved as a project. Inside a saved project, Design and Cutlist areas share the same project identity; its Design shell includes an honest empty state and a route back to that project's usable Cutlist area.

Other options considered:

1. A landing page with only two large function cards. It makes the product’s two functions obvious, but gives returning users no project overview.
2. A workspace with Design/Cutlist tabs only. It supports the eventual model-to-cutlist journey, but does not explain the two functions to new users or help them choose a starting point.

The selected dashboard-plus-project-navigation structure combines the strengths of options 2 and 3 and is recorded for implementation in the MVP plan and UI/UX spec.

## Initial Visual Direction (Under Review)

Use the blue **Stock Mix** icon with a blueprint-inspired interface palette under review. Keep clear drafting grids, cool neutral surfaces, and readable numbers. Keep cutlist and cost information visually crisp. The [design guide](DESIGN.md) is the shared MVP visual reference; the [HTML concept mockup](mockups/plankplan-studio-dashboard-concept.html) explores its dashboard and project shell, not production UI.

The current icon source is [`src/assets/plankplan-studio-stock-mix-v02.svg`](../src/assets/plankplan-studio-stock-mix-v02.svg). The original [`v01`](../src/assets/plankplan-studio-stock-mix-v01.svg) remains preserved; the browser favicon uses v02.

## Document Register

| Document | Purpose / source of truth | Status |
|---|---|---|
| [Design guide](DESIGN.md) | Initial Stock Mix identity, candidate blueprint palette, visual principles, responsive layout, and accessibility expectations for MVP screens. | Candidate; palette under review |
| [Product specification](plankplan-studio-product-spec.md) | Product vision, user/use cases, MVP requirements, domain model, optimizer behavior, technical direction, success criteria, decisions, and open questions. | Draft v0.17 |
| [Data and persistence contract](plankplan-studio-data-persistence-contract.md) | Canonical target schema, identity, validation/migration, local recovery, and Phase 3 cloud-save protocol. | Documentation approved; implementation pending |
| [3D workspace guide](plankplan-studio-3d-workspace-guide.md) | Adapts the CM Modding Tools Three.js workspace patterns and records architecture, cutlist, persistence, and accessibility constraints for Phase 2. | Owner decisions recorded; Phase 2 implementation plan remains |
| [3D workspace initial features](plankplan-studio-3d-workspace-initial-features.md) | Initial tools, drawers, shortcuts, mouse controls, component instances, stock defaults, and cutlist behaviors. | Feature decisions closed; Phase 2 implementation plan remains |
| [MVP user stories](plankplan-studio-mvp-user-stories.md) | User goals and acceptance criteria for MVP workflows, traced to the product spec and plan. | Draft |
| [MVP UI/UX specification](plankplan-studio-mvp-ui-ux-spec.md) | Screen hierarchy, dashboard decision, project navigation, responsive behavior, accessibility, and 3D-shell states. | Draft |
| [Dashboard HTML concept](mockups/plankplan-studio-dashboard-concept.html) | Clickable visual prototype of the dashboard and destination shells. | Concept; review before implementation |
| [MVP implementation plan](plans/plankplan-studio-mvp/plankplan-studio-mvp-implementation-plan.md) | Phases, implementation tasks, scope boundaries, and phase evidence. This is the execution source of truth for MVP work. | Complete with gaps; 3/3 phases complete |
| [Roadmap](plankplan-studio-roadmap.md) | Phase 2 3D direction, later cloud/billing horizons, post-MVP options, and future ideas. | Directional; no dates |

## Useful Supporting Documents to Add Later

- **Phase 2 implementation plan:** Owner decisions are closed. Include the data/persistence contract, exact design records, migration/recovery, local repository concurrency, geometry scope, and cross-section fit; keep cloud implementation in Phase 3. Use the [3D workspace guide](plankplan-studio-3d-workspace-guide.md) and [initial features proposal](plankplan-studio-3d-workspace-initial-features.md) as inputs. Three.js is selected; React Three Fiber/Drei remain candidates.
- **Architecture decisions:** Record the current SPA/deployment/auth reconciliation when the MVP plan's architecture preflight reaches a concrete decision; avoid duplicating unsettled choices here.
- **Release readiness checklist:** Create when the MVP is approaching release, with required checks and evidence for product, accessibility, browser support, data export/backup, and deployment.

## Working Rules

- Keep this register concise; do not copy full requirements or task lists into it.
- Update links and status here when a canonical document is renamed or its planning state changes.
- Keep the current MVP plan limited to MVP scope. Move post-MVP implementation tasks into a new plan when their scope is approved.
- Distinguish the three MVP implementation phases in the plan from product roadmap Phases 2–4.
- Do not treat directional roadmap ideas or draft user stories as implemented behavior.
