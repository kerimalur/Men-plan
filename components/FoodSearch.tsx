'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface Food {
  id: string
  name: string
  calories_per_100: number
  protein_per_100: number
  cost_per_100: number
  unit: 'g' | 'ml' | 'stk'
}

interface FoodSearchProps {
  onSelect: (food: Food) => void
  placeholder?: string
  /** Show recently used foods first (based on meal_items) */
  showRecent?: boolean
}

export type { Food }

export default function FoodSearch({ onSelect, placeholder = 'Lebensmittel suchen…', showRecent = false }: FoodSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Food[]>([])
  const [recentFoods, setRecentFoods] = useState<Food[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Load recently used foods on mount
  useEffect(() => {
    if (!showRecent) return
    async function loadRecent() {
      const { data: recentItems } = await supabase
        .from('meal_items')
        .select('food_id')
        .not('food_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50)
      if (!recentItems?.length) return
      // Deduplicate, keep order
      const seen = new Set<string>()
      const uniqueIds: string[] = []
      for (const item of recentItems) {
        if (item.food_id && !seen.has(item.food_id)) {
          seen.add(item.food_id)
          uniqueIds.push(item.food_id)
          if (uniqueIds.length >= 8) break
        }
      }
      if (uniqueIds.length === 0) return
      const { data: foods } = await supabase.from('foods').select('*').in('id', uniqueIds)
      if (foods) {
        // Sort by the order they appeared in uniqueIds
        const ordered = uniqueIds.map(id => foods.find(f => f.id === id)).filter(Boolean) as Food[]
        setRecentFoods(ordered)
      }
    }
    loadRecent()
  }, [showRecent])

  // Debounced search
  useEffect(() => {
    if (query.length < 1) { setResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('foods')
        .select('*')
        .ilike('name', `%${query}%`)
        .order('name')
        .limit(8)
      if (data) {
        // If showRecent, prioritise recently used foods in results
        if (showRecent && recentFoods.length > 0) {
          const recentIds = new Set(recentFoods.map(f => f.id))
          const recent = data.filter(f => recentIds.has(f.id))
          const rest = data.filter(f => !recentIds.has(f.id))
          setResults([...recent, ...rest])
        } else {
          setResults(data)
        }
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query, showRecent, recentFoods])

  // Outside click handler
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleSelect(food: Food) {
    onSelect(food)
    setQuery(food.name)
    setResults([])
    setShowDropdown(false)
  }

  const showResults = showDropdown && (results.length > 0 || (query.length === 0 && recentFoods.length > 0))
  const displayItems = query.length > 0 ? results : recentFoods

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setShowDropdown(true) }}
        onFocus={() => setShowDropdown(true)}
        placeholder={placeholder}
        className="w-full"
        style={{
          background: 'white',
          border: '1px solid #e2e8f0',
          color: '#1e293b',
          borderRadius: '0.5rem',
          padding: '0.5rem 0.75rem',
          fontSize: '0.875rem',
          outline: 'none',
        }}
      />
      {showResults && displayItems.length > 0 && (
        <ul
          className="absolute z-10 top-full left-0 right-0 mt-1 rounded-lg shadow-xl max-h-44 overflow-y-auto"
          style={{ background: 'white', border: '1px solid #e2e8f0' }}
        >
          {query.length === 0 && recentFoods.length > 0 && (
            <li className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: '#94a3b8', background: '#f8fafc' }}>
              Zuletzt verwendet
            </li>
          )}
          {displayItems.map(food => (
            <li
              key={food.id}
              onMouseDown={() => handleSelect(food)}
              className="px-3 py-2 text-sm cursor-pointer transition-colors"
              style={{ color: '#1e293b' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#f1f5f9')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
            >
              <span className="font-medium">{food.name}</span>
              <span className="text-xs ml-2" style={{ color: '#64748b' }}>
                {food.calories_per_100} kcal · {food.protein_per_100}g P · CHF {Number(food.cost_per_100).toFixed(2)}
                {food.unit === 'stk' ? '/Stück' : `/100${food.unit}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
