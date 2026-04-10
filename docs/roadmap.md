# Roadmap

## v0.2.0 — Mock sensor for testing

An in-memory mock that simulates the Sweep protocol. Generates synthetic data blocks with configurable scan patterns (circular room, random obstacles, etc.). Responds to all ASCII commands with valid responses. This enables testing scan processing pipelines in CI without hardware.

## v0.3.0 — Point cloud utilities

Helper functions for working with scan data: converting polar readings (angle + distance) to Cartesian x/y coordinates, filtering by distance range or signal strength, merging multiple rotations into denser point clouds, and exporting to common formats (CSV, simple JSON arrays).

## v0.4.0 — Occupancy grid

A 2D occupancy grid builder that takes scan data and produces a grid map. Each cell tracks whether it's occupied, free, or unknown. Configurable resolution (cm per cell) and map bounds. Useful for simple SLAM-like applications and obstacle detection.

## v0.5.0 — WebSocket streaming

A built-in `Bun.serve()` WebSocket server that streams scan data to browser clients. Ships with a minimal HTML visualizer that renders the point cloud in real time using Canvas. Designed for debugging and demos — plug in the sensor, run the server, open a browser.

## Future considerations

**Multi-sensor support.** Running two or more Sweep sensors simultaneously with coordinated scan assembly and merged point clouds. Requires managing multiple serial ports and aligning coordinate frames.

**Adaptive motor speed.** Automatically adjust rotation speed based on the application — slower for dense mapping, faster for real-time obstacle avoidance. Would monitor scan density and signal quality to find the best tradeoff.

**ROS 2 bridge.** Publish scan data as ROS 2 `LaserScan` messages for integration with the robotics ecosystem. Could be a separate package that depends on this one.
