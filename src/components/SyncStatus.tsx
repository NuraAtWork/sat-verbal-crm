import { useStore } from '../useStore'

/** Нижняя часть боковой панели: режим хранения, статус сохранения, выход. */
export function SyncStatus() {
  const { sync } = useStore()

  if (sync.mode === 'local') {
    return (
      <div className="sync" title="Supabase не настроен — данные хранятся только в этом браузере">
        <span className="sync-dot sync-local" /> Локальный режим
      </div>
    )
  }

  return (
    <div className="sync">
      <div className="sync-user" title={sync.userEmail ?? ''}>
        {sync.userEmail}
      </div>
      <div className="sync-row">
        <span className={`sync-dot ${sync.error ? 'sync-error' : sync.saving ? 'sync-saving' : 'sync-ok'}`} />
        {sync.error ? 'Ошибка сохранения' : sync.saving ? 'Сохранение…' : 'Сохранено'}
        <button className="link-btn" onClick={() => void sync.signOut()} disabled={sync.saving}>
          Выйти
        </button>
      </div>
    </div>
  )
}
