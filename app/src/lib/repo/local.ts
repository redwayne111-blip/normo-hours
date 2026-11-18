import Dexie, { type Table } from 'dexie'
import { DEFAULT_SETTINGS, type Adjustment, type DayStatus, type Order, type Settings, type Snapshot } from '../types'
import type { Repository } from './types'

interface DayRow { date: string; status: DayStatus }
interface SettingsRow { id: 'main'; value: Settings }
interface PhotoRow { id: string; blob: Blob }

class NormoDB extends Dexie {
  orders!: Table<Order, string>
  days!: Table<DayRow, string>
  settings!: Table<SettingsRow, string>
  adjustments!: Table<Adjustment, string>
  photos!: Table<PhotoRow, string>
  constructor() {
    super('normo-hours')
    this.version(1).stores({
      orders: 'id, date, status',
      days: 'date',
      settings: 'id',
      adjustments: 'id, date',
      photos: 'id',
    })
  }
}

export class LocalRepository implements Repository {
  readonly kind = 'local' as const
  private db = new NormoDB()

  async loadAll(): Promise<Snapshot> {
    const [orders, dayRows, set, adjustments] = await Promise.all([
      this.db.orders.toArray(), this.db.days.toArray(), this.db.settings.get('main'), this.db.adjustments.toArray(),
    ])
    return {
      orders,
      days: Object.fromEntries(dayRows.map((r) => [r.date, r.status])),
      settings: { ...DEFAULT_SETTINGS, ...(set?.value ?? {}), schedule: { ...DEFAULT_SETTINGS.schedule, ...(set?.value.schedule ?? {}) } },
      adjustments,
    }
  }
  async saveOrder(o: Order) { await this.db.orders.put(o) }
  async deleteOrder(id: string) {
    const o = await this.db.orders.get(id)
    await this.db.transaction('rw', this.db.orders, this.db.photos, async () => {
      await this.db.orders.delete(id)
      if (o?.photoId) await this.db.photos.delete(o.photoId)
    })
  }
  async setDay(date: string, status: DayStatus | null) {
    if (status) await this.db.days.put({ date, status })
    else await this.db.days.delete(date)
  }
  async saveSettings(s: Settings) { await this.db.settings.put({ id: 'main', value: s }) }
  async saveAdjustment(a: Adjustment) { await this.db.adjustments.put(a) }
  async deleteAdjustment(id: string) { await this.db.adjustments.delete(id) }
  async savePhoto(id: string, blob: Blob) { await this.db.photos.put({ id, blob }) }
  async getPhoto(id: string) { return (await this.db.photos.get(id))?.blob ?? null }
  async deletePhoto(id: string) { await this.db.photos.delete(id) }
  async replaceAll(snap: Snapshot, photos: Record<string, Blob>) {
    await this.db.transaction('rw', [this.db.orders, this.db.days, this.db.settings, this.db.adjustments, this.db.photos], async () => {
      await Promise.all([this.db.orders.clear(), this.db.days.clear(), this.db.adjustments.clear(), this.db.photos.clear()])
      await this.db.orders.bulkPut(snap.orders)
      await this.db.days.bulkPut(Object.entries(snap.days).map(([date, status]) => ({ date, status })))
      await this.db.settings.put({ id: 'main', value: snap.settings })
      await this.db.adjustments.bulkPut(snap.adjustments)
      await this.db.photos.bulkPut(Object.entries(photos).map(([id, blob]) => ({ id, blob })))
    })
  }
}
