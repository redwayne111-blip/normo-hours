import { compressImage } from './utils'
import { extractAwTable, wordsToLines, type OcrWord } from './ocrLayout'
import { parseOrderText, type ParsedOrder } from './ocrParse'

const base = () => new URL('vendor/', document.baseURI).href

/** Угол наклона строк (радианы): перебор углов, максимум резкости горизонтальной проекции чёрных пикселей. */
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

/** Подготовка фото для локального OCR: увеличение, серый, контраст и адаптивная бинаризация. */
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
      const ratio = gray[y * w + x] / (mean || 1)
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

async function cropTable(blob: Blob, words: OcrWord[]): Promise<{ blob: Blob } | null> {
  const head = words.find((w) => /^описани/i.test(w.text.trim()))
  if (!head) return null
  const hs = words.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b)
  const medH = hs[Math.floor(hs.length / 2)] || 10
  const end = words.filter((w) => w.bbox.y0 > head.bbox.y1 + medH * 2 && /^(?:работа|итого|нетто|скидка)/i.test(w.text.trim())).sort((a, b) => a.bbox.y0 - b.bbox.y0)[0]
  const bmp = await createImageBitmap(blob)
  const y0 = Math.max(0, Math.round(head.bbox.y0 - medH * 1.5))
  const y1 = Math.min(bmp.height, Math.round(end ? end.bbox.y0 : head.bbox.y1 + medH * 14))
  if (y1 - y0 < medH * 3) return null
  const k = Math.min(2.5, 4000 / bmp.width)
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round((y1 - y0) * k)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(bmp, 0, y0, bmp.width, y1 - y0, 0, 0, c.width, c.height)
  const out = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('crop'))), 'image/png'))
  return { blob: out }
}

const sentence = (t: string) => { const l = t.replace(/[^а-яёa-z]/gi, ''); return l && l === l.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t }

/** Локальный OCR (Tesseract.js, rus+eng) — резервный вариант, работает офлайн. */
export async function recognizeLocal(image: Blob, onProgress?: (p: number) => void): Promise<ParsedOrder> {
  const { createWorker } = await import('tesseract.js').catch(() => {
    if (!sessionStorage.getItem('ocr-reload')) { sessionStorage.setItem('ocr-reload', '1'); location.reload() }
    throw new Error('Приложение обновилось — страница перезагружается, повторите попытку')
  })
  const worker = await createWorker(['rus', 'eng'], 1, {
    workerPath: base() + 'worker.min.js', corePath: base(), langPath: base(), gzip: true,
    logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') onProgress?.(m.progress) },
  })
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '6' as never, preserve_interword_spaces: '1' })
    const prepared = await preprocessForOcr(image).catch((e) => { console.debug('[ocr] preprocess failed', e); return image })
    const { data } = await worker.recognize(prepared)
    const words = ((data as unknown as { words?: OcrWord[] }).words ?? [])
    const lines = wordsToLines(words)
    const parsed = parseOrderText(lines.length ? lines.join('\n') : data.text)
    let table = extractAwTable(words)
    const crop = await cropTable(prepared, words).catch(() => null)
    if (crop) {
      const second = ((await worker.recognize(crop.blob)).data as unknown as { words?: OcrWord[] }).words ?? []
      const t2 = extractAwTable(second)
      if (t2.length >= table.length) table = t2
    }
    if (table.length) {
      parsed.jobs = table.map((j) => ({ title: sentence(j.title), aw100: j.aw100 }))
      parsed.aw100 = table.reduce((a, j) => a + j.aw100, 0)
      parsed.earningsKop = undefined
    }
    return parsed
  } finally { await worker.terminate() }
}

/** OCR.space: фото отправляется внешнему сервису. API-ключ берётся из существующего поля настроек. */
export async function recognizeOcrSpace(image: Blob, apiKey: string): Promise<ParsedOrder> {
  const form = new FormData()
  form.append('file', image, image instanceof File ? image.name : 'order-image.png')
  form.append('language', 'rus')
  form.append('OCREngine', '2')
  form.append('scale', 'true')
  form.append('isOverlayRequired', 'false')
  const response = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { apikey: apiKey },
    body: form,
  })
  const result = await response.json() as {
    IsErroredOnProcessing?: boolean
    ErrorMessage?: string | string[]
    ParsedResults?: Array<{ ParsedText?: string }>
  }
  if (!response.ok) throw new Error(`OCR.space: HTTP ${response.status}`)
  if (result.IsErroredOnProcessing) {
    const detail = Array.isArray(result.ErrorMessage) ? result.ErrorMessage.join(', ') : result.ErrorMessage
    throw new Error(detail || 'сервис не смог обработать изображение')
  }
  const text = (result.ParsedResults ?? []).map((page) => page.ParsedText ?? '').filter(Boolean).join('\n')
  if (!text.trim()) throw new Error('OCR.space не вернул распознанный текст')
  return parseOrderText(text)
}

/** OCR.space предпочтителен при заданном ключе; при ошибке используется локальный Tesseract. */
export async function recognize(image: Blob, apiKey: string, onProgress?: (p: number) => void): Promise<{ data: ParsedOrder; engine: string; note?: string }> {
  if (apiKey) {
    try { return { data: await recognizeOcrSpace(image, apiKey), engine: 'OCR.space' } }
    catch (e) {
      const data = await recognizeLocal(image, onProgress)
      return { data, engine: 'Tesseract', note: 'OCR.space не сработал (' + (e as Error).message + '); использован локальный OCR.' }
    }
  }
  return { data: await recognizeLocal(image, onProgress), engine: 'Tesseract' }
}
