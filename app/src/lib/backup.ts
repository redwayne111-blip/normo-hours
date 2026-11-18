import { blobToDataUrl, dataUrlToBlob, downloadBlob } from './utils'
import type { Order, Snapshot } from './types'
import type { Repository } from './repo/types'
import { ORDER_STATUS_LABEL } from './types'
import { formatScaled } from './money'

export async function exportBackup(repo: Repository, snap: Snapshot) {
  const photos: Record<string, string> = {}
  for (const o of snap.orders) {
    if (!o.photoId) continue
    const b = await repo.getPhoto(o.photoId)
    if (b) photos[o.photoId] = await blobToDataUrl(b)
  }
  const json = JSON.stringify({ app: 'normo-hours', version: 1, exportedAt: new Date().toISOString(), snapshot: snap, photos })
  downloadBlob(new Blob([json], { type: 'application/json' }), `normo-hours-backup-${new Date().toISOString().slice(0, 10)}.json`)
}

export async function parseBackup(file: File): Promise<{ snap: Snapshot; photos: Record<string, Blob> }> {
  let data: { app?: string; snapshot?: Snapshot; photos?: Record<string, string> }
  try { data = JSON.parse(await file.text()) } catch { throw new Error('Файл не является корректным JSON') }
  if (data.app !== 'normo-hours' || !data.snapshot?.orders || !data.snapshot.settings) throw new Error('Это не резервная копия «Нормо-часов»')
  const photos: Record<string, Blob> = {}
  for (const [id, url] of Object.entries(data.photos ?? {})) photos[id] = await dataUrlToBlob(url)
  return { snap: { ...data.snapshot, adjustments: data.snapshot.adjustments ?? [], days: data.snapshot.days ?? {} }, photos }
}

const rows = (orders: Order[]) => orders.map((o) => [
  o.date, o.number, o.brand, o.model, o.plate, o.jobs.map((j) => j.title).join('; '),
  formatScaled(o.aw100), o.hours100 == null ? '' : formatScaled(o.hours100),
  formatScaled(o.earningsKop, 2, false), ORDER_STATUS_LABEL[o.status], o.comment,
])
const HEAD = ['Дата', 'Номер заказ-наряда', 'Марка', 'Модель', 'Госномер', 'Работы', 'AW', 'Часы', 'Заработок, ₽', 'Статус', 'Комментарий']

export function exportCsv(orders: Order[]) {
  const esc = (v: string) => `"${v.replace(/"/g, '""').replace(/\u00a0/g, '')}"`
  const csv = [HEAD, ...rows(orders)].map((r) => r.map(esc).join(';')).join('\r\n')
  downloadBlob(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), 'normo-hours-orders.csv')
}

export async function exportXlsx(orders: Order[]) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Заказы')
  ws.addRow(HEAD).font = { bold: true }
  for (const o of orders) {
    ws.addRow([
      o.date, o.number, o.brand, o.model, o.plate, o.jobs.map((j) => j.title).join('; '),
      o.aw100 / 100, o.hours100 == null ? null : o.hours100 / 100, o.earningsKop / 100, ORDER_STATUS_LABEL[o.status], o.comment,
    ])
  }
  ws.columns.forEach((c, i) => { c.width = [12, 18, 12, 18, 14, 50, 8, 8, 14, 14, 30][i] })
  const buf = await wb.xlsx.writeBuffer()
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'normo-hours-orders.xlsx')
}
