// Scan assembly — collects 7-byte data blocks into full 360° rotations.
// Emits 'reading' for each parsed data block and 'scan' for complete rotations.

import { EventEmitter } from 'node:events'
import { DATA_BLOCK_SIZE } from './constants.js'
import { parseDataBlock } from './protocol.js'

export function createScanAssembler() {
  const emitter = new EventEmitter()
  let buffer = new Uint8Array(0)
  let currentScan = []
  let seenFirstSync = false

  function push(chunk) {
    // Append chunk to internal buffer
    const next = new Uint8Array(buffer.length + chunk.length)
    next.set(buffer)
    next.set(chunk, buffer.length)
    buffer = next

    // Process complete 7-byte blocks
    while (buffer.length >= DATA_BLOCK_SIZE) {
      const block = buffer.slice(0, DATA_BLOCK_SIZE)
      buffer = buffer.slice(DATA_BLOCK_SIZE)

      const reading = parseDataBlock(block)

      if (!reading.checksumValid) {
        emitter.emit('error', new Error('Data block checksum failed'))
        continue
      }

      emitter.emit('reading', reading)

      if (reading.sync) {
        // Sync bit marks start of new rotation
        if (seenFirstSync && currentScan.length > 0) {
          // Emit the completed scan
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
    buffer = new Uint8Array(0)
    currentScan = []
    seenFirstSync = false
  }

  emitter.push = push
  emitter.reset = reset
  return emitter
}
