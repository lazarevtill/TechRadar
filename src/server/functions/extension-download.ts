import { createServerFn } from '@tanstack/react-start'
import { setResponseStatus } from '@tanstack/react-start/server'
import * as fs from 'fs'
import * as path from 'path'

// Built by scripts/build-extension.ts as part of `bun run build`. Serving the
// prebuilt zip (rather than zipping chrome-extension/ per request) is what
// makes this work in the Docker image, which ships dist/ but not the sources.
const ZIP_PATH = path.join(
  process.cwd(),
  'dist',
  'extension',
  'tech-radar-extension.zip',
)

export const downloadExtensionFn = createServerFn({ method: 'GET' }).handler(
  () => {
    if (!fs.existsSync(ZIP_PATH)) {
      console.error(
        `Extension zip not found at ${ZIP_PATH} — run \`bun run build:extension\``,
      )
      setResponseStatus(404)
      throw new Error('Extension package has not been built')
    }
    return {
      success: true,
      data: fs.readFileSync(ZIP_PATH).toString('base64'),
      filename: 'tech-radar-extension.zip',
    }
  },
)
