export interface ParsedOrder {
  number?: string
  brand?: string
  model?: string
  plate?: string
  jobs: string[]
  aw100?: number
  hours100?: number
  earningsKop?: number
}

const BRANDS = ['BMW', 'Audi', 'Mercedes-Benz', 'Mercedes', 'Toyota', 'Kia', 'Hyundai', 'Skoda', 'Volkswagen', 'Lada', 'ВАЗ', 'Mazda', 'Nissan', 'Ford',
  'Renault', 'Lexus', 'Honda', 'Chevrolet', 'Opel', 'Volvo', 'Subaru', 'Mitsubishi', 'Porsche', 'Geely', 'Haval', 'Chery', 'Peugeot', 'Citroen', 'Suzuki',
  'Land Rover', 'Infiniti', 'Jeep', 'Tesla', 'Datsun', 'УАЗ', 'ГАЗ', 'Exeed', 'Changan', 'Jaecoo', 'Omoda']

const PLATE = /[АВЕКМНОРСТУХABEKMHOPCTYX0]\s?\d{3}\s?[АВЕКМНОРСТУХABEKMHOPCTYX]{2}\s?\d{2,3}/i
const LATIN_TO_CYR: Record<string, string> = { A: 'А', B: 'В', E: 'Е', K: 'К', M: 'М', H: 'Н', O: 'О', P: 'Р', C: 'С', T: 'Т', Y: 'У', X: 'Х', '0': 'О' }
const CODE = /\bSERV[\dOОo]{2,}\b/i
const stripToCode = (l: string) => { const m = l.match(CODE); return m ? l.slice((m.index ?? 0) + m[0].length).trim() : l }
const VIN = /\b[A-HJ-NPR-Z0-9]{17}\b/
// Строка работы в таблице сервисного заказа: [код] описание AW к-во AW-значение цена ...
const AW_ROW = /^(?:[A-Z]{2,}\d+\s+)?(.+?)\s+[AА]W\s+(\d+[.,]\d{1,2})\s+(\d+(?:[.,]\d+)?)(?=\s|$)/
const SKIP = /заказ|наряд|клиент|телефон|дата|итого|номер|vin|пробег|цена|стоимость|сумма|₽|руб|мастер|исполнитель|подпись|принял|нормо/i

function num100(s: string): number | undefined {
  const t = s.replace(/\s/g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(t)) return undefined
  const [i, f = ''] = t.split('.')
  return Number(i) * 100 + Number((f + '00').slice(0, 2))
}

function sentenceCase(t: string) {
  const letters = t.replace(/[^а-яёa-z]/gi, '')
  if (letters && letters === letters.toUpperCase()) return t.charAt(0) + t.slice(1).toLowerCase()
  return t
}

/** Разбор распознанного текста заказ-наряда. Нераспознанные поля остаются undefined. */
export function parseOrderText(text: string): ParsedOrder {
  const out: ParsedOrder = { jobs: [] }
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  const num = text.match(/заказ\s+номер\W{0,4}(\d{6,})/i) ?? text.match(/(?:№|N[o°º]?\.?|заказ[\s-]*наряд\w*)\s*[:№.]*\s*(\d{5,})/i)
  if (num) out.number = num[1]

  // Строки таблицы с единицей «AW»: AW берём из колонки AW, умножая на количество
  let tableAw100 = 0
  const tableJobs: string[] = []
  for (const l of lines.map(stripToCode)) {
    const m = l.match(AW_ROW)
    if (!m) continue
    const qty = num100(m[2])
    const aw = num100(m[3])
    if (qty === undefined || aw === undefined) continue
    tableAw100 += Math.round((qty * aw) / 100)
    tableJobs.push(sentenceCase(m[1].trim()))
  }

  const aw = text.match(/(\d+(?:[.,]\d+)?)\s*(?:AW|АW)\b/i) ?? text.match(/\b(?:AW|АW)\s*[:=-]?\s*(\d+(?:[.,]\d+)?)/i)
  if (tableJobs.length) out.aw100 = tableAw100
  else if (aw) out.aw100 = num100(aw[1])
  const hrs = text.match(/(\d+(?:[.,]\d+)?)\s*(?:ч(?![а-яё])|час)/i)
  if (hrs) out.hours100 = num100(hrs[1])
  const money = text.match(/(\d[\d\s]*(?:[.,]\d{1,2})?)\s*(?:₽|руб|р\.)/i)
  const m100 = money ? num100(money[1]) : undefined
  // В таблице дилера «Сумма» — цена для клиента, а не заработок механика: его считает приложение по AW
  if (m100 !== undefined && !tableJobs.length) out.earningsKop = m100

  const plateM = text.match(PLATE)
  if (plateM) out.plate = plateM[0].replace(/\s/g, '').toUpperCase().replace(/[ABEKMHOPCTYX0]/g, (c) => LATIN_TO_CYR[c])

  let carLine: string | undefined
  const vinIdx = lines.findIndex((l) => VIN.test(l.toUpperCase()))
  if (vinIdx > 0) {
    const brandLine = lines.slice(Math.max(0, vinIdx - 2), vinIdx).reverse().find((l) => BRANDS.some((b) => new RegExp(`^${b.replace(/[-\s]/g, '[-\\s]?')}\\s*$`, 'i').test(l)))
    const model = lines[vinIdx].toUpperCase().split(VIN)[0].trim().split(/\s+/).pop()
    if (brandLine && model && /^[A-ZА-Я0-9][A-ZА-Я0-9-]{0,9}$/i.test(model)) {
      out.brand = BRANDS.find((b) => new RegExp(`^${b.replace(/[-\s]/g, '[-\\s]?')}\\s*$`, 'i').test(brandLine))
      out.model = model
      carLine = brandLine
    }
  }
  for (const b of carLine ? [] : BRANDS) {
    const re = new RegExp(`(^|[^\\p{L}])(${b.replace(/[-\s]/g, '[-\\s]?')})(?![\\p{L}])`, 'iu')
    const line = lines.find((l) => re.test(l))
    if (line) {
      const m = line.match(re)!
      carLine = line
      out.brand = b
      const rest = line.slice((m.index ?? 0) + m[0].length).replace(PLATE, '').split(',')[0].trim()
      if (rest) out.model = rest
      break
    }
  }

  const codedJobs = lines.filter((l) => CODE.test(l)).map((l) => sentenceCase(stripToCode(l).split(/\s+[AА]W\b|\s+\d+[.,]\d{2}\b/)[0].replace(/[\s|_\\/]+$/, '').trim())).filter((l) => l.length > 3)
  out.jobs = tableJobs.length ? tableJobs : codedJobs.length ? codedJobs : lines
    .filter((l) => l !== carLine && !SKIP.test(l) && (l.match(/[а-яё]/gi)?.length ?? 0) >= 4)
    .map((l) => l.replace(/^[^а-яёa-z]+/i, '').replace(/^[a-z]\s{2,}/i, '').replace(/[\s|_\\/]+$/, '').replace(/\s{2,}/g, ' ').trim())
    .filter((l) => l && !/^(работы|выполненные работы|наименование работ)\s*:?$/i.test(l))
  return out
}
