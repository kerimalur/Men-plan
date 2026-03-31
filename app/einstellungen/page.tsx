'use client'

import { useState, useEffect } from 'react'
import { loadSettings, saveSetting } from '@/lib/settings'

interface Field {
  key: string
  label: string
  description: string
  unit: string
  min: number
  step: number
}

const FIELDS: Field[] = [
  { key: 'kcal_ziel',    label: 'Kalorienziel',  description: 'Tägliches Kaloriendefizit oder -überschuss', unit: 'kcal', min: 500,  step: 50 },
  { key: 'protein_ziel', label: 'Proteinziel',   description: 'Tägliche Proteinmenge',                       unit: 'g',   min: 50,   step: 5 },
  { key: 'kosten_ziel',  label: 'Kostenbudget',  description: 'Tägliches Budget für Lebensmittel',           unit: 'CHF', min: 5,    step: 1 },
]

export default function EinstellungenPage() {
  const [values, setValues] = useState<Record<string, string>>({
    kcal_ziel: '2000', protein_ziel: '150', kosten_ziel: '20',
  })
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSettings().then(data => { setValues(data); setLoading(false) })
  }, [])

  async function handleSave() {
    await Promise.all(Object.entries(values).map(([k, v]) => saveSetting(k, v)))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) return <div className="text-center py-12 text-sm" style={{ color: '#64748b' }}>Laden…</div>

  const inputStyle: React.CSSProperties = {
    width: '6rem',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'white',
    borderRadius: '0.5rem',
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    textAlign: 'right',
    outline: 'none',
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-7">
        <h1 className="text-lg font-semibold text-white">Einstellungen</h1>
        <p className="text-xs mt-1" style={{ color: '#64748b' }}>
          Ziele für Kalorien, Protein und Kosten — steuern die Farbanzeigen im Dashboard und Kalender.
        </p>
      </div>

      {/* Goal section */}
      <div
        className="rounded-2xl overflow-hidden mb-5"
        style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div
          className="px-5 py-3.5"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.04)' }}
        >
          <h2 className="text-sm font-semibold text-white">Tagesziele</h2>
        </div>
        <div>
          {FIELDS.map((f, idx) => (
            <div
              key={f.key}
              className="px-5 py-4 flex items-center gap-4"
              style={idx > 0 ? { borderTop: '1px solid rgba(255,255,255,0.06)' } : {}}
            >
              <div className="flex-1">
                <label className="block text-sm font-medium text-white">{f.label}</label>
                <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>{f.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  value={values[f.key] || ''}
                  onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                  min={f.min}
                  step={f.step}
                  style={inputStyle}
                />
                <span className="text-xs w-8" style={{ color: '#94a3b8' }}>{f.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Color legend */}
      <div
        className="rounded-2xl p-5 mb-5"
        style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <h2 className="text-sm font-semibold text-white mb-3">Farbskala</h2>
        <div className="space-y-2">
          {[
            { color: 'bg-green-500',  label: 'Grün',   desc: '≥ 100% des Ziels erreicht' },
            { color: 'bg-amber-500',  label: 'Orange', desc: '80–99% des Ziels erreicht' },
            { color: 'bg-red-500',    label: 'Rot',    desc: '< 80% des Ziels' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${item.color}`} />
              <span className="text-xs font-medium text-white w-12">{item.label}</span>
              <span className="text-xs" style={{ color: '#94a3b8' }}>{item.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all"
        style={saved ? { background: '#16a34a' } : { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
      >
        {saved ? 'Gespeichert ✓' : 'Speichern'}
      </button>
    </div>
  )
}
