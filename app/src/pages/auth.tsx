import { useState } from 'react'
import { Wrench } from 'lucide-react'
import { Button, Card, Field, Input } from '@/components/ui'
import { supabase } from '@/lib/repo/supabase'

export function AuthScreen({ onLocal }: { onLocal: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMsg({ text: 'Введите корректный email', err: true })
    if (password.length < 6) return setMsg({ text: 'Пароль — не короче 6 символов', err: true })
    setBusy(true); setMsg(null)
    const { data, error } = mode === 'in' ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (error) setMsg({ text: error.message, err: true })
    else if (mode === 'up' && !data.session) setMsg({ text: 'Мы отправили письмо для подтверждения. Подтвердите email и войдите.', err: false })
  }

  return (
    <div className="min-h-dvh grid place-items-center p-4">
      <Card className="w-full max-w-sm p-6 anim-pop">
        <div className="flex items-center gap-3 text-xl font-bold mb-6"><span className="size-10 rounded-[30%] btn-primary grid place-items-center"><Wrench size={22} /></span>Нормо-часы</div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email"><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Пароль"><Input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {msg && <div className={msg.err ? 'text-sm text-danger' : 'text-sm text-money'}>{msg.text}</div>}
          <Button type="submit" variant="primary" className="w-full" disabled={busy}>{mode === 'in' ? 'Войти' : 'Зарегистрироваться'}</Button>
        </form>
        <button className="w-full text-sm text-muted mt-4" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}</button>
        <button className="w-full text-sm text-accent mt-2" onClick={onLocal}>Продолжить без входа (данные только на этом устройстве)</button>
      </Card>
    </div>
  )
}
