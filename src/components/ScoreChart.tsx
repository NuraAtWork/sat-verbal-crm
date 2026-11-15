import { formatDate } from '../dates'
import { MAX_SCORE, MIN_SCORE } from '../sat'
import type { ScoreEntry } from '../types'

interface Props {
  scores: ScoreEntry[]
  baseline: number | null
  target: number | null
}

const W = 600
const H = 220
const PAD = { top: 20, right: 24, bottom: 32, left: 44 }

/** Линейный график баллов R&W по пробным тестам с линиями старта и цели. */
export function ScoreChart({ scores, baseline, target }: Props) {
  if (scores.length === 0) {
    return <p className="muted">Пока нет пробных тестов — добавьте первый результат ниже.</p>
  }

  const values = scores.map((s) => s.score)
  const refs = [baseline, target].filter((v): v is number => v !== null)
  const lo = Math.max(MIN_SCORE, Math.floor((Math.min(...values, ...refs) - 40) / 50) * 50)
  const hi = Math.min(MAX_SCORE, Math.ceil((Math.max(...values, ...refs) + 40) / 50) * 50)

  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const x = (i: number) =>
    PAD.left + (scores.length === 1 ? innerW / 2 : (i / (scores.length - 1)) * innerW)
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * innerH

  const ticks: number[] = []
  for (let v = lo; v <= hi; v += 50) ticks.push(v)

  const path = scores.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(s.score)}`).join(' ')

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="График баллов">
      {ticks.map((v) => (
        <g key={v}>
          <line className="chart-grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
          <text className="chart-tick" x={PAD.left - 8} y={y(v)} textAnchor="end" dominantBaseline="middle">
            {v}
          </text>
        </g>
      ))}
      {target !== null && (
        <g>
          <line className="chart-target" x1={PAD.left} x2={W - PAD.right} y1={y(target)} y2={y(target)} />
          <text className="chart-ref-label" x={W - PAD.right} y={y(target) - 6} textAnchor="end">
            цель {target}
          </text>
        </g>
      )}
      {baseline !== null && (
        <g>
          <line className="chart-baseline" x1={PAD.left} x2={W - PAD.right} y1={y(baseline)} y2={y(baseline)} />
          <text className="chart-ref-label" x={W - PAD.right} y={y(baseline) + 14} textAnchor="end">
            старт {baseline}
          </text>
        </g>
      )}
      <path className="chart-line" d={path} />
      {scores.map((s, i) => (
        <g key={s.id}>
          <circle className="chart-dot" cx={x(i)} cy={y(s.score)} r={5}>
            <title>{`${formatDate(s.date)} · ${s.source || 'тест'} · ${s.score}`}</title>
          </circle>
          <text className="chart-value" x={x(i)} y={y(s.score) - 10} textAnchor="middle">
            {s.score}
          </text>
          <text className="chart-tick" x={x(i)} y={H - 10} textAnchor="middle">
            {formatDate(s.date).replace(/\s?\d{4}.*$/, '')}
          </text>
        </g>
      ))}
    </svg>
  )
}
