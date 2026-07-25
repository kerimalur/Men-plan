'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  listRecipes, getRecipe, createRecipe, updateRecipe, deleteRecipe,
  duplicateRecipe, toggleFavorite, addRecipeItem, updateRecipeItemAmount,
  deleteRecipeItem, listRecipeCategories, nutritionPerPortion,
} from '@/lib/db/recipes'
import { searchFoods, getFoodsByIds } from '@/lib/db/foods'
import type { Food, Recipe, RecipeItem, RecipeStatus, TemplateCategory, ItemUnit } from '@/lib/db/types'
import { MEAL_TYPE_ORDER, MEAL_TYPE_LABELS, type MealTypeKey } from '@/lib/mealTypes'
import { formatAmount, toBaseUnit, unitsForFood } from '@/lib/units'
import { useToast } from '@/components/Toast'
import Card, { CardLabel } from '@/components/ui/Card'
import Pill, { MealTypePill } from '@/components/ui/Pill'
import Button, { IconButton } from '@/components/ui/Button'
import AmountInput from '@/components/ui/AmountInput'

const STATUS_LABELS: Record<RecipeStatus, string> = {
  idee:            'Idee',
  zutaten_erfasst: 'Zutaten erfasst',
  bereit:          'Bereit',
}

const STATUS_VARIANT: Record<RecipeStatus, 'warning' | 'sage' | 'success'> = {
  idee:            'warning',
  zutaten_erfasst: 'sage',
  bereit:          'success',
}

