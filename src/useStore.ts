import { createContext, useContext } from 'react'
import type { Action } from './db'
import type { Db } from './types'

interface StoreValue {
  db: Db
  dispatch: (action: Action) => void
}

export const StoreContext = createContext<StoreValue | null>(null)

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}
