import { Monitor, Moon, Sun } from '@phosphor-icons/react'
import { useTheme, type Theme } from '@/components/theme-context'
import { SegmentedControl } from '@/components/ui/segmented-control'

const themeOptions: { value: Theme; label: string; icon: typeof Monitor }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <SegmentedControl<Theme>
      className="theme-picker"
      aria-label="Color theme"
      value={theme}
      onValueChange={setTheme}
      iconOnly
      options={themeOptions.map(({ value, label, icon: Icon }) => ({
        value,
        label: `${label} theme`,
        icon: <Icon aria-hidden="true" weight="regular" />,
      }))}
    />
  )
}
