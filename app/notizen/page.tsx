'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { calcNutrition, sumItems } from '@/lib/calculations'
import { useSwipe } from '@/lib/useSwipe'
import { useRouter } from 'next/navigation'

/* ── Types ─────────────────────────────────────────────── */

interface Food {
  id: string; name: string; calories_per_100: number; protein_per_100: number; cost_per_100: number; unit: 'g' | 'ml' | 'stk'
}

interface NoteItem {
  id: string
  note_id: string
  food_id: string | null
  food_name: string
  amount: number | null
  unit: string
  is_resolved: boolean
  sort_order: number
}

interface Note {
  id: string
  title: string
  freetext: string
  meal_type: string | null
  status: 'idee' | 'zutaten_erfasst' | 'bereit'
  created_at: string
  updated_at: string
  note_items: NoteItem[]
}

const MEAL_TYPES: Record<string, string> = {
  fruehstueck: 'Frühstück',
  mittagessen: 'Mittagessen',
  abendessen:  'Abendessen',
  snack:       'Snack',
}

const MEAL_TYPE_COLORS: Record<string, string> = {
  fruehstueck: '#d97706',
  mittagessen: '#059669',
  abendessen:  '#4f46e5',
  snack:       '#7c3aed',
}

const STATUS_LABELS: Record<string, string> = {
  idee:              'Idee',
  zutaten_erfasst:   'Zutaten erfasst',
  bereit:            'Bereit',
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  idee:            { bg: '#fef3c7', text: '#92400e', border: '#fbbf24' },
  zutaten_erfasst: { bg: '#dbeafe', text: '#1e40af', border: '#60a5fa' },
  bereit:          { bg: '#d1fae5', text: '#065f46', border: '#34d399' },
}

/* ── Main Component ────────────────────────────────────── */

