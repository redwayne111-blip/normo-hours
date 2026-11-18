import { useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'
import { Card, Empty } from '@/components/ui'
import { PeriodBar, usePeriod } from '@/components/period'
import { confirmed, summarize } from '@/lib/calc'
import { addDays, eachDay, formatDate, formatDayLong, MONTHS, parts, periodOf, startOfWeek, type Range } from '@/lib/dates'
import { fmtAW, fmtHours, fmtMoney, roundDiv } from '@/lib/money'
import { useStore } from '@/store'

const rub = (kop: number) => roundDiv(kop, 100)
const tip = { contentStyle: { background: 'var(--elev)', border: '1px solid var(--line-strong)', borderRadius: 14, color: 'var(--fg)', boxShadow: '0 12px 32px -8px rgba(0,0,0,.5)' }, labelStyle: { color: 'var(--muted)', fontWeight: 600 }, cursor: { fill: 'var(--line)' } }
const legend = { iconType: 'circle' as const, iconSize: 8, formatter: (v: string) => <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 600 }}>{v}</span> }
const axis = { stroke: 'var(--muted)', fontSize: 12, tickLine: false, axisLine: false } as const

function Kpi({ label, value, sub, tone, wide }: { wide?: boolean; label: string; value: string; sub?: string; tone?: 'money' | 'accent' }) {
  return (
    <Card className={`p-4 ${wide ? 'col-span-2 lg:col-span-1' : ''} ${tone === 'money' ? 'col-span-2 !border-money/30 bg-gradient-to-br from-money/15 to-transparent' : tone === 'accent' ? '!border-accent/30 bg-gradient-to-br from-accent/15 to-transparent' : ''}`}>
      <div className="eyebrow !normal-case !tracking-normal !text-xs !font-semibold">{label}</div>
      <div className={`num-display mt-2 ${tone === 'money' ? 'text-4xl text-grad-money' : 'text-2xl'} ${tone === 'accent' ? 'text-accent' : ''}`}>{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5 truncate">{sub}</div>}
    </Card>
  )
}
const ChartCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Card className="p-4"><h3 className="font-extrabold tracking-tight mb-3">{title}</h3><div className="h-64">{children}</div></Card>
)

