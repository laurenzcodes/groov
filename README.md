# Groov

![Groov app preview](src/shared/preview.png)

Groov is a desktop audio deck monitor built with Electrobun + React.  
Load a track, inspect a high-resolution waveform, detect tempo/beat grid, and jump around quickly with DJ-style transport controls.

## Features

- Open tracks from file picker or drag-and-drop
- Waveform rendering with detailed main view + minimap overview
- Tempo and beat/bar detection (BPM + beat offset)
- Time and beat/bar timeline modes
- Fast navigation controls:
  - Play/pause
  - +/- 10s
  - +/- 1 beat
  - +/- 1 bar
  - Cue set/jump
- Track history with quick reload and removal
- Waveform analysis caching for faster re-opens
- Re-analyze current track on demand

## Prerequisites

- [Bun](https://bun.sh/)

## Development

```bash
bun install

# Development with HMR (recommended)
bun run dev:hmr

# Development without HMR
bun run dev
```

When using HMR, Vite runs on `http://localhost:5173` and the desktop app connects to it automatically.

## Build

```bash
# Build local dev channel app
bun run build

# Build stable channel app
bun run build:prod
```

### Build Outputs

- macOS: `build/stable-macos-arm64/Groov.app`
- Windows (on Windows runner/machine): `artifacts/stable-win-x64-Groov-Setup.zip`
- Linux (on Linux runner/machine): `artifacts/stable-linux-x64-Groov-Setup.tar.gz`

This project currently focuses on Windows release artifacts.

## Run From Source Builds

### macOS

1. Build:
```bash
bun run build:prod
```
2. Start app:
```bash
open build/stable-macos-arm64/Groov.app
```
3. If macOS blocks first launch due to quarantine:
```bash
xattr -dr com.apple.quarantine build/stable-macos-arm64/Groov.app
open build/stable-macos-arm64/Groov.app
```

### Windows

1. Build on Windows:
```bash
bunx electrobun build --env=stable
```
2. Use the generated installer package:
`artifacts/stable-win-x64-Groov-Setup.zip`
3. Extract the zip and run `Groov-Setup.exe`.

Note: a true standalone single-file `Groov-Setup.exe` is not supported by the current Electrobun Windows packaging flow. The zip is required because it contains installer sidecar payload files.

### Linux

1. Build on Linux:
```bash
bunx electrobun build --env=stable
```
2. Extract and run the installer:
```bash
tar -xzf artifacts/stable-linux-x64-Groov-Setup.tar.gz
chmod +x installer
./installer
```

## Keyboard Shortcuts

- `Space`: play/pause
- `Left` / `Right`: seek -/+ 1 second
- `Shift + Left` / `Shift + Right`: seek -/+ 10 seconds
- `C`: set cue point

## Project Structure

```text
src/
  bun/         # Main process, RPC handlers, analysis/cache/history
  mainview/    # React UI (panels, waveform canvas, playback controls)
  shared/      # Shared RPC types and assets
```

## Windows Release Automation

- Workflow: `.github/workflows/windows-release.yml`
- Trigger by pushing tags like `win-v1.0.0`
- Uploads the canonical Windows installer package only:
  - `stable-win-x64-Groov-Setup.zip`
