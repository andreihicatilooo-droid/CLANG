import { appendFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import screenshot from 'screenshot-desktop'
import Jimp from 'jimp'
import Tesseract from 'tesseract.js'
import { translate } from '@vitalets/google-translate-api'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOG = resolve(__dirname, '../../debug-3dad4a.log')

function log(message, data, hypothesisId) {
  const entry = {
    sessionId: '3dad4a',
    runId: 'pipeline-test',
    hypothesisId,
    location: 'verify-pipeline.mjs',
    message,
    data,
    timestamp: Date.now()
  }
  appendFileSync(LOG, `${JSON.stringify(entry)}\n`)
  console.log(message, data)
}

const x = 100
const y = 100
const width = 400
const height = 200

const imgBuffer = await screenshot()
const image = await Jimp.read(imgBuffer)
image.crop(x, y, width, height)
const croppedBuffer = await image.getBufferAsync(Jimp.MIME_PNG)

const worker = await Tesseract.createWorker('eng')
let data
try {
  ;({ data } = await worker.recognize(croppedBuffer, {}, { text: true, blocks: true }))
} finally {
  await worker.terminate()
}

const trimmedText = data.text.trim()
log('OCR', { trimmedLen: trimmedText.length, blockCount: data.blocks?.length ?? 0 }, 'B')

if (!trimmedText) {
  log('SKIP translate', { reason: 'empty text' }, 'B')
  process.exit(1)
}

const res = await translate(trimmedText, { to: 'ru' })
log('translate', { translatedLen: res.text.length, preview: res.text.slice(0, 80) }, 'C')
