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
  const currentIndex = themeOptions.findIndex(option => option.value === theme)
  const nextTheme = themeOptions[(currentIndex + 1) % themeOptions.length]
  const currentTheme = themeOptions[currentIndex]
  const CurrentIcon = currentTheme.icon
  const nextLabel = nextTheme.label

  return (
    <>
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
      <button
        type="button"
        className="theme-cycle"
        aria-label={`Color theme: ${currentTheme.label}. Switch to ${nextLabel} theme`}
        onClick={() => setTheme(nextTheme.value)}
      >
        <CurrentIcon aria-hidden="true" weight="regular" />
      </button>
    </>
  )
}
