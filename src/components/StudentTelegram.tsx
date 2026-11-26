import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { formatTimestamp } from '../dates'
import {
  TELEGRAM_BOT,
  botLink,
  createTelegramLink,
  formatCode,
  getTelegramLink,
  resetTelegramLink,
  updateTelegramLink,
  type TelegramLink,
} from '../telegram'
import type { Student } from '../types'
import { useStore } from '../useStore'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const HOURS = Array.from({ length: 24 }, (_, h) => h)

/** Блок «Telegram» в карточке ученика: код привязки, статус, напоминания (только облачный режим). */
export function StudentTelegram({ student }: { student: Student }) {
  const { sync } = useStore()
  // undefined — грузится, null — кода ещё нет
  const [link, setLink] = useState<TelegramLink | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    getTelegramLink(supabase, student.id).then(
      (l) => {
        if (cancelled) return
        setLink(l)
        setError('')
      },
      (e: unknown) => !cancelled && setError(errText(e)),
    )
    return () => {
      cancelled = true
    }
  }, [student.id, reloadKey])

  if (sync.mode !== 'cloud' || !supabase) {
    return <p className="muted">Telegram-бот работает в облачном режиме.</p>
  }
  if (!TELEGRAM_BOT) {
    return <p className="muted">Бот не настроен: задайте имя бота в переменной TELEGRAM_BOT (сборка сайта).</p>
  }
  const sb = supabase

  if (error && link === undefined) {
    return (
      <p className="error-text">
        Не удалось загрузить Telegram: {error}. Если бот ещё не подключён, выполните блок «Telegram-бот» из
        supabase/schema.sql.
      </p>
    )
  }
  if (link === undefined) return <p className="muted">Загрузка…</p>

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(what)
    setTimeout(() => setCopied(''), 1500)
  }

  if (!link) {
    return (
      <div>
        <p className="muted">
          Ученик отправляет боту @{TELEGRAM_BOT} свой код — и бот каждый вечер напоминает про тренеры, а кнопка
          «Кабинет» открывает кабинет прямо в Telegram.
        </p>
        <button className="btn btn-primary" disabled={busy} onClick={() => void run(async () => setLink(await createTelegramLink(sb, student.id)))}>
          {busy ? 'Создаю…' : 'Выдать код для Telegram'}
        </button>
        {error && <p className="error-text">{error}</p>}
      </div>
    )
  }

  const onReset = () =>
    void run(async () => {
      if (link.linkedAt && !confirm('Отвязать Telegram ученика и выдать новый код? Напоминания придут только после новой привязки.')) return
      await resetTelegramLink(sb, student.id)
      setReloadKey((k) => k + 1)
    })

  const onPatch = (patch: { reminders?: boolean; remind_hour?: number }) =>
    void run(async () => {
      await updateTelegramLink(sb, student.id, patch)
      setLink({
        ...link,
        ...(patch.reminders !== undefined && { reminders: patch.reminders }),
        ...(patch.remind_hour !== undefined && { remindHour: patch.remind_hour }),
      })
    })

  return (
    <div>
      {link.linkedAt ? (
        <p>
          Привязан{link.tgUsername ? ` @${link.tgUsername}` : ''}
          {link.tgName && <span className="muted"> ({link.tgName})</span>}
          <span className="muted"> · с {formatTimestamp(link.linkedAt)}</span>
        </p>
      ) : (
        link.code && (
          <div>
            <p className="muted">
              Не привязан. Отправьте ученику код или ссылку — он откроет бота @{TELEGRAM_BOT}, и код отправится сам.
              Код есть и в кабинете ученика.
            </p>
            <div className="inline-form">
              <code className="tg-code">{formatCode(link.code)}</code>
              <button className="btn btn-small" onClick={() => void copy(formatCode(link.code!), 'code')}>
                {copied === 'code' ? 'Скопировано ✓' : 'Скопировать код'}
              </button>
              <button className="btn btn-small" onClick={() => void copy(botLink(link.code), 'link')}>
                {copied === 'link' ? 'Скопировано ✓' : 'Скопировать ссылку'}
              </button>
            </div>
          </div>
        )
      )}

      <div className="inline-form">
        <label className="row small">
          <input type="checkbox" checked={link.reminders} disabled={busy} onChange={(e) => onPatch({ reminders: e.target.checked })} />
          напоминать про тренеры в
        </label>
        <select
          className="input score-input"
          value={link.remindHour}
          disabled={busy || !link.reminders}
          onChange={(e) => onPatch({ remind_hour: Number(e.target.value) })}
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, '0')}:00
            </option>
          ))}
        </select>
        <span className="small muted">({link.tz})</span>
        <button className="link-btn push-right" disabled={busy} onClick={onReset}>
          {link.linkedAt ? 'Отвязать и выдать новый код' : 'Новый код'}
        </button>
      </div>
      <p className="small muted">
        Напоминание приходит раз в день и только если ученик сегодня ещё не занимался, а в тренерах есть что повторить.
        Часовой пояс берётся из браузера ученика, когда он открывает кабинет.
      </p>
      {error && <p className="error-text">{error}</p>}
    </div>
  )
}
