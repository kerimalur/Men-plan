'use client'

import { useState } from 'react'
import type { Nutrition } from '@/lib/calculations'
import RecipeIngredients from '@/components/RecipeIngredients'
import Button from '@/components/ui/Button'
import { CardLabel } from '@/components/ui/Card'

interface Props {
  recipeId: string
  recipeName: string
  /** Anzahl Boxen des Topfs — blendet zusätzlich die Gesamtmenge ein. */
  portions?: number
  /** Wird beim Schliessen aufgerufen; `changed` sagt, ob nachgeladen werden muss. */
  onClose: (changed: boolean) => void
}

/**
 * Zutaten eines Rezepts direkt aus dem Prep-Zyklus bearbeiten.
 *
 * Die eingefrorenen Werte pro Portion in prep_batches zieht der DB-Trigger
 * recipe_items_batches nach — allerdings nur für Zyklen im Status „geplant".
 * Ein bereits gekochter Zyklus behält seine Zahlen, wie er soll.
 */
export default function RecipeEditModal({ recipeId, recipeName, portions, onClose }: Props) {
  const [n, setN] = useState<Nutrition | null>(null)
  const [changed, setChanged] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-text/30 backdrop-blur-sm">
      <div className="w-full sm:max-w-md max-h-[88vh] flex flex-col bg-surface rounded-t-card sm:rounded-card border border-border shadow-float">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border-soft">
          <h2 className="font-display font-normal text-lg text-text min-w-0 truncate">{recipeName}</h2>
          <Button variant="secondary" onClick={() => onClose(changed)}>Schliessen</Button>
        </div>

        {n && (
          <div className="px-5 py-3 border-b border-border-soft">
            <CardLabel>Pro Portion</CardLabel>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm font-semibold text-text-secondary">
              <span>{Math.round(n.kcal)} kcal</span>
              <span>{n.protein} g Protein</span>
              {n.carbs > 0 && <span>{n.carbs} g KH</span>}
              {n.fat > 0 && <span>{n.fat} g Fett</span>}
              {n.cost > 0 && <span>CHF {n.cost.toFixed(2)}</span>}
            </div>
            {portions != null && portions > 0 && (
              <p className="text-[11px] text-text-faint mt-1.5">
                {portions} Boxen · {Math.round(n.kcal * portions)} kcal · CHF {(n.cost * portions).toFixed(2)} im Topf
              </p>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <RecipeIngredients
            recipeId={recipeId}
            onNutrition={setN}
            onChanged={() => setChanged(true)}
          />
        </div>
      </div>
    </div>
  )
}
