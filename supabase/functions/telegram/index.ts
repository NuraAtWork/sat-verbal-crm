// Telegram-бот Verbal CRM (Supabase Edge Function `telegram`, verify_jwt = false).
//
// Маршруты (все — POST на /functions/v1/telegram):
//   с заголовком X-Telegram-Bot-Api-Secret-Token — обновления от Telegram (вебхук);
//   ?task=setup  — зарегистрировать вебхук, команды и описание бота (повторный вызов безопасен);
//   ?task=remind — ежечасная задача напоминаний (pg_cron); идемпотентна: telegram_reminders_claim
//                  отдаёт ученика не чаще раза в день и только в его час.
//
// Настройки — только переменными окружения (секреты Supabase):
//   TELEGRAM_BOT_TOKEN — токен бота (обязателен; другой бот = другой токен, код менять не нужно);
//   SITE_URL — адрес сайта с кабинетом (по умолчанию GitHub Pages проекта).
// SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY Supabase подставляет сам.
// Схема и функции — блок «Telegram-бот» в supabase/schema.sql.

import { createClient } from 'npm:@supabase/supabase-js@2'

const TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const SITE = (Deno.env.get('SITE_URL') ?? 'https://nuraatwork.github.io/sat-verbal-crm/').replace(/\/?$/, '/')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const db = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
})

// --- Telegram API ----------------------------------------------------------------------

async function tg(method: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as Record<string, unknown>
  if (!data.ok) console.error(`telegram ${method}:`, data.description)
  return data
}

/** Секрет вебхука выводится из токена: отдельный секрет заводить не нужно, а при смене бота он меняется сам. */
async function webhookSecret(): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`webhook:${TOKEN}`))
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 48)
}

// --- Данные ученика ------------------------------------------------------------------------

interface Trainer {
  token: string
  due: number
  new: number
}

interface Context {
  ok?: boolean
  reason?: string
  student: string | null
  chat_id: number | null
  portal: string | null
  reminders?: boolean
  remind_hour?: number
  grammar: Trainer | null
  vocab: Trainer | null
  practiced: boolean
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data as T
}

// --- Сообщения -----------------------------------------------------------------------------

/** Ссылка, которая открывает страницу сайта как Mini App (маршрут — в ?open=, см. src/telegram.ts). */
const appUrl = (route: string) => `${SITE}?open=${route}`

const app = (text: string, route: string) => ({ text, web_app: { url: appUrl(route) } })

function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b === 1) return one
  if (b >= 2 && b <= 4) return few
  return many
}

const left = (t: Trainer | null) => (t ? t.due + t.new : 0)

/** Строка «4 правила» / «12 слов» или пусто, если делать нечего. */
function trainerLine(t: Trainer | null, kind: 'grammar' | 'vocab'): string {
  const n = left(t)
  if (!t || n === 0) return ''
  return kind === 'grammar'
    ? `грамматика — ${n} ${plural(n, 'правило', 'правила', 'правил')}`
    : `слова — ${n} ${plural(n, 'слово', 'слова', 'слов')}`
}

/** Кнопки тренеров и кабинета (каждая открывает Mini App сразу на нужной странице). */
function keyboard(c: Context) {
  const rows: ReturnType<typeof app>[][] = []
  if (c.grammar) rows.push([app(left(c.grammar) ? `Грамматика · ${left(c.grammar)}` : 'Грамматика', `grammar/${c.grammar.token}`)])
  if (c.vocab) rows.push([app(left(c.vocab) ? `Слова · ${left(c.vocab)}` : 'Слова', `vocab/${c.vocab.token}`)])
  if (c.portal) rows.push([app('Мой кабинет', `me/${c.portal}`)])
  return { inline_keyboard: rows }
}

/** «На сегодня: грамматика — 4 правила, слова — 12 слов.» или «на сегодня всё». */
function todayText(c: Context): string {
  const parts = [trainerLine(c.grammar, 'grammar'), trainerLine(c.vocab, 'vocab')].filter(Boolean)
  if (!c.grammar && !c.vocab) return 'Тренеры пока не включены — преподаватель скоро их откроет.'
  if (!parts.length) return 'На сегодня в тренерах всё сделано. Отличная работа!'
  return `На сегодня: ${parts.join(', ')}.${c.practiced ? '' : ' Это минут 10.'}`
}

const send = (chatId: number, text: string, extra: Record<string, unknown> = {}) =>
  tg('sendMessage', { chat_id: chatId, text, ...extra })

const HELP =
  'Команды:\n/today — что на сегодня в тренерах\n/stop — выключить напоминания\n/remind — включить напоминания\n\nКабинет открывается кнопкой слева от поля ввода.'

const ASK_CODE =
  'Привет! Я бот подготовки к SAT Reading & Writing. Пришли код от преподавателя — 6 букв и цифр, например K7M4QX. Его же можно найти в кабинете ученика.'

/** Кнопка меню чата ведёт в кабинет ученика. */
async function setMenu(chatId: number, portal: string | null) {
  if (!portal) return
  await tg('setChatMenuButton', {
    chat_id: chatId,
    menu_button: { type: 'web_app', text: 'Кабинет', web_app: { url: appUrl(`me/${portal}`) } },
  })
}

// --- Обработка сообщений ------------------------------------------------------------------

