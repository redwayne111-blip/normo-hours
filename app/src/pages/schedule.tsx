import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Settings2 } from 'lucide-react'
import { Button, Card, Segmented } from '@/components/ui'
import { Dialog } from '@/components/ui/dialog'
import { OrderCard } from '@/components/order-card'
import { useOrderManager } from '@/components/order-manager'
import { effectiveStatus, orderHours100, patternIsWork, summarize, confirmed, salaryForRange } from '@/lib/calc'
import { addDays, formatDayLong, MONTHS, MONTHS_GEN, parts, periodOf, startOfWeek, todayStr, weekday, WEEKDAYS, eachDay, type Range } from '@/lib/dates'
import { fmtAW, fmtHours, fmtMoney, roundDiv } from '@/lib/money'
import { STATUS_LABEL, type DayStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'

const CELL: Record<DayStatus, string> = {
  work: 'bg-money/25 border-money/40',
  off: 'bg-offday border-transparent',
  vacation: 'bg-warn/30 border-warn/50',
  unpaid: 'bg-danger/25 border-danger/40',
}
const DOT: Record<DayStatus, string> = { work: 'bg-money', off: 'bg-offday', vacation: 'bg-warn', unpaid: 'bg-danger' }

const compact = (kop: number, cur: string) => {
  const rub = roundDiv(kop, 100)
  return rub >= 1000 ? `${(Math.floor(rub / 100) / 10).toString().replace('.', ',')}к ${cur}` : `${rub} ${cur}`
}

export function SchedulePage() {
  const { orders, days, settings, adjustments } = useStore()
  const [view, setView] = useState<'month' | 'week' | 'day'>('month')
  const [anchor, setAnchor] = useState(todayStr())
  const [openDay, setOpenDay] = useState<string | null>(null)
  const cur = settings.currency

  const range: Range = useMemo(() => {
    if (view === 'day') return { from: anchor, to: anchor }
    if (view === 'week') { const f = startOfWeek(anchor); return { from: f, to: addDays(f, 6) } }
    return periodOf(anchor, settings.periodStartDay)
  }, [view, anchor, settings.periodStartDay])

  const shift = (dir: 1 | -1) => setAnchor(view === 'day' ? addDays(anchor, dir) : view === 'week' ? addDays(anchor, 7 * dir) : dir > 0 ? addDays(range.to, 1) : addDays(range.from, -1))

  const label = (() => {
    const f = parts(range.from), t = parts(range.to)
    if (view === 'day') return `${f.d} ${MONTHS_GEN[f.m]} ${f.y}`
    if (view === 'week') return `${f.d} ${f.m !== t.m ? MONTHS_GEN[f.m] + ' ' : ''}– ${t.d} ${MONTHS_GEN[t.m]}`
    return settings.periodStartDay === 1 ? `${MONTHS[f.m]} ${f.y}` : `${f.d} ${MONTHS_GEN[f.m].slice(0, 3)} – ${t.d} ${MONTHS_GEN[t.m].slice(0, 3)} ${t.y}`
  })()

  const dayEarn = (d: string) => {
    const sum = summarize({ from: d, to: d }, orders, days, settings, adjustments)
    return { sum, kop: sum.salaryKop + sum.normKop }
  }
  const total = useMemo(() => summarize(range, orders, days, settings, adjustments), [range, orders, days, settings, adjustments])
  const period = useMemo(() => periodOf(range.from, settings.periodStartDay), [range.from, settings.periodStartDay])
  const planned = useMemo(() => summarize(period, [], days, settings, []).days.planned, [period, days, settings])

  const cell = (d: string) => {
    const st = effectiveStatus(d, days, settings)
    const { sum, kop } = dayEarn(d)
    return (
      <button key={d} onClick={() => setOpenDay(d)} aria-label={d}
        className={cn('relative rounded-xl border p-1 md:p-2 min-h-16 md:min-h-20 flex flex-col items-center justify-center text-center transition hover:brightness-125 active:scale-95', CELL[st],
          d === todayStr() && 'ring-2 ring-accent ring-offset-2 ring-offset-bg')}>
        <span className="font-bold text-base md:text-lg">{parts(d).d}</span>
        {kop > 0 ? <span className="text-[11px] md:text-xs text-muted tnum">{compact(kop, cur)}</span>
          : sum.aw100 > 0 ? <span className="text-[11px] md:text-xs text-muted tnum">{fmtAW(sum.aw100)} AW</span> : null}
      </button>
    )
  }

  const lead = weekday(range.from)
  const rows: [string, string][] = [
    ['Рабочих по графику', String(total.days.planned)],
    ['Отмечено рабочих', String(total.days.work)],
    ['Отпуск', String(total.days.vacation)],
    ['За свой счёт', String(total.days.unpaid)],
    ['Оклад (месячный)', fmtMoney(settings.monthlySalaryKop, cur)],
    ['Оклад за рабочий день', planned ? fmtMoney(roundDiv(settings.monthlySalaryKop, planned), cur, true) : '—'],
    ['Начислено оклада', fmtMoney(total.salaryKop, cur)],
    [`По нормо-часам (${fmtAW(total.aw100)} AW)`, fmtMoney(total.normKop, cur)],
  ]
  if (total.adjustmentsKop) rows.push(['Корректировки', fmtMoney(total.adjustmentsKop, cur)])

  return (
    <div className="space-y-5">
      <Card className="p-4 md:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Segmented className="flex-1" value={view} onChange={setView} options={[{ value: 'month', label: 'Месяц' }, { value: 'week', label: 'Неделя' }, { value: 'day', label: 'День' }]} />
          <Button className="size-12 px-0" aria-label="Настроить график" onClick={() => { location.hash = '#/settings' }}><Settings2 size={20} /></Button>
        </div>
        <div className="flex items-center justify-between mb-3">
          <Button variant="ghost" className="size-11 px-0" aria-label="Назад" onClick={() => shift(-1)}><ChevronLeft /></Button>
          <button className="font-bold text-lg" onClick={() => setAnchor(todayStr())}>{label}</button>
          <Button variant="ghost" className="size-11 px-0" aria-label="Вперёд" onClick={() => shift(1)}><ChevronRight /></Button>
        </div>

        {view === 'month' && (
          <>
            <div className="grid grid-cols-7 gap-1.5 md:gap-2 text-center text-xs font-semibold text-muted mb-2">{WEEKDAYS.map((w) => <div key={w}>{w}</div>)}</div>
            <div className="grid grid-cols-7 gap-1.5 md:gap-2">
              {Array.from({ length: lead }, (_, i) => <div key={'e' + i} />)}
              {eachDay(range.from, range.to).map(cell)}
            </div>
          </>
        )}
        {view === 'week' && (
          <div className="space-y-2">
            {eachDay(range.from, range.to).map((d) => {
              const st = effectiveStatus(d, days, settings); const { sum, kop } = dayEarn(d)
              return (
                <button key={d} onClick={() => setOpenDay(d)} className={cn('w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition hover:brightness-125', CELL[st], d === todayStr() && 'ring-2 ring-accent')}>
                  <div><div className="font-bold">{formatDayLong(d)}</div><div className="text-xs text-muted">{STATUS_LABEL[st]}{sum.orderCount ? ` · заказов: ${sum.orderCount}` : ''}</div></div>
                  <div className="text-right tnum"><div className="font-bold">{kop > 0 ? fmtMoney(kop, cur) : '—'}</div>{sum.aw100 > 0 && <div className="text-xs text-muted">{fmtAW(sum.aw100)} AW</div>}</div>
                </button>
              )
            })}
          </div>
        )}
        {view === 'day' && <DayPanel date={anchor} />}

        <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 text-sm text-muted">
          {(Object.keys(STATUS_LABEL) as DayStatus[]).map((s) => <span key={s} className="flex items-center gap-1.5"><i className={cn('size-3.5 rounded', DOT[s])} />{STATUS_LABEL[s]}</span>)}
        </div>
      </Card>

      <Card className="p-4 md:p-5">
        <h2 className="font-bold text-lg mb-2">Итоги {view === 'month' ? 'месяца' : view === 'week' ? 'недели' : 'дня'}</h2>
        <div className="divide-y divide-line">
          {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-3 text-sm"><span className="text-muted">{k}</span><span className="font-semibold tnum text-right">{v}</span></div>)}
          <div className="flex justify-between gap-4 pt-4 pb-1"><span className="font-bold">Итого</span><span className="font-bold text-money text-xl tnum">{fmtMoney(total.totalKop, cur)}</span></div>
        </div>
      </Card>

      <Dialog open={!!openDay} onOpenChange={(o) => !o && setOpenDay(null)} title={openDay ? formatDayLong(openDay) : ''} wide>
        {openDay && <DayPanel date={openDay} />}
      </Dialog>
    </div>
  )
}

/** Подробности дня: статус, заказы, AW, часы, заработок. */
function DayPanel({ date }: { date: string }) {
  const { orders, days, settings, adjustments, setDay } = useStore()
  const mgr = useOrderManager(date)
  const cur = settings.currency
  const st = effectiveStatus(date, days, settings)
  const sum = summarize({ from: date, to: date }, orders, days, settings, adjustments)
  const list = orders.filter((o) => o.date === date)
  const hasOverride = date in days
  const patternWork = patternIsWork(date, settings.schedule)
  const options: { v: DayStatus | null; label: string }[] = [
    { v: null, label: settings.schedule.type === 'manual' ? 'Выходной (по умолчанию)' : `По графику (${patternWork ? 'рабочий' : 'выходной'})` },
    { v: 'work', label: 'Рабочий' }, { v: 'off', label: 'Выходной' }, { v: 'vacation', label: 'Отпуск' }, { v: 'unpaid', label: 'За свой счёт' },
  ]
  const active = hasOverride ? days[date] : null

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-medium text-muted mb-1.5">Статус дня: <span className="text-fg font-semibold">{STATUS_LABEL[st]}</span></div>
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <Button key={String(o.v)} size="sm" variant={active === o.v ? 'primary' : 'secondary'} onClick={() => setDay(date, o.v)}>{o.label}</Button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-accent/10 p-3"><div className="text-xl font-bold tnum">{fmtAW(sum.aw100)}</div><div className="text-xs text-muted">AW</div></div>
        <div className="rounded-xl bg-sec p-3"><div className="text-xl font-bold tnum">{fmtHours(sum.hours100)}</div><div className="text-xs text-muted">нормо-часы</div></div>
        <div className="rounded-xl bg-sec p-3"><div className="text-xl font-bold tnum">{fmtMoney(salaryForRange({ from: date, to: date }, days, settings), cur, true)}</div><div className="text-xs text-muted">оклад за день</div></div>
        <div className="rounded-xl bg-money/10 p-3"><div className="text-xl font-bold text-money tnum">{fmtMoney(sum.normKop, cur, true)}</div><div className="text-xs text-muted">по нормо-часам</div></div>
      </div>
      <div className="flex justify-between items-center rounded-xl bg-money/10 px-4 py-3">
        <span className="font-semibold">Заработок за день</span><span className="font-bold text-money text-lg tnum">{fmtMoney(sum.totalKop, cur, true)}</span>
      </div>
      {list.length === 0 && <div className="text-sm text-muted text-center py-2">В этот день заказов нет</div>}
      <div className="space-y-3">
        {list.map((o) => <OrderCard key={o.id} o={o} settings={settings} actions={mgr.actions} />)}
      </div>
      {confirmed(list).length !== list.length && <div className="text-xs text-muted">Черновики и отменённые заказы не входят в расчёт.</div>}
      <Button variant="primary" className="w-full" onClick={() => mgr.openNew()}><Plus size={18} />Добавить заказ на этот день</Button>
      {mgr.element}
    </div>
  )
}
