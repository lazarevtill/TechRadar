import type { DataSource } from '@/lib/tech-categories'
import type { Db } from './db'
import { groupByKeys } from './identity'

/**
 * Works: items grouped by shared identity keys (identity.ts) — one paper, its
 * code and its discussions form one work. Built from every item seen since
 * `sinceIso` (last_seen), so a work spans days as well as sources.
 */

export interface WorkItem {
  id: string
  source: DataSource
  title: string
  url: string
  first_seen: string
}

export interface Works {
  /** Item id → work id (the lexicographically smallest member id). */
  workOf: Map<string, string>
  /** Work id → member items. */
  members: Map<string, WorkItem[]>
  item: Map<string, WorkItem>
}

export function workGroups(db: Db, sinceIso: string): Works {
  const rows = db.all<WorkItem & { key: string | null }>(
    `SELECT i.id, i.source, i.title, i.url, i.first_seen, k.key
       FROM items i LEFT JOIN item_keys k ON k.item_id = i.id
      WHERE i.last_seen >= ?`,
    sinceIso,
  )
  const keys = new Map<string, string[]>()
  const item = new Map<string, WorkItem>()
  for (const { key, ...row } of rows) {
    item.set(row.id, row)
    const list = keys.get(row.id) ?? []
    if (key) list.push(key)
    keys.set(row.id, list)
  }
  const workOf = groupByKeys(keys)
  const members = new Map<string, WorkItem[]>()
  for (const [id, work] of workOf) {
    const list = members.get(work) ?? []
    list.push(item.get(id)!)
    members.set(work, list)
  }
  return { workOf, members, item }
}

/** Distinct sources carrying the work an item belongs to. */
export function workSources(works: Works, itemId: string): Set<DataSource> {
  const work = works.workOf.get(itemId)
  return new Set(
    (work ? works.members.get(work) : undefined)?.map((m) => m.source) ?? [],
  )
}
