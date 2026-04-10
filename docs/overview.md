# How scanse-sweep works

scanse-sweep is a pure JavaScript driver for the Scanse Sweep 2D scanning LiDAR. It communicates with the sensor over USB serial at 115200 baud using an ASCII command protocol, with binary data blocks for scan data. The library sits on top of `bun-serialport` for the serial I/O.

## The sensor

The Sweep is a 360-degree 2D LiDAR that rotates counterclockwise at 1–10 Hz. It samples at 500–1050 Hz depending on configuration, measuring distance (in cm) and signal strength at each angle. The sensor connects via a micro-USB cable that presents as a serial port on the host.

## Two modes of operation

The driver operates in two modes: **command mode** and **scanning mode**.

In command mode, the sensor accepts ASCII commands (2-character codes like `MS`, `MZ`, `IV`) and replies with ASCII responses terminated by newline. This is used for configuration, status queries, and starting/stopping scans.

In scanning mode (after sending the `DS` command), the sensor streams a continuous flow of 7-byte binary data blocks — one per range measurement. Each block contains the azimuth angle, distance, signal strength, a sync bit marking the start of each rotation, and a checksum. The stream continues until the host sends `DX` to stop.

## Scan assembly

Raw data blocks arrive one reading at a time. The scan assembler collects them into complete 360° rotations by watching the sync bit — when it flips to `1`, it means the sensor just passed the 0° mark. At that point the assembler emits the accumulated readings as a single `scan` event and starts a fresh rotation.

The first rotation after starting a scan is always partial (you start mid-rotation), so the assembler discards it and only begins emitting after seeing two sync markers.

## Typical lifecycle

A typical session with the sensor looks like this: open the port, set the motor speed, wait for the motor to stabilize (it takes about 6 seconds), start scanning, process complete rotations, then stop scanning and close.

The `waitUntilMotorReady()` method handles stabilization by polling the `MZ` command every 500ms until the sensor reports ready. You should always call this after changing motor speed and before starting a scan — the sensor will reject `DS` if the motor isn't stable.

## Error handling

The protocol has two checksum schemes. ASCII command responses use a single-byte checksum derived from the status bytes with a bit masking trick that keeps it as a printable ASCII character. Binary data blocks use a simple `sum % 255` checksum over the first 6 bytes.

Bad checksums on data blocks are reported as errors but don't stop the scan — the reading is discarded and the stream continues. The sync/error byte in each data block also carries a communication error flag (bit 1), which is passed through to your code so you can decide whether to use that reading.

If the serial connection drops, bun-serialport's disconnect detection propagates through as an error event.

## Dependencies

The only dependency is `bun-serialport`. No native addons, no libsweep, no C compilation.
