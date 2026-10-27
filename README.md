# PlankPlan Studio

PlankPlan Studio helps woodworkers plan projects, work out what stock to buy, and organize cuts. Create a cutlist directly or use the optional 3D Design workspace to model components and review their inclusion in a cutlist.

## Features

- **Projects:** Create, rename, duplicate, and delete local projects; organize parts, materials, and stock with imperial or metric measurements.
- **Cut planning:** Optimize linear boards, sheet goods, or a mix of both. Set quantities, kerf, trim, stock availability, prices, and other project settings. Review cut diagrams, shopping lists, costs, offcuts, and fit or input warnings.
- **3D design (beta):** Draw and edit simple shapes, create reusable components, measure, paint, and inspect a project. Review proposed cutlist changes before applying them; manual cutlist entries remain available independently. Modeling and stock-fit checks have [documented limits](docs/plankplan-studio-3d-workspace-guide.md#delivered-behavior-and-current-limits).
- **Shop outputs and backups:** Export project data as JSON, export a cutlist as CSV, or print results using the browser, including Save as PDF where supported. Import a JSON backup as a project or replace an existing project's contents.
- **Display:** Choose a light, dark, or system theme. Results adapt to smaller screens.

## Getting started

1. Open PlankPlan Studio and create a project from the dashboard, or import a JSON backup.
2. In **Cutlist**, add parts, materials, and the stock options and prices available to you. Set your cutting and project preferences, then run the optimizer and review the results.
3. Optionally open the project's **Design** area to model components and review changes before applying them to the cutlist.
4. Export a JSON backup and use CSV or **Print / Save PDF** for your shop workflow.

The standalone Design preview on the dashboard is illustrative and does not save a project. To save a model, open a project's Design area.

## Data and current limits

Projects are stored locally in the browser on this device. They do not automatically sync between devices, and clearing browser data can remove them. Export JSON backups regularly and before moving to another browser or device. Prices are entered manually; there is no automatic store lookup. Accounts and cloud sync are not available.

The 3D workspace is in beta: bugs and further improvements are expected as the core planning flow develops. It supports a bounded set of modeling operations rather than general-purpose CAD. Its accessibility, browser compatibility, and performance release checks are still incomplete; see the [3D workspace guide](docs/plankplan-studio-3d-workspace-guide.md) and [verification evidence](docs/plans/3d-workspace/phase-7-evidence.md).

## Running locally

To run the application from source, install Node.js 22.22.2 or newer in the 22.x line, or Node.js 24.15 or newer, and npm. From the repository directory:

```sh
npm install
npm run dev
```

Open the local address printed by Vite. For development checks:

```sh
npm run test
npm run lint
npm run build
```

The app is built with React, TypeScript, Vite, and TanStack Router. Repository conventions are in [AGENTS.md](AGENTS.md).

## Documentation

- [3D workspace guide](docs/plankplan-studio-3d-workspace-guide.md) — tools, workflow, and current limits.
- [Roadmap](docs/plankplan-studio-roadmap.md) — current work and possible future features.
- [Documentation register](docs/plankplan-studio-mvp.md#document-register) — product requirements, design guidance, contracts, and implementation plans. These include historical requirements and future proposals, not just delivered features.

- [Contributing](CONTRIBUTING.md), [changelog](CHANGELOG.md), [security](SECURITY.md), and [privacy](PRIVACY.md).

## License

Licensed under the [MIT License](LICENSE).
