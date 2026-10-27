# Contributing to PlankPlan Studio

Contributions, bug reports, and suggestions are welcome. For a bug, describe what you expected, what happened, steps to reproduce, and your browser and operating system. Avoid including project files or screenshots containing private information. For security issues, follow [SECURITY.md](SECURITY.md).

## Set up

Use Node.js 22.22.2 or newer in the 22.x line, or Node.js 24.15 or newer, and npm. Clone the repository, then run:

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. The app stores development projects in the local browser; export backups before clearing its site data.

## Make a change

1. Discuss substantial changes in an issue before investing in implementation, especially changes to project data, optimization, or 3D-to-cutlist behavior.
2. Follow the repository guidance in [AGENTS.md](AGENTS.md), the [design guide](docs/DESIGN.md), and relevant specifications. Do not edit the generated `src/routeTree.gen.ts` by hand.
3. Add or update tests when they meaningfully cover the behavior. Keep test files under `src/` and outside `src/routes/`.
4. Run the checks below. Describe the change, verification, known limitations, and include screenshots for visual changes in your pull request.
5. Update relevant documentation and the unreleased section of [CHANGELOG.md](CHANGELOG.md) for user-visible changes.

```sh
npm run test
npm run lint
npm run build
```

The 3D Design workspace is beta. Changes should preserve the independent Cutlist workflow and avoid silently replacing user-maintained data. See the [3D workspace guide](docs/plankplan-studio-3d-workspace-guide.md) for its boundaries and outstanding verification.
