import { useEffect, useReducer, type ReactNode } from 'react'
import { STORAGE_KEY, load, reducer } from './db'
import { StoreContext } from './useStore'

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, dispatch] = useReducer(reducer, undefined, load)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  }, [db])

  return <StoreContext.Provider value={{ db, dispatch }}>{children}</StoreContext.Provider>
}
