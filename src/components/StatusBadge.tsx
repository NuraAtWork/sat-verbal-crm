import { STATUS_LABELS } from '../sat'
import type { StudentStatus } from '../types'

export function StatusBadge({ status }: { status: StudentStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status]}</span>
}
