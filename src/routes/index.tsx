import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/')({
  component: HomeComponent,
})

function HomeComponent() {
  return (
    <div className="space-y-4">
      <h1 className="text-4xl font-extrabold tracking-tight">Welcome to the Boilerplate Template</h1>
      <p className="text-muted-foreground text-lg">Vite + React + TanStack Router + Tailwind CSS + shadcn/ui</p>
      <Button>Click Me</Button>
    </div>
  )
}