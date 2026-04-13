# Changelog

## 0.1.1 — 2026-04-13

Bug fixes, performance improvements, and Bun optimization.

- Fixed pipe cleanup in mode switching — `#detachAll()` used a no-op anonymous function instead of `unpipe()`, causing listener accumulation when toggling between command and scan mode
- Fixed leaked timeout in param-echo commands — the pending timeout was never cleared after a successful two-line response
- Added checksum validation on ASCII command responses — `#sendSimpleCommand` and `#sendParamCommand` now reject on invalid checksums instead of silently accepting garbled data
- Replaced scan assembler buffer strategy — switched from allocate-and-copy on every `push()` to a pre-allocated ring buffer with `subarray()` views and `copyWithin()` compaction, eliminating thousands of allocations per second during scanning
- Replaced custom `sleep()` with `Bun.sleep()` for native Bun timer support
- Removed unused `LF` constant export
- Fixed operator precedence bug in ARCHITECTURE.md checksum formula
- Fixed version info hardware field documented as 1 byte (actually 2 bytes) in ARCHITECTURE.md

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
