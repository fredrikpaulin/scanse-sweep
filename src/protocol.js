// Sweep protocol encoding/decoding.
// Handles ASCII command formatting, response parsing, and both checksum algorithms.

import { STATUS, DATA_BLOCK_SIZE } from './constants.js'

// --- Command encoding ---

export function encodeCommand(cmd, param) {
  return param ? `${cmd}${param}\n` : `${cmd}\n`
}

// --- ASCII response parsing ---

// Validate the checksum on an ASCII receipt status.
// Status is 2 ASCII bytes, sum is 1 ASCII byte.
// checksum = ((status[0] + status[1]) & 0x3F) + 0x30
export function validateReceiptChecksum(status1, status2, checksumByte) {
  const sum = ((status1 + status2) & 0x3F) + 0x30
  return sum === checksumByte
}

// Parse a simple response (no param echo): "CMDSTATUSSUM\n"
// Input: the raw line string (without the trailing LF)
// Returns { cmd, status, valid }
export function parseSimpleResponse(line) {
  if (line.length < 5) return { cmd: '', status: '', valid: false }

  const cmd = line.slice(0, 2)
  const status = line.slice(2, 4)
  const sumChar = line.charCodeAt(4)
  const valid = validateReceiptChecksum(line.charCodeAt(2), line.charCodeAt(3), sumChar)

  return { cmd, status, valid }
}

// Parse a param-echo response. The protocol sends two LF-terminated lines:
//   Line 1: "CMDPARAM"
//   Line 2: "STATUSSUM"
// We receive these as two separate readline events.
export function parseParamEchoLine1(line) {
  if (line.length < 4) return { cmd: '', param: '' }
  return { cmd: line.slice(0, 2), param: line.slice(2, 4) }
}

export function parseParamEchoLine2(line) {
  if (line.length < 3) return { status: '', valid: false }
  const status = line.slice(0, 2)
  const sumChar = line.charCodeAt(2)
  const valid = validateReceiptChecksum(line.charCodeAt(0), line.charCodeAt(1), sumChar)
  return { status, valid }
}

// Check if a status code indicates success
export function isSuccess(status) {
  return status === STATUS.OK || status === STATUS.OK_ALT
}

// Human-readable status error
export function statusError(cmd, status) {
  switch (status) {
    case STATUS.INVALID_PARAM: return new Error(`${cmd}: invalid parameter`)
    case STATUS.MOTOR_NOT_STABLE: return new Error(`${cmd}: motor speed not yet stabilized`)
    case STATUS.MOTOR_STATIONARY: return new Error(`${cmd}: motor is stationary (0 Hz). Adjust motor speed first.`)
    default: return new Error(`${cmd}: unexpected status '${status}'`)
  }
}

// --- Data block parsing ---

// Parse a 7-byte data block into a reading object.
// Returns { angle, distance, signal, sync, error, checksumValid }
export function parseDataBlock(buf) {
  const syncError = buf[0]
  const sync = !!(syncError & 0x01)
  const error = !!(syncError & 0x02)

  const azimuthRaw = (buf[2] << 8) | buf[1]
  const angle = azimuthRaw / 16.0

  const distance = (buf[4] << 8) | buf[3]
  const signal = buf[5]

  // Checksum: sum of bytes 0-5, mod 255
  let sum = 0
  for (let i = 0; i < 6; i++) sum += buf[i]
  const checksumValid = (sum % 255) === buf[6]

  return { angle, distance, signal, sync, error, checksumValid }
}

// Compute data block checksum for a 6-byte payload
export function computeDataBlockChecksum(bytes) {
  let sum = 0
  for (let i = 0; i < 6; i++) sum += bytes[i]
  return sum % 255
}

// --- Version info parsing ---
// Response: "IV" + model(5) + protocol(2) + firmware(2) + hardware(2) + serial(8)
export function parseVersionInfo(line) {
  if (line.length < 21) return null
  return {
    model: line.slice(2, 7),
    protocol: line.slice(7, 9),
    firmware: line.slice(9, 11),
    hardware: line.slice(11, 13),
    serialNumber: line.slice(13, 21),
  }
}

// --- Device info parsing ---
// Response: "ID" + bitRate(6) + laserState(1) + mode(1) + diagnostic(1) + motorSpeed(2) + sampleRate(4)
export function parseDeviceInfo(line) {
  if (line.length < 17) return null
  return {
    bitRate: parseInt(line.slice(2, 8), 10),
    laserState: line.slice(8, 9),
    mode: line.slice(9, 10),
    diagnostic: line.slice(10, 11),
    motorSpeed: parseInt(line.slice(11, 13), 10),
    sampleRate: parseInt(line.slice(13, 17), 10),
  }
}
