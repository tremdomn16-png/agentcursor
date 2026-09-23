# Tools — O que existe e o que falta

> Fonte da verdade: `src/server/tools.ts` + `src/server/desktop-tools.ts`. Atualizado em 2026-09-23 (v0.4.1-win).

## Browser (precisa da extensão `extension/`)

| Tool | Status | O que faz | Notas / fluidez |
|------|--------|-----------|-----------------|
| `read_page` | ✅ | Snapshot da aba: `[ref]` estáveis, `role`/`name`/`rect`, `text` | `changes:true` diff; piercing shadow DOM |
| `find` | ✅ | Rank por texto/nome visível | texto → `[ref]` |
| `click_text` | ✅ | `find` + `click` em um passo, retry 2× | |
| `move_to` | ✅ | Path humano até `[ref]` ou `x/y` | Fitts + overshoot |
| `click` | ✅ | Move+click, `button`/`double`/`stealth` | |
| `hover` | ✅ | Move + `mouseover/mouseenter` | dropdowns/tooltips |
| `drag` | ✅ | Arrasta `from`→`to` com botão segurado | sliders/canvas |
| `type` | ✅ | Digitação humana, `schedule` da persona, `stealth` | |
| `press_key` | ✅ | Enter/Esc/Tab/Setas etc. | |
| `scroll` | ✅ | `dy`/`dx` em passos humanos | |
| `screenshot` | ✅ | `data:image/*;base64` (1px = 1 coord de click) | vision loop |
| `navigate` | ✅ | `GET url` na aba ativa | |
| `get_url` | ✅ | URL atual | |
| `evaluate` | ✅ | `() => ...` via CDP, com `args` | cookies da página |
| `wait_for` | ✅ | `{ref,text,timeoutMs,condition}` | |
| `status` | ✅ | `driver/bridge_connected/active_url/persona` | |
| `console_buffer` | ✅ | Erros/warnings do console | |
| `live_view` | ✅ **novo** | `on/off/status` — floating on-demand | WinForms, topmost, feed |
| `upload` | ❌ | `input[type=file]` | removido stub; roadmapped |
| `selectOption` | ❌ | `<select>` | roadmapped |
| `tab` ops | ❌ | `tab_list/tab_select/tab_close` | hoje sempre aba ativa |
| `networkIdle` | ❌ | `wait_for {networkIdle}` | roadmapped |

## Desktop (qualquer app)

| Tool | Status | Win (`service-win.ts`) | Mac (`service.ts`) |
|------|--------|------------------------|--------------------|
| `desktop_apps` | ✅ | `winApps` via `Get-Process` | `ax apps` (Swift) |
| `desktop_open` | ✅ | `winOpen`/`winActivate` | `open -a` |
| `desktop_read` | ✅ | `winSnapshot` + `[dN]` | `ax` snapshot |
| `desktop_click` | ✅ | `winClick` SendInput | `post` |
| `desktop_move` | ✅ | `winMovePath` | `post moves` |
| `desktop_type` | ✅ | `winType` | `typeText` |
| `desktop_key` | ✅ | `winKey` | `post keys` |
| `desktop_scroll` | ✅ | scroll via UIA | `post scroll` |
| `desktop_screenshot` | ✅ | `winScreenshot(pid)` | `ax window` + screencap |

`AGENTCURSOR_TOOLS=browser|desktop|all` filtra famílias.

## Sistema / Live

| Endpoint / Tool | Método | Descrição |
|-----------------|--------|-----------|
| `GET /` | wizard | Setup page |
| `GET /health` | JSON | `{ok, version, buildId, pid}` |
| `GET /api/status` | JSON | `extension/desktop/clients/persona` |
| `GET /api/screenshot` | JPEG | `X-Agentcursor-Source` + `X-Agentcursor-Focus` (via `FrameHub`) |
| `GET /api/stream` | MJPEG | `multipart/x-mixed-replace; boundary=frame` |
| `GET /api/events?since=` | JSON | `{events, lastId, activity, focus}` |
| `GET /live` | HTML | Dashboard `video | feed` (usa `/api/stream` + poll `/api/events`) |
| `GET /api/live` | JSON | `{on}` |
| `POST /api/live` | JSON | `{on, action}` → `toggleLiveView` |
| `mcp live_view` | tool | alias de `POST /api/live` |

## Event Bus & Focus (v0.4.1-win)

- `AgentEventBus` (ring 80): `{id,t,tool,detail,ok,ms}`; `begin/end/list/activity`.
- `AgentFocus`: `{mode: browser|window|idle, pid, name, title, at}`; desktop tools pin `window`, browser tools pin `browser`.
- `FrameHub`: if `focus==browser` → extension screenshot; elif `focus==window` or `desktop.focusInfo().pid` → `WindowStream(pid)` file poll + `winScreenshot` fallback; else `winScreenCapture` (full screen).
- `WindowStream`: PS loop por `pid` grava `frame.jpg` a ~18fps; `FrameHub` só lê arquivo.

## Gaps prioritários (contribua!)

1. `upload` + `selectOption` (alta demanda em formulários)
2. `tab_*` (multi-aba, popup)
3. `wait_for {networkIdle, selectorCount, urlPattern}`
4. Linux `service-win` port (UIA → `at-spi`/`xdotool` ou `nut-js`)
5. Gravador headless (mp4 do stream)
6. Perfis `AGENTCURSOR_PERSONA=fast|careful` + `AGENTCURSOR_WPM`

PRs bem-vindos — veja `CONTRIBUTING.md` e `GAP-ANALYSIS.md`.
