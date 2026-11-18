export interface PdfPage { text: string; image: () => Promise<Blob> }

/** Читает PDF прямо на устройстве: у каждой страницы берём текстовый слой (если есть) и умеем отрисовать её в картинку для OCR. */
export async function readPdf(file: File): Promise<PdfPage[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages: PdfPage[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    pages.push({
      text: itemsToText(content.items as TextItem[]),
      image: async () => {
        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: Math.min(3, 2600 / Math.max(base.width, base.height)) })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvas, canvasContext: ctx, viewport }).promise
        return new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Не удалось отрисовать страницу PDF'))), 'image/jpeg', 0.92))
      },
    })
  }
  return pages
}

interface TextItem { str?: string; transform?: number[] }

/** Собирает элементы текстового слоя в строки: по вертикали группируем с допуском, внутри строки сортируем по X. */
export function itemsToText(items: TextItem[]): string {
  const rows: { y: number; parts: { x: number; s: string }[] }[] = []
  for (const it of items) {
    const s = it.str?.trim()
    if (!s || !it.transform) continue
    const x = it.transform[4], y = it.transform[5]
    const row = rows.find((r) => Math.abs(r.y - y) < 3)
    if (row) row.parts.push({ x, s }); else rows.push({ y, parts: [{ x, s }] })
  }
  return rows.sort((a, b) => b.y - a.y).map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(' ')).join('\n')
}
