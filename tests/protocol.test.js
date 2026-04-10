import { test, expect } from 'bun:test'
import {
  encodeCommand, validateReceiptChecksum, parseSimpleResponse,
  parseParamEchoLine1, parseParamEchoLine2, isSuccess, statusError,
  parseDataBlock, computeDataBlockChecksum,
  parseVersionInfo, parseDeviceInfo
} from '../src/protocol.js'

// --- Command encoding ---

test('encodeCommand without param', () => {
  expect(encodeCommand('DS')).toBe('DS\n')
  expect(encodeCommand('DX')).toBe('DX\n')
})

test('encodeCommand with param', () => {
  expect(encodeCommand('MS', '05')).toBe('MS05\n')
  expect(encodeCommand('LR', '02')).toBe('LR02\n')
})

// --- Receipt checksum ---

test('validateReceiptChecksum for common case 00P', () => {
  // '0' = 0x30, '0' = 0x30, 'P' = 0x50
  // (0x30 + 0x30) & 0x3F = 0x60 & 0x3F = 0x20
  // 0x20 + 0x30 = 0x50 = 'P'
  expect(validateReceiptChecksum(0x30, 0x30, 0x50)).toBe(true)
})

test('validateReceiptChecksum rejects bad checksum', () => {
  expect(validateReceiptChecksum(0x30, 0x30, 0x41)).toBe(false)
})

test('validateReceiptChecksum for status 99', () => {
  // '9' = 0x39, '9' = 0x39
  // (0x39 + 0x39) & 0x3F = 0x72 & 0x3F = 0x32
  // 0x32 + 0x30 = 0x62 = 'b'
  expect(validateReceiptChecksum(0x39, 0x39, 0x62)).toBe(true)
})

test('validateReceiptChecksum for status 11', () => {
  // '1' = 0x31, '1' = 0x31
  // (0x31 + 0x31) & 0x3F = 0x62 & 0x3F = 0x22
  // 0x22 + 0x30 = 0x52 = 'R'
  expect(validateReceiptChecksum(0x31, 0x31, 0x52)).toBe(true)
})

// --- Simple response parsing ---

test('parseSimpleResponse for DS success', () => {
  const result = parseSimpleResponse('DS00P')
  expect(result.cmd).toBe('DS')
  expect(result.status).toBe('00')
  expect(result.valid).toBe(true)
})

test('parseSimpleResponse for DX success', () => {
  const result = parseSimpleResponse('DX00P')
  expect(result.cmd).toBe('DX')
  expect(result.status).toBe('00')
  expect(result.valid).toBe(true)
})

test('parseSimpleResponse for DS motor not stable', () => {
  // Status '12': '1'=0x31, '2'=0x32
  // (0x31 + 0x32) & 0x3F = 0x63 & 0x3F = 0x23
  // 0x23 + 0x30 = 0x53 = 'S'
  const result = parseSimpleResponse('DS12S')
  expect(result.cmd).toBe('DS')
  expect(result.status).toBe('12')
  expect(result.valid).toBe(true)
})

test('parseSimpleResponse too short', () => {
  const result = parseSimpleResponse('DS')
  expect(result.valid).toBe(false)
})

// --- Param echo response parsing ---

test('parseParamEchoLine1 extracts cmd and param', () => {
  const result = parseParamEchoLine1('MS05')
  expect(result.cmd).toBe('MS')
  expect(result.param).toBe('05')
})

test('parseParamEchoLine2 validates status', () => {
  const result = parseParamEchoLine2('00P')
  expect(result.status).toBe('00')
  expect(result.valid).toBe(true)
})

// --- Status helpers ---

test('isSuccess recognizes 00 and 99', () => {
  expect(isSuccess('00')).toBe(true)
  expect(isSuccess('99')).toBe(true)
  expect(isSuccess('11')).toBe(false)
  expect(isSuccess('12')).toBe(false)
})

test('statusError returns descriptive errors', () => {
  expect(statusError('DS', '11').message).toContain('invalid parameter')
  expect(statusError('DS', '12').message).toContain('motor speed not yet stabilized')
  expect(statusError('DS', '13').message).toContain('motor is stationary')
})

// --- Data block parsing ---

