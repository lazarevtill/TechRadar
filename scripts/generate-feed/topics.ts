import type { SignalSnapshot, Signal } from './momentum'

export const TOPIC_LABELS: Record<
  string,
  { label: string; category: string; stage: string; keywords: string[] }
> = {
  'llm-agents': {
    label: 'LLM Agents',
    category: 'ai',
    stage: 'prototype',
    keywords: [
      'llm agent',
      'agent framework',
      'agentic',
      'ai agent',
      'tool use',
    ],
  },
  rag: {
    label: 'Retrieval-Augmented Generation',
    category: 'ai',
    stage: 'early-adopter',
    keywords: ['rag', 'retrieval augmented', 'vector database', 'embeddings'],
  },
  'open-models': {
    label: 'Open Models',
    category: 'ai',
    stage: 'early-adopter',
    keywords: [
      'open model',
      'open-weight',
      'llama',
      'mistral',
      'qwen',
      'gemma',
    ],
  },
  'post-quantum': {
    label: 'Post-Quantum Crypto',
    category: 'cybersecurity',
    stage: 'research',
    keywords: ['post-quantum', 'pqc', 'lattice cryptography'],
  },
  'quantum-hardware': {
    label: 'Quantum Hardware',
    category: 'quantum',
    stage: 'research',
    keywords: ['qubit', 'quantum processor', 'quantum computer'],
  },
  humanoids: {
    label: 'Humanoid Robots',
    category: 'robotics',
    stage: 'prototype',
    keywords: ['humanoid', 'optimus', 'boston dynamics', 'figure robot'],
  },
  fusion: {
    label: 'Fusion Energy',
    category: 'energy',
    stage: 'research',
    keywords: ['fusion', 'tokamak', 'plasma confinement'],
  },
  'protein-design': {
    label: 'Protein Design',
    category: 'biotech',
    stage: 'research',
    keywords: ['alphafold', 'protein design', 'protein folding'],
  },
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function tagTopics(text: string): string[] {
  const t = text || ''
  const ids: string[] = []
  for (const [id, def] of Object.entries(TOPIC_LABELS)) {
    if (
      def.keywords.some((kw) =>
        new RegExp('\\b' + escapeRegExp(kw) + '\\b', 'i').test(t),
      )
    )
      ids.push(id)
  }
  return ids
}

export function snapshotFromTexts(
  texts: string[],
  date: string,
): SignalSnapshot {
  const topics: Record<string, number> = {}
  for (const text of texts) {
    for (const id of tagTopics(text)) topics[id] = (topics[id] ?? 0) + 1
  }
  return { date, topics }
}

export function collectTopicSignals(
  posts: Array<{
    title: string
    url: string
    source: string
    publishedAt: string
    contentText?: string
  }>,
  maxPerTopic = 5,
): Record<string, Signal[]> {
  const byTopic: Record<string, Signal[]> = {}
  for (const p of posts) {
    const ids = tagTopics(`${p.title} ${p.contentText ?? ''}`)
    for (const id of ids) {
      if (!byTopic[id]) byTopic[id] = []
      byTopic[id].push({
        title: p.title,
        url: p.url,
        source: p.source,
        publishedAt: p.publishedAt,
      })
    }
  }
  for (const id of Object.keys(byTopic)) {
    byTopic[id].sort(
      (a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt),
    )
    byTopic[id] = byTopic[id].slice(0, maxPerTopic)
  }
  return byTopic
}
