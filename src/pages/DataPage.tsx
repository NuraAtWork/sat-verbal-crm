import { useRef, useState, type ChangeEvent } from 'react'
import { today } from '../dates'
import { demoDb } from '../demo'
import { emptyDb, isDb } from '../db'
import { useStore } from '../useStore'

export function DataPage() {
  const { db, dispatch, sync } = useStore()
  const cloud = sync.mode === 'cloud'
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sat-verbal-crm-${today()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importJson = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isDb(parsed)) {
        setMessage('Файл не похож на резервную копию этой CRM.')
        return
      }
      if (!confirm('Заменить текущие данные содержимым файла?')) return
      dispatch({ type: 'db/replace', db: parsed })
      setMessage(`Импортировано: ${parsed.students.length} учеников, ${parsed.lessons.length} уроков.`)
    } catch {
      setMessage('Не удалось прочитать файл.')
    }
  }

  const loadDemo = () => {
    if (db.students.length && !confirm('Заменить текущие данные демо-данными?')) return
    dispatch({ type: 'db/replace', db: demoDb() })
    setMessage('Демо-данные загружены.')
  }

  const clearAll = () => {
    const where = cloud ? 'в облаке' : 'в этом браузере'
    if (!confirm(`Удалить все данные ${where}? Отменить это нельзя — сначала лучше сделать экспорт.`)) return
    dispatch({ type: 'db/replace', db: emptyDb() })
    setMessage('Данные очищены.')
  }

  return (
    <div className="page narrow">
      <h1>Данные</h1>

      <section className="card">
        <h2>Где хранятся данные</h2>
        {cloud ? (
          <p>
            Данные хранятся в облаке (Supabase) и доступны с любого устройства после входа. Экспорт в JSON —
            дополнительная резервная копия на всякий случай.
          </p>
        ) : (
          <p>
            Сейчас всё хранится только в этом браузере (localStorage): на другом устройстве данных не будет, а
            очистка браузера их сотрёт. Регулярно делайте экспорт — это резервная копия в JSON.
          </p>
        )}
        <p className="muted small">
          Сейчас: {db.students.length} учеников · {db.lessons.length} уроков · {db.scores.length} тестов
        </p>
      </section>

      <section className="card">
        <h2>Резервная копия</h2>
        <div className="row">
          <button className="btn btn-primary" onClick={exportJson}>
            Экспорт в JSON
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Импорт из JSON
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importJson} />
        </div>
      </section>

      <section className="card">
        <h2>Прочее</h2>
        <div className="row">
          <button className="btn" onClick={loadDemo}>
            Загрузить демо-данные
          </button>
          <button className="btn btn-danger" onClick={clearAll}>
            Очистить всё
          </button>
        </div>
      </section>

      {message && <p className="message">{message}</p>}
    </div>
  )
}
