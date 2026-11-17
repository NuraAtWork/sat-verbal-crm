import { Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { applyTheme, storedTheme, type Theme } from '../theme'

/** Переключатель светлой/тёмной темы в боковой панели. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(storedTheme)
  const dark = theme === 'dark'

  const toggle = () => {
    const next: Theme = dark ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      role="switch"
      aria-checked={dark}
      title={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
    >
      {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
      <span className="theme-label">{dark ? 'Светлая тема' : 'Тёмная тема'}</span>
    </button>
  )
}
