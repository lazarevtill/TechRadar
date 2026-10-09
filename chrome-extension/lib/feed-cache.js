/** Treat an incompatible or damaged saved response as a cache miss. */
export function savedFeed(cached) {
  if (
    !cached ||
    cached.payload?.version !== 1 ||
    !Number.isFinite(cached.timestamp) ||
    ['digest', 'trends'].some((panel) => {
      const value = cached.payload[panel]
      const key = panel === 'digest' ? 'items' : 'topics'
      return (
        value &&
        !value.error &&
        Array.isArray(value[key]) &&
        value[key].some((entry) => !entry || typeof entry !== 'object')
      )
    }) ||
    !Array.isArray(cached.payload.feed?.items) ||
    cached.payload.feed.items.some(
      (item) =>
        !item ||
        typeof item !== 'object' ||
        !item.id ||
        !Number.isFinite(new Date(item.publishedAt).getTime()) ||
        (item.signal &&
          (!Array.isArray(item.signal.reasons) ||
            ['score', 'reach', 'novelty', 'velocity', 'recency'].some(
              (key) =>
                item.signal[key] != null && !Number.isFinite(item.signal[key]),
            ))),
    )
  )
    return null
  return cached
}
