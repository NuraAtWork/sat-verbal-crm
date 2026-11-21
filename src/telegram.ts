import type { SupabaseClient } from '@supabase/supabase-js'

// Telegram-бот: привязка ученика по коду, напоминания про тренеры, вход в кабинет как Mini App.
// Сервер — Edge Function `telegram` (supabase/functions/telegram), схема — блок «Telegram-бот» в
// supabase/schema.sql. Имя бота задаётся при сборке (VITE_TELEGRAM_BOT); пусто — блоки Telegram скрыты.

/** Юзернейм бота без @ (например SatStartBot) или пусто, если бот не настроен. */
export const TELEGRAM_BOT = (import.meta.env.VITE_TELEGRAM_BOT ?? '').replace(/^@/, '').trim()

/** Ссылка, которая открывает бота и сразу отправляет ему код. */
export const botLink = (code?: string | null) =>
  `https://t.me/${TELEGRAM_BOT}${code ? `?start=${code}` : ''}`

/** K7M4QX → K7M-4QX (читать и диктовать удобнее; бот принимает код с дефисом и без). */
export const formatCode = (code: string) => (code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code)

// --- Mini App ---------------------------------------------------------------------------

const ROUTE_RE = /^(me|grammar|vocab)\/([0-9a-f]{64}|demo)(\/[a-z]*)?$/

/**
 * Вызывается до разбора адреса. Бот открывает страницы как Mini App по ссылке `?open=<маршрут>`
 * (маршрут нельзя положить в #: Telegram дописывает в # свои параметры tgWebApp…).
 * Переводит ?open= в обычный #-маршрут и убирает из адреса параметры Telegram.
 * Возвращает true, если страница открыта внутри Telegram.
 */
export function prepareTelegramEntry(): boolean {
  const { search, hash, pathname } = window.location
  const open = new URLSearchParams(search).get('open') ?? ''
  const at = hash.indexOf('tgWebApp')
  const inTelegram = at >= 0 || Boolean(open)
  if (!inTelegram) return false
  if (at >= 0) {
    // параметры запуска пригодятся позже (вход по Telegram без ссылок) — держим их в этой вкладке
    try {
      sessionStorage.setItem('tg-launch', hash.slice(at))
    } catch {
      // без sessionStorage просто не сохраняем
    }
  }
  const route = ROUTE_RE.test(open) ? `#/${open}` : at >= 0 ? hash.slice(0, at).replace(/[#&?]+$/, '') : hash
  window.history.replaceState(null, '', `${pathname}${route}`)
  loadTelegramScript()
  return true
}

interface TelegramWebApp {
  ready(): void
  expand(): void
}

/** Скрипт Telegram: говорим, что страница готова, и разворачиваем её на весь экран. */
function loadTelegramScript() {
  const script = document.createElement('script')
  script.src = 'https://telegram.org/js/telegram-web-app.js'
  script.async = true
  script.onload = () => {
    const app = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp
    app?.ready()
    app?.expand()
  }
  document.head.appendChild(script)
}

// --- Supabase ---------------------------------------------------------------------------

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

/** Привязка ученика (как её видит репетитор). */
export interface TelegramLink {
  code: string | null
  tgUsername: string
  tgName: string
  linkedAt: string | null
  reminders: boolean
  remindHour: number
  tz: string
}

interface LinkRow {
  code: string | null
  tg_username: string
  tg_name: string
  linked_at: string | null
  reminders: boolean
  remind_hour: number
  tz: string
}

const LINK_COLS = 'code, tg_username, tg_name, linked_at, reminders, remind_hour, tz'
const rowToLink = (r: LinkRow): TelegramLink => ({
  code: r.code,
  tgUsername: r.tg_username,
  tgName: r.tg_name,
  linkedAt: r.linked_at,
  reminders: r.reminders,
  remindHour: r.remind_hour,
  tz: r.tz,
})

export async function getTelegramLink(sb: SupabaseClient, studentId: string): Promise<TelegramLink | null> {
  const data = check(await sb.from('telegram_links').select(LINK_COLS).eq('student_id', studentId).maybeSingle())
  return data ? rowToLink(data as LinkRow) : null
}

/** Заводит запись с новым кодом (если её ещё нет) и возвращает её. */
export async function createTelegramLink(sb: SupabaseClient, studentId: string): Promise<TelegramLink> {
  check(await sb.from('telegram_links').upsert({ student_id: studentId }, { onConflict: 'student_id', ignoreDuplicates: true }))
  const link = await getTelegramLink(sb, studentId)
  if (!link) throw new Error('Не удалось создать код')
  return link
}

/** Снимает привязку и выдаёт новый код. */
export async function resetTelegramLink(sb: SupabaseClient, studentId: string): Promise<void> {
  check(await sb.rpc('telegram_reset', { p_student_id: studentId }))
}

export async function updateTelegramLink(
  sb: SupabaseClient,
  studentId: string,
  patch: { reminders?: boolean; remind_hour?: number },
): Promise<void> {
  check(await sb.from('telegram_links').update(patch).eq('student_id', studentId))
}

/** Telegram в кабинете ученика: код для привязки или «уже подключён». */
export interface PortalTelegram {
  linked: boolean
  code: string | null
  username: string
  reminders: boolean
  remind_hour: number
}

export async function fetchPortalTelegram(sb: SupabaseClient, portalToken: string): Promise<PortalTelegram | null> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null
  return check(await sb.rpc('telegram_portal', { p_token: portalToken, p_tz: tz })) as PortalTelegram | null
}
