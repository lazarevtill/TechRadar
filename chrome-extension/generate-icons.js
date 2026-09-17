/**
 * Icon Generator Script for Tech Evolution Radar Chrome Extension
 *
 * Run this script with Node.js to generate PNG icons:
 * node generate-icons.js
 *
 * Or open generate-icons.html in a browser for a visual generator.
 */

const fs = require('fs')
const path = require('path')

// Simple 1x1 pixel PNG in cyan color as placeholder
// These are minimal valid PNGs that Chrome will accept
const createMinimalPNG = (size) => {
  // PNG header
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ])

  // IHDR chunk
  const width = size
  const height = size
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8 // bit depth
  ihdrData[9] = 2 // color type (RGB)
  ihdrData[10] = 0 // compression
  ihdrData[11] = 0 // filter
  ihdrData[12] = 0 // interlace

  const ihdrChunk = createChunk('IHDR', ihdrData)

  // IDAT chunk (compressed image data)
  // Create a simple cyan-colored image
  const rawData = []
  for (let y = 0; y < height; y++) {
    rawData.push(0) // filter byte
    for (let x = 0; x < width; x++) {
      // Create a simple radar-like pattern
      const cx = width / 2
      const cy = height / 2
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      const maxDist = Math.min(width, height) / 2

      if (dist < maxDist * 0.1) {
        // Center - cyan
        rawData.push(0, 240, 255)
      } else if (
        dist < maxDist * 0.3 ||
        dist < maxDist * 0.5 ||
        dist < maxDist * 0.7 ||
        dist < maxDist * 0.9
      ) {
        const ring = Math.floor(dist / (maxDist * 0.2))
        if (Math.abs(dist - ring * maxDist * 0.2) < 1) {
          // Ring lines - dim cyan
          rawData.push(0, 100, 120)
        } else {
          // Background - dark
          rawData.push(10, 10, 15)
        }
      } else {
        // Background - dark
        rawData.push(10, 10, 15)
      }
    }
  }

  // Use zlib to compress (simplified - just store uncompressed for small icons)
  const zlib = require('zlib')
  const compressed = zlib.deflateSync(Buffer.from(rawData))
  const idatChunk = createChunk('IDAT', compressed)

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk])
}

function createChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)

  const typeBuffer = Buffer.from(type, 'ascii')
  const crcData = Buffer.concat([typeBuffer, data])
  const crc = crc32(crcData)

  const crcBuffer = Buffer.alloc(4)
  crcBuffer.writeUInt32BE(crc >>> 0, 0)

  return Buffer.concat([length, typeBuffer, data, crcBuffer])
}

function crc32(data) {
  let crc = 0xffffffff
  const table = []

  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c
  }

  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }

  return crc ^ 0xffffffff
}

// Generate icons
const sizes = [16, 32, 48, 128]
const iconsDir = path.join(__dirname, 'icons')

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true })
}

console.log('Generating icons...')

sizes.forEach((size) => {
  try {
    const png = createMinimalPNG(size)
    const filename = path.join(iconsDir, `icon${size}.png`)
    fs.writeFileSync(filename, png)
    console.log(`✓ Created ${filename}`)
  } catch (error) {
    console.error(`✗ Failed to create icon${size}.png:`, error.message)
  }
})

console.log('\nDone! Icons are ready in the icons/ folder.')
console.log('You can now load the extension in Chrome.')
