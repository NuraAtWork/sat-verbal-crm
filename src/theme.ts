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
  const root = document.documentElement
  // На миг выключаем плавные переходы, иначе часть элементов «доезжает» до новых цветов позже остальных
  root.classList.add('theme-switching')
  root.dataset.theme = theme
  void root.offsetHeight
  requestAnimationFrame(() => root.classList.remove('theme-switching'))
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // приватный режим и т.п. — тема просто не запомнится
  }
}
