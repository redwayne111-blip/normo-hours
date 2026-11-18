import { Copy, Pencil, Trash2 } from 'lucide-react'
import { Button, Card } from './ui'
import { Dialog } from './ui/dialog'
import { Photo } from './photo'
import { orderHours100 } from '@/lib/calc'
import { fmtAW, fmtHours, fmtMoney } from '@/lib/money'
import { formatDate } from '@/lib/dates'
import { ORDER_STATUS_LABEL, type Order, type Settings } from '@/lib/types'
import { cn } from '@/lib/utils'

const statusStyle = { confirmed: 'text-money bg-money/10', draft: 'text-warn bg-warn/10', cancelled: 'text-danger bg-danger/10' }

export interface OrderActions { onOpen(o: Order): void; onEdit(o: Order): void; onCopy(o: Order): void; onDelete(o: Order): void }

const title = (o: Order) => [o.brand, o.model].filter(Boolean).join(' ') || 'Автомобиль не указан'

export function OrderCard({ o, settings, actions }: { o: Order; settings: Settings; actions: OrderActions }) {
  const cancelled = o.status === 'cancelled'
  return (
    <Card className={cn('p-4 transition active:scale-[0.99] hover:border-accent/40 anim-fade', cancelled && 'opacity-70')}>
      <div className="flex items-start justify-between gap-3 cursor-pointer" onClick={() => actions.onOpen(o)}>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-muted tnum">{o.number ? `Заказ № ${o.number}` : 'Без номера'}</div>
          <div className={cn('text-lg font-bold leading-tight mt-0.5', cancelled && 'line-through')}>{title(o)}</div>
          {o.plate && <div className="plate mt-2">{o.plate}</div>}
        </div>
        <span className="pill-aw shrink-0 tnum">{fmtAW(o.aw100)} AW</span>
      </div>
      {o.jobs.length > 0 && (
        <ul className="mt-3 pt-3 border-t border-line text-sm text-muted space-y-1 cursor-pointer" onClick={() => actions.onOpen(o)}>
          {o.jobs.slice(0, 4).map((j) => (
            <li key={j.id} className="flex items-baseline justify-between gap-2">
              <span className="line-clamp-1">• {j.title}</span>
              {j.aw100 != null && <span className="shrink-0 text-accent font-semibold tnum text-xs">{fmtAW(j.aw100)} AW</span>}
            </li>
          ))}
          {o.jobs.length > 4 && <li className="text-xs">и ещё {o.jobs.length - 4}…</li>}
        </ul>
      )}
      <div className="flex items-end justify-between mt-3 gap-2">
        <div>
          <div className={cn('font-bold tnum', cancelled ? 'text-danger line-through' : 'text-money')}>
            {fmtHours(orderHours100(o, settings))} ч · {fmtMoney(o.earningsKop, settings.currency)}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted">
            <span>{formatDate(o.date, settings.dateFormat)}</span>
            <span className={cn('rounded-full px-2 py-0.5 font-semibold', statusStyle[o.status])}>{ORDER_STATUS_LABEL[o.status]}</span>
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="size-9 px-0" aria-label="Редактировать" onClick={() => actions.onEdit(o)}><Pencil size={17} /></Button>
          <Button variant="ghost" size="sm" className="size-9 px-0" aria-label="Копировать" onClick={() => actions.onCopy(o)}><Copy size={17} /></Button>
          <Button variant="ghost" size="sm" className="size-9 px-0 hover:text-danger" aria-label="Удалить" onClick={() => actions.onDelete(o)}><Trash2 size={17} /></Button>
        </div>
      </div>
    </Card>
  )
}

export function OrderDetail({ o, settings, actions, onClose }: { o: Order | null; settings: Settings; actions: OrderActions; onClose: () => void }) {
  return (
    <Dialog open={!!o} onOpenChange={(v) => !v && onClose()} title={o ? title(o) : ''} wide>
      {o && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {o.number && <span className="text-muted tnum">Заказ № {o.number}</span>}
            {o.plate && <span className="plate">{o.plate}</span>}
            <span className={cn('rounded-full px-2 py-0.5 font-semibold text-xs', statusStyle[o.status])}>{ORDER_STATUS_LABEL[o.status]}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-accent/10 border border-accent/20 p-3"><div className="text-xl font-bold text-accent tnum">{fmtAW(o.aw100)}</div><div className="text-xs text-muted">AW</div></div>
            <div className="rounded-2xl bg-fg/5 border border-line p-3"><div className="text-xl font-bold tnum">{fmtHours(orderHours100(o, settings))}</div><div className="text-xs text-muted">нормо-часы</div></div>
            <div className="rounded-2xl bg-money/10 border border-money/20 p-3"><div className="text-xl font-bold text-money tnum">{fmtMoney(o.earningsKop, settings.currency, true)}</div><div className="text-xs text-muted">заработок</div></div>
          </div>
          <div className="text-sm text-muted">Дата выполнения: {formatDate(o.date, settings.dateFormat)}</div>
          {o.jobs.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted mb-1.5">Выполненные работы</div>
              <ul className="space-y-1.5 text-sm">{o.jobs.map((j) => (
                <li key={j.id} className="flex items-start justify-between gap-3 rounded-xl bg-fg/5 px-3 py-2">
                  <span>{j.title}</span>
                  {j.aw100 != null && <span className="shrink-0 rounded-full bg-accent/15 text-accent font-bold px-2 py-0.5 text-xs tnum">{fmtAW(j.aw100)} AW</span>}
                </li>
              ))}</ul>
            </div>
          )}
          {o.comment && <div><div className="text-xs font-medium text-muted mb-1.5">Комментарий</div><p className="text-sm whitespace-pre-wrap">{o.comment}</p></div>}
          <Photo id={o.photoId} className="rounded-xl w-full object-contain bg-sec max-h-96" />
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" onClick={() => actions.onEdit(o)}><Pencil size={16} />Изменить</Button>
            <Button className="flex-1" onClick={() => actions.onCopy(o)}><Copy size={16} />Копия</Button>
            <Button variant="danger" className="flex-1" onClick={() => actions.onDelete(o)}><Trash2 size={16} />Удалить</Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
