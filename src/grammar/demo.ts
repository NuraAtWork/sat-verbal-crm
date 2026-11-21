import { KNOWN_STAGE, STAGE_DAYS, nextStage, type GrammarBackend, type GrammarRule, type GrammarSession } from '../grammar'
import { dayStart } from '../vocab'

// Демо тренера грамматики (#/grammar/demo): три правила Boundaries с собственными примерами,
// прогресс хранится в этом браузере. Основной набор правил лежит в базе, не в репозитории.

const RULES: GrammarRule[] = [
  {
    id: 'demo-two-clauses',
    skill: 'boundaries',
    rank: 1,
    title: 'Два полных предложения рядом',
    summary: 'Два полных предложения разделяют **точкой**, **точкой с запятой** или **запятой + and / but / so / or / yet / for / nor**.',
    body:
      'Полное предложение — это кусок, у которого есть своё подлежащее и сказуемое и который звучит законченно сам по себе.\n\nОдна запятая между двумя такими кусками — ошибка comma splice. Без знака вообще — run-on.',
    examples: [
      { text: 'The ferry left at dawn**;** the harbor was still dark.', ok: true, note: '«;» — оба куска полные' },
      { text: 'The ferry left at dawn**, but** the harbor was still dark.', ok: true, note: 'запятая + союз' },
      { text: 'The ferry left at dawn**,** the harbor was still dark.', ok: false, note: 'одна запятая — comma splice' },
      { text: 'The ferry left at dawn the harbor was still dark.', ok: false, note: 'ничего — run-on' },
    ],
    tip: 'Закрой правую часть рукой: левая звучит как законченное предложение? Теперь наоборот. Обе «да» — нужен один из трёх способов.',
    items: [
      {
        id: 'd1',
        level: 1,
        structure: 'two-clauses',
        text: 'Most desert lizards rest in the shade at ____ can reach temperatures above 60°C.',
        answer: 0,
        options: [
          { text: 'midday; the ground', why: 'Верно: «;» между двумя полными предложениями.' },
          { text: 'midday, the ground', why: 'Одна запятая между полными предложениями.', trap: 'comma-splice' },
          { text: 'midday the ground', why: 'Предложения слиты без знака.', trap: 'run-on' },
          { text: 'midday, and, the ground', why: 'После and запятая не нужна.', trap: 'double-conj' },
        ],
      },
      {
        id: 'd2',
        level: 1,
        structure: 'two-clauses',
        text: 'The orchestra rehearsed the symphony for three ____ conductor still asked for one more run-through.',
        answer: 0,
        options: [
          { text: 'weeks, yet the', why: 'Верно: запятая + союз yet.' },
          { text: 'weeks yet the', why: 'Союз без запятой между полными предложениями.', trap: 'run-on' },
          { text: 'weeks, the', why: 'Одна запятая — comma splice.', trap: 'comma-splice' },
          { text: 'weeks; yet, the', why: '«;» уже разделяет предложения, союз после неё лишний.', trap: 'double-conj' },
        ],
      },
      {
        id: 'd3',
        level: 2,
        structure: 'two-clauses',
        text: 'Early mapmakers often filled unexplored regions with drawings of sea ____ were simply guesses about what lay beyond the coast.',
        answer: 0,
        options: [
          { text: 'creatures. These images', why: 'Верно: точка между двумя полными предложениями.' },
          { text: 'creatures, these images', why: 'Одна запятая между полными предложениями.', trap: 'comma-splice' },
          { text: 'creatures these images', why: 'Нет никакой границы.', trap: 'run-on' },
          { text: 'creatures and these images', why: 'Союз без запятой между полными предложениями.', trap: 'run-on' },
        ],
      },
      {
        id: 'd4',
        level: 3,
        structure: 'two-clauses',
        text: 'For decades, engineers believed the bridge could carry only light ____ tests conducted in 2019 showed that its steel frame was far stronger than expected.',
        answer: 0,
        options: [
          { text: 'traffic; however,', why: 'Верно: «;» между предложениями, however со своей запятой.' },
          { text: 'traffic, however,', why: 'However — не союз: с одними запятыми это comma splice.', trap: 'adverb-comma' },
          { text: 'traffic however', why: 'Нет границы между предложениями.', trap: 'run-on' },
          { text: 'traffic, however;', why: 'However отнесено к первому предложению, а противопоставление начинается во втором.', trap: 'adverb-side' },
        ],
        note: 'However, therefore, for example, instead — не союзы. Между двумя предложениями перед ними нужна «;» или точка.',
      },
    ],
  },
  {
    id: 'demo-insert',
    skill: 'boundaries',
    rank: 2,
    title: 'Вставка — в парных знаках',
    summary: 'Кусок, который можно вычеркнуть без потери смысла, берут в пару одинаковых знаков: **, … ,** или **— … —** или **( … )**.',
    body:
      'Вставка — это уточнение внутри предложения: приложение (a retired pilot), which-клауза, оборот. Если её открыли запятой, закрыть надо тоже запятой; открыли тире — тире.\n\nПроверка: прочитай предложение без вставки. Оно должно остаться правильным.',
    examples: [
      { text: 'My neighbor**,** a retired pilot**,** still flies on weekends.', ok: true },
      { text: 'My neighbor**—**a retired pilot**—**still flies on weekends.', ok: true },
      { text: 'My neighbor**,** a retired pilot still flies on weekends.', ok: false, note: 'вставку открыли и не закрыли' },
      { text: 'My neighbor**,** a retired pilot**—**still flies on weekends.', ok: false, note: 'пара из разных знаков' },
    ],
    tip: 'Найди, где вставка начинается, — и посмотри, каким знаком. Закрывающий знак должен быть таким же.',
    items: [
      {
        id: 'd5',
        level: 1,
        structure: 'insert',
        text: 'The architect, who designed the city library in ____ turned an old warehouse into a school.',
        answer: 0,
        options: [
          { text: '1931, later', why: 'Верно: вставка открыта запятой и закрыта запятой.' },
          { text: '1931 later', why: 'Вставку открыли и не закрыли.', trap: 'unpaired' },
          { text: '1931; later', why: '«;» требует полных предложений с обеих сторон.', trap: 'semicolon-misuse' },
          { text: '1931—later', why: 'Открыли запятой — закрывать нужно запятой.', trap: 'unpaired' },
        ],
      },
      {
        id: 'd6',
        level: 2,
        structure: 'insert',
        text: 'Saffron—the dried threads of a small purple ____ more per gram than almost any other spice.',
        answer: 0,
        options: [
          { text: 'crocus—costs', why: 'Верно: вставка между двумя тире.' },
          { text: 'crocus, costs', why: 'Открыли тире — закрывать нужно тире.', trap: 'unpaired' },
          { text: 'crocus costs', why: 'Вставку не закрыли.', trap: 'unpaired' },
          { text: 'crocus; costs', why: '«;» здесь разрывает подлежащее и сказуемое.', trap: 'semicolon-misuse' },
        ],
      },
      {
        id: 'd7',
        level: 2,
        structure: 'insert',
        text: 'The old lighthouse ____ is now a small museum about local shipwrecks.',
        answer: 0,
        options: [
          { text: '(built in 1874)', why: 'Верно: скобки — тоже пара, после них знак не нужен.' },
          { text: '(built in 1874),', why: 'Запятая после скобки отделяет подлежащее от сказуемого.', trap: 'extra-punct' },
          { text: ', built in 1874', why: 'Вставку открыли и не закрыли.', trap: 'unpaired' },
          { text: '—built in 1874,', why: 'Пара из разных знаков.', trap: 'unpaired' },
        ],
      },
      {
        id: 'd8',
        level: 3,
        structure: 'insert',
        text: 'Honeybees, which can recognize individual human faces after only a few training ____ to remember a reward for several days.',
        answer: 0,
        options: [
          { text: 'sessions, are able', why: 'Верно: which-вставка закрыта запятой, дальше сказуемое are able.' },
          { text: 'sessions are able', why: 'Which-вставку не закрыли — читатель не видит, где начинается сказуемое.', trap: 'unpaired' },
          { text: 'sessions; are able', why: '«;» отрезает сказуемое от подлежащего.', trap: 'semicolon-misuse' },
          { text: 'sessions. Are able', why: 'Точка оставляет оба куска неполными.', trap: 'fragment' },
        ],
      },
    ],
  },
  {
    id: 'demo-essential',
    skill: 'boundaries',
    rank: 3,
    title: 'Звание + имя — без запятых',
    summary: 'Если описание стоит **перед** именем (painter Ana Ruiz, the botanist Leo Park), между ними ничего не ставят.',
    body:
      'Описание перед именем работает как часть имени: оно уточняет, о каком человеке речь, и вычеркнуть его нельзя. Поэтому ни запятой, ни двоеточия, ни тире.\n\nЕсли же имя стоит первым, а описание после него, это вставка: Ana Ruiz, a painter, …',
    examples: [
      { text: 'Painter Ana Ruiz opened the exhibition.', ok: true },
      { text: 'Ana Ruiz**,** a painter**,** opened the exhibition.', ok: true, note: 'описание после имени — вставка' },
      { text: 'Painter**,** Ana Ruiz**,** opened the exhibition.', ok: false, note: 'запятые разорвали «звание + имя»' },
      { text: 'Painter**:** Ana Ruiz opened the exhibition.', ok: false, note: 'двоеточие после неполного предложения' },
    ],
    tip: 'Описание стоит перед именем и без артикля a/an? Тогда никаких знаков.',
    items: [
      {
        id: 'd9',
        level: 1,
        structure: 'essential',
        text: 'Last spring, marine ____ led a survey of the coral reefs near the island.',
        answer: 0,
        options: [
          { text: 'biologist Rosa Lindqvist', why: 'Верно: звание перед именем — без знаков.' },
          { text: 'biologist, Rosa Lindqvist,', why: 'Запятые разорвали «звание + имя».', trap: 'false-insert' },
          { text: 'biologist: Rosa Lindqvist', why: 'Двоеточие после неполного предложения.', trap: 'colon-misuse' },
          { text: 'biologist, Rosa Lindqvist', why: 'Лишняя запятая между званием и именем.', trap: 'extra-punct' },
        ],
      },
      {
        id: 'd10',
        level: 2,
        structure: 'essential',
        text: 'The documentary follows ____ as she restores a nineteenth-century violin.',
        answer: 0,
        options: [
          { text: 'instrument maker Hana Okafor', why: 'Верно: описание перед именем — без знаков.' },
          { text: 'instrument maker, Hana Okafor,', why: 'Запятые превращают имя во вставку, а оно обязательно.', trap: 'false-insert' },
          { text: 'instrument maker—Hana Okafor', why: 'Тире разрывает глагол и дополнение.', trap: 'extra-punct' },
          { text: 'instrument maker, Hana Okafor', why: 'Лишняя запятая.', trap: 'extra-punct' },
        ],
      },
      {
        id: 'd11',
        level: 2,
        text: 'According to the economic ____ cities with more public libraries tend to have higher rates of small-business creation.',
        answer: 0,
        options: [
          { text: 'historian Marcus Webb,', why: 'Верно: звание + имя слитно, запятая закрывает вводный оборот According to….' },
          { text: 'historian, Marcus Webb,', why: 'Запятая разорвала «звание + имя».', trap: 'false-insert' },
          { text: 'historian Marcus Webb', why: 'Не хватает запятой после вводного оборота.', trap: 'missing-comma' },
          { text: 'historian: Marcus Webb,', why: 'Двоеточие после неполного предложения.', trap: 'colon-misuse' },
        ],
      },
      {
        id: 'd12',
        level: 3,
        text: 'The prize committee praised the novel by Kenyan ____ calling its final chapter “a quiet masterpiece.”',
        answer: 0,
        options: [
          { text: 'author Wanjiru Kamau,', why: 'Верно: «автор + имя» слитно; запятая отделяет оборот calling….' },
          { text: 'author, Wanjiru Kamau,', why: 'Запятая разорвала «автор + имя».', trap: 'false-insert' },
          { text: 'author Wanjiru Kamau', why: 'Без запятой оборот calling… прилипает к имени.', trap: 'missing-comma' },
          { text: 'author, Wanjiru Kamau', why: 'Лишняя запятая и нет запятой перед оборотом.', trap: 'extra-punct' },
        ],
      },
    ],
  },
]

