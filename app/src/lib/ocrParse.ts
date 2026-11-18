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

const PLATE = /[АВЕКМНОРСТУХABEKMHOPCTYX]\s?\d{3}\s?[АВЕКМНОРСТУХABEKMHOPCTYX]{2}\s?\d{2,3}/i
const SKIP = /заказ|наряд|клиент|телефон|дата|итого|номер|vin|пробег|цена|стоимость|сумма|₽|руб|мастер|исполнитель|подпись|принял|нормо/i

function num100(s: string): number | undefined {
  const t = s.replace(/\s/g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(t)) return undefined
  const [i, f = ''] = t.split('.')
  return Number(i) * 100 + Number((f + '00').slice(0, 2))
}

/** Разбор распознанного текста заказ-наряда. Нераспознанные поля остаются undefined. */
export function parseOrderText(text: string): ParsedOrder {
  const out: ParsedOrder = { jobs: [] }
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  const num = text.match(/(?:№|N[o°º]?\.?|заказ[\s-]*наряд\w*)\s*[:№.]*\s*(\d{5,})/i)
  if (num) out.number = num[1]

  const aw = text.match(/(\d+(?:[.,]\d+)?)\s*(?:AW|АW)\b/i) ?? text.match(/\b(?:AW|АW)\s*[:=-]?\s*(\d+(?:[.,]\d+)?)/i)
  if (aw) out.aw100 = num100(aw[1])
  const hrs = text.match(/(\d+(?:[.,]\d+)?)\s*(?:ч(?![а-яё])|час)/i)
  if (hrs) out.hours100 = num100(hrs[1])
  const money = text.match(/(\d[\d\s]*(?:[.,]\d{1,2})?)\s*(?:₽|руб|р\.)/i)
  const m100 = money ? num100(money[1]) : undefined
  if (m100 !== undefined) out.earningsKop = m100

  const plateM = text.match(PLATE)
  if (plateM) out.plate = plateM[0].replace(/\s/g, '').toUpperCase()

  let carLine: string | undefined
  for (const b of BRANDS) {
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

  out.jobs = lines
    .filter((l) => l !== carLine && !SKIP.test(l) && (l.match(/[а-яё]/gi)?.length ?? 0) >= 4)
    .map((l) => l.replace(/^[^а-яёa-z]+/i, '').replace(/^[a-z]\s{2,}/i, '').replace(/[\s|_\\/]+$/, '').replace(/\s{2,}/g, ' ').trim())
    .filter((l) => l && !/^(работы|выполненные работы|наименование работ)\s*:?$/i.test(l))
  return out
}
