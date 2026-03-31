import { createClient } from '@supabase/supabase-js'

let _client = null

function getClient() {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  }
  return _client
}

// Proxy so alle bestehenden supabase.from(...) Aufrufe weiter funktionieren
export const supabase = new Proxy({}, {
  get(_, prop) {
    return getClient()[prop]
  }
})
