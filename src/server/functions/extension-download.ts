import { createServerFn } from '@tanstack/react-start'
import { setResponseStatus } from '@tanstack/react-start/server'
import * as fs from 'fs'
import * as path from 'path'
// archiver 8 is ESM-only and replaced the archiver('zip', …) factory
// with per-format classes.
import { ZipArchive } from 'archiver'

export const downloadExtensionFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    try {
      const extensionDir = path.join(process.cwd(), 'chrome-extension')

      // Check if directory exists
      if (!fs.existsSync(extensionDir)) {
        setResponseStatus(404)
        throw new Error('Extension directory not found')
      }

      // Create a buffer to store the zip
      const chunks: Uint8Array[] = []

      // Create archive
      const archive = new ZipArchive({
        zlib: { level: 9 }, // Maximum compression
      })

      // Collect chunks
      archive.on('data', (chunk: Uint8Array) => {
        chunks.push(chunk)
      })

      // Create a promise to wait for the archive to finish
      const archivePromise = new Promise<Buffer>((resolve, reject) => {
        archive.on('end', () => {
          resolve(Buffer.concat(chunks))
        })
        archive.on('error', (err: Error) => {
          reject(err)
        })
      })

      // Add the chrome-extension directory contents to the zip
      archive.directory(extensionDir, 'tech-radar-extension')

      // Finalize the archive
      await archive.finalize()

      // Wait for the archive to complete
      const zipBuffer = await archivePromise

      // Return as base64 for client-side download
      return {
        success: true,
        data: zipBuffer.toString('base64'),
        filename: 'tech-radar-extension.zip',
      }
    } catch (error) {
      console.error('Error creating extension zip:', error)
      setResponseStatus(500)
      throw new Error('Failed to create extension zip')
    }
  },
)
