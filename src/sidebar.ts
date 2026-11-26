const KEY = 'sat-verbal-crm:sidebar'

/** Свёрнута ли боковая панель; по умолчанию развёрнута. */
export function storedSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) === 'collapsed'
  } catch {
    return false
  }
}

export function storeSidebarCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(KEY, collapsed ? 'collapsed' : 'expanded')
  } catch {
    // приватный режим и т.п. — выбор просто не запомнится
  }
}
