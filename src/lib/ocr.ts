// Receipt OCR orchestrator. The primary path is cloud Gemini (via the /api/ocr
// proxy, see geminiOcr.ts); when the device is offline or that call fails/returns
// nothing, it falls back to on-device GLM-OCR — a vision-language model that runs
// locally in the browser and is prompted to emit the same structured JSON the
// Gemini path returns, so both paths share one parser (parseGemini).
//
// The GLM-OCR engine below prefers WebGPU and falls back to WASM; its weights are
// lazy-loaded on first use and cached by the service worker. All ML/runtime
// concerns stay isolated here: if both paths throw, the UI drops the user into
// manual entry.

import { parseGemini } from './geminiParser'
import type { ParsedReceipt } from '../types'
import { geminiScan } from './geminiOcr'

const MODEL_ID = 'onnx-community/GLM-OCR-ONNX'

// Ask the on-device VLM for the exact JSON shape parseGemini already consumes, so
// the Gemini and GLM paths converge on a single parser. Mirrors api/_gemini.ts.
const OCR_PROMPT = [
  'You are reading a photo of a restaurant or store receipt.',
  'Extract every ordered line item with its price exactly as printed.',
  'Respond with ONLY a JSON object, no markdown fences and no prose, shaped:',
  '{"title": string, "items": [{"name": string, "price": number}], "tax": number, "tip": number}',
  'Rules:',
  '- "price" is the line total for that item as a decimal number (e.g. 12.50), no currency symbol.',
  '- Do NOT include subtotal, total, balance, change, or payment lines as items.',
  '- "tax" is the tax amount; "tip" is the tip or service charge amount (use 0 if none).',
  '- "title" is the merchant/restaurant name if clearly visible, otherwise use "".',
  'Return decimal numbers, never strings.',
].join('\n')

export interface OcrProgress {
  stage: 'uploading' | 'loading-model' | 'recognizing' | 'parsing'
  /** 0..1 for the model download, undefined for indeterminate stages */
  progress?: number
  label: string
}

type ProgressFn = (p: OcrProgress) => void

let enginePromise: Promise<OcrEngine> | null = null

interface OcrEngine {
  model: any
  processor: any
  device: 'webgpu' | 'wasm'
}

/** Which device actually loaded — exposed for diagnostics/validation. */
export let activeDevice: 'webgpu' | 'wasm' | null = null

/**
 * Build the backend fallback ladder. We prefer WebGPU (fast), but only when a
 * usable adapter truly exists — merely having `navigator.gpu` (e.g. some headless
 * setups) doesn't guarantee a reachable GPU. WASM is the universal fallback.
 *
 * GLM-OCR is a multi-billion-parameter VLM, so we load 4-bit weights to keep the
 * one-time download and memory footprint browser-friendly on both backends.
 */
async function backendLadder(): Promise<{ device: 'webgpu' | 'wasm'; dtype: any }[]> {
  const ladder: { device: 'webgpu' | 'wasm'; dtype: any }[] = []
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter()
      if (adapter) ladder.push({ device: 'webgpu', dtype: 'q4' })
    } catch {
      /* no usable adapter — skip WebGPU */
    }
  }
  ladder.push({ device: 'wasm', dtype: 'q4' })
  return ladder
}