export function StatsPage() {
  const { orders, days, settings, adjustments } = useStore()
  const p = usePeriod('month')
  const cur = settings.currency
  const sum = useMemo(() => summarize(p.range, orders, days, settings, adjustments), [p.range, orders, days, settings, adjustments])

  const daily = useMemo(() => {
    const ds = eachDay(p.range.from, p.range.to).slice(0, 400)
    return ds.map((d) => {
      const s = summarize({ from: d, to: d }, orders, days, settings, adjustments)
      return { date: d, label: String(parts(d).d), salary: rub(s.salaryKop), norm: rub(s.normKop), total: s.totalKop, aw: s.aw100 / 100 }
    })
  }, [p.range, orders, days, settings, adjustments])

  const weekly = useMemo(() => {
    const m = new Map<string, { salary: number; norm: number }>()
    for (const d of daily) {
      const w = startOfWeek(d.date)
      const e = m.get(w) ?? { salary: 0, norm: 0 }
      e.salary += d.salary; e.norm += d.norm; m.set(w, e)
    }
    return [...m.entries()].map(([w, v]) => ({ label: `${parts(w).d}.${String(parts(w).m + 1).padStart(2, '0')}`, ...v }))
  }, [daily])

  const months = useMemo(() => {
    const out: { label: string; salary: number; norm: number }[] = []
    let r: Range = periodOf(p.range.from, settings.periodStartDay)
    for (let i = 0; i < 6; i++) {
      const s = summarize(r, orders, days, settings, adjustments)
      out.unshift({ label: MONTHS[parts(r.from).m].slice(0, 3), salary: rub(s.salaryKop), norm: rub(s.normKop) })
      r = periodOf(addDays(r.from, -1), settings.periodStartDay)
    }
    return out
  }, [p.range.from, orders, days, settings, adjustments])

  const ok = confirmed(orders).filter((o) => o.date >= p.range.from && o.date <= p.range.to)
  const bestOrder = ok.reduce<(typeof ok)[number] | null>((b, o) => (!b || o.earningsKop > b.earningsKop ? o : b), null)
  const bestDay = daily.reduce<(typeof daily)[number] | null>((b, d) => (!b || d.total > b.total ? d : b), null)
  const workDays = sum.days.work
  const hasData = sum.orderCount > 0 || sum.salaryKop > 0
  const pie = [{ name: 'Оклад', value: rub(sum.salaryKop), c: 'var(--cool)' }, { name: 'Нормо-часы', value: rub(sum.normKop), c: 'var(--money)' }].filter((x) => x.value > 0)

  return (
    <div className="space-y-5">
      <Card className="p-4 md:p-5"><PeriodBar p={p} /></Card>
      {!hasData ? (
        <Empty icon={<BarChart3 />} title="Нет данных за период" text="Добавьте заказы и отметьте рабочие дни — статистика появится здесь." />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Общий заработок" value={fmtMoney(sum.totalKop, cur)} tone="money" />
            <Kpi label="По нормо-часам (AW)" value={fmtMoney(sum.normKop, cur)} />
            <Kpi label="Фиксированный оклад" value={fmtMoney(sum.salaryKop, cur)} />
            <Kpi label="Выполнено заказов" value={String(sum.orderCount)} />
            <Kpi label="Всего AW" value={fmtAW(sum.aw100)} tone="accent" />
            <Kpi label="Нормо-часы" value={fmtHours(sum.hours100)} />
            <Kpi label="Средний заработок за рабочий день" value={workDays ? fmtMoney(roundDiv(sum.totalKop, workDays), cur) : '—'} />
            <Kpi label="Среднее AW за рабочий день" value={workDays ? fmtAW(roundDiv(sum.aw100, workDays)) : '—'} />
            <Kpi label="Самый прибыльный день" value={bestDay && bestDay.total > 0 ? fmtMoney(bestDay.total, cur) : '—'} sub={bestDay && bestDay.total > 0 ? formatDayLong(bestDay.date) : undefined} />
            <Kpi wide label="Самый прибыльный заказ" value={bestOrder ? fmtMoney(bestOrder.earningsKop, cur) : '—'}
              sub={bestOrder ? `${[bestOrder.brand, bestOrder.model].join(' ')} · ${formatDate(bestOrder.date, settings.dateFormat)}` : undefined} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Заработок по дням">
              <ResponsiveContainer><BarChart data={daily}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="label" {...axis} interval="preserveStartEnd" /><YAxis {...axis} width={44} />
                <Tooltip {...tip} formatter={(v) => `${Number(v).toLocaleString('ru-RU')} ${cur}`} labelFormatter={(_, pl) => (pl?.[0] ? formatDayLong(pl[0].payload.date) : '')} />
                <Legend {...legend} /><Bar dataKey="salary" name="Оклад" stackId="a" fill="var(--cool)" /><Bar dataKey="norm" name="Нормо-часы" stackId="a" fill="var(--money)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Заработок по неделям">
              <ResponsiveContainer><BarChart data={weekly}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="label" {...axis} /><YAxis {...axis} width={44} />
                <Tooltip {...tip} formatter={(v) => `${Number(v).toLocaleString('ru-RU')} ${cur}`} labelFormatter={(l) => `Неделя с ${l}`} />
                <Legend {...legend} /><Bar dataKey="salary" name="Оклад" stackId="a" fill="var(--cool)" /><Bar dataKey="norm" name="Нормо-часы" stackId="a" fill="var(--money)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Динамика AW">
              <ResponsiveContainer><LineChart data={daily}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="label" {...axis} interval="preserveStartEnd" /><YAxis {...axis} width={36} />
                <Tooltip {...tip} formatter={(v) => `${v} AW`} labelFormatter={(_, pl) => (pl?.[0] ? formatDayLong(pl[0].payload.date) : '')} />
                <Line type="monotone" dataKey="aw" name="AW" stroke="var(--accent)" strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Сравнение месяцев">
              <ResponsiveContainer><BarChart data={months}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="label" {...axis} /><YAxis {...axis} width={44} />
                <Tooltip {...tip} formatter={(v) => `${Number(v).toLocaleString('ru-RU')} ${cur}`} />
                <Legend {...legend} /><Bar dataKey="salary" name="Оклад" stackId="a" fill="var(--cool)" /><Bar dataKey="norm" name="Нормо-часы" stackId="a" fill="var(--money)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Оклад и нормо-часы">
              <ResponsiveContainer><PieChart><Pie data={pie} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={3} stroke="none"
                label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}>{pie.map((x) => <Cell key={x.name} fill={x.c} />)}</Pie>
                <Tooltip {...tip} formatter={(v) => `${Number(v).toLocaleString('ru-RU')} ${cur}`} /></PieChart></ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  )
}