export default function RezeptePage() {
  const { toast } = useToast()

  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [categories, setCategories] = useState<TemplateCategory[]>([])
  const [foodsById, setFoodsById] = useState<Map<string, Food>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [mealType, setMealType] = useState<MealTypeKey | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [status, setStatus] = useState<RecipeStatus | null>(null)
  const [favoritesOnly, setFavoritesOnly] = useState(false)

  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [rs, cs] = await Promise.all([listRecipes(), listRecipeCategories()])
      setRecipes(rs)
      setCategories(cs)

      // Nährwerte pro Portion brauchen die Lebensmittel aller Zutaten.
      const ids = [...new Set(rs.flatMap(r => (r.recipe_items ?? []).map(i => i.food_id).filter(Boolean)))] as string[]
      const foods = await getFoodsByIds(ids)
      setFoodsById(new Map(foods.map(f => [f.id, f])))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  const visible = useMemo(() => recipes.filter(r => {
    if (mealType && r.meal_type !== mealType) return false
    if (categoryId && r.category_id !== categoryId) return false
    if (status && r.status !== status) return false
    if (favoritesOnly && !r.is_favorite) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const inName = r.name.toLowerCase().includes(q)
      const inItems = (r.recipe_items ?? []).some(i => i.food_name.toLowerCase().includes(q))
      if (!inName && !inItems) return false
    }
    return true
  }), [recipes, mealType, categoryId, status, favoritesOnly, search])

  const openRecipe = recipes.find(r => r.id === openId)

  async function handleCreate() {
    try {
      const r = await createRecipe({ name: 'Neues Rezept', meal_type: mealType ?? 'mittagessen', status: 'idee' })
      await load()
      setOpenId(r.id)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Anlegen fehlgeschlagen', 'error')
    }
  }

  if (openRecipe) {
    return (
      <RecipeDetail
        recipe={openRecipe}
        categories={categories}
        foodsById={foodsById}
        onBack={() => { setOpenId(null); void load() }}
        onChanged={load}
      />
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display font-normal text-2xl text-text">Rezepte</h1>
        <Button onClick={handleCreate}>+ Neu</Button>
      </div>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Rezept oder Zutat suchen…"
        className="w-full min-h-11 px-4 mb-3 rounded-button bg-surface border border-border text-text text-sm outline-none placeholder:text-text-faint"
      />

      <div className="flex gap-2 overflow-x-auto pb-2 mb-2 -mx-1 px-1">
        <Pill variant={mealType === null ? 'accent' : 'neutral'} onClick={() => setMealType(null)}>Alle</Pill>
        {MEAL_TYPE_ORDER.map(t => (
          <Pill key={t} variant={mealType === t ? 'accent' : 'neutral'} onClick={() => setMealType(mealType === t ? null : t)}>
            {MEAL_TYPE_LABELS[t]}
          </Pill>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
        <Pill variant={favoritesOnly ? 'accent' : 'neutral'} onClick={() => setFavoritesOnly(v => !v)}>★ Favoriten</Pill>
        {(Object.keys(STATUS_LABELS) as RecipeStatus[]).map(s => (
          <Pill key={s} variant={status === s ? 'accent' : 'neutral'} onClick={() => setStatus(status === s ? null : s)}>
            {STATUS_LABELS[s]}
          </Pill>
        ))}
        {categories.map(c => (
          <Pill key={c.id} variant={categoryId === c.id ? 'accent' : 'neutral'} onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}>
            {c.name}
          </Pill>
        ))}
      </div>

      {loading && <p className="text-sm text-center py-10 text-text-muted">Laden…</p>}

      {error && (
        <Card className="text-center">
          <p className="text-sm text-danger mb-3">{error}</p>
          <Button variant="secondary" onClick={() => { setLoading(true); void load() }}>Erneut versuchen</Button>
        </Card>
      )}

      {!loading && !error && visible.length === 0 && (
        <Card className="text-center">
          <p className="text-sm text-text-muted">
            {recipes.length === 0 ? 'Noch keine Rezepte vorhanden.' : 'Keine Rezepte für diesen Filter.'}
          </p>
        </Card>
      )}

      <div className="grid gap-3">
        {visible.map(r => (
          <RecipeCard key={r.id} recipe={r} foodsById={foodsById} onOpen={() => setOpenId(r.id)} />
        ))}
      </div>
    </div>
  )
}

// ── Listenkarte ─────────────────────────────────────────────────────────────

function RecipeCard({ recipe, foodsById, onOpen }: {
  recipe: Recipe
  foodsById: Map<string, Food>
  onOpen: () => void
}) {
  const items = recipe.recipe_items ?? []
  const n = nutritionPerPortion(items, foodsById)

  return (
    <Card onClick={onOpen}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <h2 className="font-display font-normal text-base text-text flex-1 min-w-0">
          {recipe.is_favorite && <span className="text-accent mr-1">★</span>}
          {recipe.name}
        </h2>
        <MealTypePill mealType={recipe.meal_type} label={MEAL_TYPE_LABELS[recipe.meal_type]} />
      </div>

      <div className="flex items-center gap-2 mb-3">
        <Pill variant={STATUS_VARIANT[recipe.status]}>{STATUS_LABELS[recipe.status]}</Pill>
        <span className="text-xs text-text-muted">{items.length} Zutaten</span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-text-secondary">
        <span>{Math.round(n.kcal)} kcal</span>
        <span>{n.protein} g Protein</span>
        {n.carbs > 0 && <span>{n.carbs} g KH</span>}
        {n.fat > 0 && <span>{n.fat} g Fett</span>}
        {n.cost > 0 && <span>CHF {n.cost.toFixed(2)}</span>}
        <span className="text-text-faint">pro Portion</span>
      </div>
    </Card>
  )
}

// ── Detailansicht ───────────────────────────────────────────────────────────

function RecipeDetail({ recipe, categories, foodsById, onBack, onChanged }: {
  recipe: Recipe
  categories: TemplateCategory[]
  foodsById: Map<string, Food>
  onBack: () => void
  onChanged: () => Promise<void>
}) {
  const { toast } = useToast()
  const [name, setName] = useState(recipe.name)
  const [freetext, setFreetext] = useState(recipe.freetext)
  const [items, setItems] = useState<RecipeItem[]>(recipe.recipe_items ?? [])
  const [localFoods, setLocalFoods] = useState(foodsById)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [previewAmounts, setPreviewAmounts] = useState<Record<string, number>>({})

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Food[]>([])
  const [picked, setPicked] = useState<Food | null>(null)
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState<ItemUnit>('g')

  useEffect(() => {
    const t = setTimeout(async () => {
      if (query.trim().length < 1) { setResults([]); return }
      try { setResults(await searchFoods(query)) } catch { setResults([]) }
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  async function refresh() {
    const fresh = await getRecipe(recipe.id)
    if (fresh) setItems(fresh.recipe_items ?? [])
    await onChanged()
  }

  // Nährwerte pro Portion, während des Tippens live gegen die Vorschau gerechnet.
  const previewItems = items.map(i =>
    previewAmounts[i.id] !== undefined ? { ...i, amount_per_portion: previewAmounts[i.id] } : i
  )
  const n = nutritionPerPortion(previewItems, localFoods)

  async function saveField(patch: Partial<Recipe>) {
    try { await updateRecipe(recipe.id, patch); await onChanged() }
    catch (e) { toast(e instanceof Error ? e.message : 'Speichern fehlgeschlagen', 'error') }
  }

  async function handleAddItem() {
    if (!picked || !amount) return
    try {
      await addRecipeItem({
        recipe_id: recipe.id,
        food_id: picked.id,
        food_name: picked.name,
        amount_per_portion: parseFloat(amount.replace(',', '.')) || 0,
        unit,
        sort_order: items.length,
      })
      setLocalFoods(prev => new Map(prev).set(picked.id, picked))
      setPicked(null); setQuery(''); setAmount('')
      await refresh()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Zutat konnte nicht hinzugefügt werden', 'error')
    }
  }

  async function handleDeleteItem(id: string) {
    try { await deleteRecipeItem(id); await refresh() }
    catch (e) { toast(e instanceof Error ? e.message : 'Löschen fehlgeschlagen', 'error') }
  }

  async function handleCommitAmount(item: RecipeItem, value: number) {
    setEditingItemId(null)
    setPreviewAmounts(p => { const c = { ...p }; delete c[item.id]; return c })
    if (value <= 0 || value === item.amount_per_portion) return
    try { await updateRecipeItemAmount(item.id, value); await refresh() }
    catch (e) { toast(e instanceof Error ? e.message : 'Menge speichern fehlgeschlagen', 'error') }
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <IconButton label="Zurück" onClick={onBack}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </IconButton>
        <div className="flex-1" />
        <IconButton
          label={recipe.is_favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
          variant={recipe.is_favorite ? 'primary' : 'secondary'}
          onClick={async () => { await toggleFavorite(recipe.id, !recipe.is_favorite); await onChanged() }}
        >
          ★
        </IconButton>
        <IconButton label="Duplizieren" onClick={async () => {
          try { await duplicateRecipe(recipe.id); await onChanged(); toast('Rezept dupliziert', 'success'); onBack() }
          catch (e) { toast(e instanceof Error ? e.message : 'Duplizieren fehlgeschlagen', 'error') }
        }}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </IconButton>
        <IconButton label="Löschen" variant="danger" onClick={async () => {
          try { await deleteRecipe(recipe.id); toast('Rezept gelöscht', 'success'); onBack() }
          catch (e) { toast(e instanceof Error ? e.message : 'Löschen fehlgeschlagen', 'error') }
        }}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </IconButton>
      </div>

      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        onBlur={() => name.trim() && name !== recipe.name && saveField({ name: name.trim() })}
        className="w-full font-display font-normal text-2xl text-text bg-transparent outline-none mb-4"
      />

      {/* Nährwerte pro Portion */}
      <Card className="mb-4">
        <CardLabel>Pro Portion</CardLabel>
        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3">
          <Stat value={Math.round(n.kcal)} unit="kcal" />
          <Stat value={n.protein} unit="g Protein" />
          {n.carbs > 0 && <Stat value={n.carbs} unit="g KH" />}
          {n.fat > 0 && <Stat value={n.fat} unit="g Fett" />}
          {n.cost > 0 && <Stat value={Number(n.cost.toFixed(2))} unit="CHF" />}
        </div>
      </Card>

      {/* Eigenschaften */}
      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <CardLabel>Mahlzeit</CardLabel>
            <select
              value={recipe.meal_type}
              onChange={e => saveField({ meal_type: e.target.value as MealTypeKey })}
              className="min-h-11 px-3 rounded-button bg-surface-alt border border-border text-text text-sm outline-none"
            >
              {MEAL_TYPE_ORDER.map(t => <option key={t} value={t}>{MEAL_TYPE_LABELS[t]}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <CardLabel>Status</CardLabel>
            <select
              value={recipe.status}
              onChange={e => saveField({ status: e.target.value as RecipeStatus })}
              className="min-h-11 px-3 rounded-button bg-surface-alt border border-border text-text text-sm outline-none"
            >
              {(Object.keys(STATUS_LABELS) as RecipeStatus[]).map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <CardLabel>Kategorie</CardLabel>
            <select
              value={recipe.category_id ?? ''}
              onChange={e => saveField({ category_id: e.target.value || null })}
              className="min-h-11 px-3 rounded-button bg-surface-alt border border-border text-text text-sm outline-none"
            >
              <option value="">Keine</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <CardLabel>Portionen (Vorschlag)</CardLabel>
            <input
              type="text"
              inputMode="decimal"
              defaultValue={recipe.default_portions}
              onBlur={e => {
                const v = Math.max(1, Math.min(14, Math.round(parseFloat(e.target.value) || 3)))
                if (v !== recipe.default_portions) saveField({ default_portions: v })
              }}
              className="min-h-11 px-3 rounded-button bg-surface-alt border border-border text-text text-sm outline-none"
            />
          </label>
        </div>
      </Card>

      {/* Zutaten */}
      <Card className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <CardLabel>Zutaten pro Portion</CardLabel>
          <span className="text-xs text-text-faint">{items.length}</span>
        </div>

        {items.length === 0 && <p className="text-sm text-text-faint py-2">Noch keine Zutaten.</p>}

        <ul>
          {items.map(item => {
            const base = toBaseUnit(item.amount_per_portion, item.unit)
            return (
              <li key={item.id} className="border-b border-border-soft last:border-0 py-2">
                {editingItemId === item.id ? (
                  <div>
                    <p className="text-sm text-text mb-2">{item.food_name}</p>
                    <AmountInput
                      value={item.amount_per_portion}
                      unit={item.unit}
                      onPreview={v => setPreviewAmounts(p => ({ ...p, [item.id]: v }))}
                      onCommit={v => handleCommitAmount(item, v)}
                      onCancel={() => {
                        setEditingItemId(null)
                        setPreviewAmounts(p => { const c = { ...p }; delete c[item.id]; return c })
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="flex-1 text-sm text-text-secondary min-w-0">{item.food_name}</span>
                    <button
                      onClick={() => setEditingItemId(item.id)}
                      className="tap-inline text-sm text-text-muted px-2 py-1 rounded-button hover:bg-surface-alt"
                    >
                      {formatAmount(base.amount, base.unit)}
                    </button>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      aria-label={`${item.food_name} entfernen`}
                      className="tap-inline text-text-faint hover:text-danger px-1"
                    >
                      ×
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {/* Zutat hinzufügen */}
        <div className="mt-4 pt-4 border-t border-border-soft">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setPicked(null) }}
              placeholder="Lebensmittel suchen…"
              className="w-full min-h-11 px-3 rounded-button bg-surface-alt border border-border text-text text-sm outline-none placeholder:text-text-faint"
            />
            {results.length > 0 && !picked && (
              <ul className="absolute z-10 left-0 right-0 top-full mt-1 rounded-inner bg-surface border border-border shadow-float max-h-52 overflow-y-auto">
                {results.map(f => (
                  <li key={f.id}>
                    <button
                      onMouseDown={() => {
                        setPicked(f); setQuery(f.name); setResults([])
                        setUnit(unitsForFood(f.unit)[0])
                      }}
                      className="w-full text-left px-3 py-2.5 text-sm text-text hover:bg-surface-alt"
                    >
                      {f.name}
                      <span className="text-xs text-text-muted ml-2">{f.calories_per_100} kcal</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {picked && (
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddItem()}
                placeholder="Menge"
                className="flex-1 min-h-11 px-3 rounded-button bg-surface-alt border border-border text-text text-sm outline-none placeholder:text-text-faint"
              />
              <select
                value={unit}
                onChange={e => setUnit(e.target.value as ItemUnit)}
                className="min-h-11 px-3 rounded-button bg-surface-alt border border-border text-text text-sm outline-none"
              >
                {unitsForFood(picked.unit).map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <Button onClick={handleAddItem} disabled={!amount}>+</Button>
            </div>
          )}
        </div>
      </Card>

      {/* Zubereitung */}
      <Card>
        <CardLabel>Zubereitung</CardLabel>
        <textarea
          value={freetext}
          onChange={e => setFreetext(e.target.value)}
          onBlur={() => freetext !== recipe.freetext && saveField({ freetext })}
          rows={5}
          placeholder="Notizen zur Zubereitung…"
          className="w-full mt-2 p-3 rounded-inner bg-surface-alt border border-border-soft text-text text-sm outline-none resize-y placeholder:text-text-faint"
        />
      </Card>
    </div>
  )
}

function Stat({ value, unit }: { value: number; unit: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="font-display font-normal text-xl text-text">{value}</span>
      <span className="text-xs text-text-muted">{unit}</span>
    </div>
  )
}
