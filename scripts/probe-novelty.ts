/**
 * Prints Jev's novelty / substance judgment for the current arXiv batch and a
 * few Hacker News titles, to calibrate NOVELTY_THRESHOLD against real items.
 * Not part of the build; run by hand: `bun run scripts/probe-novelty.ts`.
 */
import { TypeSafeClient } from '@typesafe-ai/sdk'
import {
  buildSignalRequest,
  NOVEL_FROM_LEVEL,
} from '../src/server/utils/jev-signal'

const client = new TypeSafeClient({ apiKey: process.env.TYPESAFE_API_KEY! })

async function arxiv() {
  const res = await fetch(
    'https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL+OR+cat:quant-ph+OR+cat:cs.CR&start=0&max_results=12&sortBy=submittedDate&sortOrder=descending',
  )
  const xml = await res.text()
  return (xml.match(/<entry>[\s\S]*?<\/entry>/g) || []).map((e) => ({
    title: (e.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '')
      .replace(/\s+/g, ' ')
      .trim(),
    summary: (e.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? '')
      .replace(/\s+/g, ' ')
      .trim(),
  }))
}

async function hn() {
  const ids: number[] = await (
    await fetch('https://hacker-news.firebaseio.com/v0/topstories.json')
  ).json()
  const stories = await Promise.all(
    ids
      .slice(0, 12)
      .map(async (id) =>
        (
          await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
        ).json(),
      ),
  )
  return stories
    .filter((s) => s?.type === 'story')
    .map((s) => ({ title: s.title as string, summary: '' }))
}

const items = [
  ...(await arxiv()).map((i) => ({ ...i, src: 'arxiv' })),
  ...(await hn()).map((i) => ({ ...i, src: 'hn' })),
]
for (const item of items) {
  const { answers } = await client.systemOne(
    buildSignalRequest({
      id: 'probe',
      title: item.title,
      summary: item.summary,
    }),
  )
  const probs = answers.novelty.probabilities as Record<string, number>
  const novel = Object.entries(probs)
    .filter(([l]) => Number(l) >= NOVEL_FROM_LEVEL)
    .reduce((a, [, p]) => a + p, 0)
  console.log(
    `${item.src.padEnd(5)} novel=${novel.toFixed(2)} lvl=[${Object.values(probs)
      .map((p) => p.toFixed(2))
      .join(
        ' ',
      )}] subst=${answers.substance.noul.toFixed(2)}  ${item.title.slice(0, 70)}`,
  )
}