function makeDataBlock(syncError, azimuthLow, azimuthHigh, distLow, distHigh, signal) {
  const bytes = new Uint8Array(7)
  bytes[0] = syncError
  bytes[1] = azimuthLow
  bytes[2] = azimuthHigh
  bytes[3] = distLow
  bytes[4] = distHigh
  bytes[5] = signal
  // Checksum: sum of bytes 0-5, mod 255
  let sum = 0
  for (let i = 0; i < 6; i++) sum += bytes[i]
  bytes[6] = sum % 255
  return bytes
}

test('parseDataBlock extracts angle correctly', () => {
  // 90 degrees: 90 * 16 = 1440 = 0x05A0 → low=0xA0, high=0x05
  const block = makeDataBlock(0x00, 0xA0, 0x05, 0x00, 0x00, 0x00)
  const reading = parseDataBlock(block)
  expect(reading.angle).toBe(90)
  expect(reading.sync).toBe(false)
  expect(reading.checksumValid).toBe(true)
})

test('parseDataBlock extracts distance correctly', () => {
  // Distance 1000 cm = 0x03E8 → low=0xE8, high=0x03
  const block = makeDataBlock(0x00, 0x00, 0x00, 0xE8, 0x03, 0x00)
  const reading = parseDataBlock(block)
  expect(reading.distance).toBe(1000)
  expect(reading.checksumValid).toBe(true)
})

test('parseDataBlock detects sync bit', () => {
  const block = makeDataBlock(0x01, 0x00, 0x00, 0x00, 0x00, 0x80)
  const reading = parseDataBlock(block)
  expect(reading.sync).toBe(true)
  expect(reading.error).toBe(false)
})

test('parseDataBlock detects error bit', () => {
  const block = makeDataBlock(0x02, 0x00, 0x00, 0x00, 0x00, 0x00)
  const reading = parseDataBlock(block)
  expect(reading.sync).toBe(false)
  expect(reading.error).toBe(true)
})

test('parseDataBlock detects sync + error together', () => {
  const block = makeDataBlock(0x03, 0x00, 0x00, 0x00, 0x00, 0x00)
  const reading = parseDataBlock(block)
  expect(reading.sync).toBe(true)
  expect(reading.error).toBe(true)
})

test('parseDataBlock rejects bad checksum', () => {
  const block = makeDataBlock(0x00, 0x00, 0x00, 0x00, 0x00, 0x00)
  block[6] = 0xFF // corrupt checksum
  const reading = parseDataBlock(block)
  expect(reading.checksumValid).toBe(false)
})

test('parseDataBlock signal strength', () => {
  const block = makeDataBlock(0x00, 0x00, 0x00, 0x00, 0x00, 0xC8) // 200
  const reading = parseDataBlock(block)
  expect(reading.signal).toBe(200)
})

test('parseDataBlock fractional angle', () => {
  // 45.5 degrees: 45.5 * 16 = 728 = 0x02D8 → low=0xD8, high=0x02
  const block = makeDataBlock(0x00, 0xD8, 0x02, 0x00, 0x00, 0x00)
  const reading = parseDataBlock(block)
  expect(reading.angle).toBe(45.5)
})

test('computeDataBlockChecksum matches', () => {
  const bytes = new Uint8Array([0x01, 0xA0, 0x05, 0xE8, 0x03, 0x80])
  const checksum = computeDataBlockChecksum(bytes)
  let sum = 0
  for (let i = 0; i < 6; i++) sum += bytes[i]
  expect(checksum).toBe(sum % 255)
})

// --- Version info parsing ---

test('parseVersionInfo extracts fields', () => {
  const result = parseVersionInfo('IVSWEEP01011100000001')
  expect(result.model).toBe('SWEEP')
  expect(result.protocol).toBe('01')
  expect(result.firmware).toBe('01')
  expect(result.hardware).toBe('11')
  expect(result.serialNumber).toBe('00000001')
})

test('parseVersionInfo returns null for short input', () => {
  expect(parseVersionInfo('IV')).toBe(null)
})

// --- Device info parsing ---

test('parseDeviceInfo extracts fields', () => {
  const result = parseDeviceInfo('ID115200110050500')
  expect(result.bitRate).toBe(115200)
  expect(result.laserState).toBe('1')
  expect(result.mode).toBe('1')
  expect(result.diagnostic).toBe('0')
  expect(result.motorSpeed).toBe(5)
  expect(result.sampleRate).toBe(500)
})

test('parseDeviceInfo returns null for short input', () => {
  expect(parseDeviceInfo('ID')).toBe(null)
})
