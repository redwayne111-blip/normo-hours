// Деньги — целые копейки, AW — целые сотые (136,50 AW = 13650), часы — сотые часа.
export type DayStatus = 'work' | 'off' | 'vacation' | 'unpaid'
export type OrderStatus = 'confirmed' | 'draft' | 'cancelled'
export type ScheduleType = '5/2' | '2/2' | '3/3' | '4/2' | 'custom' | 'manual'

export interface Job { id: string; title: string; aw100?: number }

export interface Order {
  id: string
  number: string
  brand: string
  model: string
  plate: string
  date: string // YYYY-MM-DD
  jobs: Job[]
  aw100: number
  hours100: number | null
  earningsKop: number
  comment: string
  status: OrderStatus
  photoId: string | null
  createdAt: string
  updatedAt: string
}

export interface Adjustment {
  id: string
  date: string
  title: string
  amountKop: number // >0 начисление, <0 удержание
}

export interface ScheduleSettings {
  type: ScheduleType
  startDate: string
  pattern: string // для custom: Р — рабочий, В — выходной
}

export interface Settings {
  monthlySalaryKop: number
  awRateKop: number // стоимость AW (справочно: ставка часа / AW в часе)
  hourRateKop: number // ставка за нормо-час; заработок = AW × ставка / AW в часе
  schemaV: number
  awPerHour100: number // сколько AW в одном нормо-часе (×100)
  periodStartDay: number // день начала расчётного периода, 1 = календарный месяц
  vacationPaid: boolean // оплачивать отпуск по окладу
  schedule: ScheduleSettings
  currency: string
  dateFormat: 'dd.MM.yyyy' | 'yyyy-MM-dd'
  theme: 'dark' | 'light'
  openaiKey: string
}

export type DayMap = Record<string, DayStatus>

export interface Snapshot {
  orders: Order[]
  days: DayMap
  settings: Settings
  adjustments: Adjustment[]
}

export const DEFAULT_SETTINGS: Settings = {
  monthlySalaryKop: 3200000,
  awRateKop: 5433,
  hourRateKop: 65200,
  schemaV: 2,
  awPerHour100: 1200,
  periodStartDay: 1,
  vacationPaid: true,
  // чередование недель: длинная — пн, вт, пт, сб, вс (РРВВРРР); короткая — ср, чт (ВВРРВВВ)
  schedule: { type: 'custom', startDate: '2026-11-02', pattern: 'РРВВРРРВВРРВВВ' },
  currency: '₽',
  dateFormat: 'dd.MM.yyyy',
  theme: 'dark',
  openaiKey: '',
}

export const STATUS_LABEL: Record<DayStatus, string> = {
  work: 'Рабочий', off: 'Выходной', vacation: 'Отпуск', unpaid: 'За свой счёт',
}
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  confirmed: 'Подтверждён', draft: 'Черновик', cancelled: 'Отменён',
}

/** Достраивает сохранённые настройки значениями по умолчанию; данные старше schemaV 2 получают 652 ₽/ч, 12 AW/ч и график по неделям от 02.11.2026. */
export function normalizeSettings(raw: Partial<Settings> | null | undefined): Settings {
  const r = raw ?? {}
  const s: Settings = { ...DEFAULT_SETTINGS, ...r, schedule: { ...DEFAULT_SETTINGS.schedule, ...(r.schedule ?? {}) } }
  if ((r.schemaV ?? 0) < 2) {
    s.hourRateKop = DEFAULT_SETTINGS.hourRateKop
    s.awPerHour100 = DEFAULT_SETTINGS.awPerHour100
    s.awRateKop = DEFAULT_SETTINGS.awRateKop
    s.schedule = { ...DEFAULT_SETTINGS.schedule }
    s.schemaV = 2
  }
  return s
}
