import { useEffect, useMemo, useState } from 'react'
import { computeAnalytics, loadSetMeta, type Analytics, type SetMeta } from './analytics'
import { listAssignments } from './sets'
import { supabase } from './supabase'
import type { Assignment } from './types'
import { useStore } from './useStore'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export interface SkillData {
  /** false — локальный режим: аналитики нет */
  enabled: boolean
  loading: boolean
  error: string
  analytics: Analytics | null
  assignments: Assignment[]
}

/**
 * Загружает задания ученика и метаданные их сетов (один запрос заданий + один запрос сетов,
 * сеты кэшируются) и считает аналитику. reloadKey — перечитать.
 */
export function useSkillAnalytics(studentId: string | undefined, reloadKey: number): SkillData {
  const { db, sync } = useStore()
  const enabled = sync.mode === 'cloud' && !!supabase
  const [state, setState] = useState<{ key: string; error: string; assignments: Assignment[]; sets: Map<string, SetMeta> } | null>(null)
  const key = `${studentId}:${reloadKey}`

  useEffect(() => {
    if (!enabled || !supabase || !studentId) return
    const sb = supabase
    let cancelled = false
    ;(async () => {
      try {
        const assignments = await listAssignments(sb, studentId)
        const ids = assignments.filter((a) => a.submittedAt).map((a) => a.setId)
        const sets = await loadSetMeta(sb, ids)
        if (!cancelled) setState({ key, error: '', assignments, sets })
      } catch (e) {
        if (!cancelled) setState({ key, error: errText(e), assignments: [], sets: new Map() })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enabled, studentId, key])

  const materials = db.materials
  const analytics = useMemo(() => {
    if (!state || state.error) return null
    const skillsOf = (setId: string) => materials.find((m) => m.setId === setId)?.skills ?? []
    return computeAnalytics(state.assignments, state.sets, skillsOf)
  }, [state, materials])

  return {
    enabled,
    loading: enabled && state?.key !== key,
    error: state?.error ?? '',
    analytics,
    assignments: state?.assignments ?? [],
  }
}
