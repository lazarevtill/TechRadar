/**
 * Escaping for the HTML the extension builds from server data. The server is
 * a user setting, so its answers are untrusted: text and attribute values
 * are escaped (quotes included — values go inside "…" attributes), and
 * numbers are coerced so a string can never pass as one.
 */

const ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c])
}

/** A finite number, or 0. */
export function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}
