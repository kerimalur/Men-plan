import { supabase } from './supabase'

export const DEFAULTS = {
  kcal_ziel:    '2000',
  protein_ziel: '150',
  kosten_ziel:  '20',
}

export async function loadSettings(): Promise<Record<string, string>> {
  const { data } = await supabase.from('settings').select('key, value')
  const result: Record<string, string> = { ...DEFAULTS }
  data?.forEach(row => { result[row.key] = row.value })
  return result
}

export async function saveSetting(key: string, value: string) {
  await supabase.from('settings').upsert({ key, value, updated_at: new Date().toISOString() })
}

export function goalColor(value: number, max: number): string {
  if (max <= 0) return '#475569'
  const pct = value / max
  if (pct >= 1.0) return '#16a34a'
  if (pct >= 0.8) return '#d97706'
  return '#dc2626'
}

// For metrics where exceeding the limit is bad (kcal, kosten):
// green = within budget, red = exceeded
export function limitColor(value: number, max: number): string {
  if (max <= 0) return '#475569'
  const pct = value / max
  if (pct > 1.0) return '#dc2626'
  return '#16a34a'
}

export function goalTextClass(value: number, max: number): string {
  if (max <= 0) return 'text-slate-600'
  const pct = value / max
  if (pct >= 1.0) return 'text-green-600'
  if (pct >= 0.8) return 'text-amber-600'
  return 'text-red-500'
}
