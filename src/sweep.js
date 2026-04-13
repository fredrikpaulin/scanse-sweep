// Sweep — main device class for the Scanse Sweep LiDAR.
// Manages the serial connection, command/response flow, and scan streaming.

import { EventEmitter } from 'node:events'
import { SerialPort, readlineParser } from 'bun-serialport'
import { createScanAssembler } from './scan.js'
import {
  encodeCommand, parseSimpleResponse, parseParamEchoLine1, parseParamEchoLine2,
  isSuccess, statusError, parseVersionInfo, parseDeviceInfo
} from './protocol.js'
import {
  BAUD_RATE, CMD, MOTOR_READY,
  COMMAND_TIMEOUT, MOTOR_READY_POLL_INTERVAL, MOTOR_READY_TIMEOUT,
  motorSpeedCode
} from './constants.js'

const STATE_IDLE = 0
const STATE_SCANNING = 1

export class Sweep extends EventEmitter {
  #port
  #path
  #state = STATE_IDLE
  #lineParser = null
  #scanAssembler = null
  #pendingResolve = null
  #pendingReject = null
  #pendingTimeout = null
  #paramEchoState = null  // tracks two-line param echo responses
  #dataHandler = null

  constructor(options = {}) {
    super()
    if (!options.path) throw new Error('options.path is required')
    this.#path = options.path
  }

  get path() { return this.#path }
  get isScanning() { return this.#state === STATE_SCANNING }

  async open() {
    this.#port = new SerialPort({
      path: this.#path,
      baudRate: BAUD_RATE,
      autoOpen: false,
    })

    this.#port.on('error', (err) => this.emit('error', err))
    this.#port.on('close', () => this.emit('close'))

    await this.#port.open()
    this.#enterCommandMode()
    this.emit('open')
  }

  async close() {
    if (this.#state === STATE_SCANNING) {
      await this.stopScanning()
    }
    this.#detachAll()
    await this.#port.close()
  }

  // --- Scanning ---

