import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { ThemeToggle } from '@/components/theme-toggle'

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <nav className="flex flex-wrap items-center justify-between gap-4 border-b bg-muted/40 p-4">
        <div className="flex gap-4">
          <Link to="/" className="[&.active]:font-bold hover:underline">Home</Link>
          <Link to="/about" className="[&.active]:font-bold hover:underline">About</Link>
        </div>
        <ThemeToggle />
      </nav>
      <main className="flex-1 p-6 container mx-auto">
        <Outlet /> 
      </main>
      <TanStackRouterDevtools />
    </div>
  ),
})