import { TypeSafeClient, noul } from '@typesafe-ai/sdk'
import type { SignalSnapshot, Signal } from './momentum'

/**
 * Tracked trend topics. `definition` is what TypeSafe's Jev model judges each
 * post against — one yes/no question per topic, so a post can carry several.
 */
export const TOPIC_LABELS: Record<
  string,
  { label: string; category: string; stage: string; definition: string }
> = {
  'llm-agents': {
    label: 'LLM Agents',
    category: 'ai',
    stage: 'prototype',
    definition:
      'AI agents built on language models: agent frameworks, agentic workflows, models calling tools or acting autonomously',
  },
  rag: {
    label: 'Retrieval-Augmented Generation',
    category: 'ai',
    stage: 'early-adopter',
    definition:
      'Retrieval-augmented generation: grounding language model answers in retrieved documents, vector databases, embeddings for retrieval',
  },
  'open-models': {
    label: 'Open Models',
    category: 'ai',
    stage: 'early-adopter',
    definition:
      'Open-weight AI models (e.g. Llama, Mistral, Qwen, Gemma): releasing, fine-tuning, or running openly available model weights',
  },
  'post-quantum': {
    label: 'Post-Quantum Crypto',
    category: 'cybersecurity',
    stage: 'research',
    definition:
      'Post-quantum cryptography: encryption or signatures designed to resist quantum computers, such as lattice-based schemes',
  },
  'quantum-hardware': {
    label: 'Quantum Hardware',
    category: 'quantum',
    stage: 'research',
    definition:
      'Quantum computing hardware: qubits, quantum processors, building or scaling quantum computers',
  },
  humanoids: {
    label: 'Humanoid Robots',
    category: 'robotics',
    stage: 'prototype',
    definition:
      'Humanoid robots: human-shaped robots such as Tesla Optimus, Boston Dynamics Atlas, or Figure',
  },
  fusion: {
    label: 'Fusion Energy',
    category: 'energy',
    stage: 'research',
    definition:
      'Nuclear fusion energy: tokamaks, stellarators, plasma confinement, fusion power plants',
  },
  'protein-design': {
    label: 'Protein Design',
    category: 'biotech',
    stage: 'research',
    definition:
      'Protein structure prediction and protein design, such as AlphaFold or designing new proteins with AI',
  },
}

/** Noul probability at or above which a post counts toward a topic. */
export const TOPIC_THRESHOLD = 0.5
const CONTENT_CHAR_LIMIT = 6000

export interface TopicPost {
  title: string
  contentText?: string
}

export function buildTopicRequest(post: TopicPost) {
  return {
    state: {
      title: post.title,
      content: (post.contentText ?? '').slice(0, CONTENT_CHAR_LIMIT),
    },
    questions: Object.fromEntries(
      Object.entries(TOPIC_LABELS).map(([id, def]) => [
        id,
        noul(
          `Is this post (\`title\` and \`content\`) substantially about ${def.label} — ${def.definition}? A passing mention does not count.`,
        ),
      ]),
    ),
  }
}

/** Topic probabilities for one post, keyed by topic id. */
export type AskTopics = (post: TopicPost) => Promise<Record<string, number>>

export function createTopicAsker(
  env: NodeJS.ProcessEnv = process.env,
): AskTopics {
  const apiKey = env.TYPESAFE_API_KEY
  if (!apiKey) {
    throw new Error(
      'TYPESAFE_API_KEY is required for topic tagging (set as a GitHub Actions secret)',
    )
  }
  const client = new TypeSafeClient({ apiKey })
  return async (post) => {
    const { answers } = await client.systemOne(buildTopicRequest(post))
    return Object.fromEntries(
      Object.entries(answers).map(([id, a]) => [id, a.noul]),
    )
  }
}

/**
 * Topic ids per post, in input order. Throws if any request fails: trends
 * built from a partially tagged week would read as a real momentum drop.
 */
export async function tagPosts(
  posts: TopicPost[],
  ask: AskTopics,
): Promise<string[][]> {
  const probabilities = await Promise.all(posts.map((p) => ask(p)))
  return probabilities.map((byTopic) =>
    Object.keys(TOPIC_LABELS).filter(
      (id) => (byTopic[id] ?? 0) >= TOPIC_THRESHOLD,
    ),
  )
}

export function snapshotFromTags(
  tags: string[][],
  date: string,
): SignalSnapshot {
  const topics: Record<string, number> = {}
  for (const ids of tags) {
    for (const id of ids) topics[id] = (topics[id] ?? 0) + 1
  }
  return { date, topics }
}

export function collectTopicSignals(
  posts: Array<{
    title: string
    url: string
    source: string
    publishedAt: string
  }>,
  tags: string[][],
  maxPerTopic = 5,
): Record<string, Signal[]> {
  const byTopic: Record<string, Signal[]> = {}
  for (const [i, p] of posts.entries()) {
    for (const id of tags[i] ?? []) {
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
