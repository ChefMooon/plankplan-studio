import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: () => <div className="text-xl font-medium">This is the about page layout!</div>,
})