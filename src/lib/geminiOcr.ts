// Client side of the Gemini OCR path: downscale the receipt photo, POST it to the
// /api/ocr proxy (which holds the key), and parse the structured JSON into a
// ParsedReceipt. All network + browser-image concerns live here. Throws on any
// failure so the orchestrator can fall back to on-device Donut.

import { parseGemini } from './geminiParser'
import type { ParsedReceipt } from '../types'
import type { OcrProgress } from './ocr'

const MAX_EDGE = 1600
const JPEG_QUALITY = 0.8

/** Downscale to <= MAX_EDGE on the longest side and re-encode as a JPEG blob. */
async function downscale(imageUrl: string): Promise<Blob> {
  const srcBlob = await (await fetch(imageUrl)).blob()
  const bitmap = await createImageBitmap(srcBlob)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob produced no blob'))),
      'image/jpeg',
      JPEG_QUALITY,
    ),
  )
}

/** Blob → raw base64 (strips the "data:...;base64," prefix). */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
}

export async function geminiScan(
  imageUrl: string,
  onProgress?: (p: OcrProgress) => void,
): Promise<ParsedReceipt> {
  onProgress?.({ stage: 'uploading', label: 'Uploading to Gemini…' })
  const blob = await downscale(imageUrl)
  const imageBase64 = await toBase64(blob)

  onProgress?.({ stage: 'recognizing', label: 'Reading the receipt…' })
  const res = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType: 'image/jpeg' }),
  })
  if (!res.ok) throw new Error(`/api/ocr responded ${res.status}`)
  const json = await res.json()

  onProgress?.({ stage: 'parsing', label: 'Sorting items…' })
  return parseGemini(json)
}
