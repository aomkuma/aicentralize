import fs from 'node:fs'

const audioPath = process.argv[2]
if (!audioPath) {
  console.error('Usage: node scripts/test_transcribe_endpoint.mjs <audioPath>')
  process.exit(1)
}

const form = new FormData()
form.append('audio', new Blob([fs.readFileSync(audioPath)]), 'sample.webm')
form.append('model', 'small')
form.append('language', 'th')

const res = await fetch('http://localhost:4000/ai/playground/transcribe', {
  method: 'POST',
  body: form,
})

const text = await res.text()
console.log(`STATUS=${res.status}`)
console.log(text)
