// Diagnose Donut (CORD-v2) output so we can write the parser. Runs in Node;
// model is cached in ~/.cache/huggingface so reruns are fast.
import {
  AutoProcessor,
  AutoTokenizer,
  AutoModelForVision2Seq,
  RawImage,
  env,
} from '@huggingface/transformers'

env.allowLocalModels = false
const id = 'Xenova/donut-base-finetuned-cord-v2'
const t0 = Date.now()

console.log('loading Donut CORD-v2…')
const processor = await AutoProcessor.from_pretrained(id)
const tokenizer = await AutoTokenizer.from_pretrained(id)
const model = await AutoModelForVision2Seq.from_pretrained(id, { dtype: 'fp32' })
console.log('ready in', ((Date.now() - t0) / 1000).toFixed(0), 's')

import { writeFileSync } from 'node:fs'
const imgPath = process.argv[2] || '/tmp/receipt2.png'
const image = await RawImage.read(imgPath)
console.log('image:', imgPath, image.width, 'x', image.height)
const { pixel_values } = await processor(image)

const task_prompt = '<s_cord-v2>'
const { input_ids: decoder_input_ids } = tokenizer(task_prompt, { add_special_tokens: false })

const t1 = Date.now()
const output = await model.generate({
  pixel_values,
  decoder_input_ids,
  max_length: 768,
  num_beams: 1,
  do_sample: false,
})
const decoded = tokenizer.batch_decode(output, { skip_special_tokens: false })[0]

console.log('\n===== RAW Donut output =====')
console.log(decoded)
writeFileSync('/tmp/donut-raw.txt', decoded)
console.log('\ninference', ((Date.now() - t1) / 1000).toFixed(0), 's · total', ((Date.now() - t0) / 1000).toFixed(0), 's')
