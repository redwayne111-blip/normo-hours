import { compressImage } from './utils'
import { extractAwTable, wordsToLines, type OcrWord } from './ocrLayout'
import { parseOrderText, type ParsedOrder } from './ocrParse'

const base = () => new URL('vendor/', document.baseURI).href

/** Угол наклона строк (радианы): перебор углов, максимум «резкости» горизонтальной проекции чёрных пикселей. */
function estimateSkew(_gray: Uint8ClampedArray, d: Uint8ClampedArray, w: number, h: number): number {
  const step = Math.max(1, Math.round(Math.max(w, h) / 900))
  const xs: number[] = [], ys: number[] = []
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (d[(y * w + x) * 4] < 110) { xs.push(x / step); ys.push(y / step) }
  if (xs.length < 200) return 0
  const H = Math.ceil(h / step), W = Math.ceil(w / step), size = H + W + 4
  const scoreAt = (deg: number) => {
    const t = (deg * Math.PI) / 180, sin = Math.sin(t), cos = Math.cos(t)
    const bins = new Float64Array(size)
    for (let i = 0; i < xs.length; i++) bins[Math.floor(xs[i] * sin + ys[i] * cos + W)]++
    let score = 0
    for (let i = 1; i < size; i++) score += (bins[i] - bins[i - 1]) ** 2
    return score
  }
  let bestDeg = 0, bestScore = -1
  for (let deg = -8; deg <= 8.001; deg += 0.25) { const s = scoreAt(deg); if (s > bestScore) { bestScore = s; bestDeg = deg } }
  const coarse = bestDeg
  for (let deg = coarse - 0.3; deg <= coarse + 0.3001; deg += 0.05) { const s = scoreAt(deg); if (s > bestScore) { bestScore = s; bestDeg = deg } }
  console.debug('[ocr] skew', bestDeg.toFixed(2))
  return (bestDeg * Math.PI) / 180
}

function rotateCanvas(src: HTMLCanvasElement, angle: number): HTMLCanvasElement {
  const sin = Math.abs(Math.sin(angle)), cos = Math.abs(Math.cos(angle))
  const w = Math.ceil(src.width * cos + src.height * sin), h = Math.ceil(src.width * sin + src.height * cos)
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
  ctx.translate(w / 2, h / 2); ctx.rotate(angle); ctx.drawImage(src, -src.width / 2, -src.height / 2)
  return c
}

/** Подготовка фото для OCR: увеличение, серый, растяжение контраста и адаптивная бинаризация (убирает тени и неровный свет). */
export async function preprocessForOcr(file: Blob, target = 2600): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(2.5, target / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k))
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0, w, h)
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const gray = new Uint8ClampedArray(w * h)
  for (let i = 0, j = 0; i < d.length; i += 4, j++) gray[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000
  const W = w + 1
  const integral = new Float64Array(W * (h + 1))
  for (let y = 1; y <= h; y++) {
    let row = 0
    for (let x = 1; x <= w; x++) { row += gray[(y - 1) * w + (x - 1)]; integral[y * W + x] = integral[(y - 1) * W + x] + row }
  }
  const sortedSample: number[] = []
  for (let i = 0; i < gray.length; i += 97) sortedSample.push(gray[i])
  sortedSample.sort((a, b) => a - b)
  const bright = sortedSample[Math.floor(sortedSample.length * 0.9)] || 255
  const r = Math.max(15, Math.round(Math.min(w, h) / 24))
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1)
      const sum = integral[y1 * W + x1] - integral[y0 * W + x1] - integral[y1 * W + x0] + integral[y0 * W + x0]
      const mean = sum / ((x1 - x0) * (y1 - y0))
      // выравниваем фон по локальной яркости: текст темнеет, светло-серые шапки таблиц остаются светлыми
      const ratio = gray[y * w + x] / (mean || 1)
      // область темнее бумаги (фон за листом, тени, ладонь) — не текст
      const v = mean < bright * 0.55 ? 255 : Math.max(0, Math.min(255, Math.round(((ratio - 0.5) / 0.42) * 255)))
      const o = (y * w + x) * 4
      d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const angle = estimateSkew(gray, d, w, h)
  const out = Math.abs(angle) < 0.15 ? c : rotateCanvas(c, angle)
  return new Promise((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error('Не удалось подготовить фото'))), 'image/png'))
}

