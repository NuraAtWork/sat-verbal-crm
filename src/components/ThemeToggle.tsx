import { useState } from 'react'
import { applyTheme, storedTheme, type Theme } from '../theme'

/** Переключатель светлой/тёмной темы в боковой панели. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(storedTheme)

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      role="switch"
      aria-checked={theme === 'dark'}
      title={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
    >
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
      {theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
    </button>
  )
}
