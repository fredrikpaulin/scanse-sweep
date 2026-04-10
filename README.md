# scanse-sweep

Bun-native driver for the Scanse Sweep 2D scanning LiDAR. Pure JavaScript over `bun-serialport` — no libsweep, no native addons, no compilation step.

## Install

```sh
bun install scanse-sweep
```

## Quick start

```js
import { Sweep } from 'scanse-sweep'

const sweep = new Sweep({ path: '/dev/ttyUSB0' })
await sweep.open()

await sweep.setMotorSpeed(5)
await sweep.waitUntilMotorReady()

sweep.on('scan', (readings) => {
  console.log(`${readings.length} points in this rotation`)
  for (const r of readings) {
    console.log(`  ${r.angle.toFixed(1)}° → ${r.distance} cm`)
  }
})

await sweep.startScanning()

// ... later
await sweep.stopScanning()
await sweep.close()
```

## What is the Scanse Sweep?

A discontinued but community-supported 360-degree 2D LiDAR. Rotates counterclockwise at 1–10 Hz, samples at 500–1050 Hz, connects via USB serial at 115200 baud. They show up on the secondhand market and work well for hobby robotics.

## Documentation

- [Overview](docs/overview.md) — how the driver works, two-mode architecture, scan assembly
- [API reference](docs/api.md) — full method list, events, configuration, low-level exports
- [Roadmap](docs/roadmap.md) — mock sensor, point cloud utilities, occupancy grid, WebSocket streaming
- [Changelog](CHANGELOG.md)

## License

MIT