export default function NotizenPage() {
  const [notes, setNotes] = useState<Note[]>([])
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useSwipe({
    onSwipeLeft:  () => router.push('/vorlagen'),
    onSwipeRight: () => router.push('/einkaufsliste'),
  })

  useEffect(() => { loadNotes() }, [])

  async function loadNotes() {
    const { data: notesData } = await supabase
      .from('notes')
      .select('*')
      .order('updated_at', { ascending: false })
    if (!notesData) { setNotes([]); setLoading(false); return }
    // Load items separately to avoid PostgREST relation cache issues
    const noteIds = notesData.map(n => n.id)
    const { data: itemsData } = noteIds.length > 0
      ? await supabase.from('note_items').select('*').in('note_id', noteIds)
      : { data: [] }
    const itemsByNote = new Map<string, NoteItem[]>()
    ;(itemsData || []).forEach((item: NoteItem) => {
      const list = itemsByNote.get(item.note_id) || []
      list.push(item)
      itemsByNote.set(item.note_id, list)
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merged = notesData.map((n: any) => ({ ...n, note_items: itemsByNote.get(n.id) || [] }))
    setNotes(merged)
    setLoading(false)
  }

  async function createNote() {
    const { data, error } = await supabase
      .from('notes')
      .insert({ status: 'idee' })
      .select('*')
      .single()
    if (error) {
      alert('Fehler: ' + error.message + '\n\nHast du das SQL für die notes-Tabelle in Supabase ausgeführt?')
      return
    }
    if (data) {
      const noteWithItems = { ...data, note_items: [] }
      setNotes(prev => [noteWithItems, ...prev])
      setOpenNoteId(data.id)
    }
  }

  async function deleteNote(id: string) {
    await supabase.from('notes').delete().eq('id', id)
    setNotes(prev => prev.filter(n => n.id !== id))
    if (openNoteId === id) setOpenNoteId(null)
  }

  const openNote = notes.find(n => n.id === openNoteId)

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold" style={{ color: '#1e293b' }}>Notizen</h1>
        <button
          onClick={createNote}
          className="text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5"
          style={{ background: '#475569' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Neue Notiz
        </button>
      </div>

      {/* Note List */}
      {!openNote && (
        <>
          {loading && <p className="text-sm text-center py-10" style={{ color: '#94a3b8' }}>Laden…</p>}
          {!loading && notes.length === 0 && (
            <div className="text-center py-16">
              <svg className="w-12 h-12 mx-auto mb-3" style={{ color: '#cbd5e1' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <p className="text-sm" style={{ color: '#94a3b8' }}>Noch keine Notizen vorhanden.</p>
              <p className="text-xs mt-1" style={{ color: '#cbd5e1' }}>Erstelle eine Notiz für deine Menü-Ideen.</p>
            </div>
          )}
          <div className="grid gap-3">
            {notes.map(note => (
              <NoteCard
                key={note.id}
                note={note}
                onClick={() => setOpenNoteId(note.id)}
                onDelete={() => deleteNote(note.id)}
              />
            ))}
          </div>
        </>
      )}

      {/* Note Detail */}
      {openNote && (
        <NoteDetail
          note={openNote}
          onBack={() => { setOpenNoteId(null); loadNotes() }}
          onDelete={() => deleteNote(openNote.id)}
          onUpdated={loadNotes}
        />
      )}
    </div>
  )
}

/* ── Note Card (list view) ─────────────────────────────── */

function NoteCard({ note, onClick, onDelete }: { note: Note; onClick: () => void; onDelete: () => void }) {
  const statusStyle = STATUS_COLORS[note.status]
  const resolvedCount = note.note_items.filter(i => i.is_resolved).length
  const totalItems = note.note_items.length

  return (
    <div
      onClick={onClick}
      className="rounded-2xl p-4 cursor-pointer transition-all hover:shadow-md"
      style={{ background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold truncate" style={{ color: '#1e293b' }}>
            {note.title || 'Unbenannte Notiz'}
          </h3>
          {note.freetext && (
            <p className="text-xs mt-0.5 truncate" style={{ color: '#94a3b8' }}>
              {note.freetext.slice(0, 80)}{note.freetext.length > 80 ? '…' : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 ml-2 shrink-0">
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: statusStyle.bg, color: statusStyle.text, border: `1px solid ${statusStyle.border}` }}
          >
            {STATUS_LABELS[note.status]}
          </span>
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="text-base leading-none transition-colors"
            style={{ color: '#94a3b8' }}
            onMouseEnter={e => ((e.target as HTMLElement).style.color = '#f87171')}
            onMouseLeave={e => ((e.target as HTMLElement).style.color = '#94a3b8')}
          >
            ×
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {note.meal_type && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: MEAL_TYPE_COLORS[note.meal_type] + '18', color: MEAL_TYPE_COLORS[note.meal_type] }}>
            {MEAL_TYPES[note.meal_type]}
          </span>
        )}
        {totalItems > 0 && (
          <span className="text-[10px]" style={{ color: '#94a3b8' }}>
            {resolvedCount}/{totalItems} Zutaten in DB
          </span>
        )}
        <span className="text-[10px] ml-auto" style={{ color: '#cbd5e1' }}>
          {new Date(note.updated_at).toLocaleDateString('de-CH')}
        </span>
      </div>
    </div>
  )
}

/* ── Note Detail View ──────────────────────────────────── */

function NoteDetail({ note, onBack, onDelete, onUpdated }: {
  note: Note; onBack: () => void; onDelete: () => void; onUpdated: () => void
}) {
  const [title, setTitle] = useState(note.title)
  const [freetext, setFreetext] = useState(note.freetext)
  const [mealType, setMealType] = useState(note.meal_type || '')
  const [status, setStatus] = useState(note.status)
  const [items, setItems] = useState<NoteItem[]>(
    [...(note.note_items || [])].sort((a, b) => a.sort_order - b.sort_order)
  )
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Search state
  const [showAddItem, setShowAddItem] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Food[]>([])
  const [selectedFood, setSelectedFood] = useState<Food | null>(null)
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState('g')
  const [customName, setCustomName] = useState('')
  const [addMode, setAddMode] = useState<'search' | 'custom'>('search')
  const searchRef = useRef<HTMLDivElement>(null)

  // Quick action state
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [targetDate, setTargetDate] = useState(new Date().toISOString().split('T')[0])
  const [actionLoading, setActionLoading] = useState(false)
  const [actionMsg, setActionMsg] = useState('')

  // Sync title changes back when note changes
  useEffect(() => {
    setTitle(note.title)
    setFreetext(note.freetext)
    setMealType(note.meal_type || '')
    setStatus(note.status)
    setItems([...(note.note_items || [])].sort((a, b) => a.sort_order - b.sort_order))
  }, [note.id, note.title, note.freetext, note.meal_type, note.status, note.note_items])

  // Food search
  useEffect(() => {
    if (searchQuery.length < 1) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('foods').select('*').ilike('name', `%${searchQuery}%`).order('name').limit(8)
      setSearchResults(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [searchQuery])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchResults([])
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /* ── Compute status automatically ──────────────────── */
  function computeStatus(currentItems: NoteItem[]): 'idee' | 'zutaten_erfasst' | 'bereit' {
    if (currentItems.length === 0) return 'idee'
    const allResolved = currentItems.every(i => i.is_resolved)
    if (allResolved) return 'bereit'
    const someResolved = currentItems.some(i => i.is_resolved)
    if (someResolved || currentItems.length > 0) return 'zutaten_erfasst'
    return 'idee'
  }

  /* ── Save note ─────────────────────────────────────── */
  async function saveNote() {
    setSaving(true)
    const newStatus = computeStatus(items)
    await supabase.from('notes').update({
      title: title.trim(),
      freetext,
      meal_type: mealType || null,
      status: newStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', note.id)
    setStatus(newStatus)
    setDirty(false)
    setSaving(false)
    onUpdated()
  }

  /* ── Add item ──────────────────────────────────────── */
  async function addItem() {
    let foodId: string | null = null
    let foodName = ''
    let isResolved = false
    let itemUnit = unit

    if (addMode === 'search' && selectedFood) {
      foodId = selectedFood.id
      foodName = selectedFood.name
      isResolved = true
      itemUnit = unit
    } else if (addMode === 'custom' && customName.trim()) {
      foodName = customName.trim()
      isResolved = false
    } else {
      return
    }

    const { data } = await supabase.from('note_items').insert({
      note_id: note.id,
      food_id: foodId,
      food_name: foodName,
      amount: amount ? parseFloat(amount) : null,
      unit: itemUnit,
      is_resolved: isResolved,
      sort_order: items.length,
    }).select('*').single()

    if (data) {
      const newItems = [...items, data]
      setItems(newItems)
      const newStatus = computeStatus(newItems)
      setStatus(newStatus)
      await supabase.from('notes').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', note.id)
    }

    setSelectedFood(null)
    setSearchQuery('')
    setCustomName('')
    setAmount('')
    setUnit('g')
    setShowAddItem(false)
    onUpdated()
  }

  /* ── Remove item ───────────────────────────────────── */
  async function removeItem(itemId: string) {
    await supabase.from('note_items').delete().eq('id', itemId)
    const newItems = items.filter(i => i.id !== itemId)
    setItems(newItems)
    const newStatus = computeStatus(newItems)
    setStatus(newStatus)
    await supabase.from('notes').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', note.id)
    onUpdated()
  }

  /* ── Resolve item (link to DB) ─────────────────────── */
  async function resolveItem(itemId: string, food: Food) {
    await supabase.from('note_items').update({ food_id: food.id, food_name: food.name, is_resolved: true }).eq('id', itemId)
    const newItems = items.map(i => i.id === itemId ? { ...i, food_id: food.id, food_name: food.name, is_resolved: true } : i)
    setItems(newItems)
    const newStatus = computeStatus(newItems)
    setStatus(newStatus)
    await supabase.from('notes').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', note.id)
    onUpdated()
  }

  /* ── Quick Actions ─────────────────────────────────── */

  // Save as meal template
  async function saveAsTemplate() {
    if (!title.trim() || !mealType || items.length === 0) {
      setActionMsg('Titel, Mahlzeittyp und mindestens 1 Zutat nötig.')
      setTimeout(() => setActionMsg(''), 3000)
      return
    }
    const unresolvedItems = items.filter(i => !i.is_resolved)
    if (unresolvedItems.length > 0) {
      setActionMsg('Alle Zutaten müssen in der DB verknüpft sein.')
      setTimeout(() => setActionMsg(''), 3000)
      return
    }

    setActionLoading(true)
    // Create meal template
    const { data: tpl } = await supabase.from('meal_templates').insert({
      name: title.trim(),
      meal_type: mealType,
    }).select('id').single()

    if (tpl) {
      // Insert template items
      const templateItems = items.filter(i => i.food_id).map(i => ({
        template_id: tpl.id,
        food_id: i.food_id!,
        amount: i.amount || 100,
        unit: i.unit,
      }))
      if (templateItems.length > 0) {
        await supabase.from('meal_template_items').insert(templateItems)
      }
      setActionMsg('✓ Als Vorlage gespeichert!')
    } else {
      setActionMsg('Fehler beim Speichern.')
    }
    setActionLoading(false)
    setTimeout(() => setActionMsg(''), 3000)
  }

  // Assign to date (copy to meal plan)
  async function assignToDate() {
    if (!mealType || items.length === 0) {
      setActionMsg('Mahlzeittyp und mindestens 1 Zutat nötig.')
      setTimeout(() => setActionMsg(''), 3000)
      return
    }
    const unresolvedItems = items.filter(i => !i.is_resolved)
    if (unresolvedItems.length > 0) {
      setActionMsg('Alle Zutaten müssen in der DB verknüpft sein.')
      setTimeout(() => setActionMsg(''), 3000)
      return
    }

    setActionLoading(true)

    // 1. Get or create meal_plan for the date
    let { data: plan } = await supabase.from('meal_plans').select('id').eq('date', targetDate).single()
    if (!plan) {
      const { data: newPlan } = await supabase.from('meal_plans').insert({ date: targetDate }).select('id').single()
      plan = newPlan
    }
    if (!plan) { setActionMsg('Fehler beim Erstellen des Plans.'); setActionLoading(false); return }

    // 2. Fetch food details to calculate nutrition
    const foodIds = items.filter(i => i.food_id).map(i => i.food_id!)
    const { data: foods } = await supabase.from('foods').select('*').in('id', foodIds)
    const foodMap = new Map((foods || []).map(f => [f.id, f]))

    // 3. Build meal items with nutrition
    const mealItems = items.filter(i => i.food_id).map(i => {
      const food = foodMap.get(i.food_id!)
      const amt = i.amount || 100
      const nutr = food ? calcNutrition(food, amt, i.unit) : { kcal: 0, protein: 0, cost: 0 }
      return {
        food_id: i.food_id,
        food_name: i.food_name,
        amount: amt,
        unit: i.unit,
        kcal: nutr.kcal,
        protein: nutr.protein,
        cost: nutr.cost,
      }
    })

    const totals = sumItems(mealItems)

    // 4. Create meal
    const { data: meal } = await supabase.from('meals').insert({
      plan_id: plan.id,
      meal_type: mealType,
      name: title.trim() || 'Notiz-Mahlzeit',
      kcal_total: totals.kcal,
      protein_total: totals.protein,
      cost_total: totals.cost,
    }).select('id').single()

    if (meal) {
      await supabase.from('meal_items').insert(mealItems.map(mi => ({ ...mi, meal_id: meal.id })))

      // 5. Recalculate plan totals
      const { data: allMeals } = await supabase.from('meals').select('kcal_total, protein_total, cost_total').eq('plan_id', plan.id)
      if (allMeals) {
        const planTotals = allMeals.reduce((acc, m) => ({
          kcal: acc.kcal + Number(m.kcal_total),
          protein: acc.protein + Number(m.protein_total),
          cost: acc.cost + Number(m.cost_total),
        }), { kcal: 0, protein: 0, cost: 0 })
        await supabase.from('meal_plans').update({
          kcal_total: planTotals.kcal,
          protein_total: planTotals.protein,
          cost_total: planTotals.cost,
        }).eq('id', plan.id)
      }

      setActionMsg(`✓ Zum ${new Date(targetDate + 'T12:00:00').toLocaleDateString('de-CH')} hinzugefügt!`)
    }

    setShowDatePicker(false)
    setActionLoading(false)
    setTimeout(() => setActionMsg(''), 3000)
  }

  // Add items to shopping list
  async function addToShoppingList() {
    if (items.length === 0) {
      setActionMsg('Keine Zutaten vorhanden.')
      setTimeout(() => setActionMsg(''), 3000)
      return
    }
    setActionLoading(true)
    const shopItems = items.map(i => ({
      item: i.food_name,
      quantity: i.amount ? formatDisplayAmount(i.amount, i.unit) : null,
    }))
    await supabase.from('shopping_list').insert(shopItems)
    setActionMsg('✓ Zur Einkaufsliste hinzugefügt!')
    setActionLoading(false)
    setTimeout(() => setActionMsg(''), 3000)
  }

  function formatDisplayAmount(amount: number, unit: string): string {
    if (unit === 'stk') return `${amount} Stk.`
    if (unit === 'ml' || unit === 'dl' || unit === 'l') {
      const ml = unit === 'dl' ? amount * 100 : unit === 'l' ? amount * 1000 : amount
      if (ml >= 1000) return `${(ml / 1000).toFixed(1)} l`
      if (ml >= 100) return `${(ml / 100).toFixed(1)} dl`
      return `${Math.round(ml)} ml`
    }
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)} kg`
    return `${Math.round(amount)} g`
  }

  function selectFood(food: Food) {
    setSelectedFood(food)
    setSearchQuery(food.name)
    setSearchResults([])
    setUnit(food.unit === 'ml' ? 'ml' : food.unit === 'stk' ? 'stk' : 'g')
    setAmount('')
  }

  const statusStyle = STATUS_COLORS[status]

  const inputStyle: React.CSSProperties = {
    background: 'white',
    border: '1px solid #e2e8f0',
    color: '#1e293b',
    borderRadius: '0.75rem',
    padding: '0.625rem 1rem',
    fontSize: '0.875rem',
    outline: 'none',
    width: '100%',
  }

  return (
    <div>
      {/* Back + actions header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => { if (dirty) saveNote().then(onBack); else onBack() }}
          className="flex items-center gap-1 text-sm font-medium" style={{ color: '#475569' }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Zurück
        </button>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: statusStyle.bg, color: statusStyle.text, border: `1px solid ${statusStyle.border}` }}>
          {STATUS_LABELS[status]}
        </span>
        <div className="flex-1" />
        <button onClick={onDelete}
          className="text-xs transition-colors" style={{ color: '#94a3b8' }}
          onMouseEnter={e => ((e.target as HTMLElement).style.color = '#f87171')}
          onMouseLeave={e => ((e.target as HTMLElement).style.color = '#94a3b8')}>
          Löschen
        </button>
      </div>

      {/* Title */}
      <input
        value={title}
        onChange={e => { setTitle(e.target.value); setDirty(true) }}
        placeholder="Titel (z.B. Pasta Bolognese)…"
        className="w-full text-base font-semibold mb-3"
        style={{ ...inputStyle, fontSize: '1rem', fontWeight: 600 }}
      />

      {/* Meal Type Selector */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {Object.entries(MEAL_TYPES).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setMealType(mealType === key ? '' : key); setDirty(true) }}
            className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
            style={{
              background: mealType === key ? MEAL_TYPE_COLORS[key] + '18' : '#f8fafc',
              color: mealType === key ? MEAL_TYPE_COLORS[key] : '#94a3b8',
              border: `1px solid ${mealType === key ? MEAL_TYPE_COLORS[key] + '40' : '#e2e8f0'}`,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Freetext */}
      <textarea
        value={freetext}
        onChange={e => { setFreetext(e.target.value); setDirty(true) }}
        placeholder="Freitext-Notizen (Rezeptidee, Kommentare, Link…)"
        rows={3}
        style={{ ...inputStyle, resize: 'vertical', minHeight: '4rem' }}
        className="mb-4"
      />

      {/* Save button for text changes */}
      {dirty && (
        <button
          onClick={saveNote}
          disabled={saving}
          className="w-full text-white py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity mb-4 disabled:opacity-50"
          style={{ background: '#475569' }}
        >
          {saving ? 'Speichern…' : 'Änderungen speichern'}
        </button>
      )}

      {/* ── Zutaten-Liste ─────────────────────────────── */}
      <div className="rounded-2xl p-4 mb-4"
        style={{ background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: '#1e293b' }}>Zutaten</h2>
          <button
            onClick={() => setShowAddItem(!showAddItem)}
            className="text-xs font-medium flex items-center gap-1 transition-colors"
            style={{ color: '#475569' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Zutat hinzufügen
          </button>
        </div>

        {/* Add item form */}
        {showAddItem && (
          <div className="rounded-xl p-3 mb-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            {/* Mode toggle */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setAddMode('search')}
                className="text-xs px-3 py-1 rounded-full font-medium"
                style={{
                  background: addMode === 'search' ? '#475569' : 'white',
                  color: addMode === 'search' ? 'white' : '#64748b',
                  border: '1px solid #e2e8f0',
                }}
              >
                Aus Datenbank
              </button>
              <button
                onClick={() => setAddMode('custom')}
                className="text-xs px-3 py-1 rounded-full font-medium"
                style={{
                  background: addMode === 'custom' ? '#475569' : 'white',
                  color: addMode === 'custom' ? 'white' : '#64748b',
                  border: '1px solid #e2e8f0',
                }}
              >
                Freitext
              </button>
            </div>

            {addMode === 'search' ? (
              <div ref={searchRef} className="relative mb-2">
                <input
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setSelectedFood(null) }}
                  placeholder="Lebensmittel suchen…"
                  style={{ ...inputStyle, fontSize: '0.8125rem' }}
                />
                {searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden z-20"
                    style={{ background: 'white', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                    {searchResults.map(food => (
                      <button key={food.id} onClick={() => selectFood(food)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex justify-between"
                        style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <span style={{ color: '#1e293b' }}>{food.name}</span>
                        <span className="text-xs" style={{ color: '#94a3b8' }}>
                          {food.calories_per_100} kcal | {food.protein_per_100}g P
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <input
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder="Zutat-Name (z.B. Basilikum frisch)…"
                style={{ ...inputStyle, fontSize: '0.8125rem' }}
                className="mb-2"
              />
            )}

            <div className="flex gap-2">
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Menge"
                style={{ ...inputStyle, fontSize: '0.8125rem', flex: 1 }}
              />
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                style={{ ...inputStyle, fontSize: '0.8125rem', width: '5rem' }}
              >
                <option value="g">g</option>
                <option value="ml">ml</option>
                <option value="dl">dl</option>
                <option value="l">l</option>
                <option value="stk">Stk.</option>
              </select>
              <button
                onClick={addItem}
                className="text-white px-4 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shrink-0"
                style={{ background: '#475569' }}
              >
                +
              </button>
            </div>
          </div>
        )}

        {/* Items list */}
        {items.length === 0 && !showAddItem && (
          <p className="text-xs text-center py-4" style={{ color: '#94a3b8' }}>Noch keine Zutaten hinzugefügt.</p>
        )}
        {items.map(item => (
          <NoteItemRow
            key={item.id}
            item={item}
            onRemove={() => removeItem(item.id)}
            onResolve={(food) => resolveItem(item.id, food)}
          />
        ))}
      </div>

      {/* ── Schnell-Aktionen ──────────────────────────── */}
      <div className="rounded-2xl p-4 mb-4"
        style={{ background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <h2 className="text-sm font-semibold mb-3" style={{ color: '#1e293b' }}>Aktionen</h2>

        {actionMsg && (
          <p className="text-xs font-medium mb-3 px-3 py-2 rounded-lg"
            style={{
              background: actionMsg.startsWith('✓') ? '#d1fae5' : '#fef3c7',
              color: actionMsg.startsWith('✓') ? '#065f46' : '#92400e',
            }}>
            {actionMsg}
          </p>
        )}

        <div className="grid gap-2">
          {/* Save as template */}
          <button
            onClick={saveAsTemplate}
            disabled={actionLoading || status !== 'bereit'}
            className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
            style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#1e293b' }}
          >
            <svg className="w-4 h-4 shrink-0" style={{ color: '#7c3aed' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Als Vorlage speichern
            {status !== 'bereit' && <span className="text-[10px] ml-auto" style={{ color: '#94a3b8' }}>Status „Bereit" nötig</span>}
          </button>

          {/* Assign to date */}
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            disabled={actionLoading || status !== 'bereit'}
            className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
            style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#1e293b' }}
          >
            <svg className="w-4 h-4 shrink-0" style={{ color: '#059669' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            An Datum zuweisen
            {status !== 'bereit' && <span className="text-[10px] ml-auto" style={{ color: '#94a3b8' }}>Status „Bereit" nötig</span>}
          </button>

          {showDatePicker && (
            <div className="flex gap-2 px-3 py-2">
              <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)}
                style={{ ...inputStyle, flex: 1, fontSize: '0.8125rem' }} />
              <button onClick={assignToDate} disabled={actionLoading}
                className="text-white px-4 py-1.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ background: '#059669' }}>
                {actionLoading ? '…' : 'Zuweisen'}
              </button>
            </div>
          )}

          {/* Add to shopping list */}
          <button
            onClick={addToShoppingList}
            disabled={actionLoading || items.length === 0}
            className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
            style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#1e293b' }}
          >
            <svg className="w-4 h-4 shrink-0" style={{ color: '#d97706' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            Zutaten zur Einkaufsliste
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Single Note-Item Row ──────────────────────────────── */

function NoteItemRow({ item, onRemove, onResolve }: {
  item: NoteItem; onRemove: () => void; onResolve: (food: Food) => void
}) {
  const [showResolve, setShowResolve] = useState(false)
  const [resolveQuery, setResolveQuery] = useState('')
  const [resolveResults, setResolveResults] = useState<Food[]>([])
  const resolveRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (resolveQuery.length < 1) { setResolveResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('foods').select('*').ilike('name', `%${resolveQuery}%`).order('name').limit(6)
      setResolveResults(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [resolveQuery])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (resolveRef.current && !resolveRef.current.contains(e.target as Node)) {
        setShowResolve(false)
        setResolveResults([])
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="flex items-center gap-2 px-1 py-2" style={{ borderTop: '1px solid #f1f5f9' }}>
      {/* Resolved indicator */}
      <span className="w-2 h-2 rounded-full shrink-0"
        style={{ background: item.is_resolved ? '#34d399' : '#fbbf24' }} />

      <span className="flex-1 text-sm" style={{ color: item.is_resolved ? '#1e293b' : '#64748b' }}>
        {item.food_name}
      </span>

      {item.amount != null && (
        <span className="text-xs font-medium shrink-0" style={{ color: '#94a3b8' }}>
          {item.amount} {item.unit}
        </span>
      )}

      {/* Resolve button for unresolved items */}
      {!item.is_resolved && (
        <div ref={resolveRef} className="relative">
          <button
            onClick={() => { setShowResolve(!showResolve); setResolveQuery(item.food_name) }}
            className="text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors"
            style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24' }}
          >
            Verknüpfen
          </button>
          {showResolve && (
            <div className="absolute right-0 top-full mt-1 w-56 z-20 rounded-xl overflow-hidden"
              style={{ background: 'white', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              <input
                value={resolveQuery}
                onChange={e => setResolveQuery(e.target.value)}
                placeholder="In DB suchen…"
                className="w-full px-3 py-2 text-xs outline-none"
                style={{ borderBottom: '1px solid #f1f5f9', color: '#1e293b' }}
                autoFocus
              />
              {resolveResults.map(food => (
                <button key={food.id}
                  onClick={() => { onResolve(food); setShowResolve(false) }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50"
                  style={{ borderBottom: '1px solid #f1f5f9', color: '#1e293b' }}>
                  {food.name}
                  <span className="ml-2" style={{ color: '#94a3b8' }}>{food.calories_per_100} kcal</span>
                </button>
              ))}
              {resolveResults.length === 0 && resolveQuery.length > 0 && (
                <p className="px-3 py-2 text-xs" style={{ color: '#94a3b8' }}>Nicht gefunden – zuerst in Datenbank anlegen.</p>
              )}
            </div>
          )}
        </div>
      )}

      <button onClick={onRemove}
        className="text-base leading-none shrink-0 transition-colors" style={{ color: '#94a3b8' }}
        onMouseEnter={e => ((e.target as HTMLElement).style.color = '#f87171')}
        onMouseLeave={e => ((e.target as HTMLElement).style.color = '#94a3b8')}>
        ×
      </button>
    </div>
  )
}
