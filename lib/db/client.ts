import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _client
}

/**
 * Lazy initialisierter Supabase-Client.
 *
 * Der Proxy verzögert createClient bis zum ersten Zugriff — sonst würde der
 * Build scheitern, weil die Umgebungsvariablen zur Buildzeit nicht gesetzt sind.
 *
 * Direkt verwenden sollte ihn nur lib/db/. Seiten und Komponenten gehen über
 * die typisierten Funktionen in diesem Verzeichnis.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop: string) {
    const client = getClient()
    const value = (client as unknown as Record<string, unknown>)[prop]
    return typeof value === 'function' ? value.bind(client) : value
  },
})

interface QueryResult {
  data: unknown
  error: { message: string } | null
}

/**
 * Ergebnis-Helfer.
 *
 * Der Client ist nicht mit einem generierten `Database`-Typ parametrisiert
 * (siehe Kommentar in types.ts), deshalb kennt supabase-js die Zeilenform
 * nicht und leitet aus dem select-String `GenericStringError` ab. Die Helfer
 * bündeln den Cast an genau drei Stellen, statt ihn über die Module zu
 * verstreuen, und werfen bei Fehlern mit lesbarer Meldung statt still `null`
 * weiterzureichen.
 */
export function rows<T>(res: QueryResult, context: string): T[] {
  if (res.error) throw new Error(`${context}: ${res.error.message}`)
  return (res.data ?? []) as T[]
}

export function row<T>(res: QueryResult, context: string): T {
  if (res.error) throw new Error(`${context}: ${res.error.message}`)
  if (res.data === null || res.data === undefined) throw new Error(`${context}: keine Daten zurückgegeben`)
  return res.data as T
}

export function maybeRow<T>(res: QueryResult, context: string): T | null {
  if (res.error) throw new Error(`${context}: ${res.error.message}`)
  return (res.data ?? null) as T | null
}

/** Für Schreibvorgänge ohne Rückgabe. */
export function ok(res: { error: { message: string } | null }, context: string): void {
  if (res.error) throw new Error(`${context}: ${res.error.message}`)
}
