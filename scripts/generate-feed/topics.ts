import { TypeSafeClient, noul } from '@typesafe-ai/sdk'
import { TOPIC_LABELS, topicQuestion } from '../../src/lib/trend-topics'
import type { SignalSnapshot, Signal } from './momentum'

// Topic definitions live in src/lib/trend-topics.ts, shared with the live
// feed's cross-source convergence so both tag against the same list.
export { TOPIC_LABELS } from '../../src/lib/trend-topics'

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
        noul(topicQuestion(def, 'this post (`title` and `content`)')),
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
