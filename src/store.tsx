import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { STORAGE_KEY, emptyDb, load, reducer, type Action } from './db'
import { Login } from './pages/Login'
import { applyRemote, fetchAll } from './remote'
import { supabase } from './supabase'
import type { Db } from './types'
import { StoreContext, type SyncInfo } from './useStore'

export function StoreProvider({ children }: { children: ReactNode }) {
  return supabase ? <CloudAuth sb={supabase}>{children}</CloudAuth> : <LocalStore>{children}</LocalStore>
}

const noop = () => {}

/** Локальный режим: данные только в localStorage этого браузера. */
function LocalStore({ children }: { children: ReactNode }) {
  const [db, dispatch] = useReducer(reducer, undefined, load)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  }, [db])

  const sync = useMemo<SyncInfo>(
    () => ({
      mode: 'local',
      saving: false,
      error: null,
      dismissError: noop,
      userEmail: null,
      signOut: async () => {},
      localBackup: null,
      uploadLocal: async () => false,
      dismissLocal: noop,
    }),
    [],
  )

  return <StoreContext.Provider value={{ db, dispatch, sync }}>{children}</StoreContext.Provider>
}

/** Облачный режим: сначала вход, потом данные из Supabase. */
function CloudAuth({ sb, children }: { sb: SupabaseClient; children: ReactNode }) {
  // undefined — ещё проверяем сохранённую сессию
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [sb])

  if (session === undefined) return <Splash text="Загрузка…" />
  if (!session) return <Login sb={sb} />
  return (
    <CloudStore key={session.user.id} sb={sb} email={session.user.email ?? ''}>
      {children}
    </CloudStore>
  )
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function readLocalBackup(): Db | null {
  const local = load()
  return local.students.length ? local : null
}

function CloudStore({ sb, email, children }: { sb: SupabaseClient; email: string; children: ReactNode }) {
  const [db, localDispatch] = useReducer(reducer, undefined, emptyDb)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [loadError, setLoadError] = useState('')
  const [pending, setPending] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [localBackup, setLocalBackup] = useState<Db | null>(null)

  const queue = useRef<Promise<void>>(Promise.resolve())
  const pendingRef = useRef(0)
  const needsReload = useRef(false)

  const onLoaded = useCallback((remote: Db) => {
    localDispatch({ type: 'db/replace', db: remote })
    setLocalBackup(remote.students.length === 0 ? readLocalBackup() : null)
    setStatus('ready')
  }, [])

  const onLoadFailed = useCallback((e: unknown) => {
    setLoadError(errorText(e))
    setStatus('failed')
  }, [])

  const reload = useCallback(() => fetchAll(sb).then(onLoaded, onLoadFailed), [sb, onLoaded, onLoadFailed])

  useEffect(() => {
    let cancelled = false
    fetchAll(sb).then(
      (remote) => !cancelled && onLoaded(remote),
      (e: unknown) => !cancelled && onLoadFailed(e),
    )
    return () => {
      cancelled = true
    }
  }, [sb, onLoaded, onLoadFailed])

  /** Применяет действие локально сразу, а в облако — по очереди, сохраняя порядок. */
  const enqueue = useCallback(
    (action: Action): Promise<boolean> => {
      localDispatch(action)
      pendingRef.current += 1
      setPending(pendingRef.current)
      let ok = true
      const run = queue.current
        .then(() => applyRemote(sb, action))
        .catch((e: unknown) => {
          ok = false
          needsReload.current = true
          setError(errorText(e))
        })
        .then(async () => {
          pendingRef.current -= 1
          setPending(pendingRef.current)
          // После ошибки перечитываем данные с сервера, когда очередь опустеет.
          if (pendingRef.current === 0 && needsReload.current) {
            needsReload.current = false
            await reload()
          }
        })
      queue.current = run
      return run.then(() => ok)
    },
    [sb, reload],
  )

  const dispatch = useCallback((action: Action) => void enqueue(action), [enqueue])

  // Не даём закрыть вкладку, пока изменения не дошли до сервера.
  useEffect(() => {
    if (pending === 0) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [pending])

  const sync: SyncInfo = {
    mode: 'cloud',
    saving: pending > 0,
    error,
    dismissError: () => setError(null),
    userEmail: email,
    signOut: async () => {
      await sb.auth.signOut()
    },
    localBackup,
    uploadLocal: async () => {
      if (!localBackup) return false
      const ok = await enqueue({ type: 'db/replace', db: localBackup })
      if (ok) {
        localStorage.removeItem(STORAGE_KEY)
        setLocalBackup(null)
      }
      return ok
    },
    dismissLocal: () => setLocalBackup(null),
  }

  if (status === 'loading') return <Splash text="Загружаю данные…" />
  if (status === 'failed') {
    return (
      <Splash text={`Не удалось загрузить данные: ${loadError}`}>
        <div className="row">
          <button
            className="btn btn-primary"
            onClick={() => {
              setStatus('loading')
              void reload()
            }}
          >
            Повторить
          </button>
          <button className="btn" onClick={() => void sb.auth.signOut()}>
            Выйти
          </button>
        </div>
      </Splash>
    )
  }

  return <StoreContext.Provider value={{ db, dispatch, sync }}>{children}</StoreContext.Provider>
}

function Splash({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="splash">
      <div className="brand-mark">RW</div>
      <p>{text}</p>
      {children}
    </div>
  )
}
