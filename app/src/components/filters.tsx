import { Input, Select } from './ui'
import { parseScaled } from '@/lib/money'
import { ORDER_STATUS_LABEL, type Order, type OrderStatus } from '@/lib/types'

export interface Filters {
  q: string; car: string; plate: string; number: string
  awMin: string; awMax: string; earnMin: string; earnMax: string
  from: string; to: string; status: '' | OrderStatus
}
export const EMPTY_FILTERS: Filters = { q: '', car: '', plate: '', number: '', awMin: '', awMax: '', earnMin: '', earnMax: '', from: '', to: '', status: '' }

const has = (hay: string, needle: string) => hay.toLowerCase().replace(/\s/g, '').includes(needle.toLowerCase().replace(/\s/g, ''))

export function applyFilters(orders: Order[], f: Filters): Order[] {
  const awMin = f.awMin ? parseScaled(f.awMin) : null, awMax = f.awMax ? parseScaled(f.awMax) : null
  const eMin = f.earnMin ? parseScaled(f.earnMin) : null, eMax = f.earnMax ? parseScaled(f.earnMax) : null
  return orders.filter((o) => {
    if (f.q && !(has(`${o.brand}${o.model}`, f.q) || has(o.plate, f.q) || has(o.number, f.q) || o.jobs.some((j) => has(j.title, f.q)))) return false
    if (f.car && !has(`${o.brand}${o.model}`, f.car)) return false
    if (f.plate && !has(o.plate, f.plate)) return false
    if (f.number && !has(o.number, f.number)) return false
    if (awMin != null && o.aw100 < awMin) return false
    if (awMax != null && o.aw100 > awMax) return false
    if (eMin != null && o.earningsKop < eMin) return false
    if (eMax != null && o.earningsKop > eMax) return false
    if (f.from && o.date < f.from) return false
    if (f.to && o.date > f.to) return false
    if (f.status && o.status !== f.status) return false
    return true
  })
}

export const activeFilterCount = (f: Filters, ignore: (keyof Filters)[] = []) =>
  (Object.keys(f) as (keyof Filters)[]).filter((k) => !ignore.includes(k) && f[k] !== '').length

type Field = keyof Filters
const LABELS: Record<Field, string> = {
  q: 'Поиск', car: 'Автомобиль', plate: 'Госномер', number: 'Номер заказ-наряда', awMin: 'AW от', awMax: 'AW до',
  earnMin: 'Заработок от, ₽', earnMax: 'Заработок до, ₽', from: 'Дата с', to: 'Дата по', status: 'Статус',
}

export function FilterFields({ f, set, fields }: { f: Filters; set: (f: Filters) => void; fields: Field[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map((k) => (
        <label key={k} className="block">
          <span className="block text-xs font-medium text-muted mb-1.5">{LABELS[k]}</span>
          {k === 'status' ? (
            <Select value={f.status} onChange={(e) => set({ ...f, status: e.target.value as Filters['status'] })}>
              <option value="">Все</option>
              {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
            </Select>
          ) : (
            <Input type={k === 'from' || k === 'to' ? 'date' : 'text'} inputMode={k.startsWith('aw') || k.startsWith('earn') ? 'decimal' : undefined}
              value={f[k]} onChange={(e) => set({ ...f, [k]: e.target.value })} />
          )}
        </label>
      ))}
    </div>
  )
}
