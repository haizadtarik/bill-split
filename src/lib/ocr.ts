// On-device receipt OCR via Donut (CORD-v2) — a document model fine-tuned on
// receipts, so it emits structured fields (item, price, subtotal, tax, total)
// instead of raw text. Runs locally in the browser; the image never leaves the
// device. Heavy model is lazy-loaded on first use and cached by the service
// worker thereafter.
//
// Prefers WebGPU and falls back to WASM. All ML/runtime concerns are isolated
// here: if it throws, the UI drops the user into manual entry.

import { parseDonut } from './donutParser'
import type { ParsedReceipt } from '../types'
import { geminiScan } from './geminiOcr'

const MODEL_ID = 'Xenova/donut-base-finetuned-cord-v2'
const TASK_PROMPT = '<s_cord-v2>'

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
  tokenizer: any
  device: 'webgpu' | 'wasm'
}

/** Which device actually loaded — exposed for diagnostics/validation. */
export let activeDevice: 'webgpu' | 'wasm' | null = null

/**
 * Build the backend fallback ladder. We prefer WebGPU (fast), but only when a
 * usable adapter truly exists — merely having `navigator.gpu` (e.g. some headless
 * setups) doesn't guarantee a reachable GPU. WASM is the universal fallback.
 */
async function backendLadder(): Promise<{ device: 'webgpu' | 'wasm'; dtype: any }[]> {
  const ladder: { device: 'webgpu' | 'wasm'; dtype: any }[] = []
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter()
      if (adapter) ladder.push({ device: 'webgpu', dtype: 'fp32' })
    } catch {
      /* no usable adapter — skip WebGPU */
    }
  }
  ladder.push({ device: 'wasm', dtype: 'q8' })
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
        const model = await tjs.AutoModelForVision2Seq.from_pretrained(MODEL_ID, {
          dtype,
          device,
          progress_callback,
        } as any)
        const processor = await tjs.AutoProcessor.from_pretrained(MODEL_ID)
        const tokenizer = await tjs.AutoTokenizer.from_pretrained(MODEL_ID)
        engine = { model, processor, tokenizer, device }
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
export let activeEngine: 'gemini' | 'donut' | null = null

/**
 * Run OCR on an image and return a parsed receipt. Tries the cloud Gemini path
 * first when online; on offline / failure / empty result, falls back to on-device
 * Donut. Throws only if BOTH paths fail — callers route that to manual entry.
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
  const parsed = await donutScan(imageUrl, onProgress)
  activeEngine = 'donut'
  if (typeof window !== 'undefined') (window as any).__ocrEngine = 'donut'
  return parsed
}

async function donutScan(
  imageUrl: string,
  onProgress?: ProgressFn,
): Promise<ParsedReceipt> {
  const tjs = await import('@huggingface/transformers')
  const engine = await getEngine(onProgress)

  onProgress?.({ stage: 'recognizing', label: 'Reading the receipt…' })

  const image = await tjs.RawImage.fromURL(imageUrl)
  const { pixel_values } = await engine.processor(image)
  const { input_ids: decoder_input_ids } = engine.tokenizer(TASK_PROMPT, {
    add_special_tokens: false,
  })

  const output = await engine.model.generate({
    pixel_values,
    decoder_input_ids,
    max_length: 768,
    num_beams: 1,
    do_sample: false,
  })

  const decoded = engine.tokenizer.batch_decode(output, { skip_special_tokens: false })[0]

  onProgress?.({ stage: 'parsing', label: 'Sorting items…' })
  if (typeof window !== 'undefined') {
    ;(window as any).__lastOcr = { decoded, device: engine.device }
  }
  return parseDonut(decoded)
}

/** Warm the model in the background so the first scan feels instant. */
export function preloadOcr(): void {
  void getEngine().catch(() => {
    /* ignore — will retry on demand */
  })
}
