import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { OrderFormDialog, type OrderDraft } from './order-form'
import { OrderDetail, type OrderActions } from './order-card'
import { Dialog, Confirm } from './ui/dialog'
import { autoEarningsKop, autoHours100 } from '@/lib/calc'
import { recognize } from '@/lib/ocr'
import { parseOrderText, type ParsedOrder } from '@/lib/ocrParse'
import { readPdf, type PdfPage } from '@/lib/pdf'
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
  const queue = useRef<{ pages: PdfPage[]; i: number } | null>(null)

  const openNew = (draft: OrderDraft = {}) => setForm({ order: null, draft: { date: defaultDate ?? todayStr(), ...draft }, photo: null })

  const actions: OrderActions = {
    onOpen: (o) => setDetail(o),
    onEdit: (o) => { setDetail(null); setForm({ order: o, draft: null, photo: null }) },
    onCopy: (o) => {
      setDetail(null)
      setForm({ order: null, photo: null, notice: 'Копия заказа: проверьте номер и дату.', draft: {
        ...o, id: undefined, photoId: null, number: '', date: defaultDate ?? todayStr(), jobs: o.jobs.map((j) => ({ title: j.title, aw100: j.aw100 })), status: 'confirmed',
      } })
    },
    onDelete: (o) => setToDelete(o),
  }

  const toDraft = (data: ParsedOrder): OrderDraft => {
    const aw = data.aw100
    return {
      date: defaultDate ?? todayStr(), number: data.number, brand: data.brand, model: data.model, plate: data.plate, jobs: data.jobs, raw: data.raw,
      aw100: aw, hours100: data.hours100 ?? (aw != null ? autoHours100(aw, settings) ?? undefined : undefined),
      earningsKop: data.earningsKop ?? (aw != null ? autoEarningsKop(aw, settings) : undefined),
    }
  }

  const fromPhoto = async (file: Blob, label = '', fromQueue = false) => {
    cancelled.current = false
    if (!fromQueue) queue.current = null
    setOcr(0)
    let photo: Blob
    try { photo = await compressImage(file as File) } catch (e) { setOcr(null); toast((e as Error).message, 'err'); return }
    try {
      const { data, engine, note } = await recognize(file, settings.openaiKey, (p) => setOcr(p))
      if (cancelled.current) return
      setOcr(null)
      setForm({ order: null, draft: toDraft(data), photo, notice: `${label}Распознано (${engine}). Проверьте и исправьте данные перед сохранением.${note ? ' ' + note : ''}` })
    } catch (e) {
      if (cancelled.current) return
      setOcr(null)
      setForm({ order: null, draft: { date: defaultDate ?? todayStr() }, photo, notice: label + 'Не удалось распознать текст (' + (e as Error).message + '). Заполните поля вручную.' })
    }
  }

  const openPdfPage = async () => {
    const q = queue.current
    if (!q) return
    const page = q.pages[q.i]
    const label = q.pages.length > 1 ? `Страница ${q.i + 1} из ${q.pages.length}. ` : ''
    const parsed = page.text.length > 40 ? parseOrderText(page.text) : null
    if (parsed && (parsed.jobs.length > 0 || parsed.number)) {
      setForm({ order: null, draft: toDraft(parsed), photo: null, notice: `${label}Данные считаны из PDF. Проверьте и исправьте перед сохранением.` })
      return
    }
    cancelled.current = false
    setOcr(0)
    try { await fromPhoto(await page.image(), label, true) } catch (e) { setOcr(null); toast((e as Error).message, 'err') }
  }

  const fromPdf = async (file: File) => {
    cancelled.current = false
    setOcr(0)
    try {
      const pages = await readPdf(file)
      if (!pages.length) throw new Error('В PDF нет страниц')
      queue.current = { pages, i: 0 }
      setOcr(null)
      await openPdfPage()
    } catch (e) { setOcr(null); toast('Не удалось открыть PDF: ' + (e as Error).message, 'err') }
  }

  const closeForm = () => {
    setForm(null)
    const q = queue.current
    if (q && q.i + 1 < q.pages.length) { q.i++; void openPdfPage() } else queue.current = null
  }

  const element = (
    <>
      <OrderFormDialog open={!!form} onClose={closeForm} order={form?.order} draft={form?.draft} photo={form?.photo} notice={form?.notice} />
      <OrderDetail o={detail} settings={settings} actions={actions} onClose={() => setDetail(null)} />
      <Confirm open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title="Удалить заказ?"
        text={toDelete ? `Заказ ${toDelete.number ? '№ ' + toDelete.number : ''} ${[toDelete.brand, toDelete.model].join(' ')} будет удалён без возможности восстановления.` : ''}
        onConfirm={async () => { if (toDelete) { try { await deleteOrder(toDelete.id); toast('Заказ удалён'); setDetail(null) } catch { /* toast в store */ } } setToDelete(null) }} />
      <Dialog open={ocr !== null} onOpenChange={(o) => { if (!o) { cancelled.current = true; setOcr(null) } }} title="Распознавание заказ-наряда">
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <Loader2 className="animate-spin text-accent" size={36} />
          <div className="text-sm text-muted">Читаю текст. При первом запуске это может занять до минуты.</div>
          <div className="w-full h-2 rounded-full bg-sec overflow-hidden"><div className="h-full bg-accent transition-all" style={{ width: `${Math.round((ocr ?? 0) * 100)}%` }} /></div>
        </div>
      </Dialog>
    </>
  )

  return { actions, openNew, fromPhoto: (f: File) => fromPhoto(f), fromPdf, element }
}
