import { useMemo, useState } from 'react'
import { Download, History as HistoryIcon, SlidersHorizontal } from 'lucide-react'
import { Button, Card, Empty, Select } from '@/components/ui'
import { OrderCard } from '@/components/order-card'
import { useOrderManager } from '@/components/order-manager'
import { FilterFields, activeFilterCount, applyFilters, EMPTY_FILTERS, type Filters } from '@/components/filters'
import { confirmed, orderHours100 } from '@/lib/calc'
import { exportCsv, exportXlsx } from '@/lib/backup'
import { fmtAW, fmtHours, fmtMoney } from '@/lib/money'
import { useStore } from '@/store'

type Sort = 'date-desc' | 'date-asc' | 'earn-desc' | 'aw-desc'

export function HistoryPage() {
  const { orders, settings, toast } = useStore()
  const [f, setF] = useState<Filters>(EMPTY_FILTERS)
  const [sort, setSort] = useState<Sort>('date-desc')
  const [open, setOpen] = useState(true)
  const mgr = useOrderManager()

  const list = useMemo(() => {
    const l = applyFilters(orders, f)
    const cmp: Record<Sort, (a: typeof l[number], b: typeof l[number]) => number> = {
      'date-desc': (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
      'date-asc': (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
      'earn-desc': (a, b) => b.earningsKop - a.earningsKop,
      'aw-desc': (a, b) => b.aw100 - a.aw100,
    }
    return [...l].sort(cmp[sort])
  }, [orders, f, sort])

  const ok = confirmed(list)
  const n = activeFilterCount(f)
  const doExport = async (kind: 'csv' | 'xlsx') => {
    if (!list.length) return toast('Нечего экспортировать', 'err')
    try { kind === 'csv' ? exportCsv(list) : await exportXlsx(list) } catch (e) { toast('Ошибка экспорта: ' + (e as Error).message, 'err') }
  }

  return (
    <div className="space-y-5">
      <Card className="p-4 md:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <button className="flex items-center gap-2 font-bold" onClick={() => setOpen(!open)}><SlidersHorizontal size={18} />Фильтры{n > 0 && <span className="size-5 rounded-full bg-accent text-white text-xs grid place-items-center">{n}</span>}</button>
          {n > 0 && <Button size="sm" variant="ghost" onClick={() => setF(EMPTY_FILTERS)}>Сбросить</Button>}
        </div>
        {open && (
          <div className="anim-fade space-y-3">
            <FilterFields f={f} set={setF} fields={['from', 'to', 'car', 'plate', 'number', 'status', 'awMin', 'awMax', 'earnMin', 'earnMax']} />
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted tnum">
          Найдено: <b className="text-fg">{list.length}</b> · {fmtAW(ok.reduce((a, o) => a + o.aw100, 0))} AW · {fmtHours(ok.reduce((a, o) => a + orderHours100(o, settings), 0))} ч ·{' '}
          <b className="text-money">{fmtMoney(ok.reduce((a, o) => a + o.earningsKop, 0), settings.currency)}</b>
        </div>
        <div className="flex gap-2 items-center">
          <Select className="h-10 w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Сортировка">
            <option value="date-desc">Сначала новые</option><option value="date-asc">Сначала старые</option>
            <option value="earn-desc">По заработку</option><option value="aw-desc">По AW</option>
          </Select>
          <Button size="sm" className="h-10" onClick={() => doExport('csv')}><Download size={16} />CSV</Button>
          <Button size="sm" className="h-10" onClick={() => doExport('xlsx')}><Download size={16} />Excel</Button>
        </div>
      </div>

      {list.length === 0 ? (
        <Empty icon={<HistoryIcon />} title={orders.length ? 'Ничего не найдено' : 'История пуста'} text={orders.length ? 'Измените фильтры.' : 'Здесь появятся все ваши заказы.'} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">{list.map((o) => <OrderCard key={o.id} o={o} settings={settings} actions={mgr.actions} />)}</div>
      )}
      {mgr.element}
    </div>
  )
}
