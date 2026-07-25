'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  listShopping, addShoppingItem, setShoppingChecked, deleteShoppingItem,
  clearChecked, getCycleShoppingItems, syncCycleToShoppingList, shoppingKey,
} from '@/lib/db/shopping'
import { listCycles } from '@/lib/db/cycles'
import type { CycleShoppingItem, PrepCycle, ShoppingItem } from '@/lib/db/types'
import { formatAmount, roundForShopping } from '@/lib/units'
import { useToast } from '@/components/Toast'
import Card, { CardLabel } from '@/components/ui/Card'
import Pill from '@/components/ui/Pill'
import Button, { IconButton } from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'

const OWNED_KEY = 'einkauf:owned'

export default function EinkaufslistePage() {
  const { toast } = useToast()

  const [items, setItems] = useState<ShoppingItem[]>([])
  const [cycles, setCycles] = useState<PrepCycle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newItem, setNewItem] = useState('')
  const [newQty, setNewQty] = useState('')

  const [showSync, setShowSync] = useState(false)
  const [cycleId, setCycleId] = useState<string | null>(null)
  const [syncItems, setSyncItems] = useState<CycleShoppingItem[]>([])
  const [syncing, setSyncing] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [owned, setOwned] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [list, cs] = await Promise.all([listShopping(), listCycles()])
      setItems(list)
      setCycles(cs)
      if (!cycleId && cs.length > 0) setCycleId(cs[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Liste konnte nicht geladen werden')
    } finally {
      setLoading(false)
    }
  }, [cycleId])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  // „Habe ich schon zuhause" überlebt den Reload.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(OWNED_KEY)
      if (raw) setOwned(new Set(JSON.parse(raw) as string[]))
    } catch { /* ohne localStorage eben nicht */ }
  }, [])

  function toggleOwned(key: string) {
    setOwned(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      try { localStorage.setItem(OWNED_KEY, JSON.stringify([...next])) } catch { /* ignorieren */ }
      return next
    })
  }

  async function runSync() {
    if (!cycleId) return
    setSyncing(true)
    try {
      setSyncItems(await getCycleShoppingItems(cycleId))
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Berechnen fehlgeschlagen', 'error')
    } finally {
      setSyncing(false)
    }
  }

  async function applySync() {
    if (!cycleId) return
    try {
      const n = await syncCycleToShoppingList(cycleId, syncItems, owned)
      await load()
      setShowSync(false)
      toast(`${n} Positionen übernommen`, 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Übernehmen fehlgeschlagen', 'error')
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newItem.trim()) return
    try {
      await addShoppingItem(newItem.trim(), newQty)
      setNewItem(''); setNewQty('')
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Hinzufügen fehlgeschlagen', 'error')
    }
  }

  const unchecked = useMemo(() => items.filter(i => !i.checked), [items])
  const checkedItems = useMemo(() => items.filter(i => i.checked), [items])

  function exportToBring() {
    if (unchecked.length === 0) return
    const itemsParam = unchecked
      .map(i => `${encodeURIComponent(i.item)},${encodeURIComponent(i.quantity || '')}`)
      .join('|')
    window.open(
      `https://api.getbring.com/rest/bringrecipes/deeplink?source=${encodeURIComponent('Menüplan')}&items=${itemsParam}`,
      '_blank'
    )
  }

  async function copyAsText() {
    if (unchecked.length === 0) return
    const text = unchecked.map(i => i.quantity ? `${i.item} – ${i.quantity}` : i.item).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      prompt('Liste kopieren:', text)
    }
  }

  const activeCycle = cycles.find(c => c.id === cycleId)

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display font-normal text-2xl text-text">Einkauf</h1>
        <Pill variant="accent" onClick={() => { setShowSync(v => !v); if (!showSync) void runSync() }}>
          Sync
        </Pill>
      </div>

      {/* Zyklus-Sync */}
      {showSync && (
        <Card className="mb-4">
          <CardLabel>Aus Zyklus berechnen</CardLabel>

          {cycles.length === 0 ? (
            <p className="text-sm text-text-muted mt-3">
              Noch kein Kochzyklus vorhanden. Leg unter „Prep“ einen an.
            </p>
          ) : (
            <>
              <select
                value={cycleId ?? ''}
                onChange={e => { setCycleId(e.target.value); setSyncItems([]) }}
                className="w-full min-h-11 px-3 mt-3 rounded-button bg-surface-alt border border-border text-text text-sm outline-none"
              >
                {cycles.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name || `Kochtag ${fmt(c.cook_date)}`} · {fmt(c.start_date)}–{fmt(c.end_date)}
                  </option>
                ))}
              </select>

              <Button fullWidth className="mt-3" onClick={runSync} disabled={syncing || !cycleId}>
                {syncing ? 'Berechnen…' : 'Berechnen'}
              </Button>

              {syncItems.length > 0 && (
                <>
                  <p className="text-xs text-text-muted mt-4 mb-2">
                    {syncItems.length} Positionen · {owned.size > 0 && `${owned.size} schon zuhause`}
                  </p>
                  <ul className="mb-3">
                    {syncItems.map(item => {
                      const key = shoppingKey(item)
                      const isOwned = owned.has(key)
                      const isOpen = expanded.has(key)
                      const rounded = roundForShopping(item.total_amount, item.unit)
                      return (
                        <li key={key} className="border-b border-border-soft last:border-0 py-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setExpanded(prev => {
                                const n = new Set(prev)
                                if (n.has(key)) n.delete(key); else n.add(key)
                                return n
                              })}
                              className="tap-inline flex-1 text-left min-w-0"
                            >
                              <span className={`text-sm ${isOwned ? 'line-through text-text-faint' : 'text-text'}`}>
                                {item.food_name}
                              </span>
                              <span className="text-xs text-text-muted ml-2">
                                {formatAmount(rounded, item.unit)}
                              </span>
                              {rounded !== item.total_amount && (
                                <span className="text-[10px] text-text-faint ml-1">
                                  (geplant {formatAmount(item.total_amount, item.unit)})
                                </span>
                              )}
                            </button>
                            <Pill
                              variant={isOwned ? 'success' : 'neutral'}
                              onClick={() => toggleOwned(key)}
                            >
                              {isOwned ? '✓ Hab ich' : 'Hab ich'}
                            </Pill>
                          </div>

                          {isOpen && (
                            <ul className="mt-2 pl-3 border-l-2 border-border-soft">
                              {item.sources.map((s, i) => (
                                <li key={i} className="text-xs text-text-muted py-0.5">
                                  {formatAmount(s.amount, item.unit)} aus {s.source}
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      )
                    })}
                  </ul>

                  <Button fullWidth onClick={applySync}>
                    {syncItems.length - owned.size} Positionen übernehmen
                  </Button>
                  {activeCycle && (
                    <p className="text-[11px] text-text-faint mt-2">
                      Ersetzt die generierten Positionen dieses Zyklus. Selbst hinzugefügte bleiben stehen.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </Card>
      )}

      {/* Eigene Position */}
      <form onSubmit={handleAdd} className="flex gap-2 mb-3">
        <input
          type="text"
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          placeholder="Artikel"
          className="flex-1 min-h-11 px-3 rounded-button bg-surface border border-border text-text text-sm outline-none placeholder:text-text-faint"
        />
        <input
          type="text"
          value={newQty}
          onChange={e => setNewQty(e.target.value)}
          placeholder="Menge"
          className="w-24 min-h-11 px-3 rounded-button bg-surface border border-border text-text text-sm outline-none placeholder:text-text-faint"
        />
        <IconButton label="Hinzufügen" variant="primary" type="submit">+</IconButton>
      </form>

      {/* Teilen */}
      <div className="flex gap-2 mb-4">
        <Button variant="secondary" fullWidth onClick={exportToBring} disabled={unchecked.length === 0}>
          Teilen
        </Button>
        <IconButton label="Als Text kopieren" onClick={copyAsText}>
          {copied ? '✓' : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3" />
            </svg>
          )}
        </IconButton>
      </div>

      {loading && <p className="text-sm text-center py-10 text-text-muted">Laden…</p>}

      {error && (
        <Card className="text-center">
          <p className="text-sm text-danger mb-3">{error}</p>
          <Button variant="secondary" onClick={() => { setLoading(true); void load() }}>Erneut versuchen</Button>
        </Card>
      )}

      {!loading && !error && (
        <Card flush>
          {items.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-text-muted">Einkaufsliste ist leer</p>
          )}

          <ul className="px-5">
            {unchecked.map(i => (
              <li key={i.id} className="border-b border-border-soft last:border-0 flex items-center gap-2">
                <Checkbox
                  checked={false}
                  onChange={async () => { await setShoppingChecked(i.id, true); await load() }}
                  label={i.item}
                  trailing={i.quantity ?? undefined}
                />
                <button
                  onClick={async () => { await deleteShoppingItem(i.id); await load() }}
                  aria-label={`${i.item} löschen`}
                  className="tap-inline text-text-faint hover:text-danger px-1"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          {checkedItems.length > 0 && (
            <>
              <div className="flex items-center justify-between px-5 pt-3 pb-1">
                <CardLabel>Erledigt ({checkedItems.length})</CardLabel>
                <button
                  onClick={async () => { await clearChecked(); await load() }}
                  className="tap-inline text-xs text-text-muted hover:text-danger"
                >
                  Löschen
                </button>
              </div>
              <ul className="px-5 pb-3">
                {checkedItems.map(i => (
                  <li key={i.id} className="border-b border-border-soft last:border-0">
                    <Checkbox
                      checked
                      onChange={async () => { await setShoppingChecked(i.id, false); await load() }}
                      label={i.item}
                      trailing={i.quantity ?? undefined}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}
    </div>
  )
}

function fmt(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('de-CH', { day: 'numeric', month: 'short' })
}
