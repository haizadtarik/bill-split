// Manual smoke test of the live Gemini OCR path. Loads GEMINI_KEY from .env,
// reads a receipt image from argv, prints the raw Gemini JSON and the parsed
// (cents) ParsedReceipt. Usage: npm run ocr:gemini -- /path/to/receipt.jpg
import { existsSync, readFileSync } from 'node:fs'
import { runGeminiOcr } from '../api/_gemini'
import { parseGemini } from '../src/lib/geminiParser'

try {
  process.loadEnvFile('.env')
} catch {
  /* .env optional if GEMINI_KEY already in the environment */
}

const imgPath = process.argv[2]
if (!imgPath) {
  console.error('usage: npm run ocr:gemini -- <path-to-receipt-image>')
  process.exit(1)
}
if (!existsSync(imgPath)) {
  console.error(`File not found: ${imgPath}`)
  process.exit(1)
}

// Only png/jpg are exercised; other formats fall through to image/jpeg, which
// Gemini may reject with a 400.
const ext = imgPath.split('.').pop()?.toLowerCase()
const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg'
const imageBase64 = readFileSync(imgPath).toString('base64')

const t0 = Date.now()
const raw = await runGeminiOcr({
  imageBase64,
  mimeType,
  apiKey: process.env.GEMINI_KEY ?? '',
  model: process.env.GEMINI_MODEL,
})
console.log('\n===== RAW Gemini JSON =====')
console.log(JSON.stringify(raw, null, 2))
console.log('\n===== Parsed (cents) =====')
console.log(JSON.stringify(parseGemini(raw), null, 2))
console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
