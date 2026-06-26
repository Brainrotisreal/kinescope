# Kinescope

Kinescope is a minimalist, high-aesthetic desktop GUI frontend for `yt-dlp`. It is designed with a premium, dark cinematic steel slate style, glowing amber telemetry highlights, and a real-time responsive Canvas-based oscilloscope that reflects your download speed and system metrics.

---

## Key Features

- **Cross-Platform Compatibility**: Fully compatible with both **Windows** (using WebView2 Edge Chromium) and **macOS** (using WebKit).
- **Auto-Configured Dependencies**: Downloads and extracts platform-specific FFmpeg static binaries locally in a background thread upon first startup so that merging video and audio formats works out-of-the-box.
- **Dynamic Format Selector**: Pasting a YouTube URL fetches available video and audio streams, letting you pick resolution formats dynamically.
- **Responsive Oscilloscope**: A custom Canvas audio-wave/oscilloscope visualizer that reactively scales and pulses based on your download speed, progress, and system states.
- **Native Folder Picker**: Seamlessly integrated, left-aligned system directory picker (`FileDialog.FOLDER`) for choosing save paths.
- **Portable Standalone Binaries**: Compiles into a single, self-contained executable with custom application icon styling.

---

## Tech Stack

- **Frontend**: React (Vite, Vanilla CSS layout, custom dynamic Canvas visualizer).
- **Backend**: Python 3.11+, `pywebview` for window orchestration, `yt-dlp` for downloading logic.
- **Build / Packaging**: PyInstaller with custom scripts for compiling frontend assets, generating OS-specific icon configurations (`.ico`/`.icns`), and bundling dependencies.

---

## Local Development

### Prerequisites
- Python 3.11+
- Node.js 20+ & npm

### Initial Setup
1. Clone the repository.
2. Initialize virtual environments, install Python/Node dependencies, and start the app in development mode:
   ```bash
   python run.py --dev
   ```

This will spin up the Vite development server in the background and open the Python `pywebview` client window connected to the hot-reloading frontend.

---

## Packaging & Compilation

To compile a standalone binary locally, run:
```bash
python build_exe.py
```
- **Windows**: Outputs a standalone portable file at `dist/Kinescope.exe`.
- **macOS**: Outputs an App bundle at `dist/Kinescope.app`.

### Continuous Integration (GitHub Actions)
This repository includes a GitHub Actions workflow (`.github/workflows/build.yml`) that automatically compiles release-ready binaries for both platforms:
1. Triggers on any pushes to the `main` or `master` branch.
2. If you push a tag starting with `v` (e.g. `v1.0.0`), it will compile and automatically upload the Windows `.exe` and a zipped macOS `.app` bundle directly as assets to a new GitHub Release.
