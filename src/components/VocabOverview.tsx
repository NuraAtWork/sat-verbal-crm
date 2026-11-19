import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useStore } from '../useStore'
import { plural } from '../vocab'
import { fetchVocabOverview, type VocabOverviewRow } from '../vocabAdmin'

/** Сколько полных дней назад была тренировка (по часам устройства). */
function daysAgo(iso: string): number {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((day(new Date()) - day(new Date(iso))) / 86_400_000)
}

function lastLabel(iso: string | null): string {
  if (!iso) return 'ещё не начинал'
  const n = daysAgo(iso)
  if (n <= 0) return 'сегодня'
  if (n === 1) return 'вчера'
  return `${n} ${plural(n, 'день', 'дня', 'дней')} назад`
}

/** Карточка «Тренер слов» на «Обзоре»: кто занимается, а кто забросил (только облачный режим). */
export function VocabOverview() {
  const { db, sync } = useStore()
  const [rows, setRows] = useState<VocabOverviewRow[]>([])

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    // без функции vocab_overview (SQL этапа 3 не применён) карточка просто не показывается
    fetchVocabOverview(supabase).then(
      (r) => !cancelled && setRows(r),
      () => {},
    )
    return () => {
      cancelled = true
    }
  }, [])

  if (sync.mode !== 'cloud') return null
  const items = rows
    .map((r) => ({ ...r, student: db.students.find((s) => s.id === r.student_id) }))
    .filter((r) => r.student && r.student.status !== 'finished')
    // сначала те, кто дольше всех не занимался
    .sort((a, b) => (a.last_reviewed_at ?? '').localeCompare(b.last_reviewed_at ?? ''))
  if (items.length === 0) return null

  return (
    <section className="card">
      <h2>Тренер слов</h2>
      <div className="table-wrap">
        <table className="table compact">
          <thead>
            <tr>
              <th>Ученик</th>
              <th>Последняя тренировка</th>
              <th className="num" title="Дней с тренировкой за последние 7">
                Дней из 7
              </th>
              <th className="num">Ждут повторения</th>
              <th className="num" title="Слова из ошибок и кликов, которые тренер ещё не ввёл">
                В очереди
              </th>
              <th className="num">Выучено</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => {
              const stale = !r.last_reviewed_at || daysAgo(r.last_reviewed_at) >= 3
              return (
                <tr key={r.student_id}>
                  <td>
                    <Link to={`/students/${r.student_id}`}>{r.student!.name}</Link>
                  </td>
                  <td className={stale ? 'error-text' : ''}>{lastLabel(r.last_reviewed_at)}</td>
                  <td className="num">{r.active_days}</td>
                  <td className="num">{r.due}</td>
                  <td className="num">{r.queued}</td>
                  <td className="num">
                    {r.known} <span className="muted">/ {r.started}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
