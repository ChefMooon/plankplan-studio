# PlankPlan Studio Design Guide

## Design intent

PlankPlan Studio is a precise, approachable planning tool for the woodshop. Its interface should make dimensions, stock choices, cut plans, and project progress easy to scan. The initial **Stock Mix** mark combines a blueprint-blue sheet panel with deep navy boards. The current interface exploration uses a blueprint-inspired blue system; broader interface choices remain open for review.

This is the initial MVP design direction, not a claim that the whole application UI has been implemented. The [dashboard concept](mockups/plankplan-studio-dashboard-concept.html) is the visual reference for the home page and project shell. Product behavior and screen requirements remain in the [UI/UX specification](plankplan-studio-mvp-ui-ux-spec.md).

## Visual principles

- Put clarity of measurements, labels, warnings, and numeric results ahead of decoration.
- Use cool paper-like surfaces with deep blue text and borders; reserve blueprint blue for primary actions and selected states.
- Use blueprint blue and deep navy in the mark and interface. Natural wood tones belong in project material illustrations, not as the main UI color.
- Use wood texture or grain only as a restrained accent. Do not place texture behind tables, cut diagrams, or dense results.
- Use precise alignment and light grid cues to suggest layout and cutting work.
- Keep the dashboard welcoming and project-oriented, with two clear starting actions: Design and Cutlist.
- Show product maturity in text: Cutlist is the MVP workflow; Design is a shell until Phase 2.

## Brand mark and iconography

The initial app icon is the **Stock Mix** SVG, preserved as an editable, versioned source at [`src/assets/plankplan-studio-stock-mix-v02.svg`](../src/assets/plankplan-studio-stock-mix-v02.svg). It represents a sheet panel and two boards in a simple, flat geometric style. The original warm-color version remains preserved as [`v01`](../src/assets/plankplan-studio-stock-mix-v01.svg).

- Use the mark in the app identity and browser favicon without adding a wordmark inside the artwork.
- Keep clear space around it and preserve its aspect ratio; do not add shadows, gradients, outlines, or recolor individual shapes in the source asset.
- The current SVG colors are blueprint blue `#276A91` and deep navy `#173B56`.
- Prefer one consistent line-icon style for interface actions. Adjacent labels make decorative icons; icon-only controls need accessible names.

## Color and themes

The current exploration is a light blueprint workspace. The light and planned dark semantic tokens below are paired so the blue identity remains recognizable across themes. Dark values are design targets, not an implemented theme or a final brand lock.

| Token | Light | Planned dark | Role |
| --- | --- | --- | --- |
| `--color-canvas` | `#EFF4F7` | `#111C25` | Main page background |
| `--color-surface` | `#FBFDFE` | `#192834` | Cards, tables, and workspace surfaces |
| `--color-surface-raised` | `#F2F7FA` | `#223642` | Nested panels and raised surfaces |
| `--color-text` | `#1E3342` | `#EDF4F7` | Primary text |
| `--color-text-muted` | `#536B7A` | `#B5C4CC` | Supporting text |
| `--color-border` | `#D3E0E8` | `#3B515F` | Dividers and surface boundaries |
| `--color-brand` | `#276A91` | `#76C6E7` | Primary actions and selected emphasis |
| `--color-brand-strong` | `#174A6B` | `#A7DCF1` | Text links and stronger brand emphasis |
| `--color-brand-soft` | `#E5F0F6` | `#223E4D` | Selected or nested surfaces |
| `--color-logo-blue` | `#276A91` | `#276A91` | Blue shape in the Stock Mix mark |
| `--color-logo-navy` | `#173B56` | `#173B56` | Navy shapes in the Stock Mix mark |
| `--color-logo-backplate` | `#FFFFFF` | `#E5F0F6` | Optional clear tile behind the unchanged mark on dark surfaces |
| `--color-hero` | `#173B56` | `#0D2739` | High-contrast blueprint hero surface |
| `--color-on-brand` | `#FFFFFF` | `#102A3B` | Text and icons on brand actions |
| `--color-focus` | `#276A91` | `#9BDCF4` | Visible keyboard focus ring |
| `--color-success` | `#49634E` | `#8ECC9A` | Positive state with a textual label |
| `--color-warning` | `#936326` | `#F2C66D` | Caution state with a textual label |
| `--color-danger` | `#A33D32` | `#FF978D` | Error/destructive state with a textual label |

These are candidate values. Before production use, verify text, controls, focus indicators, and status colors against their actual backgrounds in both themes. Keep the Stock Mix SVG's colors unchanged; use the backplate token when the navy shapes need separation from a dark surface. Never communicate status through color alone. Dark theme implementation remains future work.

## Typography, spacing, and shape

- Use the app's Inter Variable sans-serif stack for controls, body copy, tables, measurements, and labels.
- A restrained editorial serif may be used for a short dashboard hero headline; do not use it for functional or numeric content.
- Align dimensions and costs consistently; use tabular numerals for dense measurement and currency columns where supported.
- Use the existing spacing scale where practical: 4, 8, 12, 16, 24, and 32 px.
- Use 8–12 px corner radii for cards and controls. Keep shadows subtle and use borders to define data groups.

## Layout and responsive behavior

- The dashboard puts the project promise and primary action first, then the Design/Cutlist entry cards, then recent projects.
- Within a project, Design and Cutlist are peer navigation destinations under one project identity.
- Use a centered content area near 1160 px with fluid page gutters; let cards collapse to one column on phone widths.
- Keep tables and diagrams readable at narrow widths; use the defined card-style parts fallback and prevent page-level horizontal overflow.
- The Design viewport is a bounded Phase 2 placeholder in the MVP, not an interactive model canvas.

## Components and interaction states

- Follow the React, Tailwind, and shadcn/Radix conventions already in the repository. Use semantic design tokens rather than introducing one-off brand colors in components.
- Primary buttons use blueprint blue with clear text contrast. Secondary actions use quiet surfaces and a visible boundary.
- Preserve visible focus, keyboard operation, disabled and pressed states, and reduced-motion behavior.
- Keep focus predictable when switching project areas or returning to the dashboard.
- Keep status and availability labels explicit, such as “MVP workflow” or “Planned · Phase 2.”

## Voice and accessibility

Use concise, practical language that helps people act in the shop. Prefer specific action labels (“Start a cutlist project”) over generic labels (“Continue”). Use semantic headings and landmarks, accessible names, visible keyboard focus, and non-color status cues. Verify contrast and keyboard behavior during implementation; this guide does not assert a completed accessibility audit.

## Review checklist

- Does the interface use the blue Stock Mix identity with a restrained blueprint-blue palette?
- Are dimensions, quantities, costs, and cut results easier to scan than decorative elements?
- Do the home page and project areas make Design and Cutlist roles clear, including the Phase 2 boundary?
- Are focus, keyboard operation, status labels, reduced motion, and narrow layouts handled?
- Have actual color contrast and rendered layouts been checked at the target sizes?
