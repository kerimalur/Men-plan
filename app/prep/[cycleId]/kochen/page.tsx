'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getCycle, buildCookingList, setCycleStatus } from '@/lib/db/cycles'
import type { PrepCycle } from '@/lib/db/types'
import { MEAL_TYPE_LABELS } from '@/lib/mealTypes'
import { formatAmount } from '@/lib/units'
import { useToast } from '@/components/Toast'
import Card, { CardLabel } from '@/components/ui/Card'
import Pill from '@/components/ui/Pill'
import Button, { IconButton } from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'

/**
 * Die Ansicht, die beim Kochen auf dem Handy offen liegt.
 *
 * Leistet die Hochrechnung, die der Nutzer bisher im Kopf gemacht hat:
 * 300 g pro Portion × 3 Portionen = 900 g in den Topf, danach 3 Boxen à 300 g.
 */
export default function KochlistePage() {
  const { cycleId } = useParams<{ cycleId: string }>()
  const router = useRouter()
  const { toast } = useToast()

  const [cycle, setCycle] = useState<PrepCycle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())

  const storageKey = `kochliste:${cycleId}`

  const load = useCallback(async () => {
    setError(null)
    try {
      const c = await getCycle(cycleId)
      if (!c) { setError('Zyklus nicht gefunden.'); return }
      setCycle(c)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Zyklus konnte nicht geladen werden')
    } finally {
      setLoading(false)
    }
  }, [cycleId])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  // Abhak-Zustand lokal: überlebt Reload, ohne Schreibzugriff auf die Datenbank.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) setChecked(new Set(JSON.parse(raw) as string[]))
    } catch { /* localStorage nicht verfügbar — dann eben ohne */ }
  }, [storageKey])

  function toggle(key: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      try { localStorage.setItem(storageKey, JSON.stringify([...next])) } catch { /* ignorieren */ }
      return next
    })
  }

  // Bildschirm wachhalten. Feature-Detection, stiller Fallback.
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null
    const nav = navigator as Navigator & {
      wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> }
    }
    nav.wakeLock?.request('screen').then(s => { sentinel = s }).catch(() => {})
    return () => { sentinel?.release().catch(() => {}) }
  }, [])

  const batches = useMemo(() => (cycle ? buildCookingList(cycle) : []), [cycle])
  const costTotal = batches.reduce((s, b) => s + b.costTotal, 0)
  const portionsTotal = batches.reduce((s, b) => s + b.portions, 0)

  if (loading) return <p className="text-sm text-center py-10 text-text-muted">Laden…</p>

  if (error) {
    return (
      <div className="max-w-lg mx-auto">
        <Card className="text-center">
          <p className="text-sm text-danger mb-3">{error}</p>
          <Button variant="secondary" onClick={() => { setLoading(true); void load() }}>Erneut versuchen</Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-5">
        <IconButton label="Zurück" onClick={() => router.push('/prep')}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </IconButton>
        <h1 className="font-display font-normal text-2xl text-text">Kochliste</h1>
      </div>

      {/* Kopfzeile */}
      <Card className="mb-4">
        <div className="flex items-end justify-between">
          <div>
            <CardLabel>Gesamtkosten</CardLabel>
            <p className="font-display font-normal text-2xl text-text mt-1">
              CHF {costTotal.toFixed(2)}
            </p>
          </div>
          <div className="text-right">
            <CardLabel>Pro Portion</CardLabel>
            <p className="font-display font-normal text-2xl text-text mt-1">
              CHF {portionsTotal > 0 ? (costTotal / portionsTotal).toFixed(2) : '0.00'}
            </p>
          </div>
        </div>
        <p className="text-xs text-text-muted mt-2">{portionsTotal} Boxen aus {batches.length} Töpfen</p>
      </Card>

      {/* Ein Block pro Topf */}
      {batches.map(b => (
        <Card key={b.batchId} className="mb-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <h2 className="font-display font-normal text-lg text-text">{b.recipeName}</h2>
              <Pill variant="neutral" className="mt-1">{MEAL_TYPE_LABELS[b.mealType]}</Pill>
            </div>
            <div className="text-right shrink-0">
              <span className="font-display font-normal text-3xl text-accent">{b.portions}</span>
              <p className="text-[11px] text-text-muted">Boxen</p>
            </div>
          </div>

          {/* Hochgerechnete Gesamtmengen — das kommt in den Topf */}
          <div className="rounded-inner bg-surface-alt p-3 mb-3">
            <CardLabel>In den Topf</CardLabel>
            <ul className="mt-2">
              {b.ingredients.map((ing, i) => {
                const key = `${b.batchId}:${i}`
                return (
                  <li key={key} className="border-b border-border-soft last:border-0">
                    <Checkbox
                      checked={checked.has(key)}
                      onChange={() => toggle(key)}
                      label={ing.food_name}
                      trailing={formatAmount(ing.total, ing.unit)}
                    />
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Box-Aufteilung — das kommt in jede Box */}
          <div className="rounded-inner bg-sage-soft p-3">
            <CardLabel>{b.portions} Boxen à</CardLabel>
            <ul className="mt-2 flex flex-col gap-1">
              {b.ingredients.map((ing, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">{ing.food_name}</span>
                  <span className="text-text-muted font-semibold">{formatAmount(ing.perPortion, ing.unit)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      ))}

      {batches.length === 0 && (
        <Card className="text-center">
          <p className="text-sm text-text-muted">Dieser Zyklus hat noch keine Töpfe.</p>
        </Card>
      )}

      {cycle && cycle.status !== 'gekocht' && cycle.status !== 'erledigt' && (
        <Button
          fullWidth
          onClick={async () => {
            try {
              await setCycleStatus(cycle.id, 'gekocht')
              await load()
              toast('Zyklus als gekocht markiert', 'success')
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Speichern fehlgeschlagen', 'error')
            }
          }}
        >
          Zyklus als gekocht markieren
        </Button>
      )}
    </div>
  )
}
