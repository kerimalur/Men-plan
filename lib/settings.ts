import { supabase, rows, ok } from './db/client'

export const DEFAULTS = {
  kcal_ziel:    '2000',
  protein_ziel: '150',
  kosten_ziel:  '20',
  /** Rezept, das automatisch als Frühstück gesetzt wird. Leer = keins. */
  default_breakfast_recipe_id: '',
  /** Optional dasselbe für einen Standard-Snack. */
  default_snack_recipe_id: '',
}

export type SettingKey = keyof typeof DEFAULTS

export async function loadSettings(): Promise<Record<string, string>> {
  const data = rows<{ key: string; value: string }>(
    await supabase.from('settings').select('key, value'),
    'Einstellungen laden'
  )
  const result: Record<string, string> = { ...DEFAULTS }
  data.forEach(r => { result[r.key] = r.value })
  return result
}

export async function saveSetting(key: SettingKey | string, value: string): Promise<void> {
  ok(
    await supabase.from('settings').upsert({ key, value, updated_at: new Date().toISOString() }),
    'Einstellung speichern'
  )
}

/**
 * Statusfarben als Design-Token, nicht als Hex-Wert.
 *
 * Aufrufer setzen das Ergebnis als Tailwind-Klasse ein; die konkreten Werte
 * stehen ausschliesslich im @theme-Block von globals.css.
 */
export type StatusToken = 'success' | 'warning' | 'danger' | 'muted'

/** Für Werte, bei denen Erreichen gut ist (Protein). */
export function goalStatus(value: number, max: number): StatusToken {
  if (max <= 0) return 'muted'
  const pct = value / max
  if (pct >= 1.0) return 'success'
  if (pct >= 0.8) return 'warning'
  return 'danger'
}

/** Für Werte, bei denen Überschreiten schlecht ist (Kalorien, Kosten). */
export function limitStatus(value: number, max: number): StatusToken {
  if (max <= 0) return 'muted'
  return value / max > 1.0 ? 'danger' : 'success'
}

const TEXT_CLASS: Record<StatusToken, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger:  'text-danger',
  muted:   'text-text-muted',
}

const BG_CLASS: Record<StatusToken, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger:  'bg-danger',
  muted:   'bg-text-muted',
}

export function statusTextClass(token: StatusToken): string {
  return TEXT_CLASS[token]
}

export function statusBgClass(token: StatusToken): string {
  return BG_CLASS[token]
}
