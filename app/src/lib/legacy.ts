import { DEFAULT_SETTINGS, type DayMap, type DayStatus, type Order, type Snapshot } from './types'
import { parseScaled, roundDiv } from './money'
import { autoEarningsKop, autoHours100 } from './calc'
import { dataUrlToBlob, uid } from './utils'

// График пользователя на ноябрь 2026 (со скриншота): рабочие дни, остальные — выходные.
export const SEED_WORK_DAYS = [2, 3, 6, 7, 8, 11, 12, 16, 17, 20, 21, 22, 25, 26, 30].map((d) => '2026-11-' + String(d).padStart(2, '0'))

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
    settings.awRateKop = roundDiv(Math.round(cfg.rate * 100) * 100, settings.awPerHour100)
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
  return { orders: [], days: Object.fromEntries(SEED_WORK_DAYS.map((d) => [d, 'work' as const])), settings: { ...DEFAULT_SETTINGS }, adjustments: [] }
}
