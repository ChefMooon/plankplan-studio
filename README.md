# Web Static Template

A fast, type-safe starter template for building production-ready Single Page Applications with a built-in design system.

## Tech Stack

- **Build Engine:** [Vite](https://vite.dev/) (Next-generation native ES Modules dev server)
- **Framework:** [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Routing Engine:** [TanStack Router](https://tanstack.com/router/latest) (100% Type-Safe, file-based routing)
- **Styling Pipeline:** [Tailwind CSS v4.0](https://tailwindcss.com/) (High-performance utility engine)
- **UI Architecture:** [shadcn/ui](https://ui.shadcn.com/) (Accessible, unstyled primitives powered by Radix UI)

---

## Key Architecture & Directory Structure

- **public/**
  - `_redirects` — Cloudflare Pages SPA catch-all routing rules
- **src/**
  - **components/ui/** — Component primitives injected directly via shadcn CLI (e.g., `button.tsx`)
  - **routes/** — File-based routing tree monitored by TanStack Router
    - `__root.tsx` — Master layout wrapper (Navbar, layout, DevTools)
    - `index.tsx` — Home page route ('/')
    - `about.tsx` — About page route ('/about')
  - `routeTree.gen.ts` — AUTOMATICALLY GENERATED — DO NOT EDIT
  - `index.css` — Global Tailwind v4 engine layer entrypoint
  - `main.tsx` — Application bootstrap and strict route mounting
- `components.json` — shadcn/ui framework workspace configurations
- `tsconfig.json` — Custom compiler options & path aliases (@/*)
- `vite.config.ts` — Tailwind, Path Aliases, and TanStack compiler pipelines

---

## Local Development Workflow

### 1. Install Workspace Dependencies
npm install

### 2. Boot up the Dev Server
npm run dev

*Note: TanStack Router will continuously watch your src/routes/ directory and auto-generate type definitions inside src/routeTree.gen.ts as you create new route files.*

### 3. Injecting UI Primitives (shadcn)
You own the components in your codebase. To add more accessible components, execute:
npx shadcn@latest add [component-name]  
[Component List](https://ui.shadcn.com/docs/components)

---

## Type-Safe Routing Rules

This setup uses TanStack Router. Features to keep in mind while building:
1. **Layout Wrappers:** Every route rendered is dynamically nested inside the Outlet component located within `src/routes/__root.tsx`.
2. **FileSystem Mapping:** A file created at `src/routes/dashboard.tsx` automatically maps out to the URL path `/dashboard` with full compilation safety.
3. **Internal Navigation:** Always use the type-safe Link component instead of traditional anchor tags to maintain local application state.

---