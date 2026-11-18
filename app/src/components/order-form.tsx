import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button, Field, Input, Select, Textarea } from './ui'
import { Dialog } from './ui/dialog'
import { Photo } from './photo'
import { autoEarningsKop, autoHours100 } from '@/lib/calc'
import { kopToInput, parseScaled, formatScaled } from '@/lib/money'
import { todayStr } from '@/lib/dates'
import { uid } from '@/lib/utils'
import { ORDER_STATUS_LABEL, type Order, type OrderStatus } from '@/lib/types'
import { useStore } from '@/store'

export interface DraftJob { title: string; aw100?: number }
export interface OrderDraft extends Partial<Omit<Order, 'jobs'>> { jobs?: DraftJob[]; raw?: string }

interface JobRow { key: string; title: string; aw: string }

interface FormState {
  number: string; brand: string; model: string; plate: string; date: string; jobs: JobRow[]
  aw: string; hours: string; earnings: string; comment: string; status: OrderStatus
}

const fmtIn = (v: number | null | undefined, f: (n: number) => string) => (v == null ? '' : f(v))
const num2 = (n: number) => formatScaled(n, 2, true).replace(/\u00a0/g, '')

export function OrderFormDialog({ open, onClose, order, draft, photo, notice }: {
  open: boolean; onClose: () => void
  order?: Order | null // редактирование
  draft?: OrderDraft | null // новый заказ / копия / результат OCR
  photo?: Blob | null // новое фото (из камеры/галереи)
  notice?: string
}) {
  const { settings, saveOrder, toast } = useStore()
  const src: OrderDraft = order ? { ...order, jobs: order.jobs.map((j) => ({ title: j.title, aw100: j.aw100 })) } : draft ?? {}

  const initial = useMemo<FormState>(() => ({
    number: src.number ?? '', brand: src.brand ?? '', model: src.model ?? '', plate: src.plate ?? '',
    date: src.date ?? todayStr(), jobs: (src.jobs ?? []).map((j) => ({ key: uid(), title: j.title, aw: fmtIn(j.aw100, num2) })),
    aw: fmtIn(src.aw100, num2), hours: fmtIn(src.hours100, num2), earnings: fmtIn(src.earningsKop, kopToInput),
    comment: src.comment ?? '', status: src.status ?? 'confirmed',
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [open, order?.id, draft, photo])

  const [f, setF] = useState<FormState>(initial)
  const [touched, setTouched] = useState({ hours: false, earnings: false })
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    setF(initial); setErrors({})
    // Поля, значения которых отличаются от авто-расчёта (или пришли из OCR), не перезаписываем при вводе AW
    const aw = parseScaled(initial.aw) ?? 0
    setTouched({
      hours: initial.hours !== '' && parseScaled(initial.hours) !== autoHours100(aw, settings),
      earnings: initial.earnings !== '' && parseScaled(initial.earnings) !== autoEarningsKop(aw, settings),
    })
  }, [initial, settings])

  useEffect(() => {
    if (!photo) { setPreview(null); return }
    const u = URL.createObjectURL(photo); setPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [photo])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }))

  const onAw = (v: string) => {
    setF((s) => {
      const aw = parseScaled(v)
      const next = { ...s, aw: v }
      if (aw != null && aw >= 0) {
        if (!touched.hours) { const h = autoHours100(aw, settings); next.hours = h == null ? '' : num2(h) }
        if (!touched.earnings) next.earnings = kopToInput(autoEarningsKop(aw, settings))
      }
      return next
    })
  }

  const setJobs = (jobs: JobRow[]) => {
    setF((s) => ({ ...s, jobs }))
    // Общее AW = сумма AW по работам (если хотя бы у одной указано)
    if (jobs.some((j) => j.aw.trim() !== '')) {
      const sum = jobs.reduce((a, j) => a + (parseScaled(j.aw) ?? 0), 0)
      onAw(num2(sum))
    }
  }
  const updJob = (key: string, patch: Partial<JobRow>) => setJobs(f.jobs.map((j) => (j.key === key ? { ...j, ...patch } : j)))

  const submit = async () => {
    const e: typeof errors = {}
    const aw = f.aw.trim() === '' ? 0 : parseScaled(f.aw)
    const hours = f.hours.trim() === '' ? null : parseScaled(f.hours)
    const earn = f.earnings.trim() === '' ? autoEarningsKop(aw ?? 0, settings) : parseScaled(f.earnings)
    if (!f.date) e.date = 'Укажите дату'
    if (aw == null || aw < 0 || aw > 99999999) e.aw = 'Введите число ≥ 0'
    if (f.hours.trim() !== '' && (hours == null || hours < 0)) e.hours = 'Введите число ≥ 0'
    if (earn == null || earn < 0) e.earnings = 'Введите сумму ≥ 0'
    if (f.jobs.some((j) => j.aw.trim() !== '' && (parseScaled(j.aw) ?? -1) < 0)) e.jobs = 'AW работы: число ≥ 0'
    if (f.number.length > 30) e.number = 'Слишком длинный номер'
    if (!f.number.trim() && !f.brand.trim() && !aw) e.number = 'Заполните номер, автомобиль или AW'
    setErrors(e)
    if (Object.keys(e).length) return

    const now = new Date().toISOString()
    const photoId = photo ? (order?.photoId ?? uid()) : (order?.photoId ?? null)
    const o: Order = {
      id: order?.id ?? uid(), number: f.number.trim(), brand: f.brand.trim(), model: f.model.trim(),
      plate: f.plate.replace(/\s/g, '').toUpperCase(), date: f.date,
      jobs: f.jobs.map((j) => ({ id: uid(), title: j.title.trim(), aw100: j.aw.trim() === '' ? undefined : parseScaled(j.aw) ?? undefined }))
        .filter((j) => j.title),
      aw100: aw!, hours100: hours ?? autoHours100(aw!, settings), earningsKop: earn!,
      comment: f.comment.trim(), status: f.status, photoId, createdAt: order?.createdAt ?? now, updatedAt: now,
    }
    setBusy(true)
    try { await saveOrder(o, photo); toast(order ? 'Заказ обновлён' : 'Заказ добавлен'); onClose() }
    catch { /* сообщение показано в store */ }
    finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={order ? 'Редактирование заказа' : 'Новый заказ'} wide>
      <div className="space-y-4">
        {notice && <div className="text-sm rounded-xl bg-accent/10 border border-accent/30 text-accent px-3 py-2">{notice}</div>}
        {preview ? <img src={preview} alt="Фото заказа" className="rounded-xl max-h-52 w-full object-contain bg-sec" />
          : order?.photoId ? <Photo id={order.photoId} className="rounded-xl max-h-52 w-full object-contain bg-sec" /> : null}
        {src.raw && (
          <details className="text-xs text-muted rounded-xl bg-sec px-3 py-2">
            <summary className="cursor-pointer">Распознанный текст</summary>
            <pre className="whitespace-pre-wrap mt-2 max-h-48 overflow-auto">{src.raw}</pre>
          </details>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Номер заказ-наряда" error={errors.number}><Input inputMode="numeric" value={f.number} onChange={(e) => set('number', e.target.value)} placeholder="12345678" /></Field>
          <Field label="Дата выполнения" error={errors.date}><Input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
          <Field label="Марка"><Input value={f.brand} onChange={(e) => set('brand', e.target.value)} placeholder="BMW" /></Field>
          <Field label="Модель"><Input value={f.model} onChange={(e) => set('model', e.target.value)} placeholder="3 серии" /></Field>
          <Field label="Госномер" className="col-span-2"><Input value={f.plate} onChange={(e) => set('plate', e.target.value)} placeholder="A123BC777" /></Field>
        </div>
        <Field label="Выполненные работы" error={errors.jobs} hint="Каждая работа — отдельная строка со своим AW">
          <div className="space-y-2">
            {f.jobs.map((j) => (
              <div key={j.key} className="flex gap-2 items-start">
                <Textarea rows={2} className="flex-1 min-w-0" value={j.title} placeholder="Название работы" onChange={(e) => updJob(j.key, { title: e.target.value })} />
                <Input className="w-20 shrink-0 text-center" inputMode="decimal" value={j.aw} placeholder="AW" aria-label="AW работы" onChange={(e) => updJob(j.key, { aw: e.target.value })} />
                <Button type="button" className="shrink-0 px-2.5" aria-label="Удалить работу" onClick={() => setJobs(f.jobs.filter((x) => x.key !== j.key))}><X size={16} /></Button>
              </div>
            ))}
            <Button type="button" className="w-full" onClick={() => set('jobs', [...f.jobs, { key: uid(), title: '', aw: '' }])}><Plus size={16} />Добавить работу</Button>
          </div>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="AW всего" error={errors.aw}><Input inputMode="decimal" value={f.aw} onChange={(e) => onAw(e.target.value)} placeholder="0" /></Field>
          <Field label="Нормо-часы" error={errors.hours}><Input inputMode="decimal" value={f.hours} onChange={(e) => { setTouched((t) => ({ ...t, hours: true })); set('hours', e.target.value) }} /></Field>
          <Field label={`Заработок, ${settings.currency}`} error={errors.earnings}><Input inputMode="decimal" value={f.earnings} onChange={(e) => { setTouched((t) => ({ ...t, earnings: true })); set('earnings', e.target.value) }} /></Field>
        </div>
        <p className="text-xs text-muted -mt-2">Часы и заработок считаются автоматически по AW ({formatScaled(settings.awRateKop)} {settings.currency} за AW); их можно исправить вручную.</p>
        <Field label="Статус">
          <Select value={f.status} onChange={(e) => set('status', e.target.value as OrderStatus)}>
            {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
          </Select>
        </Field>
        <Field label="Комментарий"><Textarea rows={2} value={f.comment} onChange={(e) => set('comment', e.target.value)} /></Field>
        <div className="flex gap-3 pt-2">
          <Button className="flex-1" onClick={onClose}>Отмена</Button>
          <Button variant="primary" className="flex-1" disabled={busy} onClick={submit}>{busy ? 'Сохранение…' : 'Сохранить'}</Button>
        </div>
      </div>
    </Dialog>
  )
}
