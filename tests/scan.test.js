import { test, expect } from 'bun:test'
import { createScanAssembler } from '../src/scan.js'
import { computeDataBlockChecksum } from '../src/protocol.js'

function makeBlock(syncBit, angleDeg, distanceCm, signal) {
  const azimuth = Math.round(angleDeg * 16)
  const buf = new Uint8Array(7)
  buf[0] = syncBit ? 0x01 : 0x00
  buf[1] = azimuth & 0xFF
  buf[2] = (azimuth >> 8) & 0xFF
  buf[3] = distanceCm & 0xFF
  buf[4] = (distanceCm >> 8) & 0xFF
  buf[5] = signal
  buf[6] = computeDataBlockChecksum(buf)
  return buf
}

function concatBlocks(...blocks) {
  const total = blocks.reduce((sum, b) => sum + b.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const b of blocks) {
    result.set(b, offset)
    offset += b.length
  }
  return result
}

test('scan assembler emits individual readings', () => {
  const assembler = createScanAssembler()
  const readings = []
  assembler.on('reading', (r) => readings.push(r))

  const block = makeBlock(true, 0, 100, 50)
  assembler.push(block)

  expect(readings.length).toBe(1)
  expect(readings[0].angle).toBe(0)
  expect(readings[0].distance).toBe(100)
  expect(readings[0].signal).toBe(50)
  expect(readings[0].sync).toBe(true)
})

test('scan assembler emits complete scan on second sync', () => {
  const assembler = createScanAssembler()
  const scans = []
  assembler.on('scan', (s) => scans.push(s))

  // First rotation: sync + 3 readings
  const blocks = concatBlocks(
    makeBlock(true, 0, 100, 50),
    makeBlock(false, 90, 200, 60),
    makeBlock(false, 180, 300, 70),
    makeBlock(false, 270, 400, 80),
    // Second rotation starts — triggers emit of first
    makeBlock(true, 0, 110, 55),
  )

  assembler.push(blocks)

  expect(scans.length).toBe(1)
  expect(scans[0].length).toBe(4) // 4 readings in first rotation
  expect(scans[0][0].angle).toBe(0)
  expect(scans[0][1].angle).toBe(90)
  expect(scans[0][2].angle).toBe(180)
  expect(scans[0][3].angle).toBe(270)
})

test('scan assembler discards partial first rotation', () => {
  const assembler = createScanAssembler()
  const scans = []
  assembler.on('scan', (s) => scans.push(s))

  // Start mid-rotation (no initial sync)
  const blocks = concatBlocks(
    makeBlock(false, 180, 300, 70),
    makeBlock(false, 270, 400, 80),
    // First sync — start collecting
    makeBlock(true, 0, 100, 50),
    makeBlock(false, 90, 200, 60),
    // Second sync — emit first complete rotation
    makeBlock(true, 0, 110, 55),
  )

  assembler.push(blocks)

  expect(scans.length).toBe(1)
  expect(scans[0].length).toBe(2) // only the readings after first sync
  expect(scans[0][0].angle).toBe(0)
  expect(scans[0][1].angle).toBe(90)
})

test('scan assembler handles data split across chunks', () => {
  const assembler = createScanAssembler()
  const readings = []
  assembler.on('reading', (r) => readings.push(r))

  const block = makeBlock(false, 45, 500, 100)

  // Split a 7-byte block across two pushes
  assembler.push(block.slice(0, 3))
  expect(readings.length).toBe(0) // not enough data yet

  assembler.push(block.slice(3))
  expect(readings.length).toBe(1)
  expect(readings[0].angle).toBe(45)
  expect(readings[0].distance).toBe(500)
})

test('scan assembler emits error on bad checksum', () => {
  const assembler = createScanAssembler()
  const errors = []
  assembler.on('error', (e) => errors.push(e))

  const block = makeBlock(false, 0, 100, 50)
  block[6] = 0xFF // corrupt checksum
  assembler.push(block)

  expect(errors.length).toBe(1)
  expect(errors[0].message).toContain('checksum')
})

test('scan assembler reset clears state', () => {
  const assembler = createScanAssembler()
  const scans = []
  assembler.on('scan', (s) => scans.push(s))

  // Push some data
  assembler.push(makeBlock(true, 0, 100, 50))
  assembler.reset()

  // After reset, need two syncs again for a complete scan
  assembler.push(concatBlocks(
    makeBlock(true, 0, 100, 50),
    makeBlock(false, 90, 200, 60),
    makeBlock(true, 0, 110, 55),
  ))

  expect(scans.length).toBe(1)
  expect(scans[0].length).toBe(2)
})

test('scan assembler multiple complete rotations', () => {
  const assembler = createScanAssembler()
  const scans = []
  assembler.on('scan', (s) => scans.push(s))

  const blocks = concatBlocks(
    // Rotation 1
    makeBlock(true, 0, 100, 50),
    makeBlock(false, 120, 200, 60),
    makeBlock(false, 240, 300, 70),
    // Rotation 2
    makeBlock(true, 0, 110, 55),
    makeBlock(false, 120, 210, 65),
    // Rotation 3 start (emits rotation 2)
    makeBlock(true, 0, 120, 60),
  )

  assembler.push(blocks)

  expect(scans.length).toBe(2)
  expect(scans[0].length).toBe(3)
  expect(scans[1].length).toBe(2)
})