const sentence = (t: string) => { const l = t.replace(/[^а-яёa-z]/gi, ''); return l && l === l.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t }

/** Локальный OCR (Tesseract.js, rus+eng). Данные языка и ядро лежат в public/vendor — работает офлайн. */
export async function recognizeLocal(image: Blob, onProgress?: (p: number) => void): Promise<ParsedOrder> {
  const { createWorker } = await import('tesseract.js').catch(() => {
    if (!sessionStorage.getItem('ocr-reload')) { sessionStorage.setItem('ocr-reload', '1'); location.reload() }
    throw new Error('Приложение обновилось — страница перезагружается, повторите попытку')
  })
  const worker = await createWorker(['rus', 'eng'], 1, {
    workerPath: base() + 'worker.min.js',
    corePath: base(),
    langPath: base(),
    gzip: true,
    logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') onProgress?.(m.progress) },
  })
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '6' as never, preserve_interword_spaces: '1' })
    const prepared = await preprocessForOcr(image).catch((e) => { console.debug('[ocr] preprocess failed', e); return image })
    console.debug('[ocr] prepared', prepared.size, prepared === image ? 'original' : 'processed')
    const { data } = await worker.recognize(prepared)
    const words = ((data as unknown as { words?: OcrWord[] }).words ?? [])
    const lines = wordsToLines(words)
    const parsed = parseOrderText(lines.length ? lines.join('\n') : data.text)
    const table = extractAwTable(words)
    if (table.length) {
      parsed.jobs = table.map((j) => ({ title: sentence(j.title), aw100: j.aw100 }))
      parsed.aw100 = table.reduce((a, j) => a + j.aw100, 0)
      parsed.earningsKop = undefined
    }
    return parsed
  } finally {
    await worker.terminate()
  }
}

const blobToDataUrl = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => rej(r.error); r.readAsDataURL(b)
})

/** Необязательное облачное распознавание (OpenAI Vision) — точнее Tesseract; включается ключом в настройках. */
export async function recognizeCloud(image: Blob, apiKey: string): Promise<ParsedOrder> {
  const url = await blobToDataUrl(await compressImage(image, 2000, 0.9))
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: 'gpt-4o-mini', response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Это фото заказ-наряда автосервиса. Верни JSON: {"number": строка|null, "brand": строка|null, "model": строка|null, "plate": строка|null, "jobs": [{"title": строка, "aw": число|null}] (по каждой работе — её AW), "aw": число|null, "hours": число|null, "sum": число|null}. Ничего не выдумывай: нет в документе — null.' },
        { type: 'image_url', image_url: { url } },
      ] }],
    }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error?.message ?? String(r.status))
  const o = JSON.parse(j.choices[0].message.content)
  const n100 = (v: unknown) => (v == null || v === '' || isNaN(Number(v)) ? undefined : Math.round(Number(v) * 100))
  return {
    number: o.number ? String(o.number) : undefined, brand: o.brand || undefined, model: o.model || undefined,
    plate: o.plate || undefined, jobs: Array.isArray(o.jobs) ? o.jobs.map((j: unknown) => typeof j === 'string' ? { title: j } : { title: String((j as { title?: unknown }).title ?? ''), aw100: n100((j as { aw?: unknown }).aw) }).filter((j: { title: string }) => j.title) : [],
    aw100: n100(o.aw), hours100: n100(o.hours), earningsKop: n100(o.sum),
  }
}

export async function recognize(image: Blob, openaiKey: string, onProgress?: (p: number) => void): Promise<{ data: ParsedOrder; engine: string; note?: string }> {
  if (openaiKey) {
    try { return { data: await recognizeCloud(image, openaiKey), engine: 'нейросеть' } }
    catch (e) {
      const data = await recognizeLocal(image, onProgress)
      return { data, engine: 'Tesseract', note: 'Облачное распознавание не сработало (' + (e as Error).message + ')' }
    }
  }
  return { data: await recognizeLocal(image, onProgress), engine: 'Tesseract' }
}
