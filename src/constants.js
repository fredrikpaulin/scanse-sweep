// Scanse Sweep protocol constants.

// UART settings
export const BAUD_RATE = 115200

// Command codes (2-byte ASCII)
export const CMD = {
  START_SCAN: 'DS',
  STOP_SCAN: 'DX',
  MOTOR_SPEED: 'MS',
  SAMPLE_RATE: 'LR',
  LIDAR_INFO: 'LI',
  MOTOR_INFO: 'MI',
  MOTOR_READY: 'MZ',
  VERSION_INFO: 'IV',
  DEVICE_INFO: 'ID',
  RESET: 'RR',
}

// Status codes returned in ASCII responses
export const STATUS = {
  OK: '00',
  OK_ALT: '99',
  INVALID_PARAM: '11',
  MOTOR_NOT_STABLE: '12',
  MOTOR_STATIONARY: '13',
}

// Motor speed codes: '00' through '10' (0–10 Hz)
// The code is the ASCII representation of the Hz value, zero-padded to 2 chars
export function motorSpeedCode(hz) {
  if (!Number.isInteger(hz) || hz < 0 || hz > 10) {
    throw new Error(`Motor speed must be integer 0–10 Hz, got ${hz}`)
  }
  return String(hz).padStart(2, '0')
}

export function motorSpeedFromCode(code) {
  return parseInt(code, 10)
}

// Sample rate codes
export const SAMPLE_RATE = {
  '01': { min: 500, max: 600, label: '500-600 Hz' },
  '02': { min: 750, max: 800, label: '750-800 Hz' },
  '03': { min: 1000, max: 1050, label: '1000-1050 Hz' },
}

// Motor ready codes
export const MOTOR_READY = {
  READY: '00',
  NOT_READY: '01',
}

// Data block constants
export const DATA_BLOCK_SIZE = 7

// Timing defaults (ms)
export const COMMAND_TIMEOUT = 1000
export const MOTOR_READY_POLL_INTERVAL = 500
export const MOTOR_READY_TIMEOUT = 10000
export const MOTOR_STABILIZE_TIME = 6000

