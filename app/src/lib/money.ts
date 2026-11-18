// Вся арифметика — на целых числах, без плавающей точки.

/** Деление с округлением «half away from zero». */
export function roundDiv(a: number, b: number): number {
  if (b === 0) return 0
  const sign = (a < 0) !== (b < 0) ? -1 : 1
  const x = Math.abs(a), y = Math.abs(b)
  return sign * Math.floor((2 * x + y) / (2 * y))
}

/** "54,33" -> 5433 (scale=2). Возвращает null для некорректного ввода. */
export function parseScaled(input: string, scale = 2): number | null {
  const s = input.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^-?\d+(\.\d*)?$|^-?\.\d+$/.test(s)) return null
  const neg = s.startsWith('-')
  const [i = '0', f = ''] = s.replace('-', '').split('.')
  const frac = (f + '0'.repeat(scale)).slice(0, scale)
  const roundUp = f.length > scale && Number(f[scale]) >= 5 ? 1 : 0
  const v = Number(i || '0') * 10 ** scale + Number(frac || '0') + roundUp
  return neg ? -v : v
}

export function formatScaled(v: number, scale = 2, trim = true): string {
  const neg = v < 0
  const abs = Math.abs(v)
  const p = 10 ** scale
  const i = Math.floor(abs / p)
  let f = String(abs % p).padStart(scale, '0')
  if (trim) f = f.replace(/0+$/, '')
  const ip = String(i).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')
  return (neg ? '−' : '') + ip + (f ? ',' + f : '')
}

export const fmtAW = (aw100: number) => formatScaled(aw100, 2, true)
export const fmtHours = (h100: number | null) => (h100 == null ? '—' : formatScaled(h100, 2, true))

/** Рубли: в списках — целые, с exact=true — с копейками. */
export function fmtMoney(kop: number, cur = '₽', exact = false): string {
  if (exact) return formatScaled(kop, 2, kop % 100 === 0) + '\u00a0' + cur
  return formatScaled(roundDiv(kop, 100) * 100, 2, true) + '\u00a0' + cur
}

export const kopToInput = (kop: number) => formatScaled(kop, 2, true).replace(/\u00a0/g, '')
