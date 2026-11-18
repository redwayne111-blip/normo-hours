import { useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarDays, ClipboardList, History, Settings, Wrench } from 'lucide-react'
import { StoreProvider, useStore } from './store'
import { createRepository } from './lib/repo'
import { supabase, supabaseConfigured } from './lib/repo/supabase'
import { OrdersPage } from './pages/orders'
import { SchedulePage } from './pages/schedule'
import { StatsPage } from './pages/stats'
import { HistoryPage } from './pages/history'
import { SettingsPage } from './pages/settings'
import { AuthScreen } from './pages/auth'
import { cn } from './lib/utils'

const TABS = [
  { id: 'orders', label: 'Заказы', icon: ClipboardList, page: OrdersPage },
  { id: 'schedule', label: 'График', icon: CalendarDays, page: SchedulePage },
  { id: 'stats', label: 'Статистика', icon: BarChart3, page: StatsPage },
  { id: 'history', label: 'История', icon: History, page: HistoryPage },
  { id: 'settings', label: 'Настройки', icon: Settings, page: SettingsPage },
] as const

const useRoute = () => {
  const read = () => (TABS.find((t) => '#/' + t.id === location.hash)?.id ?? 'orders')
  const [id, setId] = useState<string>(read)
  useEffect(() => { const h = () => setId(read()); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h) }, [])
  return id
}

function Shell() {
  const route = useRoute()
  const { toasts } = useStore()
  const Page = TABS.find((t) => t.id === route)!.page
  useEffect(() => { window.scrollTo({ top: 0 }) }, [route])

  return (
    <div className="min-h-dvh md:pl-64">
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-64 flex-col gap-1 border-r border-line bg-sec/60 p-4">
        <div className="flex items-center gap-3 px-3 py-4 text-xl font-bold"><span className="size-10 rounded-xl bg-accent grid place-items-center text-white"><Wrench size={22} /></span>Нормо-часы</div>
        {TABS.map((t) => (
          <a key={t.id} href={'#/' + t.id} className={cn('flex items-center gap-3 rounded-xl px-4 py-3 font-semibold transition', route === t.id ? 'bg-card text-accent border border-line' : 'text-muted hover:text-fg hover:bg-card/60')}>
            <t.icon size={20} />{t.label}
          </a>
        ))}
      </aside>

      <header className="md:hidden sticky top-0 z-20 bg-card/90 backdrop-blur border-b border-line safe-t">
        <div className="flex items-center gap-3 px-4 h-14 font-bold text-lg"><Wrench size={20} className="text-accent" />{TABS.find((t) => t.id === route)!.label}</div>
      </header>
      <h1 className="hidden md:block max-w-5xl mx-auto px-8 pt-8 text-2xl font-bold">{TABS.find((t) => t.id === route)!.label}</h1>

      <main className="max-w-5xl mx-auto px-4 md:px-8 py-4 md:py-6 pb-28 md:pb-10" key={route}><div className="anim-fade"><Page /></div></main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-5 bg-card/95 backdrop-blur border-t border-line safe-b">
        {TABS.map((t) => (
          <a key={t.id} href={'#/' + t.id} className={cn('flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition', route === t.id ? 'text-accent' : 'text-muted')}>
            <t.icon size={22} />{t.label}
          </a>
        ))}
      </nav>

      <div className="fixed z-[80] inset-x-0 bottom-24 md:bottom-6 flex flex-col items-center gap-2 pointer-events-none px-4">
        {toasts.map((t) => <div key={t.id} role="status" className={cn('anim-up rounded-xl px-4 py-3 text-sm font-semibold shadow-xl border', t.kind === 'err' ? 'bg-danger text-white border-transparent' : 'bg-card text-fg border-line')}>{t.msg}</div>)}
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<{ userId: string | null } | 'loading'>(supabaseConfigured ? 'loading' : { userId: null })
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession({ userId: data.session?.user.id ?? null }))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession({ userId: s?.user.id ?? null }))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session === 'loading' ? null : session.userId
  const repo = useMemo(() => createRepository(offline ? null : userId), [userId, offline])

  if (session === 'loading') return <div className="min-h-dvh grid place-items-center text-muted">Загрузка…</div>
  if (supabaseConfigured && !userId && !offline) return <AuthScreen onLocal={() => setOffline(true)} />
  return (
    <StoreProvider key={repo.kind + (userId ?? '')} repo={repo} signOut={supabase && userId && !offline ? () => supabase!.auth.signOut() : undefined}>
      <Shell />
    </StoreProvider>
  )
}