interface Progress {
  stage: number
  reps: number
  due: number
  introduced: number
}

interface DemoState {
  progress: Record<string, Progress>
  /** Времена ответов (мс) — для счётчика «сегодня» */
  reviews: number[]
  /** Последние показанные упражнения по правилам */
  recent: Record<string, string[]>
}

const KEY = 'sat-grammar-demo'
const NEW_PER_DAY = 3
const DAY = 86_400_000

function load(): DemoState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '') as DemoState
    if (s && typeof s.progress === 'object' && Array.isArray(s.reviews)) return { ...s, recent: s.recent ?? {} }
  } catch {
    // нет сохранённого прогресса
  }
  return { progress: {}, reviews: [], recent: {} }
}

const save = (s: DemoState) => localStorage.setItem(KEY, JSON.stringify(s))

export const grammarDemoBackend: GrammarBackend = {
  async session(): Promise<GrammarSession> {
    const s = load()
    const now = Date.now()
    const start = dayStart().getTime()
    const introduced = Object.values(s.progress).filter((p) => p.introduced >= start).length
    const due = RULES.flatMap((rule) => {
      const p = s.progress[rule.id]
      return p && p.due <= now ? [{ ...rule, stage: p.stage, reps: p.reps, recent: s.recent[rule.id] ?? [] }] : []
    })
    const fresh = RULES.filter((rule) => !s.progress[rule.id]).slice(0, Math.max(0, NEW_PER_DAY - introduced))
    return {
      student: null,
      new_per_day: NEW_PER_DAY,
      due,
      fresh,
      stats: {
        total: RULES.length,
        started: Object.keys(s.progress).length,
        known: Object.values(s.progress).filter((p) => p.stage >= KNOWN_STAGE).length,
        reviews_today: s.reviews.filter((t) => t >= start).length,
        streak: s.reviews.some((t) => t >= start - DAY) ? 1 : 0,
      },
    }
  },

  async review({ ruleId, itemId, exercise, correct }) {
    const s = load()
    const now = Date.now()
    const p = s.progress[ruleId]
    if (itemId) s.recent[ruleId] = [itemId, ...(s.recent[ruleId] ?? []).filter((id) => id !== itemId)].slice(0, 40)
    if (!p || exercise === 'intro') {
      if (!p) s.progress[ruleId] = { stage: 1, reps: 0, due: now, introduced: now }
    } else if (exercise !== 'warmup') {
      const stage = nextStage(p.stage, correct)
      s.progress[ruleId] = {
        ...p,
        stage,
        reps: p.reps + 1,
        due: correct ? now + STAGE_DAYS[stage] * DAY - 6 * 3_600_000 : now,
      }
    }
    if (exercise !== 'intro') s.reviews.push(now)
    save(s)
  },
}
