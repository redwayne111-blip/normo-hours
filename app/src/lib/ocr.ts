import { compressImage } from './utils'
import { parseOrderText, type ParsedOrder } from './ocrParse'

const base = () => new URL('vendor/', document.baseURI).href

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
  const r = Math.max(15, Math.round(Math.min(w, h) / 24))
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1)
      const sum = integral[y1 * W + x1] - integral[y0 * W + x1] - integral[y1 * W + x0] + integral[y0 * W + x0]
      const mean = sum / ((x1 - x0) * (y1 - y0))
      const v = gray[y * w + x] < mean * 0.9 ? 0 : 255
      const o = (y * w + x) * 4
      d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Не удалось подготовить фото'))), 'image/png'))
}

/** Локальный OCR (Tesseract.js, rus+eng). Данные языка и ядро лежат в public/vendor — работает офлайн. */
export async function recognizeLocal(image: Blob, onProgress?: (p: number) => void): Promise<ParsedOrder> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(['rus', 'eng'], 1, {
    workerPath: base() + 'worker.min.js',
    corePath: base(),
    langPath: base(),
    gzip: true,
    logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') onProgress?.(m.progress) },
  })
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '6' as never, preserve_interword_spaces: '1' })
    const prepared = await preprocessForOcr(image).catch(() => image)
    const { data } = await worker.recognize(prepared)
    return parseOrderText(data.text)
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
        { type: 'text', text: 'Это фото заказ-наряда автосервиса. Верни JSON: {"number": строка|null, "brand": строка|null, "model": строка|null, "plate": строка|null, "jobs": [строки], "aw": число|null, "hours": число|null, "sum": число|null}. Ничего не выдумывай: нет в документе — null.' },
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
    plate: o.plate || undefined, jobs: Array.isArray(o.jobs) ? o.jobs.map(String) : [],
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
