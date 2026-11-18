import { useRef, useState } from 'react'
import { Download, LogOut, Plus, Trash2, Upload } from 'lucide-react'
import { Button, Card, Field, Input, Select, Textarea } from '@/components/ui'
import { Confirm } from '@/components/ui/dialog'
import { exportBackup, parseBackup } from '@/lib/backup'
import { hasLegacyData, parseClaudeExport, readLegacy } from '@/lib/legacy'
import { patternIsWork, parsePattern } from '@/lib/calc'
import { addDays, formatDate, todayStr, WEEKDAYS, weekday } from '@/lib/dates'
import { fmtMoney, formatScaled, kopToInput, parseScaled, roundDiv } from '@/lib/money'
import { uid } from '@/lib/utils'
import { DEFAULT_SETTINGS, type ScheduleType, type Settings, type Snapshot } from '@/lib/types'
import { useStore } from '@/store'

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Card className="p-4 md:p-5"><h2 className="font-bold text-lg mb-4">{title}</h2><div className="space-y-4">{children}</div></Card>
)

const SCHEDULES: { v: ScheduleType; label: string }[] = [
  { v: 'manual', label: 'Ручное назначение дней' }, { v: '5/2', label: '5/2 (пн–пт)' }, { v: '2/2', label: '2/2' },
  { v: '3/3', label: '3/3' }, { v: '4/2', label: '4/2' }, { v: 'custom', label: 'Произвольный повторяющийся' },
]

