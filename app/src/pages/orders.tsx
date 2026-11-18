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

  return (
    <div className="space-y-5">
      <Card className="p-4 md:p-5">
        <PeriodBar p={p} />
        <div className="grid grid-cols-3 gap-2 md:gap-3 mt-4">
          <div className="rounded-2xl bg-accent/10 py-4 text-center"><div className="text-2xl md:text-3xl font-bold tnum">{fmtAW(sum.aw100) || '0'}</div><div className="text-xs md:text-sm text-muted mt-1">AW</div></div>
          <div className="rounded-2xl bg-sec py-4 text-center"><div className="text-2xl md:text-3xl font-bold tnum">{fmtHours(sum.hours100)}</div><div className="text-xs md:text-sm text-muted mt-1">нормо-часы</div></div>
          <div className="rounded-2xl bg-money/10 py-4 text-center"><div className="text-xl md:text-3xl font-bold text-money tnum">{fmtMoney(sum.totalKop, cur)}</div><div className="text-xs md:text-sm text-muted mt-1">заработок</div></div>
        </div>
        <div className="text-center text-sm text-muted mt-3 tnum">
          {sum.orderCount || sum.salaryKop || sum.adjustmentsKop
            ? <>Оклад {fmtMoney(sum.salaryKop, cur)} + нормо-часы {fmtMoney(sum.normKop, cur)}{sum.adjustmentsKop ? ` ${sum.adjustmentsKop > 0 ? '+' : '−'} корректировки ${fmtMoney(Math.abs(sum.adjustmentsKop), cur)}` : ''}</>
            : 'Нет записей за период'}
        </div>
      </Card>

      <div className="grid grid-cols-5 gap-3">
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
          {nFilters > 0 && <span className="absolute -top-1 -right-1 size-5 rounded-full bg-accent text-white text-xs grid place-items-center">{nFilters}</span>}
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
                <div>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 px-1 text-sm">
                    <span className="font-semibold text-muted">{formatDayLong(date)}</span>
                    <span className="text-muted tnum">{fmtAW(aw) || 0} AW · {fmtHours(h)} ч · {fmtMoney(norm, cur)}</span>
                  </div>
                  {sal > 0 && <div className="px-1 mt-1 text-sm font-semibold text-money tnum">Оклад {fmtMoney(sal, cur)} + нормо-часы = {fmtMoney(sal + norm, cur)}</div>}
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
