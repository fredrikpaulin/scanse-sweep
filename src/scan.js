// Scan assembly — collects 7-byte data blocks into full 360° rotations.
// Emits 'reading' for each parsed data block and 'scan' for complete rotations.

import { EventEmitter } from 'node:events'
import { DATA_BLOCK_SIZE } from './constants.js'
import { parseDataBlock } from './protocol.js'

// Initial buffer: 512 bytes covers ~73 data blocks.
// Grows if a single push delivers more.
const INITIAL_BUF_SIZE = 512

export function createScanAssembler() {
  const emitter = new EventEmitter()
  let buffer = new Uint8Array(INITIAL_BUF_SIZE)
  let writePos = 0     // bytes written into buffer
  let readPos = 0      // bytes consumed from buffer
  let currentScan = []
  let seenFirstSync = false

  function push(chunk) {
    const pending = writePos - readPos
    const needed = pending + chunk.length

    // Grow or compact the buffer if chunk doesn't fit
    if (needed > buffer.length) {
      const next = new Uint8Array(Math.max(needed * 2, INITIAL_BUF_SIZE))
      next.set(buffer.subarray(readPos, writePos))
      buffer = next
      writePos = pending
      readPos = 0
    } else if (writePos + chunk.length > buffer.length) {
      // Compact: shift unread bytes to the front
      buffer.copyWithin(0, readPos, writePos)
      writePos = pending
      readPos = 0
    }

    buffer.set(chunk, writePos)
    writePos += chunk.length

    // Process complete 7-byte blocks
    while (writePos - readPos >= DATA_BLOCK_SIZE) {
      const reading = parseDataBlock(buffer.subarray(readPos, readPos + DATA_BLOCK_SIZE))
      readPos += DATA_BLOCK_SIZE

      if (!reading.checksumValid) {
        emitter.emit('error', new Error('Data block checksum failed'))
        continue
      }

      emitter.emit('reading', reading)

      if (reading.sync) {
        if (seenFirstSync && currentScan.length > 0) {
          emitter.emit('scan', currentScan)
        }
        seenFirstSync = true
        currentScan = []
      }

      if (seenFirstSync) {
        currentScan.push(reading)
      }
    }
  }

  function reset() {
    writePos = 0
    readPos = 0
    currentScan = []
    seenFirstSync = false
  }

  emitter.push = push
  emitter.reset = reset
  return emitter
}
