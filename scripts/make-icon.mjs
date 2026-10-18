// 生成应用图标 build/icon.png（256×256，蓝色圆角方块 + 白色播放三角）
// 纯 Node 实现（PNG 手写编码），不依赖 System.Drawing 等本机组件
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SIZE = 256
const RADIUS = 56
const BG = [47, 111, 237]
const FG = [255, 255, 255]
const TRIANGLE = [
  [104, 64],
  [104, 192],
  [200, 128]
]
const SUPERSAMPLE = 4

function insideRoundedRect(x, y) {
  const cx = Math.min(Math.max(x, RADIUS), SIZE - RADIUS)
  const cy = Math.min(Math.max(y, RADIUS), SIZE - RADIUS)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= RADIUS * RADIUS
}

function insideTriangle(x, y) {
  const [a, b, c] = TRIANGLE
  const e1 = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])
  const e2 = (c[0] - b[0]) * (y - b[1]) - (c[1] - b[1]) * (x - b[0])
  const e3 = (a[0] - c[0]) * (y - c[1]) - (a[1] - c[1]) * (x - c[0])
  return !((e1 < 0 || e2 < 0 || e3 < 0) && (e1 > 0 || e2 > 0 || e3 > 0))
}

function renderPixels() {
  const raw = Buffer.alloc(SIZE * (1 + SIZE * 4))
  for (let y = 0; y < SIZE; y += 1) {
    const rowStart = y * (1 + SIZE * 4)
    raw[rowStart] = 0 // filter: none
    for (let x = 0; x < SIZE; x += 1) {
      let background = 0
      let triangle = 0
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const px = x + (sx + 0.5) / SUPERSAMPLE
          const py = y + (sy + 0.5) / SUPERSAMPLE
          if (insideRoundedRect(px, py)) background += 1
          if (insideTriangle(px, py)) triangle += 1
        }
      }
      const samples = SUPERSAMPLE * SUPERSAMPLE
      const backgroundCoverage = background / samples
      const triangleCoverage = triangle / samples
      const offset = rowStart + 1 + x * 4
      for (let channel = 0; channel < 3; channel += 1) {
        raw[offset + channel] = Math.round(BG[channel] + (FG[channel] - BG[channel]) * triangleCoverage)
      }
      raw[offset + 3] = Math.round(backgroundCoverage * 255)
    }
  }
  return raw
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(raw) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0)
  ihdr.writeUInt32BE(SIZE, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const outFile = join(process.cwd(), 'build', 'icon.png')
mkdirSync(join(process.cwd(), 'build'), { recursive: true })
writeFileSync(outFile, encodePng(renderPixels()))
console.log(`icon written: ${outFile}`)
