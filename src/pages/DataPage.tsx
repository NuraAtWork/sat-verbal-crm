import { useRef, useState, type ChangeEvent } from 'react'
import { today } from '../dates'
import { demoDb } from '../demo'
import { emptyDb, normalizeDb } from '../db'
import { isQuestionSet, uploadQuestionSets } from '../sets'
import { supabase } from '../supabase'
import { useStore } from '../useStore'

export function DataPage() {
  const { db, dispatch, sync } = useStore()
  const cloud = sync.mode === 'cloud'
  const fileRef = useRef<HTMLInputElement>(null)
  // merge — дописать к текущим; replace — восстановить копию целиком
  const importMode = useRef<'merge' | 'replace'>('merge')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

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
      const raw: unknown = JSON.parse(await file.text())
      const parsed = normalizeDb(raw)
      if (!parsed) {
        setMessage('Файл не похож на резервную копию этой CRM.')
        return
      }
      // Файл может содержать сеты вопросов (questionSets) — они хранятся только в облаке.
      const rawSets = (raw as { questionSets?: unknown }).questionSets
      const sets = Array.isArray(rawSets) ? rawSets.filter(isQuestionSet) : []
      let setsNote = ''
      if (sets.length) {
        if (cloud && supabase) {
          setBusy(true)
          try {
            await uploadQuestionSets(supabase, sets, (done, total) => setMessage(`Загружаю сеты вопросов: ${done}/${total}…`))
          } catch (e) {
            setMessage(`Не удалось загрузить сеты: ${e instanceof Error ? e.message : String(e)}. Попробуйте ещё раз.`)
            return
          } finally {
            setBusy(false)
          }
          setsNote = ` Сетов вопросов загружено: ${sets.length}.`
        } else {
          setsNote = ` Сеты вопросов (${sets.length}) загрузятся в облачном режиме — пока добавлены ссылки на Drive.`
        }
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
        setMessage(`Восстановлено из копии: ${counts}.${setsNote}`)
      } else {
        dispatch({ type: 'db/merge', db: parsed })
        setMessage(`Добавлено или обновлено: ${counts}. Остальные данные не тронуты.${setsNote}`)
      }
    } catch {
      setMessage('Не удалось прочитать файл.')
    }
  }

  const loadDemo = () => {
    const hasData = db.students.length + db.lessons.length + db.scores.length + db.materials.length > 0
    if (hasData && !confirm('Заменить ВСЕ текущие данные демо-данными?')) return
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
          <button className="btn" disabled={busy} onClick={() => pickFile('replace')}>
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
          <button className="btn" disabled={busy} onClick={() => pickFile('merge')}>
            Выбрать файл…
          </button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importJson} />
      </section>

      <section className="card">
        <h2>Прочее</h2>
        <div className="row">
          {!cloud && (
            <button className="btn" onClick={loadDemo}>
              Загрузить демо-данные
            </button>
          )}
          <button className="btn btn-danger" onClick={clearAll}>
            Очистить всё
          </button>
        </div>
      </section>

      {message && <p className="message">{message}</p>}
    </div>
  )
}
