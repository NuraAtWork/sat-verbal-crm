import type { Assignment } from '../types'

/**
 * Пометка задания-теста в списке заданий ученика: «Тест», оценка балла и предупреждение,
 * если модуль сдан позже лимита по часам сервера.
 */
export function TestBadge({ a, isTest }: { a: Assignment; isTest: boolean }) {
  const test = isTest || a.scoreEstimate != null || (a.moduleAnswers?.length ?? 0) > 0
  if (!test) return null
  const late = (a.moduleAnswers ?? []).map((m, i) => (m.late ? i + 1 : 0)).filter(Boolean)
  const inProgress = !a.submittedAt && (a.moduleAnswers?.length ?? 0) > 0
  return (
    <>
      <span className="badge badge-test" title="Пробный тест: модули с таймером">
        Тест
      </span>
      {a.submittedAt && a.scoreEstimate != null && (
        <span className="assign-estimate" title="Грубая оценка по доле верных ответов, не официальный балл">
          ≈ {a.scoreEstimate}
        </span>
      )}
      {inProgress && <span className="muted small">сдан модуль {a.moduleAnswers!.length}</span>}
      {late.length > 0 && (
        <span className="error-text small" title="Модуль сдан позже лимита времени (по часам сервера, +2 мин запаса)">
          время превышено: модуль {late.join(', ')}
        </span>
      )}
    </>
  )
}