export function SettingsPage() {
  const store = useStore()
  const { settings, adjustments, saveSettings, saveAdjustment, deleteAdjustment, repo, toast, replaceAll, signOut } = store
  const [f, setF] = useState({
    salary: kopToInput(settings.monthlySalaryKop), rate: kopToInput(settings.hourRateKop), awh: formatScaled(settings.awPerHour100).replace(/\u00a0/g, ''),
    startDay: String(settings.periodStartDay), vacationPaid: settings.vacationPaid, type: settings.schedule.type,
    schedStart: settings.schedule.startDate, pattern: settings.schedule.pattern, currency: settings.currency,
    dateFormat: settings.dateFormat, theme: settings.theme, key: settings.openaiKey,
  })
  const [err, setErr] = useState<Record<string, string>>({})
  const [adj, setAdj] = useState({ date: todayStr(), title: '', amount: '', sign: 1 })
  const [confirm, setConfirm] = useState<null | { title: string; text: string; label: string; run: () => Promise<void> }>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }))

  const save = async () => {
    const e: Record<string, string> = {}
    const salary = parseScaled(f.salary), rate = parseScaled(f.rate), awh = parseScaled(f.awh), day = Number(f.startDay)
    if (salary == null || salary < 0) e.salary = 'Введите сумму ≥ 0'
    if (rate == null || rate <= 0) e.rate = 'Введите ставку > 0'
    if (awh == null || awh < 0) e.awh = 'Введите число ≥ 0 (0 — не считать часы)'
    if (!Number.isInteger(day) || day < 1 || day > 31) e.startDay = 'День от 1 до 31'
    if (f.type === 'custom' && parsePattern(f.pattern).length === 0) e.pattern = 'Используйте Р (рабочий) и В (выходной), например РРВВ'
    if (!f.schedStart) e.schedStart = 'Укажите дату начала'
    setErr(e)
    if (Object.keys(e).length) return
    const s: Settings = {
      ...settings, monthlySalaryKop: salary!, hourRateKop: rate!, awRateKop: awh! > 0 ? roundDiv(rate! * 100, awh!) : settings.awRateKop, awPerHour100: awh!, periodStartDay: day, vacationPaid: f.vacationPaid,
      schedule: { type: f.type, startDate: f.schedStart, pattern: f.pattern }, currency: f.currency.trim() || '₽',
      dateFormat: f.dateFormat, theme: f.theme, openaiKey: f.key.trim(),
    }
    try { await saveSettings(s); toast('Настройки сохранены') } catch { /* toast в store */ }
  }

  const addAdj = async () => {
    const amount = parseScaled(adj.amount)
    if (!adj.title.trim() || amount == null || amount <= 0) return toast('Укажите название и сумму > 0', 'err')
    try { await saveAdjustment({ id: uid(), date: adj.date, title: adj.title.trim(), amountKop: amount * adj.sign }); setAdj({ ...adj, title: '', amount: '' }) } catch { /* */ }
  }

  const preview = (() => {
    if (f.type === 'manual') return null
    const sch = { type: f.type, startDate: f.schedStart || todayStr(), pattern: f.pattern }
    return Array.from({ length: 14 }, (_, i) => { const d = addDays(todayStr(), i); return { d, work: patternIsWork(d, sch) } })
  })()

  const doImport = async (file: File) => {
    try {
      const { snap, photos } = await parseBackup(file)
      setConfirm({ title: 'Заменить данные из копии?', label: 'Заменить', text: `В копии заказов: ${snap.orders.length}. Все текущие данные будут заменены.`, run: async () => { await replaceAll(snap, photos); toast('Данные восстановлены') } })
    } catch (e) { toast((e as Error).message, 'err') }
  }
  const doLegacy = async () => {
    const l = await readLegacy()
    if (!l) return toast('Данных старой версии не найдено', 'err')
    setConfirm({ title: 'Импорт из старой версии?', label: 'Импортировать', text: `Заказов: ${l.snap.orders.length}, отмеченных дней: ${Object.keys(l.snap.days).length}. Текущие данные будут заменены.`, run: async () => { await replaceAll(l.snap, l.photos); toast('Данные импортированы') } })
  }
  const [claudeText, setClaudeText] = useState('')
  const doClaude = async () => {
    try {
      const r = parseClaudeExport(claudeText, settings, store.orders)
      const nDays = Object.keys(r.days).length
      if (!r.orders.length && !nDays) return toast(r.skipped ? 'Все эти записи уже есть в приложении' : 'В тексте не найдено записей', 'err')
      for (const o of r.orders) await store.saveOrder(o)
      for (const [d, st] of Object.entries(r.days)) await store.setDay(d, st)
      setClaudeText('')
      toast(`Перенесено заказов: ${r.orders.length}, дней графика: ${nDays}${r.skipped ? `, пропущено дублей: ${r.skipped}` : ''}`)
    } catch (e) { toast((e as Error).message, 'err') }
  }
  const clearAll = () => setConfirm({
    title: 'Удалить все данные?', label: 'Удалить всё', text: 'Заказы, график, корректировки и фотографии будут удалены безвозвратно. Сделайте резервную копию заранее.',
    run: async () => { const empty: Snapshot = { orders: [], days: {}, adjustments: [], settings: { ...DEFAULT_SETTINGS } }; await replaceAll(empty, {}); toast('Все данные удалены') },
  })

  return (
    <div className="space-y-5">
      <Section title="Заработная плата">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={`Месячный оклад, ${f.currency}`} error={err.salary}><Input inputMode="decimal" value={f.salary} onChange={(e) => set('salary', e.target.value)} /></Field>
          <Field label={`Ставка за нормо-час, ${f.currency}`} error={err.rate}><Input inputMode="decimal" value={f.rate} onChange={(e) => set('rate', e.target.value)} /></Field>
          <Field label="AW в одном нормо-часе" error={err.awh} hint="Например 12: 136 AW = 11,33 ч"><Input inputMode="decimal" value={f.awh} onChange={(e) => set('awh', e.target.value)} /></Field>
          <Field label="День начала расчётного периода" error={err.startDay} hint="1 — календарный месяц"><Input inputMode="numeric" value={f.startDay} onChange={(e) => set('startDay', e.target.value)} /></Field>
        </div>
        <label className="flex items-center gap-3 text-sm cursor-pointer">
          <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={f.vacationPaid} onChange={(e) => set('vacationPaid', e.target.checked)} />
          Оплачивать отпускные дни по окладу (отпуск «за свой счёт» не оплачивается никогда)
        </label>
        <div className="text-xs text-muted">Оклад за рабочий день = месячный оклад ÷ число плановых рабочих дней периода. Выходные не оплачиваются, один день не начисляется дважды.</div>

        <div className="pt-2 border-t border-line">
          <h3 className="font-semibold mb-3">Дополнительные начисления и удержания</h3>
          <div className="space-y-2 mb-3">
            {adjustments.length === 0 && <div className="text-sm text-muted">Корректировок нет</div>}
            {[...adjustments].sort((a, b) => b.date.localeCompare(a.date)).map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl bg-sec px-3 py-2 text-sm">
                <div className="min-w-0"><div className="font-medium truncate">{a.title}</div><div className="text-xs text-muted">{formatDate(a.date, settings.dateFormat)}</div></div>
                <div className={`font-bold tnum ${a.amountKop < 0 ? 'text-danger' : 'text-money'}`}>{a.amountKop > 0 ? '+' : ''}{fmtMoney(a.amountKop, settings.currency, true)}</div>
                <Button size="sm" variant="ghost" className="size-9 px-0" aria-label="Удалить корректировку" onClick={() => deleteAdjustment(a.id)}><Trash2 size={16} /></Button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-[1fr_1.4fr_1fr_auto] gap-2 items-end">
            <Field label="Дата"><Input type="date" value={adj.date} onChange={(e) => setAdj({ ...adj, date: e.target.value })} /></Field>
            <Field label="Название"><Input value={adj.title} onChange={(e) => setAdj({ ...adj, title: e.target.value })} placeholder="Премия, аванс…" /></Field>
            <Field label="Сумма"><Input inputMode="decimal" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} /></Field>
            <div className="flex gap-2 col-span-2 sm:col-span-1">
              <Select className="w-auto" value={adj.sign} onChange={(e) => setAdj({ ...adj, sign: Number(e.target.value) })} aria-label="Тип"><option value={1}>+ Начисление</option><option value={-1}>− Удержание</option></Select>
              <Button variant="primary" className="px-3" aria-label="Добавить корректировку" onClick={addAdj}><Plus size={18} /></Button>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Рабочий график">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Тип графика"><Select value={f.type} onChange={(e) => set('type', e.target.value as ScheduleType)}>{SCHEDULES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}</Select></Field>
          {f.type !== 'manual' && f.type !== '5/2' && <Field label="Дата начала графика (первый рабочий день цикла)" error={err.schedStart}><Input type="date" value={f.schedStart} onChange={(e) => set('schedStart', e.target.value)} /></Field>}
          {f.type === 'custom' && <Field label="Шаблон: Р — рабочий, В — выходной" error={err.pattern} className="sm:col-span-2"><Input value={f.pattern} onChange={(e) => set('pattern', e.target.value)} placeholder="РРВВ" /></Field>}
        </div>
        {f.type === 'manual' && <div className="text-sm text-muted">Рабочие дни назначаются вручную на вкладке «График» (нажмите на день). Плановые дни — все отмеченные рабочими, отпуском и за свой счёт.</div>}
        {f.type === '5/2' && <div className="text-sm text-muted">Рабочие дни — с понедельника по пятницу. Отдельные дни можно изменить на вкладке «График».</div>}
        {preview && (
          <div>
            <div className="text-xs font-medium text-muted mb-2">Ближайшие 14 дней (после сохранения)</div>
            <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
              {preview.map(({ d, work }) => <div key={d} className={`rounded-lg py-2 ${work ? 'bg-money/25' : 'bg-offday'}`}><div className="text-muted">{WEEKDAYS[weekday(d)]}</div><div className="font-bold">{Number(d.slice(8))}</div></div>)}
            </div>
          </div>
        )}
      </Section>

      <Section title="Приложение">
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Валюта"><Select value={f.currency} onChange={(e) => set('currency', e.target.value)}>{['₽', '$', '€', '₸', 'Br', '₴'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Формат даты"><Select value={f.dateFormat} onChange={(e) => set('dateFormat', e.target.value as Settings['dateFormat'])}><option value="dd.MM.yyyy">31.12.2026</option><option value="yyyy-MM-dd">2026-12-31</option></Select></Field>
          <Field label="Тема"><Select value={f.theme} onChange={(e) => set('theme', e.target.value as Settings['theme'])}><option value="dark">Тёмная</option><option value="light">Светлая</option></Select></Field>
        </div>
        <Field label="OpenAI API-ключ (необязательно)" hint="Для более точного распознавания фото нейросетью. Ключ хранится только на этом устройстве; без него используется локальный OCR."><Input type="password" autoComplete="off" value={f.key} onChange={(e) => set('key', e.target.value)} placeholder="sk-…" /></Field>
      </Section>

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+88px)] md:bottom-4 z-10"><Button variant="primary" size="lg" className="w-full shadow-2xl" onClick={save}>Сохранить настройки</Button></div>

      <Section title="Данные и резервные копии">
        <div className="text-sm text-muted">Хранилище: {repo.kind === 'supabase' ? 'облако Supabase (синхронизация между устройствами)' : 'на этом устройстве (IndexedDB)'}.</div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => exportBackup(repo, { orders: store.orders, days: store.days, settings: store.settings, adjustments: store.adjustments }).then(() => toast('Копия сохранена')).catch((e) => toast(e.message, 'err'))}><Download size={18} />Экспорт копии (JSON)</Button>
          <Button onClick={() => fileRef.current?.click()}><Upload size={18} />Импорт копии</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ''; if (x) doImport(x) }} />
          {hasLegacyData() && <Button onClick={doLegacy}>Импорт из старой версии</Button>}
          <Button variant="danger" onClick={clearAll}><Trash2 size={18} />Удалить все данные</Button>
        </div>
        <div className="pt-3 border-t border-line space-y-2">
          <h3 className="font-semibold">Перенос из старого приложения (Claude)</h3>
          <p className="text-xs text-muted">Попросите Claude вывести ваши записи как JSON, вставьте сюда и нажмите «Перенести». Текущие данные не удаляются, дубли пропускаются.</p>
          <Textarea rows={5} value={claudeText} onChange={(e) => setClaudeText(e.target.value)} placeholder='[{"type":"order","date":"2026-11-12", ...}]' />
          <Button disabled={!claudeText.trim()} onClick={doClaude}><Upload size={18} />Перенести</Button>
        </div>
        {signOut && <Button onClick={signOut}><LogOut size={18} />Выйти из аккаунта</Button>}
      </Section>

      <Confirm open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} title={confirm?.title ?? ''} text={confirm?.text ?? ''} confirmLabel={confirm?.label}
        onConfirm={async () => { const c = confirm; setConfirm(null); try { await c?.run() } catch (e) { toast((e as Error).message, 'err') } }} />
    </div>
  )
}
