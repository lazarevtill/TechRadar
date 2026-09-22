import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { dirname, join, normalize, posix } from 'node:path'
import { ZipArchive } from 'archiver'

/**
 * Packages chrome-extension/ into dist/extension/tech-radar-extension.zip
 * (and the same tree unpacked under dist/extension/unpacked/).
 *
 * The file list is not a glob: it is every file reachable from manifest.json
 * (icons, the new-tab page) through HTML src/href, CSS url() and JS relative
 * imports. Tests, the README and dev-only icon generators are never shipped,
 * and a reference to a missing file fails the build instead of producing an
 * extension that breaks after install.
 *
 * Page scripts are bundled into one minified file each (the lib/ modules they
 * import are inlined, removing the import waterfall on every new tab) and
 * stylesheets are minified; everything else is copied as-is.
 */

export const EXTENSION_DIR = 'chrome-extension'
export const OUT_DIR = 'dist/extension'
export const ZIP_NAME = 'tech-radar-extension.zip'
/** Top-level folder inside the zip — the one users "Load unpacked". */
export const ZIP_ROOT = 'tech-radar-extension'
export const UNPACKED_DIR = 'unpacked'
/** Matches chrome-extension/lib/config.js and the source manifest. */
export const DEFAULT_BACKEND_URL = 'http://localhost:3000'

/**
 * The TechRadar server a fresh install reads from; users can change it in the
 * extension's Settings (stored in chrome.storage.sync). Must be an http(s)
 * origin (optionally with a path prefix); a typo fails the build instead of
 * shipping an extension that can reach nothing.
 */
