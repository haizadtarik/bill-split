// Deterministic assertions for the pure Gemini receipt parser. No network.
import assert from 'node:assert/strict'
import { parseGemini } from '../src/lib/geminiParser'

// decimal major units → integer cents
{
  const r = parseGemini({ items: [{ name: 'Coffee', price: 4.5 }], tax: 0.3, tip: 0 })
  assert.deepEqual(r.items, [{ name: 'Coffee', price: 450 }])
  assert.equal(r.tax, 30)
  assert.equal(r.tip, 0)
}

// junk rows dropped: blank name, non-positive price
{
  const r = parseGemini({
    items: [
      { name: '', price: 9.99 },
      { name: 'Subtotal', price: 0 },
      { name: 'Burger', price: 12 },
    ],
    tax: 1,
    tip: 2,
  })
  assert.deepEqual(r.items, [{ name: 'Burger', price: 1200 }])
  assert.equal(r.tax, 100)
  assert.equal(r.tip, 200)
}

// negative/missing tax & tip clamp/default to 0
{
  const r = parseGemini({ items: [], tax: -5 })
  assert.equal(r.tax, 0)
  assert.equal(r.tip, 0)
}

// title: whitespace-collapsed when present, absent when blank
{
  const r = parseGemini({ title: '  Cafe   Luna ', items: [], tax: 0, tip: 0 })
  assert.equal(r.title, 'Cafe Luna')
  const r2 = parseGemini({ items: [], tax: 0, tip: 0 })
  assert.equal(r2.title, undefined)
}

// totally malformed input does not throw, yields an empty receipt
{
  const r = parseGemini(null)
  assert.deepEqual(r.items, [])
  assert.equal(r.tax, 0)
  assert.equal(r.tip, 0)
}

console.log('✓ geminiParser: all assertions passed')
