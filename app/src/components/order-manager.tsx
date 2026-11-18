import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { OrderFormDialog, type OrderDraft } from './order-form'
import { OrderDetail, type OrderActions } from './order-card'
import { Dialog, Confirm } from './ui/dialog'
import { autoEarningsKop, autoHours100 } from '@/lib/calc'
import { recognize } from '@/lib/ocr'
import { compressImage } from '@/lib/utils'
import { todayStr } from '@/lib/dates'
import type { Order } from '@/lib/types'
import { useStore } from '@/store'

interface FormState { order: Order | null; draft: OrderDraft | null; photo: Blob | null; notice?: string }

/** Общая логика заказов: форма, подробности, копирование, подтверждение удаления, распознавание фото. */
export function useOrderManager(defaultDate?: string) {
  const { settings, deleteOrder, toast } = useStore()
  const [form, setForm] = useState<FormState | null>(null)
  const [detail, setDetail] = useState<Order | null>(null)
  const [toDelete, setToDelete] = useState<Order | null>(null)
  const [ocr, setOcr] = useState<number | null>(null)
  const cancelled = useRef(false)

  const openNew = (draft: OrderDraft = {}) => setForm({ order: null, draft: { date: defaultDate ?? todayStr(), ...draft }, photo: null })

  const actions: OrderActions = {
    onOpen: (o) => setDetail(o),
    onEdit: (o) => { setDetail(null); setForm({ order: o, draft: null, photo: null }) },
    onCopy: (o) => {
      setDetail(null)
      setForm({ order: null, photo: null, notice: 'Копия заказа: проверьте номер и дату.', draft: {
        ...o, id: undefined, photoId: null, number: '', date: defaultDate ?? todayStr(), jobs: o.jobs.map((j) => j.title), status: 'confirmed',
      } })
    },
    onDelete: (o) => setToDelete(o),
  }

  const fromPhoto = async (file: File) => {
    cancelled.current = false
    setOcr(0)
    let photo: Blob
    try { photo = await compressImage(file) } catch (e) { setOcr(null); toast((e as Error).message, 'err'); return }
    try {
      const { data, engine, note } = await recognize(photo, settings.openaiKey, (p) => setOcr(p))
      if (cancelled.current) return
      const aw = data.aw100
      const draft: OrderDraft = {
        date: defaultDate ?? todayStr(), number: data.number, brand: data.brand, model: data.model, plate: data.plate, jobs: data.jobs,
        aw100: aw, hours100: data.hours100 ?? (aw != null ? autoHours100(aw, settings) ?? undefined : undefined),
        earningsKop: data.earningsKop ?? (aw != null ? autoEarningsKop(aw, settings) : undefined),
      }
      setOcr(null)
      setForm({ order: null, draft, photo, notice: `Распознано (${engine}). Проверьте и исправьте данные перед сохранением.${note ? ' ' + note : ''}` })
    } catch (e) {
      if (cancelled.current) return
      setOcr(null)
      setForm({ order: null, draft: { date: defaultDate ?? todayStr() }, photo, notice: 'Не удалось распознать текст (' + (e as Error).message + '). Заполните поля вручную.' })
    }
  }

  const element = (
    <>
      <OrderFormDialog open={!!form} onClose={() => setForm(null)} order={form?.order} draft={form?.draft} photo={form?.photo} notice={form?.notice} />
      <OrderDetail o={detail} settings={settings} actions={actions} onClose={() => setDetail(null)} />
      <Confirm open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title="Удалить заказ?"
        text={toDelete ? `Заказ ${toDelete.number ? '№ ' + toDelete.number : ''} ${[toDelete.brand, toDelete.model].join(' ')} будет удалён без возможности восстановления.` : ''}
        onConfirm={async () => { if (toDelete) { try { await deleteOrder(toDelete.id); toast('Заказ удалён'); setDetail(null) } catch { /* toast в store */ } } setToDelete(null) }} />
      <Dialog open={ocr !== null} onOpenChange={(o) => { if (!o) { cancelled.current = true; setOcr(null) } }} title="Распознавание заказ-наряда">
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <Loader2 className="animate-spin text-accent" size={36} />
          <div className="text-sm text-muted">Читаю текст с фото. При первом запуске это может занять до минуты.</div>
          <div className="w-full h-2 rounded-full bg-sec overflow-hidden"><div className="h-full bg-accent transition-all" style={{ width: `${Math.round((ocr ?? 0) * 100)}%` }} /></div>
        </div>
      </Dialog>
    </>
  )

  return { actions, openNew, fromPhoto, element }
}
