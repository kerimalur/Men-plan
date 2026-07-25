import { MONTH_NAMES, DAY_SHORT, DAY_LONG, toDateStr } from './dates'

/**
 * Farbpalette des Export-Dokuments.
 *
 * Der Export erzeugt ein EIGENSTAENDIGES HTML-Dokument, das in einem neuen
 * Fenster geoeffnet und gedruckt wird. Es hat keinen Zugriff auf globals.css,
 * deshalb koennen hier keine CSS-Variablen verwendet werden.
 *
 * Die Werte sind bewusst 1:1 aus den Design-Tokens uebernommen. Aendern sich
 * die Tokens in app/globals.css, muss diese Tabelle nachgezogen werden --
 * sie ist die einzige erlaubte Ausnahme von "kein Hex ausserhalb globals.css".
 */
const EXPORT_PALETTE = {
  bg:            '#F2EBE0',
  surface:       '#FDFAF5',
  surfaceAlt:    '#F7F1E7',
  border:        '#E8DDCE',
  borderSoft:    '#F0E8DC',
  text:          '#3B2E26',
  textSecondary: '#6B5A4C',
  textMuted:     '#9A8878',
  textFaint:     '#C3B5A5',
  accent:        '#C4693C',
  accentText:    '#FDFAF5',
  sage:          '#8A9A7B',
  sageSoft:      '#E4EADD',
  success:       '#7C9070',
  warning:       '#C9913F',
  warningSoft:   '#F5E8D2',
  danger:        '#B5503C',
} as const

const C = EXPORT_PALETTE

interface Plan   { date: string; kcal_total: number; protein_total: number; cost_total: number }
interface Marker { date: string; training: boolean; eingeladen: boolean }
interface Goals  { kcal: number; protein: number; kosten: number }

