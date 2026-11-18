import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_SETTINGS, type Adjustment, type Job, type DayStatus, type Order, type Settings, type Snapshot } from '../types'
import type { Repository } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const supabaseConfigured = Boolean(url && key)
export const supabase: SupabaseClient | null = supabaseConfigured ? createClient(url!, key!) : null

const toInt = (v: unknown) => Math.round(Number(v) * 100)
const toDec = (n: number) => n / 100 // граница с numeric(…,2): ровно 2 знака, потерь нет

function fail<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

/** Реализация Repository поверх Supabase. Схема — supabase/schema.sql. */
export class SupabaseRepository implements Repository {
  readonly kind = 'supabase' as const
  constructor(private sb: SupabaseClient, private userId: string) {}

  async loadAll(): Promise<Snapshot> {
    const [orders, jobs, days, settings, adj] = await Promise.all([
      this.sb.from('orders').select('*'),
      this.sb.from('order_jobs').select('*').order('position'),
      this.sb.from('work_schedule').select('*'),
      this.sb.from('salary_settings').select('value').maybeSingle(),
      this.sb.from('salary_adjustments').select('*'),
    ])
    const jobRows = fail(jobs) as { id: string; order_id: string; title: string; aw: string | number | null }[]
    const byOrder = new Map<string, Job[]>()
    for (const j of jobRows) byOrder.set(j.order_id, [...(byOrder.get(j.order_id) ?? []), { id: j.id, title: j.title, aw100: j.aw == null ? undefined : toInt(j.aw) }])
    return {
      orders: (fail(orders) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string, number: r.number as string, brand: r.brand as string, model: r.model as string,
        plate: r.plate as string, date: r.date as string, jobs: byOrder.get(r.id as string) ?? [],
        aw100: toInt(r.aw), hours100: r.hours == null ? null : toInt(r.hours), earningsKop: toInt(r.earnings),
        comment: r.comment as string, status: r.status as Order['status'], photoId: (r.photo_id as string) ?? null,
        createdAt: r.created_at as string, updatedAt: r.updated_at as string,
      })),
      days: Object.fromEntries((fail(days) as { date: string; status: DayStatus }[]).map((d) => [d.date, d.status])),
      settings: { ...DEFAULT_SETTINGS, ...((fail(settings) as { value: Settings } | null)?.value ?? {}) },
      adjustments: (fail(adj) as { id: string; date: string; title: string; amount: number }[])
        .map((a) => ({ id: a.id, date: a.date, title: a.title, amountKop: toInt(a.amount) })),
    }
  }

  async saveOrder(o: Order) {
    fail(await this.sb.from('orders').upsert({
      id: o.id, user_id: this.userId, number: o.number, brand: o.brand, model: o.model, plate: o.plate, date: o.date,
      aw: toDec(o.aw100), hours: o.hours100 == null ? null : toDec(o.hours100), earnings: toDec(o.earningsKop),
      comment: o.comment, status: o.status, photo_id: o.photoId, created_at: o.createdAt, updated_at: o.updatedAt,
    }))
    fail(await this.sb.from('order_jobs').delete().eq('order_id', o.id))
    if (o.jobs.length) {
      fail(await this.sb.from('order_jobs').insert(
        o.jobs.map((j, i) => ({ id: j.id, user_id: this.userId, order_id: o.id, title: j.title, aw: j.aw100 == null ? null : toDec(j.aw100), position: i }))))
    }
  }
  async deleteOrder(id: string) {
    const o = fail(await this.sb.from('orders').select('photo_id').eq('id', id).maybeSingle()) as { photo_id: string | null } | null
    if (o?.photo_id) await this.deletePhoto(o.photo_id)
    fail(await this.sb.from('orders').delete().eq('id', id))
  }
  async setDay(date: string, status: DayStatus | null) {
    if (status) fail(await this.sb.from('work_schedule').upsert({ user_id: this.userId, date, status }))
    else fail(await this.sb.from('work_schedule').delete().eq('date', date))
  }
  async saveSettings(s: Settings) {
    fail(await this.sb.from('salary_settings').upsert({ user_id: this.userId, value: s, updated_at: new Date().toISOString() }))
  }
  async saveAdjustment(a: Adjustment) {
    fail(await this.sb.from('salary_adjustments').upsert({ id: a.id, user_id: this.userId, date: a.date, title: a.title, amount: toDec(a.amountKop) }))
  }
  async deleteAdjustment(id: string) { fail(await this.sb.from('salary_adjustments').delete().eq('id', id)) }

  private path(id: string) { return `${this.userId}/${id}.jpg` }
  async savePhoto(id: string, blob: Blob) {
    fail(await this.sb.storage.from('attachments').upload(this.path(id), blob, { upsert: true, contentType: blob.type || 'image/jpeg' }))
    fail(await this.sb.from('attachments').upsert({ id, user_id: this.userId, path: this.path(id) }))
  }
  async getPhoto(id: string) {
    const { data, error } = await this.sb.storage.from('attachments').download(this.path(id))
    return error ? null : data
  }
  async deletePhoto(id: string) {
    await this.sb.storage.from('attachments').remove([this.path(id)])
    await this.sb.from('attachments').delete().eq('id', id)
  }
  async replaceAll(snap: Snapshot, photos: Record<string, Blob>) {
    const old = await this.loadAll()
    for (const o of old.orders) await this.deleteOrder(o.id)
    for (const a of old.adjustments) await this.deleteAdjustment(a.id)
    for (const d of Object.keys(old.days)) await this.setDay(d, null)
    for (const [id, b] of Object.entries(photos)) await this.savePhoto(id, b)
    for (const o of snap.orders) await this.saveOrder(o)
    for (const a of snap.adjustments) await this.saveAdjustment(a)
    for (const [d, s] of Object.entries(snap.days)) await this.setDay(d, s)
    await this.saveSettings(snap.settings)
  }
}
