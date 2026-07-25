'use client'

import { useState, useEffect, useCallback } from 'react'
import { loadSettings, saveSetting, DEFAULTS } from '@/lib/settings'
import { listRecipes } from '@/lib/db/recipes'
import { listFoodCategories, createFoodCategory, deleteFoodCategory } from '@/lib/db/foods'
import { listEventRules, addEventRule, deleteEventRule } from '@/lib/eventRules'
import type { EventMealRule, FoodCategory, Recipe } from '@/lib/db/types'
import { MEAL_TYPE_ORDER, MEAL_TYPE_LABELS, type MealTypeKey } from '@/lib/mealTypes'
import { useToast } from '@/components/Toast'
import Card, { CardLabel } from '@/components/ui/Card'
import Pill from '@/components/ui/Pill'
import Button, { IconButton } from '@/components/ui/Button'

const GOALS: Array<{ key: keyof typeof DEFAULTS; label: string; unit: string }> = [
  { key: 'kcal_ziel',    label: 'Kalorien',  unit: 'kcal' },
  { key: 'protein_ziel', label: 'Protein',   unit: 'g' },
  { key: 'kosten_ziel',  label: 'Kosten',    unit: 'CHF' },
]

export default function EinstellungenPage() {
  const { toast } = useToast()

  const [values, setValues] = useState<Record<string, string>>({ ...DEFAULTS })
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [categories, setCategories] = useState<FoodCategory[]>([])
  const [rules, setRules] = useState<EventMealRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newCat, setNewCat] = useState('')
  const [newEvent, setNewEvent] = useState<'training' | 'eingeladen'>('training')
  const [newMealType, setNewMealType] = useState<MealTypeKey>('mittagessen')
  const [newRecipeId, setNewRecipeId] = useState('')

  const load = useCallback(async () => {
    setError(null)
    try {
      const [s, rs, cs, rl] = await Promise.all([
        loadSettings(), listRecipes(), listFoodCategories(), listEventRules(),
      ])
      setValues(s); setRecipes(rs); setCategories(cs); setRules(rl)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Einstellungen konnten nicht geladen werden')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  async function save(key: string, value: string) {
    setValues(v => ({ ...v, [key]: value }))
    try { await saveSetting(key, value) }
    catch (e) { toast(e instanceof Error ? e.message : 'Speichern fehlgeschlagen', 'error') }
  }

  const breakfastRecipes = recipes.filter(r => r.meal_type === 'fruehstueck')
  const snackRecipes = recipes.filter(r => r.meal_type === 'snack')

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
      <h1 className="font-display font-normal text-2xl text-text mb-5">Einstellungen</h1>

      {/* Tagesziele */}
      <Card className="mb-4">
        <CardLabel>Tagesziele</CardLabel>
        <div className="flex flex-col gap-3 mt-3">
          {GOALS.map(g => (
            <label key={g.key} className="flex items-center justify-between gap-3">
              <span className="text-sm text-text-secondary">{g.label}</span>
              <span className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={values[g.key] ?? ''}
                  onChange={e => setValues(v => ({ ...v, [g.key]: e.target.value }))}
                  onBlur={e => save(g.key, e.target.value)}
                  className="w-24 min-h-11 px-3 rounded-button bg-surface-alt border border-border text-text text-sm text-right outline-none"
                />
                <span className="w-10 text-xs text-text-muted">{g.unit}</span>
              </span>
            </label>
          ))}
        </div>
      </Card>

      {/* Standard-Mahlzeiten */}
      <Card className="mb-4">
        <CardLabel>Standard-Mahlzeiten</CardLabel>
        <p className="text-xs text-text-muted mt-1 mb-3">
          Wird beim Anlegen eines Zyklus und beim Öffnen eines leeren Tages automatisch gesetzt,
          bleibt aber pro Tag überschreib- und löschbar.
        </p>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-text-secondary">Frühstück</span>
            <select
              value={values.default_breakfast_recipe_id ?? ''}
              onChange={e => save('default_breakfast_recipe_id', e.target.value)}
              className="min-h-11 px-3 rounded-button bg-surface-alt border border-border text-text text-sm outline-none"
            >
              <option value="">Keins</option>
              {breakfastRecipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-text-secondary">Snack (optional)</span>
            <select
              value={values.default_snack_recipe_id ?? ''}
              onChange={e => save('default_snack_recipe_id', e.target.value)}
              className="min-h-11 px-3 rounded-button bg-surface-alt border border-border text-text text-sm outline-none"
            >
              <option value="">Keiner</option>
              {snackRecipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        </div>
      </Card>

      {/* Event-Regeln */}
      <Card className="mb-4">
        <CardLabel>Event-Regeln</CardLabel>
        <p className="text-xs text-text-muted mt-1 mb-3">
          An Tagen mit diesem Marker wird das Rezept als Vorschlag angeboten.
        </p>

        {rules.length === 0 && <p className="text-sm text-text-faint mb-3">Noch keine Regeln.</p>}

        <ul className="mb-3">
          {rules.map(r => (
            <li key={r.id} className="flex items-center gap-2 border-b border-border-soft last:border-0 py-2">
              <Pill variant={r.event_type === 'training' ? 'sage' : 'warning'}>
                {r.event_type === 'training' ? 'Training' : 'Eingeladen'}
              </Pill>
              <span className="text-xs text-text-muted">{MEAL_TYPE_LABELS[r.meal_type]}</span>
              <span className="flex-1 text-sm text-text min-w-0 truncate">{r.recipes?.name ?? '—'}</span>
              <button
                onClick={async () => { await deleteEventRule(r.id); await load() }}
                aria-label="Regel löschen"
                className="tap-inline text-text-faint hover:text-danger px-1"
              >×</button>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <select
              value={newEvent}
              onChange={e => setNewEvent(e.target.value as 'training' | 'eingeladen')}
              className="flex-1 min-h-11 px-3 rounded-button bg-surface-alt border border-border text-text text-sm outline-none"
            >
              <option value="training">Training</option>
              <option value="eingeladen">Eingeladen</option>
            </select>
            <select
              value={newMealType}
              onChange={e => setNewMealType(e.target.value as MealTypeKey)}
              className="flex-1 min-h-11 px-3 rounded-button bg-surface-alt border border-border text-text text-sm outline-none"
            >
              {MEAL_TYPE_ORDER.map(t => <option key={t} value={t}>{MEAL_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <select
              value={newRecipeId}
              onChange={e => setNewRecipeId(e.target.value)}
              className="flex-1 min-h-11 px-3 rounded-button bg-surface-alt border border-border text-text text-sm outline-none"
            >
              <option value="">Rezept wählen…</option>
              {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <Button
              disabled={!newRecipeId}
              onClick={async () => {
                try {
                  await addEventRule(newEvent, newMealType, newRecipeId)
                  setNewRecipeId('')
                  await load()
                } catch (e) {
                  toast(e instanceof Error ? e.message : 'Regel konnte nicht angelegt werden', 'error')
                }
              }}
            >+</Button>
          </div>
        </div>
      </Card>

      {/* Lebensmittel-Kategorien */}
      <Card className="mb-4">
        <CardLabel>Lebensmittel-Kategorien</CardLabel>

        <div className="flex flex-wrap gap-2 my-3">
          {categories.length === 0 && <span className="text-sm text-text-faint">Noch keine Kategorien.</span>}
          {categories.map(c => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-pill bg-surface-alt px-3 py-1.5">
              <span className="text-xs font-semibold text-text-secondary">{c.name}</span>
              <button
                onClick={async () => { await deleteFoodCategory(c.id); await load() }}
                aria-label={`${c.name} löschen`}
                className="tap-inline text-text-faint hover:text-danger"
              >×</button>
            </span>
          ))}
        </div>

        <form
          className="flex gap-2"
          onSubmit={async e => {
            e.preventDefault()
            if (!newCat.trim()) return
            try { await createFoodCategory(newCat.trim()); setNewCat(''); await load() }
            catch (err) { toast(err instanceof Error ? err.message : 'Anlegen fehlgeschlagen', 'error') }
          }}
        >
          <input
            type="text"
            value={newCat}
            onChange={e => setNewCat(e.target.value)}
            placeholder="Neue Kategorie"
            className="flex-1 min-h-11 px-3 rounded-button bg-surface-alt border border-border text-text text-sm outline-none placeholder:text-text-faint"
          />
          <IconButton label="Kategorie anlegen" variant="primary" type="submit">+</IconButton>
        </form>
      </Card>

      {/* Sicherheitshinweis */}
      <Card>
        <CardLabel>Sicherheit</CardLabel>
        <p className="text-xs text-text-muted mt-2">
          Die Datenbank steht auf <code className="text-text-secondary">allow_all</code> für anonyme Zugriffe.
          Jeder mit der URL kann alle Daten lesen und schreiben. Details und ein Vorschlag für einen
          späteren Auth-Schritt stehen in der README.
        </p>
      </Card>
    </div>
  )
}
