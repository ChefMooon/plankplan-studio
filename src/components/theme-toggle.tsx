import { Monitor, Moon, Sun } from '@phosphor-icons/react'
import { useTheme, type Theme } from '@/components/theme-context'

const themeOptions: { value: Theme; label: string; icon: typeof Monitor }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="theme-picker" role="group" aria-label="Color theme">
      {themeOptions.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          className="theme-picker-option"
          aria-label={`${label} theme`}
          aria-pressed={theme === value}
          title={`${label} theme`}
          onClick={() => setTheme(value)}
        >
          <Icon aria-hidden="true" weight="regular" />
        </button>
      ))}
    </div>
  )
}
