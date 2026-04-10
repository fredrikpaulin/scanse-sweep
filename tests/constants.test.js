import { test, expect } from 'bun:test'
import {
  motorSpeedCode, motorSpeedFromCode,
  CMD, STATUS, SAMPLE_RATE, MOTOR_READY,
  BAUD_RATE, DATA_BLOCK_SIZE
} from '../src/constants.js'

test('motorSpeedCode pads single digits', () => {
  expect(motorSpeedCode(0)).toBe('00')
  expect(motorSpeedCode(5)).toBe('05')
  expect(motorSpeedCode(9)).toBe('09')
  expect(motorSpeedCode(10)).toBe('10')
})

test('motorSpeedCode rejects out of range', () => {
  expect(() => motorSpeedCode(-1)).toThrow()
  expect(() => motorSpeedCode(11)).toThrow()
  expect(() => motorSpeedCode(5.5)).toThrow()
})

test('motorSpeedFromCode converts back', () => {
  expect(motorSpeedFromCode('00')).toBe(0)
  expect(motorSpeedFromCode('05')).toBe(5)
  expect(motorSpeedFromCode('10')).toBe(10)
})

test('CMD codes are 2-char strings', () => {
  for (const key of Object.keys(CMD)) {
    expect(CMD[key].length).toBe(2)
  }
})

test('BAUD_RATE is 115200', () => {
  expect(BAUD_RATE).toBe(115200)
})

test('DATA_BLOCK_SIZE is 7', () => {
  expect(DATA_BLOCK_SIZE).toBe(7)
})

test('SAMPLE_RATE has valid codes', () => {
  expect(SAMPLE_RATE['01']).toBeDefined()
  expect(SAMPLE_RATE['02']).toBeDefined()
  expect(SAMPLE_RATE['03']).toBeDefined()
  expect(SAMPLE_RATE['01'].min).toBe(500)
  expect(SAMPLE_RATE['03'].max).toBe(1050)
})

test('MOTOR_READY codes', () => {
  expect(MOTOR_READY.READY).toBe('00')
  expect(MOTOR_READY.NOT_READY).toBe('01')
})
