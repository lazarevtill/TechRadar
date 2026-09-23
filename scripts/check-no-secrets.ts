import { readFileSync, existsSync } from 'node:fs'

const PATTERNS = [
  /sk-ant-[a-zA-Z0-9-]{10,}/g, // Anthropic
  /sk-[a-zA-Z0-9]{20,}/g, // OpenAI-style
  /ghp_[a-zA-Z0-9]{20,}/g, // GitHub PAT
]

export function scanForSecrets(text: string): string[] {
  const hits: string[] = []
  for (const re of PATTERNS) {
    const m = text.match(re)
    if (m) hits.push(...m)
  }
  return hits
}

function run() {
  const files = [
    'public/data/digest.json',
    'public/data/trends.json',
    'public/data/history.json',
    'public/data/topic-tags.json',
  ]
  let bad = false
  for (const f of files) {
    if (!existsSync(f)) continue
    const hits = scanForSecrets(readFileSync(f, 'utf8'))
    if (hits.length) {
      bad = true
      console.error(`[check-no-secrets] LEAK in ${f}: ${hits.length} match(es)`)
    }
  }
  if (bad) process.exit(1)
  console.log('[check-no-secrets] clean')
}

// Run only as a CLI, not when imported by tests.
if (import.meta.main) run()
