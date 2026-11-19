import { KNOWN_STAGE, STAGE_DAYS, dayStart, nextStage, type VocabBackend, type VocabSession, type VocabWord } from '../vocab'

// Демо тренера (#/vocab/demo): несколько слов-примеров, прогресс хранится в этом браузере.
// Правила ступеней те же, что на сервере (vocab_review).

const w = (
  id: number,
  word: string,
  pos: string,
  definition: string,
  translation: string,
  connotation: VocabWord['connotation'],
  confusables: string[],
  contexts: VocabWord['contexts'],
): VocabWord => ({ id: `demo-${id}`, word, pos, definition, translation, connotation, confusables, contexts, deck: 'Demo', rank: id })

const WORDS: VocabWord[] = [
  w(1, 'ambivalent', 'adj', 'having mixed or contradictory feelings about something', 'испытывающий смешанные чувства', 'neutral', ['indifferent', 'ambiguous'], [
    {
      text: 'Critics were ____ about the novel: they admired its inventive structure but found its characters flat.',
      distractors: ['indifferent', 'enthusiastic', 'ambiguous'],
      note: 'Сразу и похвала, и критика — это смешанные чувства; indifferent значило бы «всё равно».',
    },
    {
      text: 'Although she accepted the job offer, Maya remained ____, drawn to the salary yet uneasy about leaving her hometown.',
      distractors: ['resolute', 'apathetic', 'jubilant'],
    },
  ]),
  w(2, 'corroborate', 'verb', 'to support a claim with additional evidence', 'подтверждать (доказательствами)', 'neutral', ['collaborate', 'elaborate'], [
    {
      text: 'The fossils found last year ____ the hypothesis that the species migrated north much earlier than assumed.',
      answer: 'corroborate',
      distractors: ['undermine', 'complicate', 'predate'],
      note: 'Находки согласуются с гипотезой и усиливают её.',
    },
    {
      text: 'Two independent surveys ____ the team’s initial finding, making it far harder to dismiss.',
      answer: 'corroborated',
      distractors: ['contradicted', 'anticipated', 'overlooked'],
    },
  ]),
  w(3, 'tenuous', 'adj', 'weak, slight, or not well supported', 'слабый, шаткий', 'negative', ['tenacious', 'tentative'], [
    {
      text: 'The link between the two events is ____ at best: it rests on a single, disputed eyewitness account.',
      distractors: ['robust', 'tenacious', 'evident'],
      note: 'Одно спорное свидетельство — слабое основание. Tenacious — «упорный», похоже только по звучанию.',
    },
  ]),
  w(4, 'ubiquitous', 'adj', 'present or found everywhere', 'вездесущий, повсеместный', 'neutral', ['unanimous'], [
    {
      text: 'Once a rare luxury, smartphones have become ____, appearing in even the most remote villages.',
      distractors: ['obsolete', 'scarce', 'unanimous'],
    },
  ]),
  w(5, 'pragmatic', 'adj', 'dealing with things in a practical rather than idealistic way', 'практичный, прагматичный', 'positive', ['dogmatic'], [
    {
      text: 'Rather than insisting on a perfect solution, the mayor took a ____ approach and funded the repairs that could be finished this year.',
      distractors: ['dogmatic', 'idealistic', 'reckless'],
      note: 'Противопоставление «идеальное решение ↔ то, что реально сделать» указывает на практичность.',
    },
  ]),
  w(6, 'undermine', 'verb', 'to weaken something gradually or secretly', 'подрывать, ослаблять', 'negative', ['underline', 'underscore'], [
    {
      text: 'The newly discovered letters ____ the biographer’s claim that the poet never left her village.',
      distractors: ['underscore', 'corroborate', 'echo'],
      note: 'Письма противоречат утверждению и ослабляют его; underscore — наоборот, «подчёркивать».',
    },
  ]),
  w(7, 'conspicuous', 'adj', 'easy to notice; attracting attention', 'заметный, бросающийся в глаза', 'neutral', ['conscientious', 'suspicious'], [
    {
      text: 'The bird’s bright red plumage makes it ____ against the snow, which is why it relies on speed rather than camouflage.',
      distractors: ['inconspicuous', 'vulnerable', 'conscientious'],
    },
  ]),
  w(8, 'reconcile', 'verb', 'to make two different ideas or facts agree with each other', 'согласовать, примирить', 'positive', ['recollect', 'concede'], [
    {
      text: 'The researchers struggled to ____ their results with earlier studies that had pointed to the opposite conclusion.',
      distractors: ['replace', 'concede', 'conflate'],
    },
  ]),
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
}

const KEY = 'sat-vocab-demo'
const NEW_PER_DAY = 5
const DAY = 86_400_000

function load(): DemoState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '') as DemoState
    if (s && typeof s.progress === 'object' && Array.isArray(s.reviews)) return s
  } catch {
    // нет сохранённого прогресса
  }
  return { progress: {}, reviews: [] }
}

const save = (s: DemoState) => localStorage.setItem(KEY, JSON.stringify(s))

export const demoBackend: VocabBackend = {
  async session(): Promise<VocabSession> {
    const s = load()
    const now = Date.now()
    const start = dayStart().getTime()
    const introduced = Object.values(s.progress).filter((p) => p.introduced >= start).length
    const due = WORDS.flatMap((word) => {
      const p = s.progress[word.id]
      return p && p.due <= now ? [{ ...word, stage: p.stage, reps: p.reps }] : []
    })
    const fresh = WORDS.filter((word) => !s.progress[word.id]).slice(0, Math.max(0, NEW_PER_DAY - introduced))
    return {
      student: null,
      new_per_day: NEW_PER_DAY,
      due,
      fresh,
      pool: WORDS.map(({ word, pos, definition }) => ({ word, pos, definition })),
      glossary: Object.fromEntries(
        WORDS.map(({ word, definition, translation }) => [word, { word, definition, translation }]),
      ),
      stats: {
        total: WORDS.length,
        started: Object.keys(s.progress).length,
        known: Object.values(s.progress).filter((p) => p.stage >= KNOWN_STAGE).length,
        reviews_today: s.reviews.filter((t) => t >= start).length,
        streak: s.reviews.some((t) => t >= start - DAY) ? 1 : 0,
      },
    }
  },

  async review(wordId, exercise, correct) {
    const s = load()
    const now = Date.now()
    const p = s.progress[wordId]
    if (!p || exercise === 'intro') {
      if (!p) s.progress[wordId] = { stage: 1, reps: 0, due: now, introduced: now }
    } else {
      const stage = nextStage(p.stage, correct)
      s.progress[wordId] = {
        ...p,
        stage,
        reps: p.reps + 1,
        due: correct ? now + STAGE_DAYS[stage] * DAY - 6 * 3_600_000 : now,
      }
      s.reviews.push(now)
    }
    save(s)
  },
}