  async startScanning() {
    if (this.#state === STATE_SCANNING) throw new Error('Already scanning')

    const response = await this.#sendSimpleCommand(CMD.START_SCAN)
    if (!isSuccess(response.status)) throw statusError(CMD.START_SCAN, response.status)

    // Switch to binary streaming mode
    this.#enterScanMode()
  }

  async stopScanning() {
    if (this.#state !== STATE_SCANNING) return

    // Detach scan mode handlers
    this.#exitScanMode()

    // Send DX — first one may get garbled with leftover data blocks
    await this.#port.write(encodeCommand(CMD.STOP_SCAN))

    // Brief pause to let the sensor process and flush remaining data
    await Bun.sleep(50)
    await this.#port.flush()

    // Re-enter command mode and send DX again for a clean response
    this.#enterCommandMode()

    try {
      const response = await this.#sendSimpleCommand(CMD.STOP_SCAN)
      // Accept any response — the sensor has stopped regardless
    } catch {
      // Timeout is acceptable here; sensor may have already stopped
    }

    this.#state = STATE_IDLE
  }

  // --- Configuration ---

  async setMotorSpeed(hz) {
    const code = motorSpeedCode(hz)
    const response = await this.#sendParamCommand(CMD.MOTOR_SPEED, code)
    if (!isSuccess(response.status)) throw statusError(CMD.MOTOR_SPEED, response.status)
  }

  async getMotorSpeed() {
    const line = await this.#sendInfoCommand(CMD.MOTOR_INFO)
    // Response: "MI" + speedCode(2)
    return parseInt(line.slice(2, 4), 10)
  }

  async isMotorReady() {
    const line = await this.#sendInfoCommand(CMD.MOTOR_READY)
    // Response: "MZ" + readyCode(2)
    return line.slice(2, 4) === MOTOR_READY.READY
  }

  async waitUntilMotorReady(options = {}) {
    const { timeout = MOTOR_READY_TIMEOUT, interval = MOTOR_READY_POLL_INTERVAL } = options
    const deadline = Date.now() + timeout

    while (Date.now() < deadline) {
      if (await this.isMotorReady()) return true
      await Bun.sleep(interval)
    }

    throw new Error(`Motor did not stabilize within ${timeout}ms`)
  }

  async setSampleRate(code) {
    if (!['01', '02', '03'].includes(code)) {
      throw new Error(`Invalid sample rate code '${code}'. Use '01', '02', or '03'.`)
    }
    const response = await this.#sendParamCommand(CMD.SAMPLE_RATE, code)
    if (!isSuccess(response.status)) throw statusError(CMD.SAMPLE_RATE, response.status)
  }

  async getSampleRate() {
    const line = await this.#sendInfoCommand(CMD.LIDAR_INFO)
    // Response: "LI" + sampleRateCode(2)
    return line.slice(2, 4)
  }

  // --- Device info ---

  async getVersion() {
    const line = await this.#sendInfoCommand(CMD.VERSION_INFO)
    return parseVersionInfo(line)
  }

  async getDeviceInfo() {
    const line = await this.#sendInfoCommand(CMD.DEVICE_INFO)
    return parseDeviceInfo(line)
  }

  async reset() {
    await this.#port.write(encodeCommand(CMD.RESET))
    // RR has no response. Green LED while resetting, blue when ready.
  }

  // --- Private: mode switching ---

  #enterCommandMode() {
    this.#detachAll()
    this.#lineParser = readlineParser()
    this.#port.pipe(this.#lineParser)

    this.#lineParser.on('data', (line) => {
      if (this.#pendingResolve) {
        this.#resolvePending(line)
      }
    })
  }

  #enterScanMode() {
    this.#detachAll()
    this.#state = STATE_SCANNING

    this.#scanAssembler = createScanAssembler()
    this.#scanAssembler.on('scan', (scan) => this.emit('scan', scan))
    this.#scanAssembler.on('reading', (reading) => this.emit('reading', reading))
    this.#scanAssembler.on('error', (err) => this.emit('error', err))

    this.#dataHandler = (chunk) => this.#scanAssembler.push(chunk)
    this.#port.on('data', this.#dataHandler)
  }

  #exitScanMode() {
    if (this.#dataHandler) {
      this.#port.off('data', this.#dataHandler)
      this.#dataHandler = null
    }
    if (this.#scanAssembler) {
      this.#scanAssembler.reset()
      this.#scanAssembler = null
    }
  }

  #detachAll() {
    this.#exitScanMode()

    if (this.#lineParser) {
      this.#port.unpipe(this.#lineParser)
      this.#lineParser.removeAllListeners()
      this.#lineParser = null
    }

    this.#clearPending()
  }

  // --- Private: command sending ---

  // Simple command: send CMD\n, expect CMD+STATUS+SUM\n
  #sendSimpleCommand(cmd, timeout = COMMAND_TIMEOUT) {
    return new Promise((resolve, reject) => {
      this.#pendingResolve = (line) => {
        const response = parseSimpleResponse(line)
        if (!response.valid) {
          reject(new Error(`${cmd}: invalid response checksum`))
          return
        }
        resolve(response)
      }
      this.#pendingReject = reject
      this.#pendingTimeout = setTimeout(() => {
        this.#clearPending()
        reject(new Error(`${cmd}: command timeout (${timeout}ms)`))
      }, timeout)

      this.#port.write(encodeCommand(cmd)).catch(reject)
    })
  }

  // Param command: send CMD+PARAM\n, expect two lines:
  //   Line 1: CMD+PARAM
  //   Line 2: STATUS+SUM
  #sendParamCommand(cmd, param, timeout = COMMAND_TIMEOUT) {
    return new Promise((resolve, reject) => {
      this.#paramEchoState = { cmd, param, waitingForLine2: false }

      this.#pendingResolve = (line) => {
        const state = this.#paramEchoState
        if (!state.waitingForLine2) {
          // Line 1: echo of cmd + param
          state.waitingForLine2 = true
          return // keep waiting for line 2
        }
        // Line 2: status + sum
        const { status, valid } = parseParamEchoLine2(line)
        this.#paramEchoState = null
        if (!valid) {
          reject(new Error(`${cmd}: invalid response checksum`))
          return
        }
        resolve({ cmd, param, status, valid })
      }

      this.#pendingReject = reject
      this.#pendingTimeout = setTimeout(() => {
        this.#paramEchoState = null
        this.#clearPending()
        reject(new Error(`${cmd}: command timeout (${timeout}ms)`))
      }, timeout)

      this.#port.write(encodeCommand(cmd, param)).catch(reject)
    })
  }

  // Info command: send CMD\n, get back a single info line (no status/sum)
  #sendInfoCommand(cmd, timeout = COMMAND_TIMEOUT) {
    return new Promise((resolve, reject) => {
      this.#pendingResolve = (line) => resolve(line)
      this.#pendingReject = reject
      this.#pendingTimeout = setTimeout(() => {
        this.#clearPending()
        reject(new Error(`${cmd}: command timeout (${timeout}ms)`))
      }, timeout)

      this.#port.write(encodeCommand(cmd)).catch(reject)
    })
  }

  #resolvePending(value) {
    const resolve = this.#pendingResolve
    if (!resolve) return

    // For param-echo commands, line 1 sets waitingForLine2 inside the
    // resolve callback. Call resolve first, then check if we're done.
    resolve(value)

    // If paramEchoState still exists after resolve, we're mid param-echo
    // (line 1 just arrived) — keep the timeout running.
    if (this.#paramEchoState) return

    clearTimeout(this.#pendingTimeout)
    this.#pendingResolve = null
    this.#pendingReject = null
    this.#pendingTimeout = null
  }

  #clearPending() {
    if (this.#pendingTimeout) clearTimeout(this.#pendingTimeout)
    this.#pendingResolve = null
    this.#pendingReject = null
    this.#pendingTimeout = null
    this.#paramEchoState = null
  }
}