export function buildExportHtml(
  title: string,
  rows: { label: string; dateStr: string; plan?: Plan; marker?: Marker }[],
  goals: Goals
) {
  const filled = rows.filter(r => r.plan && r.plan.kcal_total > 0)
  const totalKcal = filled.reduce((s, r) => s + (r.plan?.kcal_total ?? 0), 0)
  const totalProtein = filled.reduce((s, r) => s + (r.plan?.protein_total ?? 0), 0)
  const totalCost = filled.reduce((s, r) => s + (r.plan?.cost_total ?? 0), 0)
  const avgKcal = filled.length ? totalKcal / filled.length : 0

  function kcalExportColor(v: number) {
    if (!v) return C.textMuted
    return v > goals.kcal ? C.danger : C.success
  }

  const rowsHtml = rows.map(({ label, plan, marker }) => {
    const v = plan?.kcal_total ?? 0
    const pct = v ? Math.min((v / goals.kcal) * 100, 100) : 0
    const barW = Math.round(pct)
    const color = kcalExportColor(v)
    const badges = [
      marker?.training   ? '<span style="background:${C.sageSoft};color:${C.sage};padding:2px 8px;border-radius:99px;font-size:11px;margin-right:4px">🏋️ Training</span>' : '',
      marker?.eingeladen ? '<span style="background:${C.warningSoft};color:${C.warning};padding:2px 8px;border-radius:99px;font-size:11px">🍽 Eingeladen</span>' : '',
    ].join('')
    return `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid ${C.borderSoft};vertical-align:middle">
        <div style="font-weight:600;font-size:13px;color:${C.text}">${label}</div>
        ${badges ? `<div style="margin-top:4px">${badges}</div>` : ''}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid ${C.borderSoft};text-align:right;vertical-align:middle">
        ${v ? `<span style="font-weight:700;color:${color};font-size:14px">${Math.round(v)}</span><span style="color:${C.textMuted};font-size:12px"> kcal</span>` : '<span style="color:${C.textFaint};font-size:12px">–</span>'}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid ${C.borderSoft};text-align:right;vertical-align:middle;color:${C.textSecondary};font-size:13px">
        ${plan ? `${Math.round((plan.protein_total ?? 0) * 10) / 10}g` : '–'}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid ${C.borderSoft};text-align:right;vertical-align:middle;color:${C.textSecondary};font-size:13px">
        ${plan ? `CHF ${Number(plan.cost_total).toFixed(2)}` : '–'}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid ${C.borderSoft};vertical-align:middle;width:100px">
        ${v ? `
        <div style="background:${C.borderSoft};border-radius:99px;height:6px">
          <div style="background:${color};border-radius:99px;height:6px;width:${barW}%"></div>
        </div>
        <div style="font-size:10px;color:${C.textMuted};margin-top:3px;text-align:right">${Math.round(pct)}%</div>
        ` : ''}
      </td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0 }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: ${C.bg}; color: ${C.text}; padding: 2rem }
  .card { background: ${C.surface}; border-radius: 16px; box-shadow: 0 1px 6px rgba(0,0,0,0.08); overflow: hidden }
  .header { background: linear-gradient(135deg, ${C.textSecondary} 0%, ${C.text} 100%); padding: 24px 28px; color: ${C.accentText} }
  .header h1 { font-size: 18px; font-weight: 800; margin-bottom: 4px }
  .header p { font-size: 13px; opacity: 0.75 }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; border-bottom: 1px solid ${C.borderSoft} }
  .stat { padding: 16px 20px; text-align: center; border-right: 1px solid ${C.borderSoft} }
  .stat:last-child { border-right: none }
  .stat-value { font-size: 22px; font-weight: 800; color: ${C.text} }
  .stat-label { font-size: 11px; color: ${C.textMuted}; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.05em }
  table { width: 100%; border-collapse: collapse }
  thead th { background: ${C.surfaceAlt}; padding: 10px 16px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: ${C.textMuted}; text-align: left; border-bottom: 2px solid ${C.border} }
  thead th:not(:first-child) { text-align: right }
  @media print { body { padding: 0.5rem; background: ${C.surface} } .card { box-shadow: none } }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <h1>${title}</h1>
    <p>${filled.length} von ${rows.length} Tagen mit Daten · Ziel: ${goals.kcal} kcal / ${goals.protein}g Protein</p>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-value">${Math.round(avgKcal)}<span style="font-size:13px;font-weight:400;color:${C.textMuted}"> kcal</span></div><div class="stat-label">Ø Kalorien/Tag</div></div>
    <div class="stat"><div class="stat-value">${Math.round(totalProtein * 10) / 10}<span style="font-size:13px;font-weight:400;color:${C.textMuted}"> g</span></div><div class="stat-label">Protein gesamt</div></div>
    <div class="stat"><div class="stat-value">CHF ${totalCost.toFixed(2)}</div><div class="stat-label">Kosten gesamt</div></div>
    <div class="stat"><div class="stat-value">${filled.length}/${rows.length}</div><div class="stat-label">Tage geplant</div></div>
  </div>
  <table>
    <thead><tr>
      <th>Tag</th><th style="text-align:right">Kalorien</th><th style="text-align:right">Protein</th><th style="text-align:right">Kosten</th><th style="text-align:right">Fortschritt</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</div>
<script>window.print()</script>
</body></html>`
}

export function exportWeek(days: Date[], plans: Plan[], markers: Marker[], goals: Goals) {
  const title = `Wochenübersicht · ${days[0].toLocaleDateString('de-CH', { day: 'numeric', month: 'long' })} – ${days[6].toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' })}`
  const rows = days.map(d => {
    const ds = toDateStr(d)
    return {
      label: `${DAY_LONG[(d.getDay() + 6) % 7]}, ${d.getDate()}. ${MONTH_NAMES[d.getMonth()]}`,
      dateStr: ds,
      plan: plans.find(p => p.date === ds),
      marker: markers.find(m => m.date === ds),
    }
  })
  const html = buildExportHtml(title, rows, goals)
  const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close() }
}

export function exportMonth(year: number, month: number, plans: Plan[], markers: Marker[], goals: Goals) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  const days = Array.from({ length: lastDay }, (_, i) => new Date(year, month, i + 1))
  const monthName = MONTH_NAMES[month]
  const title = `Monatsübersicht · ${monthName} ${year}`
  const rows = days.map(d => {
    const ds = toDateStr(d)
    return {
      label: `${DAY_SHORT[(d.getDay() + 6) % 7]} ${d.getDate()}. ${monthName}`,
      dateStr: ds,
      plan: plans.find(p => p.date === ds),
      marker: markers.find(m => m.date === ds),
    }
  })
  const html = buildExportHtml(title, rows, goals)
  const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close() }
}
