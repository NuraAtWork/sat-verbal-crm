import { X } from 'lucide-react'
import { useState } from 'react'
import { useStore } from '../useStore'

/** Сообщения об ошибках сохранения и предложение перенести локальные данные в облако. */
export function SyncBanners() {
  const { sync } = useStore()
  const [uploading, setUploading] = useState(false)

  return (
    <>
      {sync.error && (
        <div className="banner banner-error">
          <span>
            Не удалось сохранить изменения: {sync.error}. Данные перечитаны с сервера — проверьте последнее
            действие.
          </span>
          <button className="icon-btn" title="Скрыть" onClick={sync.dismissError}>
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      )}
      {sync.localBackup && (
        <div className="banner">
          <span>
            В этом браузере остались данные из локального режима: {sync.localBackup.students.length} учеников,{' '}
            {sync.localBackup.lessons.length} уроков, {sync.localBackup.scores.length} тестов. Облако пока пустое.
          </span>
          <div className="row">
            <button
              className="btn btn-primary"
              disabled={uploading}
              onClick={async () => {
                setUploading(true)
                await sync.uploadLocal()
                setUploading(false)
              }}
            >
              {uploading ? 'Переношу…' : 'Перенести в облако'}
            </button>
            <button className="btn" onClick={sync.dismissLocal}>
              Не сейчас
            </button>
          </div>
        </div>
      )}
    </>
  )
}
