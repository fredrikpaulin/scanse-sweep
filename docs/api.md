# scanse-sweep API

## Sweep

```js
import { Sweep } from 'scanse-sweep'
```

### Constructor

```js
const sweep = new Sweep({ path: '/dev/ttyUSB0' })
```

The constructor does not open the serial connection. Call `sweep.open()` to connect.

### Properties

- `sweep.path` — device path (read-only)
- `sweep.isScanning` — `true` while data acquisition is active

### Connection

```js
await sweep.open()   // opens serial port at 115200 baud
await sweep.close()  // stops scanning if active, then closes port
```

### Scanning

```js
// Start streaming data blocks from the sensor
await sweep.startScanning()

// Listen for complete 360° rotations
sweep.on('scan', (readings) => {
  // readings = [{ angle, distance, signal, sync, error }, ...]
  for (const r of readings) {
    console.log(`${r.angle}° → ${r.distance} cm (signal: ${r.signal})`)
  }
})

// Listen for individual readings (every data block)
sweep.on('reading', (r) => {
  // { angle, distance, signal, sync, error, checksumValid }
})

// Stop streaming
await sweep.stopScanning()
```

A `scan` event fires each time the sensor completes a full rotation. The first partial rotation after `startScanning()` is discarded.

### Reading Object

Each reading in a scan contains:

- `angle` — azimuth in degrees (float, 0–360)
- `distance` — range in centimeters (integer)
- `signal` — signal strength 0–255 (higher is better)
- `sync` — `true` if this is the first reading after passing 0°
- `error` — `true` if the sensor reported a communication error

### Configuration

```js
// Motor speed: 0–10 Hz (integer)
await sweep.setMotorSpeed(5)
const speed = await sweep.getMotorSpeed()  // 5

// Wait for motor to stabilize after speed change (~6 seconds)
await sweep.waitUntilMotorReady()
// or with custom timeout:
await sweep.waitUntilMotorReady({ timeout: 15000, interval: 500 })

// Check motor status without waiting
const ready = await sweep.isMotorReady()  // true or false

// Sample rate: '01' (500-600Hz), '02' (750-800Hz), '03' (1000-1050Hz)
await sweep.setSampleRate('02')
const rate = await sweep.getSampleRate()  // '02'
```

### Device Information

```js
const version = await sweep.getVersion()
// { model: 'SWEEP', protocol: '01', firmware: '01', hardware: '11', serialNumber: '00000001' }

const info = await sweep.getDeviceInfo()
// { bitRate: 115200, laserState: '1', mode: '1', diagnostic: '0', motorSpeed: 5, sampleRate: 500 }
```

### Reset

```js
await sweep.reset()
// No response — green LED while resetting, blue when ready
```

### Events

- `'open'` — serial port opened
- `'close'` — serial port closed
- `'scan'` — complete 360° rotation (array of readings)
- `'reading'` — individual sensor reading (single data block)
- `'error'` — error occurred

## Low-Level Exports

For building custom integrations, the protocol internals are also exported:

```js
import {
  parseDataBlock, computeDataBlockChecksum,
  validateReceiptChecksum, parseVersionInfo, parseDeviceInfo,
  createScanAssembler,
  CMD, STATUS, SAMPLE_RATE, MOTOR_READY,
  BAUD_RATE, DATA_BLOCK_SIZE, motorSpeedCode
} from 'scanse-sweep'
```
