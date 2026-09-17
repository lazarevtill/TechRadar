/**
 * One-off model comparison. NOT wired into package.json scripts.
 *
 *   ANTHROPIC_API_KEY=sk-ant-... bun run scripts/generate-feed/compare-models.ts
 *
 * Runs every profile in MODEL_PROFILES over the same posts and writes the
 * results side by side to /tmp/digest-compare.json for review. Judge Russian
 * phrasing first — it is half the product's output and where a smaller model
 * most visibly struggles. Writes nothing to public/data.
 */
import { writeFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import { fetchAllPosts } from './sources'
import { summarizePost } from './summarize'
import { MODEL_PROFILES } from './model'

const SAMPLE = Number(process.env.COMPARE_SAMPLE ?? 10)
const OUT = process.env.COMPARE_OUT ?? '/tmp/digest-compare.json'

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required')

  const client = new Anthropic({ apiKey, maxRetries: 3 })
  const posts = (await fetchAllPosts())
    .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt))
    .slice(0, SAMPLE)

  const names = Object.keys(MODEL_PROFILES)
  const rows: Array<Record<string, unknown>> = []
  const totals: Record<
    string,
    { input: number; output: number; failures: number }
  > = Object.fromEntries(
    names.map((n) => [n, { input: 0, output: 0, failures: 0 }]),
  )

  for (const post of posts) {
    const row: Record<string, unknown> = { title: post.title, url: post.url }
    for (const name of names) {
      try {
        const r = await summarizePost(post, client, MODEL_PROFILES[name])
        totals[name].input += r.usage.inputTokens
        totals[name].output += r.usage.outputTokens
        row[name] = { category: r.category, en: r.en, ru: r.ru }
      } catch (e) {
        totals[name].failures++
        row[name] = { error: (e as Error).message }
      }
    }
    rows.push(row)
  }

  writeFileSync(OUT, JSON.stringify({ totals, rows }, null, 2))
  console.log(`\nwrote ${OUT}`)
  for (const name of names) {
    const t = totals[name]
    console.log(
      `${name}: ${t.input} in / ${t.output} out tokens, ${t.failures} failure(s)`,
    )
  }
  console.log(
    '\nNow read the RU blocks side by side. If they are comparable, stay on the cheaper model.',
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
