import { test, expect } from 'bun:test'
import { Sweep } from '../src/sweep.js'

test('Sweep requires path', () => {
  expect(() => new Sweep()).toThrow('path is required')
  expect(() => new Sweep({})).toThrow('path is required')
})

test('Sweep constructor sets properties', () => {
  const sweep = new Sweep({ path: '/dev/ttyUSB0' })
  expect(sweep.path).toBe('/dev/ttyUSB0')
  expect(sweep.isScanning).toBe(false)
})

test('Sweep does not auto-open', () => {
  // Sweep should not try to connect on construction
  const sweep = new Sweep({ path: '/dev/nonexistent' })
  expect(sweep.isScanning).toBe(false)
})
