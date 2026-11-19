import { addDays, today } from '../dates'
import type { PortalHome } from '../portal'

// Демо кабинета (#/me/demo): выдуманный ученик, чтобы посмотреть страницу без облака.
// Задания в демо не открываются, словарь ведёт в демо тренера.

const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString()

export function demoHome(): PortalHome {
  const t = today()
  return {
    student: 'Алия',
    exam_date: addDays(t, 23),
    baseline_score: 540,
    target_score: 700,
    assignments: [
      {
        token: 'demo-1', title: 'Transitions · Set 04', kind: 'set', questions: 24, minutes: null,
        due_date: addDays(t, 2), created_at: at(1), started_at: null, submitted_at: null,
        correct_count: null, total_count: null, score_estimate: null,
      },
      {
        token: 'demo-2', title: 'Practice Test 3 · Reading & Writing', kind: 'test', questions: 54, minutes: 64,
        due_date: addDays(t, 5), created_at: at(1), started_at: at(0.2), submitted_at: null,
        correct_count: null, total_count: null, score_estimate: null,
      },
      {
        token: 'demo-3', title: 'Words in Context · Set 07', kind: 'set', questions: 25, minutes: null,
        due_date: addDays(t, -3), created_at: at(8), started_at: at(5), submitted_at: at(5),
        correct_count: 21, total_count: 25, score_estimate: null,
      },
      {
        token: 'demo-4', title: 'Practice Test 2 · Reading & Writing', kind: 'test', questions: 54, minutes: 64,
        due_date: null, created_at: at(16), started_at: at(12), submitted_at: at(12),
        correct_count: 43, total_count: 54, score_estimate: 640,
      },
      {
        token: 'demo-5', title: 'Boundaries · Set 02', kind: 'set', questions: 24, minutes: null,
        due_date: null, created_at: at(20), started_at: at(18), submitted_at: at(18),
        correct_count: 17, total_count: 24, score_estimate: null,
      },
    ],
    lessons: [
      {
        date: addDays(t, -1), duration_min: 90, topics: ['transitions', 'rhetorical-synthesis'],
        homework: 'Сет по Transitions и первый модуль пробного теста. Слова — каждый день по 10 минут.',
      },
      {
        date: addDays(t, -5), duration_min: 90, topics: ['boundaries', 'form-structure-sense'],
        homework: 'Boundaries · Set 02. Выписать правила про точку с запятой и двоеточие.',
      },
      {
        date: addDays(t, -8), duration_min: 60, topics: ['words-in-context'],
        homework: 'Words in Context · Set 07, перед ответом закрывать варианты рукой.',
      },
      { date: addDays(t, -12), duration_min: 90, topics: ['central-ideas', 'inferences'], homework: '' },
    ],
    lessons_count: 9,
    topics: {
      'words-in-context': 3, 'text-structure': 2, 'central-ideas': 2, inferences: 1,
      boundaries: 2, 'form-structure-sense': 1, transitions: 2, 'rhetorical-synthesis': 1,
    },
    skills: {
      'words-in-context': { total: 37, correct: 31, time_sec: 1700 },
      'text-structure': { total: 14, correct: 10, time_sec: 980 },
      'cross-text': { total: 4, correct: 2, time_sec: 420 },
      'central-ideas': { total: 12, correct: 11, time_sec: 800 },
      'evidence-textual': { total: 11, correct: 7, time_sec: 990 },
      'evidence-quant': { total: 6, correct: 5, time_sec: 430 },
      inferences: { total: 12, correct: 8, time_sec: 1010 },
      boundaries: { total: 36, correct: 25, time_sec: 1500 },
      'form-structure-sense': { total: 13, correct: 12, time_sec: 560 },
      transitions: { total: 10, correct: 9, time_sec: 400 },
    },
    scores: [
      { date: addDays(t, -40), source: 'Bluebook PT 1', score: 560 },
      { date: addDays(t, -26), source: 'Bluebook PT 2', score: 600 },
      { date: addDays(t, -12), source: 'Bluebook PT 3', score: 640 },
    ],
    vocab: { token: 'demo', due: 12, started: 86, known: 41, reviews_today: 0 },
  }
}
