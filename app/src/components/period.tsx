import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, Input, Segmented } from './ui'
import { addDays, MONTHS, MONTHS_GEN, parts, periodOf, startOfWeek, todayStr, type Range } from '@/lib/dates'
import { useStore } from '@/store'

export type PeriodMode = 'day' | 'week' | 'month' | 'custom'

export function usePeriod(initial: PeriodMode = 'month') {
  const { settings } = useStore()
  const [mode, setMode] = useState<PeriodMode>(initial)
  const [anchor, setAnchor] = useState(todayStr())
  const [custom, setCustom] = useState<Range>({ from: addDays(todayStr(), -29), to: todayStr() })

  const range = useMemo<Range>(() => {
    if (mode === 'day') return { from: anchor, to: anchor }
    if (mode === 'week') { const f = startOfWeek(anchor); return { from: f, to: addDays(f, 6) } }
    if (mode === 'month') return periodOf(anchor, settings.periodStartDay)
    return custom.from <= custom.to ? custom : { from: custom.to, to: custom.from }
  }, [mode, anchor, custom, settings.periodStartDay])

  const shift = (dir: 1 | -1) => {
    if (mode === 'day') setAnchor(addDays(anchor, dir))
    else if (mode === 'week') setAnchor(addDays(anchor, 7 * dir))
    else if (mode === 'month') setAnchor(dir > 0 ? addDays(range.to, 1) : addDays(range.from, -1))
  }

  const label = (() => {
    const f = parts(range.from), t = parts(range.to)
    if (mode === 'day') return range.from === todayStr() ? 'Сегодня' : `${f.d} ${MONTHS_GEN[f.m]} ${f.y}`
    if (mode === 'week') return `${f.d} ${f.m !== t.m ? MONTHS_GEN[f.m] + ' ' : ''}– ${t.d} ${MONTHS_GEN[t.m]}`
    if (mode === 'month') {
      if (settings.periodStartDay === 1) return `${MONTHS[f.m]} ${f.y}`
      return `${f.d} ${MONTHS_GEN[f.m].slice(0, 3)} – ${t.d} ${MONTHS_GEN[t.m].slice(0, 3)} ${t.y}`
    }
    return 'Период'
  })()

  return { mode, setMode, range, label, shift, custom, setCustom, setAnchor, anchor }
}

export function PeriodBar({ p }: { p: ReturnType<typeof usePeriod> }) {
  return (
    <div>
      <Segmented value={p.mode} onChange={p.setMode} options={[
        { value: 'day', label: 'День' }, { value: 'week', label: 'Неделя' }, { value: 'month', label: 'Месяц' }, { value: 'custom', label: 'Период' },
      ]} />
      {p.mode === 'custom' ? (
        <div className="grid grid-cols-2 gap-3 mt-4">
          <Input type="date" aria-label="С" value={p.custom.from} onChange={(e) => e.target.value && p.setCustom({ ...p.custom, from: e.target.value })} />
          <Input type="date" aria-label="По" value={p.custom.to} onChange={(e) => e.target.value && p.setCustom({ ...p.custom, to: e.target.value })} />
        </div>
      ) : (
        <div className="flex items-center justify-between mt-3">
          <Button variant="ghost" className="size-11 px-0" aria-label="Назад" onClick={() => p.shift(-1)}><ChevronLeft /></Button>
          <button className="font-bold text-lg px-3" onClick={() => p.setAnchor(todayStr())} title="Перейти к текущему">{p.label}</button>
          <Button variant="ghost" className="size-11 px-0" aria-label="Вперёд" onClick={() => p.shift(1)}><ChevronRight /></Button>
        </div>
      )}
    </div>
  )
}
