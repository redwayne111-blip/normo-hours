export interface OcrWord { text: string; confidence?: number; bbox: { x0: number; y0: number; x1: number; y1: number } }

/** Собирает строки по координатам слов: слова с близким центром по вертикали — одна строка, внутри сортировка по X. */
export function wordsToLines(words: OcrWord[]): string[] {
  const ws = words.filter((w) => w.text.trim() && (w.confidence ?? 100) >= 20)
  if (!ws.length) return []
  const hs = ws.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b)
  const medH = hs[Math.floor(hs.length / 2)] || 10
  const yc = (w: OcrWord) => (w.bbox.y0 + w.bbox.y1) / 2
  const sorted = [...ws].sort((a, b) => yc(a) - yc(b))
  const rows: OcrWord[][] = []
  let mean = 0
  for (const w of sorted) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(yc(w) - mean) <= medH * 0.55) {
      row.push(w)
      mean = row.reduce((s, x) => s + yc(x), 0) / row.length
    } else { rows.push([w]); mean = yc(w) }
  }
  return rows.map((row) => {
    row.sort((a, b) => a.bbox.x0 - b.bbox.x0)
    let out = ''
    row.forEach((w, i) => {
      if (i) out += w.bbox.x0 - row[i - 1].bbox.x1 > medH * 1.5 ? '  ' : ' '
      out += w.text.trim()
    })
    return out
  })
}

export interface TableJob { title: string; aw100: number }

const AW_UNIT = /^[AaАа][WwМмMm]$/
const QTY = /^(?:\d+[.,]\d{2}|\d00)$/
const INT = /^\d{1,3}$/

const cx = (w: OcrWord, k: 'y') => (w.bbox.y0 + w.bbox.y1) / 2 + 0 * k.length

/**
 * Таблица сервисного заказа дилера: у работ единица «AW», дальше «К-во» и значение AW.
 * Из-за наклона колонка AW может стоять выше описаний, поэтому описание берём из левой колонки по порядку строк, а не по высоте.
 */
export function extractAwTable(words: OcrWord[]): TableJob[] {
  const ws = words.filter((w) => w.text.trim())
  if (!ws.length) return []
  const hs = ws.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b)
  const medH = hs[Math.floor(hs.length / 2)] || 10
  const yc = (w: OcrWord) => cx(w, 'y')

  const units: { unit: OcrWord; aw100: number }[] = []
  for (const u of ws.filter((w) => AW_UNIT.test(w.text.trim()))) {
    const right = ws.filter((w) => w.bbox.x0 >= u.bbox.x1 - 2 && Math.abs(yc(w) - yc(u)) <= medH * 0.6).sort((a, b) => a.bbox.x0 - b.bbox.x0)
    const qi = right.findIndex((w) => QTY.test(w.text.trim()))
    if (qi < 0) continue
    const awW = right.slice(qi + 1).find((w) => INT.test(w.text.trim()))
    if (!awW) continue
    const q = right[qi].text.trim()
    const qty = /[.,]/.test(q) ? Number(q.replace(',', '.')) : Number(q) / 100
    units.push({ unit: u, aw100: Math.round(qty * Number(awW.text.trim()) * 100) })
  }
  if (!units.length) return []
  units.sort((a, b) => yc(a.unit) - yc(b.unit))

  // строки работ привязываем к кодам (SERV009…) — код стоит в начале строки, описание правее него
  const unitX = Math.min(...units.map((u) => u.unit.bbox.x0))
  const CODE = /^[A-Za-z5SЕКЕK]{3,6}[\\/|]?[\dOОo]{2,4}$/
  const HEAD = /^(?:ед|к-во|цена|ндс|нас|скидка|сумма|aw)/i
  const codes = ws.filter((w) => CODE.test(w.text.trim()) && w.bbox.x1 < unitX).sort((a, b) => yc(a) - yc(b))
  const jobs: TableJob[] = []
  codes.slice(0, units.length).forEach((c, i) => {
    const row = ws
      .filter((w) => w !== c && w.bbox.x0 >= c.bbox.x1 - 2 && w.bbox.x1 <= unitX + 2 && Math.abs(yc(w) - yc(c)) <= medH * 0.6)
      .sort((a, b) => a.bbox.x0 - b.bbox.x0)
    const parts: string[] = []
    for (const w of row) { const t = w.text.trim(); if (HEAD.test(t)) break; parts.push(t) }
    const title = parts.join(' ').replace(/[|_\\]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
    if (title) jobs.push({ title, aw100: units[i].aw100 })
  })
  return jobs
}
