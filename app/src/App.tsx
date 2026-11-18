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

  const cur = TABS.find((t) => t.id === route)!
  const Logo = ({ size = 40 }: { size?: number }) => (
    <span style={{ width: size, height: size }} className="btn-primary rounded-[30%] grid place-items-center shrink-0"><Wrench size={size * 0.55} strokeWidth={2.4} /></span>
  )

  return (
    <div className="min-h-dvh md:pl-72">
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-72 flex-col gap-1.5 border-r border-line glass p-5">
        <div className="flex items-center gap-3 px-2 pt-2 pb-6">
          <Logo size={44} />
          <div><div className="text-xl font-extrabold leading-none tracking-tight">Нормо-часы</div><div className="eyebrow mt-1.5">учёт заработка</div></div>
        </div>
        {TABS.map((t) => (
          <a key={t.id} href={'#/' + t.id} aria-current={route === t.id ? 'page' : undefined}
            className={cn('group relative flex items-center gap-3 rounded-2xl px-4 py-3 font-semibold transition', route === t.id ? 'bg-accent/12 text-accent' : 'text-muted hover:text-fg hover:bg-fg/5')}>
            {route === t.id && <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-accent" />}
            <t.icon size={21} strokeWidth={route === t.id ? 2.4 : 2} />{t.label}
          </a>
        ))}
      </aside>

      <header className="md:hidden sticky top-0 z-20 glass border-b border-line safe-t">
        <div className="flex items-center gap-3 px-5 h-16">
          <Logo size={34} />
          <div className="min-w-0">
            <div className="eyebrow leading-none">Нормо-часы</div>
            <h1 className="text-[22px] font-extrabold leading-tight tracking-tight">{cur.label}</h1>
          </div>
        </div>
      </header>
      <h1 className="hidden md:block max-w-5xl mx-auto px-10 pt-10 text-4xl font-extrabold tracking-tight">{cur.label}</h1>

      <main className="max-w-5xl mx-auto px-4 md:px-10 py-5 md:py-6 pb-36 md:pb-12" key={route}><div className="anim-fade"><Page /></div></main>

      <nav className="md:hidden fixed z-30 inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+10px)] grid grid-cols-5 gap-1 rounded-[28px] glass border border-line-strong p-1.5 shadow-2xl shadow-black/40">
        {TABS.map((t) => (
          <a key={t.id} href={'#/' + t.id} aria-current={route === t.id ? 'page' : undefined}
            className={cn('flex flex-col items-center gap-0.5 rounded-[22px] py-2 text-[10.5px] font-semibold transition-all duration-200', route === t.id ? 'bg-accent/15 text-accent' : 'text-muted active:scale-95')}>
            <t.icon size={22} strokeWidth={route === t.id ? 2.5 : 1.9} />{t.label}
          </a>
        ))}
      </nav>

      <div className="fixed z-[80] inset-x-0 bottom-32 md:bottom-8 flex flex-col items-center gap-2 pointer-events-none px-4">
        {toasts.map((t) => <div key={t.id} role="status" className={cn('anim-up rounded-2xl px-5 py-3 text-sm font-semibold shadow-2xl border glass', t.kind === 'err' ? 'bg-danger text-white border-transparent' : 'border-line-strong')}>{t.msg}</div>)}
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
