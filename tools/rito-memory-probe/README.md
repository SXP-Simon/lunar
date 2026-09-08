# Rito Windows memory probe

This standalone release-mode probe exercises the same `ReaderSessionV1` API
and the embedded Rito source used by the Android application. It records Rust
allocator counters, Windows working-set samples, pagination time, page output
counts, and lifecycle checkpoints.

Run it from the Lunar repository root:

```powershell
cargo +1.95.0 run --release --manifest-path tools/rito-memory-probe/Cargo.toml -- `
  '<book.epub>' `
  --source-revision (git rev-parse HEAD) `
  --output reports/rito-memory/result.json
```

The default `current` feature uses the Rito source embedded in the Android
module. The `reference` feature uses `lib/Rito` for an equal-input comparison:

```powershell
cargo +1.95.0 run --release --manifest-path tools/rito-memory-probe/reference/Cargo.toml -- `
  '<book.epub>' `
  --source-revision (git -C lib/Rito rev-parse HEAD) `
  --output reports/rito-memory/reference.json
```

The defaults model Lunar's single-page typography on the attached Xiaomi 13
portrait viewport: `392.727 x 872.727`, margins `84 24 56 24`, font size `18`,
and line height `1.65`. The device values came from ADB: `1080 x 2400` at
`440 dpi`, status bar `121 px`, and navigation bar `44 px`. Override them with
`--width`, `--height`, `--margin-top`,
`--margin-right`, `--margin-bottom`, and `--margin-left` after reading exact
values from the device.

The allocator values cover Rust allocations in the probe and Rito. Memory
points are reported relative to the baseline taken after argument parsing and
working-set sampler startup. Windows working set includes executable code,
mapped files, allocator bookkeeping, and other process memory.
