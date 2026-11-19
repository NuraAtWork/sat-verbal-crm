import { useEffect, useState } from 'react'
import { createPortal, deletePortal, getPortalToken, portalUrl } from '../portal'
import { supabase } from '../supabase'
import type { Student } from '../types'
import { useStore } from '../useStore'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Блок «Кабинет ученика» в карточке ученика (только облачный режим): открыть кабинет, ссылка. */
export function StudentPortal({ student }: { student: Student }) {
  const { sync } = useStore()
  // undefined — ещё грузится, null — кабинет не открыт
  const [token, setToken] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    getPortalToken(supabase, student.id).then(
      (t) => !cancelled && setToken(t),
      (e: unknown) => !cancelled && setError(errText(e)),
    )
    return () => {
      cancelled = true
    }
  }, [student.id])

  if (sync.mode !== 'cloud' || !supabase) {
    return (
      <p className="muted">
        Кабинет ученика работает в облачном режиме — после подключения Supabase. Посмотреть, как он выглядит:{' '}
        <a href="#/me/demo" target="_blank" rel="noreferrer">
          демо
        </a>
        .
      </p>
    )
  }
  const sb = supabase

  if (error && token === undefined) {
    return (
      <p className="error-text">
        Не удалось загрузить кабинет: {error}. Если он ещё не подключён, выполните блок «Кабинет ученика» из
        supabase/schema.sql в SQL Editor.
      </p>
    )
  }
  if (token === undefined) return <p className="muted">Загрузка…</p>

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <div>
        <p className="muted">
          Одна постоянная ссылка вместо отдельной на каждое задание: ученик видит, что нужно сделать, последний урок
          с ДЗ, сданные задания с разбором, баллы и словарь. Оплату, заметки и контакты кабинет не показывает.
        </p>
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() => run(async () => setToken(await createPortal(sb, student.id)))}
        >
          {busy ? 'Открываю…' : 'Открыть кабинет'}
        </button>
        {error && <p className="error-text">{error}</p>}
      </div>
    )
  }

  return (
    <div>
      <div className="inline-form">
        <button
          className="btn btn-small"
          onClick={async () => {
            await navigator.clipboard.writeText(portalUrl(token))
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? 'Скопировано ✓' : 'Скопировать ссылку ученика'}
        </button>
        <a className="btn btn-small" href={portalUrl(token)} target="_blank" rel="noreferrer">
          Посмотреть как ученик
        </a>
        <button
          className="link-btn push-right"
          disabled={busy}
          onClick={() =>
            confirm('Закрыть кабинет? Текущая ссылка перестанет работать. Задания и результаты останутся.') &&
            run(async () => {
              await deletePortal(sb, student.id)
              setToken(null)
            })
          }
        >
          Закрыть кабинет
        </button>
      </div>
      <p className="muted small">
        Ссылка постоянная: новые задания появляются в кабинете сами, отправлять их по отдельности не нужно.
      </p>
      {error && <p className="error-text">{error}</p>}
    </div>
  )
}
