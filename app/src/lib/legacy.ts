import { DEFAULT_SETTINGS, type DayMap, type DayStatus, type Order, type Settings, type Snapshot } from './types'
import { parseScaled, roundDiv } from './money'
import { autoEarningsKop, autoHours100 } from './calc'
import { dataUrlToBlob, uid } from './utils'

// График пользователя на ноябрь 2026 (со скриншота): рабочие дни, остальные — выходные.

interface LegacyOrder { date: string; num?: string; car?: string; txt?: string; aw?: number | string; photo?: string | null }

export function hasLegacyData(): boolean {
  try { return Boolean(localStorage.getItem('orders') || localStorage.getItem('work') || localStorage.getItem('cfg')) } catch { return false }
}

/** Импорт данных первой (однофайловой) версии приложения из localStorage того же адреса. */
export async function readLegacy(): Promise<{ snap: Snapshot; photos: Record<string, Blob> } | null> {
  if (!hasLegacyData()) return null
  const get = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d } catch { return d } }
  const old = get<LegacyOrder[]>('orders', [])
  const work = get<Record<string, string | boolean>>('work', {})
  const cfg = get<{ awh?: number; rate?: number }>('cfg', {})
  const settings = { ...DEFAULT_SETTINGS }
  if (cfg.awh && cfg.rate) {
    settings.awPerHour100 = Math.round(cfg.awh * 100)
    settings.hourRateKop = Math.round(cfg.rate * 100)
    settings.awRateKop = roundDiv(settings.hourRateKop * 100, settings.awPerHour100)
  }
  const now = new Date().toISOString()
  const photos: Record<string, Blob> = {}
  const orders: Order[] = []
  for (const o of old) {
    const aw100 = parseScaled(String(o.aw ?? 0)) ?? 0
    const [carMain = '', ...rest] = (o.car ?? '').split(',')
    const [brand = '', ...model] = carMain.trim().split(/\s+/)
    let photoId: string | null = null
    if (o.photo) { photoId = uid(); photos[photoId] = await dataUrlToBlob(o.photo) }
    orders.push({
      id: uid(), number: o.num ?? '', brand, model: model.join(' '), plate: rest.join(',').trim(), date: o.date,
      jobs: (o.txt ?? '').split(/\n/).map((t) => t.trim()).filter(Boolean).map((title) => ({ id: uid(), title })),
      aw100, hours100: autoHours100(aw100, settings), earningsKop: autoEarningsKop(aw100, settings),
      comment: '', status: 'confirmed', photoId, createdAt: now, updatedAt: now,
    })
  }
  const map: Record<string, DayStatus> = { w: 'work', v: 'vacation', u: 'unpaid' }
  const days: DayMap = {}
  for (const [d, v] of Object.entries(work)) {
    const st = v === true ? 'work' : typeof v === 'string' ? map[v] : undefined
    if (st) days[d] = st
  }
  return { snap: { orders, days, settings, adjustments: [] }, photos }
}

export function firstRunSnapshot(): Snapshot {
  return { orders: [], days: {}, settings: { ...DEFAULT_SETTINGS }, adjustments: [] }
}

export interface ClaudeImport { orders: Order[]; days: DayMap; skipped: number }

/** Импорт записей первой версии из Claude: JSON с документами type = order / schedule (массив или объект с полем docs/data). */
export function parseClaudeExport(text: string, settings: Settings, existing: Order[]): ClaudeImport {
  const a = text.indexOf('['), b = text.indexOf('{')
  const start = a >= 0 && (b < 0 || a < b) ? a : b
  const end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'))
  let data: unknown
  try { data = JSON.parse(text.slice(start, end + 1)) } catch { throw new Error('Не удалось прочитать данные: вставьте JSON целиком') }
  const docs: Record<string, unknown>[] = []
  const walk = (x: unknown) => {
    if (Array.isArray(x)) return x.forEach(walk)
    if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>
      if (o.type === 'order' || o.type === 'schedule') docs.push(o)
      else Object.values(o).forEach(walk)
    }
  }
  walk(data)
  const now = new Date().toISOString()
  const seen = new Set(existing.filter((o) => o.number).map((o) => o.number + '|' + o.date))
  const orders: Order[] = []
  const days: DayMap = {}
  let skipped = 0
  for (const d of docs) {
    if (d.type === 'schedule') {
      const month = String(d.month ?? '')
      for (const [dd, s] of Object.entries((d.days ?? {}) as Record<string, string>)) {
        if (/^\d{4}-\d{2}$/.test(month) && ['work', 'off', 'vacation', 'unpaid'].includes(s)) days[`${month}-${dd.padStart(2, '0')}`] = s as DayStatus
      }
      continue
    }
    const date = String(d.date ?? '')
    const number = String(d.orderNo ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (number && seen.has(number + '|' + date))) { skipped++; continue }
    if (number) seen.add(number + '|' + date)
    const works = ((d.works ?? []) as { desc?: string; aw?: number; mine?: boolean }[]).filter((w) => w.mine !== false)
    const jobs = works.map((w) => ({ id: uid(), title: String(w.desc ?? '').trim(), aw100: Math.round((Number(w.aw) || 0) * 100) })).filter((j) => j.title || j.aw100)
    const aw100 = jobs.length ? jobs.reduce((s, j) => s + (j.aw100 ?? 0), 0) : Math.round((Number(d.aw) || 0) * 100)
    const [carMain = '', ...rest] = String(d.car ?? '').split(',')
    const [brand = '', ...model] = carMain.trim().split(/\s+/)
    const created = typeof d.createdAt === 'number' ? new Date(d.createdAt).toISOString() : now
    orders.push({
      id: uid(), number, brand, model: model.join(' '), plate: rest.join(',').trim(), date, jobs, aw100,
      hours100: autoHours100(aw100, settings), earningsKop: autoEarningsKop(aw100, settings),
      comment: '', status: 'confirmed', photoId: null, createdAt: created, updatedAt: now,
    })
  }
  return { orders, days, skipped }
}
