// Server-only core: send a receipt image to Gemini and return structured receipt
// JSON (amounts in decimal MAJOR units). No browser APIs and no env reads — the
// caller passes apiKey/model — so this runs unchanged in a Vercel function, the
// Vite dev middleware, and Node smoke scripts.

const DEFAULT_MODEL = 'gemini-3.5-flash'

const PROMPT = [
  'You are reading a photo of a restaurant or store receipt.',
  'Extract every ordered line item with its price exactly as printed.',
  'Rules:',
  '- "price" is the line total for that item as a decimal number (e.g. 12.50), no currency symbol.',
  '- Do NOT include subtotal, total, balance, change, or payment lines as items.',
  '- "tax" is the tax amount; "tip" is the tip or service charge amount (use 0 if none).',
  '- "title" is the merchant/restaurant name if clearly visible, otherwise omit it.',
  'Return decimal numbers, never strings.',
].join('\n')

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { name: { type: 'STRING' }, price: { type: 'NUMBER' } },
        required: ['name', 'price'],
      },
    },
    tax: { type: 'NUMBER' },
    tip: { type: 'NUMBER' },
  },
  required: ['items', 'tax', 'tip'],
}

export interface RunGeminiArgs {
  imageBase64: string // raw base64, no "data:" prefix
  mimeType: string
  apiKey: string
  model?: string
}

/** Calls Gemini and returns the parsed JSON object (still in decimal units). */
export async function runGeminiOcr({
  imageBase64,
  mimeType,
  apiKey,
  model,
}: RunGeminiArgs): Promise<unknown> {
  if (!apiKey) throw new Error('Missing Gemini API key')
  const id = model || DEFAULT_MODEL
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${id}:generateContent?key=${apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
            { text: PROMPT },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Gemini ${res.status}: ${detail.slice(0, 300)}`)
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini returned no content')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Gemini returned unparseable JSON: ${text.slice(0, 120)}`)
  }
}
