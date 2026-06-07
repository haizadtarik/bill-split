// Vercel serverless function: POST /api/ocr  { imageBase64, mimeType }
// Holds GEMINI_KEY server-side and proxies to Gemini; the key never reaches the
// client. Returns the structured receipt JSON (decimal units) on success, or a
// non-200 the browser treats as "fall back to on-device OCR".
// NOTE: explicit .js extension is required — package.json is `type: module`, so
// Vercel runs this as native ESM where extensionless relative imports throw
// ERR_MODULE_NOT_FOUND at runtime. The .js maps to ./_gemini.ts at build time.
import { runGeminiOcr } from './_gemini.js'

// Minimal structural types so we need no @vercel/node dependency.
interface Req {
  method?: string
  body?: unknown
}
interface Res {
  status: (code: number) => Res
  json: (body: unknown) => void
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const apiKey = process.env.GEMINI_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_KEY not configured' })
    return
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}) as {
    imageBase64?: string
    mimeType?: string
  }
  if (!body.imageBase64 || !body.mimeType) {
    res.status(400).json({ error: 'imageBase64 and mimeType are required' })
    return
  }

  try {
    const receipt = await runGeminiOcr({
      imageBase64: body.imageBase64,
      mimeType: body.mimeType,
      apiKey,
      model: process.env.GEMINI_MODEL,
    })
    res.status(200).json(receipt)
  } catch (err) {
    res.status(502).json({ error: (err as Error).message })
  }
}
