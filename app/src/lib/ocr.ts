import { parseOrderText, type ParsedOrder } from './ocrParse'

const base = () => new URL('vendor/', document.baseURI).href

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
    const { data } = await worker.recognize(image)
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
  const url = await blobToDataUrl(image)
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
