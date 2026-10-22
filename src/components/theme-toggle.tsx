import { Monitor, Moon, Sun } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useTheme, type Theme } from '@/components/theme-context'

const themeOptions: { value: Theme; label: string; icon: typeof Monitor }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const currentOption = themeOptions.find((option) => option.value === theme) ?? themeOptions[0]
  const currentIndex = themeOptions.findIndex((option) => option.value === theme)
  const nextOption = themeOptions[(currentIndex + 1) % themeOptions.length]
  const Icon = currentOption.icon

  return (
    <Button
      aria-label={`Theme: ${currentOption.label}. Switch to ${nextOption.label}.`}
      onClick={() => setTheme(nextOption.value)}
      size="sm"
      title={`Switch to ${nextOption.label} theme`}
      variant="outline"
    >
      <Icon aria-hidden="true" weight="regular" />
      <span>{currentOption.label}</span>
    </Button>
  )
}
