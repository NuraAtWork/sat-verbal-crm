import { createContext, useContext } from 'react'
import type { Action } from './db'
import type { Db } from './types'

export interface SyncInfo {
  /** local — только localStorage; cloud — Supabase */
  mode: 'local' | 'cloud'
  /** Есть неотправленные изменения */
  saving: boolean
  /** Последняя ошибка сохранения в облако */
  error: string | null
  dismissError: () => void
  userEmail: string | null
  signOut: () => Promise<void>
  /** Данные, оставшиеся в localStorage с локального режима (облако при этом пустое) */
  localBackup: Db | null
  uploadLocal: () => Promise<boolean>
  dismissLocal: () => void
}

interface StoreValue {
  db: Db
  dispatch: (action: Action) => void
  sync: SyncInfo
}

export const StoreContext = createContext<StoreValue | null>(null)

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}