async function getEngine(onProgress?: ProgressFn): Promise<OcrEngine> {
  if (enginePromise) return enginePromise
  enginePromise = (async () => {
    // dynamic import keeps the large library out of the initial app bundle
    const tjs = await import('@huggingface/transformers')
    tjs.env.allowLocalModels = false
    // Single-threaded WASM avoids requiring SharedArrayBuffer (cross-origin
    // isolation), so OCR works even on hosts that don't send COOP/COEP headers.
    try {
      ;(tjs.env.backends as any).onnx.wasm.numThreads = 1
    } catch {
      /* older runtime shape — ignore */
    }

    const seen: Record<string, number> = {}
    const progress_callback = (data: any) => {
      if (data?.status === 'progress' && typeof data.progress === 'number') {
        seen[data.file] = data.progress
        const vals = Object.values(seen)
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length / 100
        onProgress?.({
          stage: 'loading-model',
          progress: avg,
          label: `Downloading model… ${Math.round(avg * 100)}%`,
        })
      }
    }

    const ladder = await backendLadder()
    let engine: OcrEngine | null = null
    let lastErr: unknown
    for (const { device, dtype } of ladder) {
      try {
        const model = await tjs.AutoModelForImageTextToText.from_pretrained(MODEL_ID, {
          dtype,
          device,
          progress_callback,
        } as any)
        const processor = await tjs.AutoProcessor.from_pretrained(MODEL_ID)
        engine = { model, processor, device }
        activeDevice = device
        if (typeof window !== 'undefined') (window as any).__ocrDevice = device
        break
      } catch (err) {
        lastErr = err
        console.warn(`[ocr] backend "${device}" failed, trying next…`, err)
      }
    }
    if (!engine) throw lastErr ?? new Error('No OCR backend available')
    return engine
  })()
  // don't cache a rejection — allow a later retry
  enginePromise.catch(() => {
    enginePromise = null
  })
  return enginePromise
}

/** Which engine produced the last result — exposed for the UI label/diagnostics. */
export let activeEngine: 'gemini' | 'glm' | null = null

/**
 * Run OCR on an image and return a parsed receipt. Tries the cloud Gemini path
 * first when online; on offline / failure / empty result, falls back to on-device
 * GLM-OCR. Throws only if BOTH paths fail — callers route that to manual entry.
 */
export async function scanReceipt(
  imageUrl: string,
  onProgress?: ProgressFn,
): Promise<ParsedReceipt> {
  const online = typeof navigator === 'undefined' || navigator.onLine !== false
  if (online) {
    try {
      const parsed = await geminiScan(imageUrl, onProgress)
      if (parsed.items.length > 0) {
        activeEngine = 'gemini'
        if (typeof window !== 'undefined') (window as any).__ocrEngine = 'gemini'
        return parsed
      }
      console.warn('[ocr] Gemini returned no items — falling back to on-device…')
    } catch (err) {
      console.warn('[ocr] Gemini path failed — falling back to on-device…', err)
    }
  }
  const parsed = await glmScan(imageUrl, onProgress)
  activeEngine = 'glm'
  if (typeof window !== 'undefined') (window as any).__ocrEngine = 'glm'
  return parsed
}

/** Pull the first balanced JSON object out of the model's free-form text. */
function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  if (start === -1) throw new Error('GLM-OCR returned no JSON object')
  let depth = 0
  let inStr = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) {
      return JSON.parse(text.slice(start, i + 1))
    }
  }
  throw new Error('GLM-OCR returned an unterminated JSON object')
}

async function glmScan(
  imageUrl: string,
  onProgress?: ProgressFn,
): Promise<ParsedReceipt> {
  const tjs = await import('@huggingface/transformers')
  const engine = await getEngine(onProgress)

  onProgress?.({ stage: 'recognizing', label: 'Reading the receipt…' })

  const image = await tjs.RawImage.fromURL(imageUrl)
  const messages = [
    { role: 'user', content: [{ type: 'image' }, { type: 'text', text: OCR_PROMPT }] },
  ]
  const prompt = engine.processor.apply_chat_template(messages, {
    add_generation_prompt: true,
  })
  const inputs = await engine.processor(prompt, image)

  const output = await engine.model.generate({
    ...inputs,
    max_new_tokens: 1024,
    do_sample: false,
  })

  // Decode only the newly generated tokens (strip the prompt prefix).
  const promptLen = inputs.input_ids.dims.at(-1)
  const decoded = engine.processor.batch_decode(output.slice(null, [promptLen, null]), {
    skip_special_tokens: true,
  })[0] as string

  onProgress?.({ stage: 'parsing', label: 'Sorting items…' })
  if (typeof window !== 'undefined') {
    ;(window as any).__lastOcr = { decoded, device: engine.device }
  }
  return parseGemini(extractJson(decoded))
}

/** Warm the model in the background so the first scan feels instant. */
export function preloadOcr(): void {
  void getEngine().catch(() => {
    /* ignore — will retry on demand */
  })
}
