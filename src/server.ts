import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { startScheduler } from '@/server/scheduler'

// Custom server entry: the default TanStack Start handler plus the feed
// schedule, so history is recorded whether or not anyone visits.
startScheduler()

export default createServerEntry({ fetch: handler.fetch })
