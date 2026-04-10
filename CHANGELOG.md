# Changelog

## 0.1.0 — 2026-04-10

Initial implementation.

- Sweep class with EventEmitter API (open, close, startScanning, stopScanning)
- Full protocol implementation: all 10 ASCII commands (DS, DX, MS, LR, LI, MI, MZ, IV, ID, RR)
- Binary data block parsing with checksum validation
- Scan assembly: collects data blocks into complete 360° rotations via sync bit detection
- Motor speed control (0–10 Hz) with stabilization polling
- Sample rate configuration (500–1050 Hz)
- Device and version info queries
- Built on bun-serialport, no native dependencies
