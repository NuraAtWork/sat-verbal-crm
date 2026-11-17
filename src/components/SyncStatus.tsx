import { LogOut } from 'lucide-react'
import { useStore } from '../useStore'

/** Низ боковой панели: аккаунт, статус сохранения, выход (или пометка локального режима). */
export function SyncStatus() {
  const { sync } = useStore()

  if (sync.mode === 'local') {
    return (
      <div className="sync-local" title="Supabase не настроен — данные хранятся только в этом браузере">
        <span className="sync-dot sync-local" /> <span className="theme-label">Локальный режим</span>
      </div>
    )
  }

  const email = sync.userEmail ?? ''
  const status = sync.error ? 'Ошибка сохранения' : sync.saving ? 'Сохранение…' : 'Сохранено'
  const dot = sync.error ? 'sync-error' : sync.saving ? 'sync-saving' : 'sync-ok'

  return (
    <div className="account">
      <span className="avatar" aria-hidden="true">
        {email.slice(0, 1).toUpperCase() || '?'}
      </span>
      <span className="account-text">
        <span className="sync-user" title={email}>
          {email}
        </span>
        <span className="sync-row">
          <span className={`sync-dot ${dot}`} />
          {status}
        </span>
      </span>
      <button
        className="icon-btn"
        onClick={() => void sync.signOut()}
        disabled={sync.saving}
        title="Выйти"
        aria-label="Выйти"
      >
        <LogOut size={16} />
      </button>
    </div>
  )
}
