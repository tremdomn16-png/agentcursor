# Changelog

All notable changes to AgentCursor. Format based on [Keep a Changelog](https://keepachangelog.com/).

## [0.4.1-win] - 2026-09-23

**Windows-first release (tremdomn16-png fork)** — on-demand floating preview that shows *only* what the agent touches.

### Added
- **Windows UIA desktop driver** (`src/desktop/win.ts`, `src/desktop/service-win.ts`): `winApps`, `winSnapshot`, `winClick`, `winType`, `winKey`, powered by PowerShell + UI Automation. No native build needed on `win32`.
- **Win screenshot fallback** (`winScreenCapture`) via `System.Drawing` + `VirtualScreen` (JPEG 960px, used when extension is offline).
- **Agent focus tracker** (`src/server/focus.ts`): tracks last `browser` vs `window` target; `read_page`/`desktop_open`/`desktop_click` etc. pin focus.
- **Frame hub** (`src/server/frame-hub.ts`): coalesced captures, `X-Agentcursor-Source` + `X-Agentcursor-Focus` headers, `WindowStream` continuous window capture for fluid previews.
- **Window streamer** (`src/server/window-stream.ts`): persistent PS loop that writes `frame.jpg` every ~55ms for the focused `pid` — live view reads the file instead of spawning PS per frame.
- **Event bus** (`src/server/events.ts`): ring buffer (80 events) with `GET /api/events?since=`, `activity` (running/last tool), used by floating panel and `/live`.
- **MJPEG stream** `GET /api/stream` (`multipart/x-mixed-replace; boundary=frame`) + HTML dashboard `GET /live` (video + agent feed).
- **Live HTML** (`src/server/live.html`): professional grid `video | feed`, pulse indicator, fps/focus/status, auto-reconnect.
- **On-demand live view**: `AGENTCURSOR_LIVE` defaults to `0` (was `1` on `win32`). Panel only opens via `live_view on` tool / `POST /api/live` / `agentcursor live_view on`. Stays out of Alt+Tab, never steals focus, draggable header, opacity toggle.
- **HTTP additions**: `GET /api/screenshot` now uses `FrameHub`, `GET /api/events`, `GET /api/stream`, `GET /live`.
- **opencode config**: `opencode.json` sets `AGENTCURSOR_LIVE=0` by default.

### Changed
- `src/server/create.ts`: `Runtime` now carries `events`, `focus`, `frames`; `registerTools`/`registerDesktopTools` instrumented to push to event bus + update focus.
- `src/server/http.ts`: screenshot is hub-based; added stream/events/live routes.
- `src/server/tools.ts` + `desktop-tools.ts`: wrapped via `tracked()` → auto-feeds event bus + focus.
- `src/index.ts`: autostart live only if `AGENTCURSOR_LIVE=1`.
- `src/desktop/service.ts` (mac) + `service-win.ts`: added `focusInfo()` for hub.
- `src/cli/autostart.ts`: rewritten `LIVE_VIEW_PS1` (520×400, ListBox feed, 70ms frame timer + 400ms event timer, `--window-stream` aware, wmic fallback for pidfile).

### Fixed
- **PS 5.1 `[:8]` ParserError** in `winScreenCapture`/`winScreenshot` temp-dir creation: now uses Node `mkdtempSync` + `psFile` instead of `-Command $d = Join-Path $env:TEMP "ac-full-$([Guid]...[:8])"`.
- `psFile` UTF-8 BOM handling for UIA scripts.
- Double-daemon race (BUILD_ID + kill before `serve`).
- `live_view status` pidfile stale detection.

## [0.4.0] - upstream
- Desktop control for any Mac app via `desktop_*`, Swift helper `agentcursor-ax`, shared HTTP service.

## [0.3.0] - upstream
- Programmatic SDK `AgentCursor` with Playwright-shaped locators.

## [Unreleased] - Planned (see `docs/TOOLS.md`)
- `upload` (file input), `selectOption`, tab picker, network idle wait, multi-tab control, headless recording, `AGENTCURSOR_*` profiles, Linux/Windows OS driver (`nut-js`/alternative).
