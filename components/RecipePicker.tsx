'use client'

import { useState, useEffect, useMemo } from 'react'
import { listRecipes } from '@/lib/db/recipes'
import type { Recipe } from '@/lib/db/types'
import { MEAL_TYPE_LABELS, type MealTypeKey } from '@/lib/mealTypes'
import Card from '@/components/ui/Card'
import Pill from '@/components/ui/Pill'
import Button from '@/components/ui/Button'

interface Props {
  /** Slot, für den gewählt wird. Filtert nur vor. */
  mealType?: MealTypeKey
  onPick: (recipe: Recipe) => void
  onClose: () => void
  /** Rezepte, die im Zyklus schon verwendet sind — werden markiert. */
  usedIds?: string[]
}

/**
 * Rezeptauswahl.
 *
 * meal_type ist ein VORFILTER, keine Sperre: der Umschalter „alle Rezepte"
 * hebt ihn jederzeit auf. Das ist wichtig, weil bei der Migration alle 41
 * vormaligen Hauptmahlzeiten auf 'mittagessen' gelandet sind und sonst im
 * Abendessen-Slot niemand etwas fände.
 */
export default function RecipePicker({ mealType, onPick, onClose, usedIds = [] }: Props) {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    void Promise.resolve().then(async () => {
      try { setRecipes(await listRecipes()) }
      catch (e) { setError(e instanceof Error ? e.message : 'Rezepte konnten nicht geladen werden') }
      finally { setLoading(false) }
    })
  }, [])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return recipes
      .filter(r => showAll || !mealType || r.meal_type === mealType)
      .filter(r => !q || r.name.toLowerCase().includes(q))
      // Favoriten zuoberst, danach zuletzt geändert.
      .sort((a, b) => {
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1
        return (b.updated_at ?? '').localeCompare(a.updated_at ?? '')
      })
  }, [recipes, showAll, mealType, query])

  const hiddenByFilter = mealType && !showAll
    ? recipes.length - recipes.filter(r => r.meal_type === mealType).length
    : 0

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-text/30 backdrop-blur-sm">
      <div className="w-full sm:max-w-md max-h-[88vh] flex flex-col bg-surface rounded-t-card sm:rounded-card border border-border shadow-float">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft">
          <h2 className="font-display font-normal text-lg text-text">
            {mealType ? `Rezept für ${MEAL_TYPE_LABELS[mealType]}` : 'Rezept wählen'}
          </h2>
          <Button variant="secondary" onClick={onClose}>Schliessen</Button>
        </div>

        <div className="px-5 py-3 border-b border-border-soft">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Suchen…"
            className="w-full min-h-11 px-3 rounded-button bg-surface-alt border border-border text-text text-sm outline-none placeholder:text-text-faint"
          />
          {mealType && (
            <div className="flex items-center gap-2 mt-2">
              <Pill variant={showAll ? 'accent' : 'neutral'} onClick={() => setShowAll(v => !v)}>
                {showAll ? '✓ Alle Rezepte' : 'Alle Rezepte'}
              </Pill>
              {hiddenByFilter > 0 && (
                <span className="text-xs text-text-faint">{hiddenByFilter} weitere ausgeblendet</span>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading && <p className="text-sm text-center py-8 text-text-muted">Laden…</p>}

          {error && (
            <Card className="text-center">
              <p className="text-sm text-danger">{error}</p>
            </Card>
          )}

          {!loading && !error && visible.length === 0 && (
            <p className="text-sm text-center py-8 text-text-muted">Keine Rezepte gefunden.</p>
          )}

          <ul className="flex flex-col gap-1">
            {visible.map(r => (
              <li key={r.id}>
                <button
                  onClick={() => onPick(r)}
                  className="w-full min-h-11 text-left px-3 py-2.5 rounded-inner hover:bg-surface-alt flex items-center gap-2"
                >
                  {r.is_favorite && <span className="text-accent">★</span>}
                  <span className="flex-1 text-sm text-text">{r.name}</span>
                  {usedIds.includes(r.id) && <Pill variant="sage">im Zyklus</Pill>}
                  {r.meal_type !== mealType && (
                    <span className="text-[11px] text-text-faint">{MEAL_TYPE_LABELS[r.meal_type]}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
