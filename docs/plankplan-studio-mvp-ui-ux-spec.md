# PlankPlan Studio MVP UI/UX Specification

> Historical product requirements and planning targets: references to the MVP Design shell or future Phase 2 describe the original scope, not the current application. See the [README](../README.md) and [3D workspace guide](plankplan-studio-3d-workspace-guide.md) for delivered behavior and limits.

**Status:** Draft | **Product specification:** [PlankPlan Studio Product Specification](plankplan-studio-product-spec.md) | **User stories:** [PlankPlan Studio MVP User Stories](plankplan-studio-mvp-user-stories.md) | **Implementation plan:** [PlankPlan Studio MVP Implementation Plan](plans/plankplan-studio-mvp/plankplan-studio-mvp-implementation-plan.md)

**Visual source:** [PlankPlan Studio Design Guide](DESIGN.md)

This document defines the MVP screen structure and interaction boundaries. It records the chosen home/dashboard pattern and the future-facing Design shell without specifying a functional 3D editor.

## Visual Direction

Use the blue Stock Mix mark with the current blueprint-blue interface exploration, cool neutral surfaces, strong alignment, clear grids, and readable numeric values. Keep dense planning information calm and legible; avoid decorative wood textures behind tables or results. See [DESIGN.md](DESIGN.md) for the shared rules for this candidate direction.

## Product Navigation

```text
Project Dashboard
├── Start a cutlist project → Project Workspace / Cutlist
├── Open 3D workspace preview → Standalone preview (no project/save)
└── Existing project → Project Workspace
    ├── Design
    └── Cutlist
        ├── Parts
        ├── Materials & Stock
        ├── Settings
        └── Results
```

Names above describe destinations, not committed route paths.

## Initial Page Decision

The initial page is a project dashboard with recent/local projects and two prominent entry actions: **Open 3D workspace preview** and **Start a cutlist project**. A new or returning user can tell what each path does and which one is fully usable in MVP.

Within a project, **Design** and **Cutlist** are peer areas. The 3D shell belongs to the same project so Phase 2 can connect modeled components to the existing parts and optimizer workflow without replacing it.

Alternatives considered and rejected for MVP:

- **Two cards only, no project list:** clear choice for first-time users, but poor continuity for users returning to saved work.
- **Design/Cutlist tabs only, no dashboard choice:** supports the eventual workflow, but hides the product's two functions until after project creation and gives no landing orientation.

## Screen Requirements

### Project Dashboard

- Show the user's local projects, with a clear empty state when none exist.
- Provide actions to create a cutlist project and open the 3D workspace preview.
- The dashboard-level preview does not create or save a model/project. When the shell is opened from an existing project, preserve that project's context.
- Explain availability in text, not color alone: cutlist planning is available; Design is a preview shell until Phase 2.
- Make import/restore available without obscuring the primary actions.
- Keep project cards and actions usable by keyboard and at narrow widths.

### Project Workspace Navigation

- Show the current project name and persistent Design/Cutlist navigation.
- Preserve the current project when switching areas.
- Indicate the current area with more than color alone and expose it to assistive technology.
- Provide an obvious route back to the dashboard and between Design and Cutlist.

### Design Workspace Shell (MVP)

- Show a stable, bounded viewport placeholder where the future Three.js canvas will live.
- Use an explicit message such as “3D design tools are planned for Phase 2” and explain that the Cutlist area is available now.
- When the shell belongs to a saved project, provide a working action to open that same project's Cutlist area. A standalone dashboard preview may instead offer the action to start a cutlist project.
- Do not show inactive modeling tools as enabled controls. Avoid an empty fake toolbar or property panel; reserve space in the layout only if it helps establish the future workspace proportions.
- Do not render a model, imply geometry editing, or claim that model dimensions populate parts.

### Cutlist Workspace and Results

- Keep the product specification's parts/material/settings organization, warnings, and optimizer result hierarchy.
- Let users enter and maintain material and stock prices directly; do not imply prices are synced, looked up, or scraped from stores.
- Make results phone-friendly, including cut lists, diagrams, shopping lists, and print output.
- Provide clear loading, invalid-input, impossible-fit, empty-project, and optimizer-failure states.

## Responsive and Accessibility Requirements

- Editing is desktop/tablet-first; on phones, the parts table becomes the specified card-style fallback.
- Results and navigation work at phone widths without horizontal page overflow.
- Use semantic headings and navigation landmarks, visible keyboard focus, logical focus order, and accessible names for every control.
- Availability and validation states must not rely on color alone.
- Keep focus visible and predictable when project navigation changes the main view.
- Prevent layout shifts when lists, warnings, or empty states appear.

## MVP Boundary and Later Extension

- MVP builds the dashboard, project navigation, and Design shell only.
- Phase 2 adds the Three.js canvas, model creation/editing, dimensional constraints, component/material mapping, and a defined model-to-parts/cutlist flow.
- Detailed Phase 2 interaction design remains open and belongs in a separate feature specification before that phase is planned.
