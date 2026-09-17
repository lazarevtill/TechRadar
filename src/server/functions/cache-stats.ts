/**
 * Cache Statistics Server Function
 *
 * Получение статистики кэша для диагностики
 */

import { createServerFn } from '@tanstack/react-start'
import { getCacheStats, CACHE_KEYS } from '@/server/utils/cache'

export const getCacheStatsFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const stats = getCacheStats()

    console.log('\n📊 Cache Statistics:')
    console.log(`   Total entries: ${stats.size}`)
    console.log(`   Keys: ${stats.keys.join(', ')}`)

    stats.entries.forEach((entry) => {
      console.log(
        `   - ${entry.key}: age=${entry.age}s, expires in ${entry.expiresIn}s`,
      )
    })

    return {
      ...stats,
      cacheKeys: CACHE_KEYS,
      timestamp: new Date().toISOString(),
    }
  },
)
