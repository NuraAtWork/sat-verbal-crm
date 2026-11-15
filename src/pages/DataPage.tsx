import { useRef, useState, type ChangeEvent } from 'react'
import { today } from '../dates'
import { demoDb } from '../demo'
import { emptyDb, normalizeDb } from '../db'
import { useStore } from '../useStore'

export function DataPage() {
  const { db, dispatch, sync } = useStore()
  const cloud = sync.mode === 'cloud'
  const fileRef = useRef<HTMLInputElement>(null)
  // merge — дописать к текущим; replace — восстановить копию целиком
  const importMode = useRef<'merge' | 'replace'>('merge')
  const [message, setMessage] = useState('')

  const pickFile = (mode: 'merge' | 'replace') => {
    importMode.current = mode
    fileRef.current?.click()
  }

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
      const parsed = normalizeDb(JSON.parse(await file.text()))
      if (!parsed) {
        setMessage('Файл не похож на резервную копию этой CRM.')
        return
      }
      const counts =
        [
          [parsed.students.length, 'учеников'],
          [parsed.lessons.length, 'уроков'],
          [parsed.scores.length, 'тестов'],
          [parsed.materials.length, 'материалов'],
        ]
          .filter(([n]) => n)
          .map(([n, label]) => `${label}: ${n}`)
          .join(', ') || 'пустой файл'
      if (importMode.current === 'replace') {
        if (!confirm(`Заменить ВСЕ текущие данные содержимым файла (${counts})?`)) return
        dispatch({ type: 'db/replace', db: parsed })
        setMessage(`Восстановлено из копии: ${counts}.`)
      } else {
        dispatch({ type: 'db/merge', db: parsed })
        setMessage(`Добавлено или обновлено: ${counts}. Остальные данные не тронуты.`)
      }
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
          Сейчас: {db.students.length} учеников · {db.lessons.length} уроков · {db.scores.length} тестов ·{' '}
          {db.materials.length} материалов
        </p>
      </section>

      <section className="card">
        <h2>Резервная копия</h2>
        <div className="row">
          <button className="btn btn-primary" onClick={exportJson}>
            Экспорт в JSON
          </button>
          <button className="btn" onClick={() => pickFile('replace')}>
            Восстановить из копии
          </button>
        </div>
        <p className="muted small">«Восстановить» заменяет все текущие данные содержимым файла.</p>
      </section>

      <section className="card">
        <h2>Добавить из файла</h2>
        <p className="muted small">
          Записи из JSON-файла добавятся к текущим: совпадающие (по id) обновятся, новые добавятся, ничего не
          удаляется. Подходит для готовых наборов материалов.
        </p>
        <div className="row">
          <button className="btn" onClick={() => pickFile('merge')}>
            Выбрать файл…
          </button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importJson} />
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
