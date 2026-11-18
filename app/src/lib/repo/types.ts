import type { Adjustment, DayStatus, Order, Settings, Snapshot } from '../types'

/** Единый интерфейс хранилища: локальная IndexedDB или Supabase. UI знает только о нём. */
export interface Repository {
  readonly kind: 'local' | 'supabase'
  loadAll(): Promise<Snapshot>
  saveOrder(o: Order): Promise<void>
  deleteOrder(id: string): Promise<void>
  setDay(date: string, status: DayStatus | null): Promise<void>
  saveSettings(s: Settings): Promise<void>
  saveAdjustment(a: Adjustment): Promise<void>
  deleteAdjustment(id: string): Promise<void>
  savePhoto(id: string, blob: Blob): Promise<void>
  getPhoto(id: string): Promise<Blob | null>
  deletePhoto(id: string): Promise<void>
  /** Полная замена данных (импорт резервной копии). */
  replaceAll(snap: Snapshot, photos: Record<string, Blob>): Promise<void>
}
