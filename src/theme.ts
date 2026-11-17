export type Theme = 'light' | 'dark'

const KEY = 'sat-verbal-crm:theme'

/** Сохранённая тема; по умолчанию светлая. */
export function storedTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // приватный режим и т.п. — тема просто не запомнится
  }
}
