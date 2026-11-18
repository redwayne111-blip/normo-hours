// Даты — строки YYYY-MM-DD; вычисления через UTC, чтобы не зависеть от часового пояса.
const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
const toUTC = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const fromUTC = (t: number) => { const d = new Date(t); return ymd(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) }

export function todayStr(): string {
  const d = new Date()
  return ymd(d.getFullYear(), d.getMonth(), d.getDate())
}
export const addDays = (s: string, n: number) => fromUTC(toUTC(s) + n * 86400000)
export const diffDays = (a: string, b: string) => Math.round((toUTC(a) - toUTC(b)) / 86400000)
/** 0 = понедельник … 6 = воскресенье */
export const weekday = (s: string) => (new Date(toUTC(s)).getUTCDay() + 6) % 7
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
export const parts = (s: string) => { const [y, m, d] = s.split('-').map(Number); return { y, m: m - 1, d } }
export const startOfWeek = (s: string) => addDays(s, -weekday(s))

export function eachDay(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export function formatDate(s: string, fmt: 'dd.MM.yyyy' | 'yyyy-MM-dd' = 'dd.MM.yyyy'): string {
  if (fmt === 'yyyy-MM-dd') return s
  const { y, m, d } = parts(s)
  return `${pad(d)}.${pad(m + 1)}.${y}`
}
export function formatDayLong(s: string): string {
  const { m, d } = parts(s)
  return `${WEEKDAYS[weekday(s)]}, ${d} ${MONTHS_GEN[m]}`
}

export interface Range { from: string; to: string }

/** Расчётный период, начинающийся в startDay месяца (y, m). При startDay=1 — календарный месяц. */
export function settlementPeriod(y: number, m: number, startDay: number): Range {
  const clamp = (yy: number, mm: number) => Math.min(startDay, daysInMonth(yy, mm))
  const from = ymd(y, m, clamp(y, m))
  const ny = m === 11 ? y + 1 : y, nm = (m + 1) % 12
  const to = addDays(ymd(ny, nm, clamp(ny, nm)), -1)
  return { from, to }
}

/** Расчётный период, содержащий дату. */
export function periodOf(date: string, startDay: number): Range {
  const { y, m } = parts(date)
  const cur = settlementPeriod(y, m, startDay)
  if (date >= cur.from && date <= cur.to) return cur
  if (date < cur.from) { const py = m === 0 ? y - 1 : y, pm = (m + 11) % 12; return settlementPeriod(py, pm, startDay) }
  const ny = m === 11 ? y + 1 : y, nm = (m + 1) % 12
  return settlementPeriod(ny, nm, startDay)
}

export function periodsOverlapping(r: Range, startDay: number): Range[] {
  const out: Range[] = []
  let p = periodOf(r.from, startDay)
  while (p.from <= r.to) { out.push(p); p = periodOf(addDays(p.to, 1), startDay) }
  return out
}