export function extensionBackendUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = (env.EXTENSION_BACKEND_URL || DEFAULT_BACKEND_URL).replace(
    /\/+$/,
    '',
  )
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`EXTENSION_BACKEND_URL is not a URL: ${raw}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error(`EXTENSION_BACKEND_URL must be http(s): ${raw}`)
  return raw
}

type Read = (relPath: string) => string | null

function isLocal(ref: string): boolean {
  return !/^([a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(ref)
}

/** Resolve `ref` (as written inside `from`) to an extension-relative path. */
function resolveRef(from: string, ref: string): string {
  const clean = ref.split(/[?#]/)[0]
  return posix.normalize(posix.join(posix.dirname(from), clean))
}

export function referencesIn(file: string, text: string): string[] {
  const refs: string[] = []
  const add = (r: string | undefined) => {
    if (r && isLocal(r)) refs.push(resolveRef(file, r))
  }
  if (file.endsWith('.html')) {
    for (const m of text.matchAll(/\s(?:src|href)=["']([^"']+)["']/g)) add(m[1])
  } else if (file.endsWith('.css')) {
    for (const m of text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g))
      add(m[1])
  } else if (file.endsWith('.js')) {
    for (const m of text.matchAll(
      /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/g,
    ))
      add(m[1])
  }
  return refs
}

export function manifestEntries(manifest: Record<string, unknown>): string[] {
  const entries: string[] = []
  const icons = (manifest.icons ?? {}) as Record<string, string>
  entries.push(...Object.values(icons))
  const overrides = (manifest.chrome_url_overrides ?? {}) as Record<
    string,
    string
  >
  entries.push(...Object.values(overrides))
  const action = (manifest.action ?? {}) as {
    default_popup?: string
    default_icon?: string | Record<string, string>
  }
  if (action.default_popup) entries.push(action.default_popup)
  if (typeof action.default_icon === 'string') entries.push(action.default_icon)
  else if (action.default_icon)
    entries.push(...Object.values(action.default_icon))
  const background = (manifest.background ?? {}) as { service_worker?: string }
  if (background.service_worker) entries.push(background.service_worker)
  return entries.map((e) => posix.normalize(e))
}

/**
 * Every file the extension loads, sorted. Throws listing each missing
 * reference together with the file that referenced it.
 */
export function collectExtensionFiles(read: Read): string[] {
  const manifestText = read('manifest.json')
  if (manifestText === null) throw new Error('manifest.json not found')
  const manifest = JSON.parse(manifestText) as Record<string, unknown>

  const seen = new Set<string>(['manifest.json'])
  const missing: string[] = []
  const queue: Array<[string, string]> = manifestEntries(manifest).map((f) => [
    f,
    'manifest.json',
  ])
  while (queue.length) {
    const [file, from] = queue.shift()!
    if (seen.has(file)) continue
    if (file.startsWith('..')) {
      missing.push(`${file} (outside the extension, referenced by ${from})`)
      continue
    }
    const text = read(file)
    if (text === null) {
      missing.push(`${file} (referenced by ${from})`)
      continue
    }
    seen.add(file)
    for (const ref of referencesIn(file, text)) queue.push([ref, file])
  }
  if (missing.length) {
    throw new Error(
      `chrome extension references missing files:\n  ${missing.join('\n  ')}`,
    )
  }
  return [...seen].sort()
}

export interface BuildPlan {
  /** Scripts loaded by a page: bundled, with their imports inlined. */
  scripts: string[]
  styles: string[]
  /** Copied verbatim (manifest, HTML, fonts, icons). */
  copies: string[]
}

/**
 * Split the reachable files by how they ship. A script referenced only by
 * another script is inlined into its entry and not shipped on its own.
 */
export function planBuild(files: string[], read: Read): BuildPlan {
  const scripts = new Set<string>()
  for (const f of files.filter((f) => f.endsWith('.html'))) {
    for (const ref of referencesIn(f, read(f) ?? ''))
      if (ref.endsWith('.js')) scripts.add(ref)
  }
  return {
    scripts: [...scripts].sort(),
    styles: files.filter((f) => f.endsWith('.css')),
    copies: files.filter((f) => !f.endsWith('.js') && !f.endsWith('.css')),
  }
}

export async function buildExtension(root = process.cwd()): Promise<{
  zipPath: string
  files: string[]
  version: string
  backendUrl: string
}> {
  const extDir = join(root, EXTENSION_DIR)
  const read: Read = (rel) => {
    const abs = join(extDir, rel)
    return existsSync(abs) ? readFileSync(abs, 'latin1') : null
  }
  const files = collectExtensionFiles(read)
  const version = String(
    (
      JSON.parse(readFileSync(join(extDir, 'manifest.json'), 'utf8')) as {
        version?: string
      }
    ).version ?? '',
  )

  const outDir = join(root, OUT_DIR)
  const stageDir = join(outDir, UNPACKED_DIR)
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(stageDir, { recursive: true })

  const plan = planBuild(files, read)
  const backendUrl = extensionBackendUrl()
  const result = await Bun.build({
    // lib/config.js reads this; see its comment.
    define: { __TECHRADAR_BACKEND_URL__: JSON.stringify(backendUrl) },
    entrypoints: [...plan.scripts, ...plan.styles].map((f) => join(extDir, f)),
    root: extDir,
    outdir: stageDir,
    naming: '[dir]/[name].[ext]',
    target: 'browser',
    format: 'esm',
    minify: true,
    // Fonts stay where fonts.css points; the bundler must not rehash them.
    external: ['*.woff2'],
  })
  if (!result.success) {
    throw new Error(
      `extension bundle failed:\n${result.logs.map(String).join('\n')}`,
    )
  }
  for (const file of plan.copies) {
    mkdirSync(dirname(join(stageDir, file)), { recursive: true })
    copyFileSync(join(extDir, file), join(stageDir, file))
  }
  const shipped = [...plan.scripts, ...plan.styles, ...plan.copies].sort()
  for (const file of shipped) {
    if (!existsSync(join(stageDir, file)))
      throw new Error(`extension build did not produce ${file}`)
  }

  const zipPath = join(outDir, ZIP_NAME)

  const archive = new ZipArchive({ zlib: { level: 9 } })
  const output = createWriteStream(zipPath)
  const done = new Promise<void>((resolve, reject) => {
    output.on('close', () => resolve())
    archive.on('error', reject)
  })
  archive.pipe(output)
  for (const file of shipped) {
    // Buffers (not archive.file, which stats asynchronously and reorders
    // entries), sorted names, a fixed date and mode: the zip is byte-identical
    // whenever the sources are.
    archive.append(readFileSync(join(stageDir, file)), {
      name: `${ZIP_ROOT}/${file}`,
      date: new Date('2000-01-01T00:00:00Z'),
      mode: 0o644,
    })
  }
  await archive.finalize()
  await done
  return { zipPath: normalize(zipPath), files: shipped, version, backendUrl }
}

if (import.meta.main) {
  const { zipPath, files, version, backendUrl } = await buildExtension()
  console.log(
    `[build-extension] v${version}: ${files.length} files, backend ${backendUrl} -> ${zipPath}`,
  )
}
