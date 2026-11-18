import type { Adjustment, DayMap, DayStatus, Order, ScheduleSettings, Settings } from './types'
import { addDays, diffDays, eachDay, periodsOverlapping, weekday, type Range } from './dates'
import { roundDiv } from './money'

/** AW × стоимость AW; AW / (AW в часе). Только целые числа. */
export function autoEarningsKop(aw100: number, s: Pick<Settings, 'awRateKop'>): number {
  return roundDiv(aw100 * s.awRateKop, 100)
}
export function autoHours100(aw100: number, s: Pick<Settings, 'awPerHour100'>): number | null {
  if (!s.awPerHour100) return null
  return roundDiv(aw100 * 100, s.awPerHour100)
}

export function parsePattern(p: string): boolean[] {
  return [...p.toUpperCase()].filter((c) => 'РВPB'.includes(c) || c === 'W' || c === 'O' || c === '1' || c === '0')
    .map((c) => c === 'Р' || c === 'P' || c === 'W' || c === '1')
}

/** Рабочий ли день по повторяющемуся графику (без ручных правок). */
export function patternIsWork(date: string, sch: ScheduleSettings): boolean {
  switch (sch.type) {
    case 'manual': return false
    case '5/2': return weekday(date) < 5
    case 'custom': {
      const pat = parsePattern(sch.pattern)
      if (!pat.length) return false
      const n = diffDays(date, sch.startDate)
      return pat[((n % pat.length) + pat.length) % pat.length]
    }
    default: {
      const [a, b] = sch.type.split('/').map(Number)
      const n = diffDays(date, sch.startDate)
      return ((n % (a + b)) + (a + b)) % (a + b) < a
    }
  }
}

export function effectiveStatus(date: string, days: DayMap, s: Settings): DayStatus {
  return days[date] ?? (patternIsWork(date, s.schedule) ? 'work' : 'off')
}

const isPaid = (st: DayStatus, s: Settings) => st === 'work' || (st === 'vacation' && s.vacationPaid)

/** Плановое число рабочих дней в расчётном периоде. */
export function plannedDays(p: Range, days: DayMap, s: Settings): number {
  let n = 0
  for (const d of eachDay(p.from, p.to)) {
    const st = effectiveStatus(d, days, s)
    const planned = s.schedule.type === 'manual' ? st !== 'off' : patternIsWork(d, s.schedule)
    if (planned) n++
  }
  return n
}

export interface PeriodDays { planned: number; work: number; vacation: number; unpaid: number; off: number; paid: number }

export function countDays(r: Range, days: DayMap, s: Settings): PeriodDays {
  const out: PeriodDays = { planned: 0, work: 0, vacation: 0, unpaid: 0, off: 0, paid: 0 }
  for (const d of eachDay(r.from, r.to)) {
    const st = effectiveStatus(d, days, s)
    out[st]++
    if (isPaid(st, s)) out.paid++
  }
  out.planned = plannedDays(r, days, s)
  return out
}

/**
 * Оклад за диапазон: оклад периода × оплаченные дни / плановые дни периода.
 * Каждый день считается один раз, выходные и «за свой счёт» не оплачиваются.
 */
export function salaryForRange(r: Range, days: DayMap, s: Settings): number {
  let total = 0
  for (const p of periodsOverlapping(r, s.periodStartDay)) {
    const planned = plannedDays(p, days, s)
    if (!planned) continue
    const from = r.from > p.from ? r.from : p.from
    const to = r.to < p.to ? r.to : p.to
    let paid = 0
    for (const d of eachDay(from, to)) if (isPaid(effectiveStatus(d, days, s), s)) paid++
    total += roundDiv(s.monthlySalaryKop * paid, planned)
  }
  return total
}

export const confirmed = (orders: Order[]) => orders.filter((o) => o.status === 'confirmed')
export const orderHours100 = (o: Order, s: Settings) => o.hours100 ?? autoHours100(o.aw100, s) ?? 0

export interface Summary {
  orderCount: number
  aw100: number
  hours100: number
  normKop: number
  salaryKop: number
  adjustmentsKop: number
  totalKop: number
  days: PeriodDays
}

export function summarize(r: Range, orders: Order[], days: DayMap, s: Settings, adjustments: Adjustment[]): Summary {
  const os = confirmed(orders).filter((o) => o.date >= r.from && o.date <= r.to)
  const aw100 = os.reduce((a, o) => a + o.aw100, 0)
  const hours100 = os.reduce((a, o) => a + orderHours100(o, s), 0)
  const normKop = os.reduce((a, o) => a + o.earningsKop, 0)
  const salaryKop = salaryForRange(r, days, s)
  const adjustmentsKop = adjustments.filter((a) => a.date >= r.from && a.date <= r.to).reduce((a, x) => a + x.amountKop, 0)
  return {
    orderCount: os.length, aw100, hours100, normKop, salaryKop, adjustmentsKop,
    totalKop: normKop + salaryKop + adjustmentsKop, days: countDays(r, days, s),
  }
}

export { addDays }
