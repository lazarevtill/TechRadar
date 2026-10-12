/** Explicit UTC keeps streamed server text identical during hydration. */
export function formatUpdatedTime(date: Date): string {
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  return `${hours}:${minutes} UTC`
}

/** ISO calendar day in UTC, independent of server or browser locale. */
export function formatCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}
