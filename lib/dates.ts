export const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

/** Mo–So */
export const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

/** Montag–Sonntag (ISO order, index 0 = Montag) */
export const DAY_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

/** Sonntag–Samstag (JS Date.getDay() order) */
export const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

export function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

export function getMondayOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(d)
  m.setDate(d.getDate() + diff)
  return m
}

export function getWeekDays(d: Date): Date[] {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return Array.from({ length: 7 }, (_, i) => {
    const wd = new Date(d)
    wd.setDate(d.getDate() + diff + i)
    return wd
  })
}