interface TgMessage {
  chat: { id: number; type: string }
  from?: { id: number; username?: string; first_name?: string; last_name?: string }
  text?: string
}

async function link(msg: TgMessage, code: string) {
  const from = msg.from!
  const c = await rpc<Context>('telegram_link', {
    p_code: code,
    p_tg_user_id: from.id,
    p_chat_id: msg.chat.id,
    p_username: from.username ?? '',
    p_name: [from.first_name, from.last_name].filter(Boolean).join(' '),
  })
  if (!c.ok) {
    await send(
      msg.chat.id,
      c.reason === 'limit'
        ? 'Слишком много неверных попыток. Попробуй через час или попроси преподавателя проверить код.'
        : 'Код не подошёл. Проверь его (6 букв и цифр) или попроси у преподавателя новый.',
    )
    return
  }
  await setMenu(msg.chat.id, c.portal)
  await send(
    msg.chat.id,
    `Готово${c.student ? `, ${c.student}` : ''}! Каждый вечер в ${c.remind_hour ?? 19}:00 я напомню про тренеры, если ты ещё не занимался.\n\n${todayText(c)}`,
    { reply_markup: keyboard(c) },
  )
}

async function handleMessage(msg: TgMessage) {
  if (msg.chat.type !== 'private' || !msg.from || !msg.text) return
  const text = msg.text.trim()
  const [command, arg] = text.split(/\s+/, 2)
  const ctx = () => rpc<Context | null>('telegram_context', { p_tg_user_id: msg.from!.id })

  if (command === '/start') {
    if (arg) return link(msg, arg)
    const c = await ctx()
    if (!c) return send(msg.chat.id, ASK_CODE)
    await setMenu(msg.chat.id, c.portal)
    return send(msg.chat.id, `Привет${c.student ? `, ${c.student}` : ''}! ${todayText(c)}`, { reply_markup: keyboard(c) })
  }
  if (command === '/today') {
    const c = await ctx()
    if (!c) return send(msg.chat.id, ASK_CODE)
    return send(msg.chat.id, todayText(c), { reply_markup: keyboard(c) })
  }
  if (command === '/stop' || command === '/remind') {
    const on = command === '/remind'
    const res = await rpc<boolean | null>('telegram_set_reminders', { p_tg_user_id: msg.from.id, p_on: on })
    if (res === null) return send(msg.chat.id, ASK_CODE)
    return send(msg.chat.id, on ? 'Напоминания включены.' : 'Напоминания выключены. Включить снова — /remind.')
  }
  if (command === '/help') return send(msg.chat.id, HELP)

  // любой другой текст: не привязан — считаем кодом, привязан — подсказка
  const c = await ctx()
  if (!c) return link(msg, text)
  return send(msg.chat.id, HELP)
}

// --- Задачи -------------------------------------------------------------------------------

async function remind(): Promise<number> {
  const list = await rpc<Context[]>('telegram_reminders_claim', {})
  let sent = 0
  for (const c of list) {
    if (!c.chat_id) continue
    const res = await send(c.chat_id, `${c.student ? `${c.student}, ` : ''}${todayText(c).replace(/^Н/, 'н')}`, {
      reply_markup: keyboard(c),
    })
    if (res.ok) sent++
  }
  return sent
}

async function setup(): Promise<Record<string, unknown>> {
  const url = `${SUPABASE_URL}/functions/v1/telegram`
  await tg('setWebhook', {
    url,
    secret_token: await webhookSecret(),
    allowed_updates: ['message'],
    drop_pending_updates: false,
  })
  await tg('setMyCommands', {
    commands: [
      { command: 'today', description: 'Что на сегодня в тренерах' },
      { command: 'stop', description: 'Выключить напоминания' },
      { command: 'remind', description: 'Включить напоминания' },
      { command: 'help', description: 'Помощь' },
    ],
  })
  await tg('setMyDescription', {
    description:
      'Тренеры подготовки к SAT Reading & Writing: грамматика и слова каждый день понемногу. Нажми «Старт» и отправь код от преподавателя.',
  })
  await tg('setMyShortDescription', { short_description: 'Ежедневные тренеры SAT Reading & Writing' })
  const info = await tg('getWebhookInfo', {})
  const me = await tg('getMe', {})
  const r = (info.result ?? {}) as Record<string, unknown>
  return {
    bot: (me.result as Record<string, unknown> | undefined)?.username,
    webhook: r.url,
    pending: r.pending_update_count,
    last_error: r.last_error_message ?? null,
  }
}

// --- Вход ---------------------------------------------------------------------------------

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (!TOKEN) return json({ error: 'TELEGRAM_BOT_TOKEN is not set' }, 500)
  const task = new URL(req.url).searchParams.get('task')
  try {
    if (task === 'setup') return json(await setup())
    if (task === 'remind') return json({ sent: await remind() })
    if (req.method !== 'POST' || req.headers.get('x-telegram-bot-api-secret-token') !== (await webhookSecret())) {
      return json({ error: 'forbidden' }, 403)
    }
    const update = (await req.json()) as { message?: TgMessage }
    if (update.message) await handleMessage(update.message)
  } catch (e) {
    console.error(e)
    // Telegram повторяет запрос, если ответ не 200; ошибку уже записали в лог
    if (!task) return json({ ok: false })
    return json({ error: String(e) }, 500)
  }
  return json({ ok: true })
})
