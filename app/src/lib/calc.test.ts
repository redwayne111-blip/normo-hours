import { describe, expect, it } from 'vitest'
import { autoEarningsKop, autoHours100, patternIsWork, salaryForRange, summarize } from './calc'
import { formatScaled, parseScaled, roundDiv, fmtMoney } from './money'
import { DEFAULT_SETTINGS, type DayMap, type Order, type Settings } from './types'
import { parseClaudeExport } from './legacy'
import { eachDay, settlementPeriod } from './dates'

const S: Settings = { ...DEFAULT_SETTINGS }
const nov = { from: '2026-11-01', to: '2026-11-30' }
const manualDays = (dates: number[], status: 'work' | 'vacation' | 'unpaid' = 'work'): DayMap =>
  Object.fromEntries(dates.map((d) => ['2026-11-' + String(d).padStart(2, '0'), status]))
const WORK15 = [2, 3, 6, 7, 8, 11, 12, 16, 17, 20, 21, 22, 25, 26, 30]

describe('AW и нормо-часы', () => {
  const byAw = { awRateKop: 5433, hourRateKop: 0, awPerHour100: 1200 }
  it('по стоимости AW: 136 AW × 54,33 ₽ = 7 388,88 ₽, 11,33 ч', () => {
    expect(autoEarningsKop(13600, byAw)).toBe(738888)
    expect(autoHours100(13600, byAw)).toBe(1133)
  })
  it('дробные AW считаются точно', () => {
    expect(autoEarningsKop(1050, byAw)).toBe(57047) // 10,5 × 54,33 = 570,465 → 570,47
  })
  it('по умолчанию 652 ₽/ч при 12 AW/ч: 105 AW = 5 705 ₽', () => {
    expect(autoEarningsKop(10500, S)).toBe(570500)
  })
  it('график по умолчанию — 15 рабочих дней в ноябре 2026', () => {
    const days = eachDay('2026-11-01', '2026-11-30').filter((d) => patternIsWork(d, S.schedule)).map((d) => Number(d.slice(8)))
    expect(days).toEqual(WORK15)
  })
  it('без коэффициента часы не считаются', () => {
    expect(autoHours100(13600, { awPerHour100: 0 })).toBeNull()
  })
})

describe('деньги без float', () => {
  it('парсинг и форматирование', () => {
    expect(parseScaled('54,33')).toBe(5433)
    expect(parseScaled('0.1')).toBe(10)
    expect(parseScaled('1,005')).toBe(101)
    expect(parseScaled('abc')).toBeNull()
    expect(formatScaled(3200000)).toBe('32\u00a0000')
    expect(fmtMoney(738888)).toBe('7\u00a0389\u00a0₽')
  })
  it('roundDiv округляет half away from zero', () => {
    expect(roundDiv(5, 2)).toBe(3)
    expect(roundDiv(-5, 2)).toBe(-3)
  })
})

describe('оклад', () => {
  it('15 из 15 дней = 32 000 ₽', () => {
    expect(salaryForRange(nov, manualDays(WORK15), S)).toBe(3200000)
  })
  it('оклад за один день = 2 133,33 ₽', () => {
    expect(salaryForRange({ from: '2026-11-02', to: '2026-11-02' }, manualDays(WORK15), S)).toBe(213333)
  })
  it('10 отработанных из 15 = 21 333,33 ₽ (остальные за свой счёт)', () => {
    const d = { ...manualDays(WORK15.slice(0, 10)), ...manualDays(WORK15.slice(10), 'unpaid') }
    expect(salaryForRange(nov, d, S)).toBe(2133333)
  })
  it('отпуск оплачивается по настройке', () => {
    const d = { ...manualDays(WORK15.slice(0, 10)), ...manualDays(WORK15.slice(10), 'vacation') }
    expect(salaryForRange(nov, d, S)).toBe(3200000)
    expect(salaryForRange(nov, d, { ...S, vacationPaid: false })).toBe(2133333)
  })
  it('выходные не оплачиваются, день не считается дважды', () => {
    expect(salaryForRange({ from: '2026-11-04', to: '2026-11-05' }, manualDays(WORK15), S)).toBe(0)
  })
  it('график 5/2 даёт 21 рабочий день в ноябре 2026', () => {
    const s52 = { ...S, schedule: { ...S.schedule, type: '5/2' as const } }
    const n = eachDay(nov.from, nov.to).filter((d) => patternIsWork(d, s52.schedule)).length
    expect(n).toBe(21)
    expect(salaryForRange(nov, {}, s52)).toBe(3200000)
  })
  it('график 2/2 от даты начала', () => {
    const sch = { type: '2/2' as const, startDate: '2026-11-01', pattern: '' }
    const w = eachDay('2026-11-01', '2026-11-08').map((d) => patternIsWork(d, sch))
    expect(w).toEqual([true, true, false, false, true, true, false, false])
  })
  it('расчётный период с 15-го числа', () => {
    expect(settlementPeriod(2026, 10, 15)).toEqual({ from: '2026-11-15', to: '2026-12-14' })
  })
})

describe('итоги', () => {
  const order = (over: Partial<Order>): Order => ({
    id: 'x', number: '1', brand: 'BMW', model: '3', plate: '', date: '2026-11-12', jobs: [],
    aw100: 13600, hours100: 1133, earningsKop: 738888, comment: '', status: 'confirmed',
    photoId: null, createdAt: '', updatedAt: '', ...over,
  })
  it('учитывает только подтверждённые заказы; оклад и AW отдельно', () => {
    const orders = [order({}), order({ id: 'y', status: 'draft' }), order({ id: 'z', status: 'cancelled' })]
    const sum = summarize(nov, orders, manualDays(WORK15), S, [{ id: 'a', date: '2026-11-20', title: 'Премия', amountKop: -100000 }])
    expect(sum.aw100).toBe(13600)
    expect(sum.normKop).toBe(738888)
    expect(sum.salaryKop).toBe(3200000)
    expect(sum.adjustmentsKop).toBe(-100000)
    expect(sum.totalKop).toBe(3838888)
  })
})

describe('перенос из старого приложения', () => {
  const json = JSON.stringify([
    { type: 'order', date: '2026-11-12', orderNo: '87654321', car: 'BMW X7, Е456КХ777', works: [{ desc: 'Развал', aw: 23, mine: true }, { desc: 'Чужая', aw: 50, mine: false }], aw: 23, createdAt: 1 },
    { type: 'schedule', month: '2026-11', days: { '05': 'vacation' } },
  ])
  it('берёт только свои работы, авто и график', () => {
    const r = parseClaudeExport('Вот данные:\n' + json, S, [])
    expect(r.orders).toHaveLength(1)
    expect(r.orders[0]).toMatchObject({ number: '87654321', brand: 'BMW', model: 'X7', plate: 'Е456КХ777', aw100: 2300, earningsKop: 124967 })
    expect(r.days).toEqual({ '2026-11-05': 'vacation' })
  })
  it('пропускает дубли', () => {
    const first = parseClaudeExport(json, S, [])
    expect(parseClaudeExport(json, S, first.orders).orders).toHaveLength(0)
  })
})
