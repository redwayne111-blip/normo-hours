import { useMemo, useState } from 'react'
import { Camera, ClipboardList, Image as ImageIcon, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { Button, Card, Empty, Input } from '@/components/ui'
import { PeriodBar, usePeriod } from '@/components/period'
import { OrderCard } from '@/components/order-card'
import { useOrderManager } from '@/components/order-manager'
import { FilterFields, activeFilterCount, applyFilters, EMPTY_FILTERS, type Filters } from '@/components/filters'
import { summarize, confirmed, salaryForRange, orderHours100 } from '@/lib/calc'
import { fmtAW, fmtHours, fmtMoney } from '@/lib/money'
import { formatDayLong } from '@/lib/dates'
import { useStore } from '@/store'
import type { Order } from '@/lib/types'

export function OrdersPage() {
  const { orders, days, settings, adjustments } = useStore()
  const p = usePeriod('day')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [showFilters, setShowFilters] = useState(false)
  const mgr = useOrderManager(p.mode === 'day' ? p.range.from : undefined)
  const cur = settings.currency

  const sum = useMemo(() => summarize(p.range, orders, days, settings, adjustments), [p.range, orders, days, settings, adjustments])
  const inRange = useMemo(() => orders.filter((o) => o.date >= p.range.from && o.date <= p.range.to), [orders, p.range])
  const visible = useMemo(() => applyFilters(inRange, filters), [inRange, filters])
  const groups = useMemo(() => {
    const m = new Map<string, Order[]>()
    for (const o of [...visible].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))) m.set(o.date, [...(m.get(o.date) ?? []), o])
    return [...m.entries()]
  }, [visible])
  const nFilters = activeFilterCount(filters, ['q'])
  const plural = (n: number, a: string, b: string, c: string) => { const m = n % 100, k = n % 10; return m > 10 && m < 20 ? c : k === 1 ? a : k >= 2 && k <= 4 ? b : c }

  return (
    <div className="space-y-5">
      <section className="hero rounded-[32px] p-5 md:p-6">
        <PeriodBar p={p} />
        <div className="mt-6 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Заработок</div>
            <div className="num-display text-grad-money text-[44px] md:text-6xl mt-2 truncate">{fmtMoney(sum.totalKop, cur)}</div>
          </div>
          <div className="text-right text-xs text-muted tnum leading-relaxed shrink-0">
            {sum.orderCount ? <><div>{sum.orderCount} {plural(sum.orderCount, 'заказ', 'заказа', 'заказов')}</div></> : <div>нет заказов</div>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-5">
          <div className="rounded-2xl bg-accent/10 border border-accent/20 px-4 py-3.5"><div className="eyebrow !text-accent">AW</div><div className="num-display text-3xl mt-2">{fmtAW(sum.aw100) || '0'}</div></div>
          <div className="rounded-2xl bg-fg/5 border border-line px-4 py-3.5"><div className="eyebrow">Нормо-часы</div><div className="num-display text-3xl mt-2">{fmtHours(sum.hours100)}</div></div>
        </div>
        {(sum.orderCount > 0 || sum.salaryKop > 0 || sum.adjustmentsKop !== 0) && (
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted tnum">
            <span>Оклад <b className="text-fg font-semibold">{fmtMoney(sum.salaryKop, cur)}</b></span><span aria-hidden>+</span>
            <span>нормо-часы <b className="text-fg font-semibold">{fmtMoney(sum.normKop, cur)}</b></span>
            {sum.adjustmentsKop !== 0 && <><span aria-hidden>{sum.adjustmentsKop > 0 ? '+' : '−'}</span><span>корректировки <b className="text-fg font-semibold">{fmtMoney(Math.abs(sum.adjustmentsKop), cur)}</b></span></>}
          </div>
        )}
      </section>

      <div className="grid grid-cols-5 gap-2.5">
        <Button variant="primary" size="lg" className="col-span-3 md:col-span-2" onClick={() => mgr.openNew()}><Plus size={20} />Добавить заказ</Button>
        <label className="col-span-2 md:col-span-1 contents">
          <input id="cam" type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) mgr.fromPhoto(f) }} />
          <input id="gal" type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) mgr.fromPhoto(f) }} />
        </label>
        <Button size="lg" className="col-span-1 md:col-span-1 px-2" onClick={() => document.getElementById('cam')?.click()} aria-label="Сфотографировать заказ"><Camera size={20} /><span className="hidden md:inline">Сфотографировать</span></Button>
        <Button size="lg" className="col-span-1 md:col-span-1 px-2" onClick={() => document.getElementById('gal')?.click()} aria-label="Из галереи"><ImageIcon size={20} /><span className="hidden md:inline">Из галереи</span></Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input className="pl-10" placeholder="Поиск: автомобиль, госномер, № заказа" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        </div>
        <Button className="relative" aria-label="Фильтры" onClick={() => setShowFilters((s) => !s)}>
          <SlidersHorizontal size={18} />
          {nFilters > 0 && <span className="absolute -top-1 -right-1 size-5 rounded-full btn-primary text-xs grid place-items-center">{nFilters}</span>}
        </Button>
      </div>
      {showFilters && (
        <Card className="p-4 anim-fade space-y-3">
          <FilterFields f={filters} set={setFilters} fields={['awMin', 'awMax', 'status']} />
          <Button size="sm" variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>Сбросить фильтры</Button>
        </Card>
      )}

      {groups.length === 0 ? (
        <Empty icon={<ClipboardList />} title={inRange.length ? 'Ничего не найдено' : 'Заказов за период нет'}
          text={inRange.length ? 'Измените поиск или фильтры.' : 'Добавьте заказ вручную или сфотографируйте заказ-наряд.'}
          action={!inRange.length && <Button variant="primary" onClick={() => mgr.openNew()}><Plus size={18} />Добавить заказ</Button>} />
      ) : (
        <div className="space-y-6">
          {groups.map(([date, list]) => {
            const ok = confirmed(list)
            const aw = ok.reduce((a, o) => a + o.aw100, 0)
            const h = ok.reduce((a, o) => a + orderHours100(o, settings), 0)
            const norm = ok.reduce((a, o) => a + o.earningsKop, 0)
            const sal = salaryForRange({ from: date, to: date }, days, settings)
            return (
              <section key={date} className="space-y-3">
                <div className="flex items-end justify-between gap-3 px-1">
                  <div>
                    <div className="text-lg font-extrabold tracking-tight">{formatDayLong(date)}</div>
                    <div className="text-[13px] text-muted tnum mt-0.5">{fmtAW(aw) || 0} AW · {fmtHours(h)} ч{sal > 0 && <> · оклад {fmtMoney(sal, cur)}</>}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="num-display text-xl text-money">{fmtMoney(sal + norm, cur)}</div>
                    {sal > 0 && <div className="text-[11px] text-muted mt-1">с окладом</div>}
                  </div>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {list.map((o) => <OrderCard key={o.id} o={o} settings={settings} actions={mgr.actions} />)}
                </div>
              </section>
            )
          })}
        </div>
      )}
      {mgr.element}
    </div>
  )
}
