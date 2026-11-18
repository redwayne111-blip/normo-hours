// Деньги — целые копейки, AW — целые сотые (136,50 AW = 13650), часы — сотые часа.
export type DayStatus = 'work' | 'off' | 'vacation' | 'unpaid'
export type OrderStatus = 'confirmed' | 'draft' | 'cancelled'
export type ScheduleType = '5/2' | '2/2' | '3/3' | '4/2' | 'custom' | 'manual'

export interface Job { id: string; title: string }

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
  awRateKop: number
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
  awPerHour100: 1200,
  periodStartDay: 1,
  vacationPaid: true,
  schedule: { type: 'manual', startDate: '2026-01-01', pattern: 'РРВВ' },
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
