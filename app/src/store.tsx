import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Adjustment, DayStatus, Order, Settings, Snapshot } from './lib/types'
import type { Repository } from './lib/repo'
import { firstRunSnapshot, readLegacy } from './lib/legacy'

export interface Toast { id: number; msg: string; kind: 'ok' | 'err' }

interface Store extends Snapshot {
  repo: Repository
  saveOrder(o: Order, photo?: Blob | null): Promise<void>
  deleteOrder(id: string): Promise<void>
  setDay(date: string, status: DayStatus | null): Promise<void>
  saveSettings(s: Settings): Promise<void>
  saveAdjustment(a: Adjustment): Promise<void>
  deleteAdjustment(id: string): Promise<void>
  replaceAll(snap: Snapshot, photos: Record<string, Blob>): Promise<void>
  reload(): Promise<void>
  toasts: Toast[]
  toast(msg: string, kind?: Toast['kind']): void
  signOut?: () => void
}

const Ctx = createContext<Store | null>(null)
export const useStore = () => { const s = useContext(Ctx); if (!s) throw new Error('Store not ready'); return s }

export function StoreProvider({ repo, signOut, children }: { repo: Repository; signOut?: () => void; children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const tid = useRef(0)

  const toast = useCallback((msg: string, kind: Toast['kind'] = 'ok') => {
    const id = ++tid.current
    setToasts((t) => [...t, { id, msg, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])

  const reload = useCallback(async () => { setSnap(await repo.loadAll()) }, [repo])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (repo.kind === 'local' && !localStorage.getItem('normo-initialized')) {
          const cur = await repo.loadAll()
          if (!cur.orders.length && !Object.keys(cur.days).length) {
            const legacy = await readLegacy()
            if (legacy) await repo.replaceAll(legacy.snap, legacy.photos)
            else await repo.replaceAll(firstRunSnapshot(), {})
          }
          localStorage.setItem('normo-initialized', '1')
        }
        const data = await repo.loadAll()
        if (!cancelled) setSnap(data)
        navigator.storage?.persist?.().catch(() => {})
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    })()
    return () => { cancelled = true }
  }, [repo])

  useEffect(() => {
    if (!snap) return
    document.documentElement.classList.toggle('dark', snap.settings.theme === 'dark')
    document.documentElement.classList.toggle('light', snap.settings.theme === 'light')
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', snap.settings.theme === 'dark' ? '#000000' : '#f2f2f7')
  }, [snap?.settings.theme])

  // Обёртка: сначала пишем в хранилище, при ошибке — сообщение и перечитывание данных.
  const run = useCallback(async (fn: () => Promise<void>, apply: (s: Snapshot) => Snapshot) => {
    try { await fn(); setSnap((s) => (s ? apply(s) : s)) }
    catch (e) { toast('Не удалось сохранить: ' + (e as Error).message, 'err'); await reload(); throw e }
  }, [reload, toast])

  const store = useMemo<Store | null>(() => {
    if (!snap) return null
    return {
      ...snap, repo, toasts, toast, reload, signOut,
      saveOrder: async (o, photo) => {
        const prev = snap.orders.find((x) => x.id === o.id)
        await run(async () => {
          if (photo && o.photoId) await repo.savePhoto(o.photoId, photo)
          await repo.saveOrder(o)
          if (prev?.photoId && prev.photoId !== o.photoId) await repo.deletePhoto(prev.photoId)
        }, (s) => ({ ...s, orders: s.orders.some((x) => x.id === o.id) ? s.orders.map((x) => (x.id === o.id ? o : x)) : [...s.orders, o] }))
      },
      deleteOrder: (id) => run(() => repo.deleteOrder(id), (s) => ({ ...s, orders: s.orders.filter((o) => o.id !== id) })),
      setDay: (date, status) => run(() => repo.setDay(date, status), (s) => {
        const days = { ...s.days }
        if (status) days[date] = status; else delete days[date]
        return { ...s, days }
      }),
      saveSettings: (settings) => run(() => repo.saveSettings(settings), (s) => ({ ...s, settings })),
      saveAdjustment: (a) => run(() => repo.saveAdjustment(a), (s) => ({
        ...s, adjustments: s.adjustments.some((x) => x.id === a.id) ? s.adjustments.map((x) => (x.id === a.id ? a : x)) : [...s.adjustments, a],
      })),
      deleteAdjustment: (id) => run(() => repo.deleteAdjustment(id), (s) => ({ ...s, adjustments: s.adjustments.filter((a) => a.id !== id) })),
      replaceAll: async (data, photos) => { await repo.replaceAll(data, photos); await reload() },
    }
  }, [snap, repo, toasts, toast, reload, run, signOut])

  if (error) return <div className="p-6 text-red-400">Ошибка загрузки данных: {error}</div>
  if (!store) return <div className="min-h-screen grid place-items-center text-muted">Загрузка…</div>
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}
