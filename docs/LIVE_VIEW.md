# Live View — Preview inteligente on-demand

> v0.4.1-win. On-demand, só abre quando você mandar. Mostra **só** a janela/aba que o agente está usando, em stream fluido.

## Filosofia

- **Não auto-abre**: `AGENTCURSOR_LIVE=0` por padrão (`opencode.json` incluso). O floating só existe quando o humano pede (`live_view on`).
- **Mostra só o que importa**: `AgentFocus` pinado por `read_page`/`desktop_open`/etc.; `FrameHub` captura a `window` daquele `pid` (ou a `browser tab` se o foco for browser), não a tela cheia com Discord/Explorer ao fundo.
- **Fluido, não print estático**: `WindowStream` = um `powershell.exe` loop por `pid` grava `frame.jpg` a ~18fps; `FrameHub` só lê arquivo + fallback `winScreenshot`. Browser usa `chrome.tabs.captureVisibleTab` via extensão.
- **Não atrapalha**: WinForms `TopMost` sem `WS_EX_APPWINDOW` (fora do Alt+Tab), `ShowWithoutActivation` (não rouba foco), draggable header, botão `—` minimiza para `opacity 0.12` (hover volta).

## Como usar

### Via tool (recomendado, on-demand)

```
live_view {"action":"status"} → live_view: off
live_view {"action":"on"}     → live_view: on (pid 1234)
live_view {"action":"off"}    → live_view: off
```

### Via HTTP

```bash
curl http://127.0.0.1:8931/api/live            # {on:false}
curl -X POST http://127.0.0.1:8931/api/live -H 'content-type: application/json' -d '{"on":true}'
curl -X POST http://127.0.0.1:8931/api/live -d '{"action":"off"}'
```

### Via CLI

```bash
node dist/index.js live_view on
node dist/index.js live_view status
node dist/index.js live_view off
```

## O que aparece

- **Vídeo**: `PictureBox Zoom` (mantém proporção). Header `LIVE | AgentCursor` → amarelo quando `running`.
- **Status bar** (`Consolas 8`): `LIVE | <source: browser|window|desktop> | <fps> fps | <KB> | <activity>`  
  `activity` = `RUNNING <tool>` ou `idle | <lastTool>` + `focus` (label da janela).
- **Feed** (`ListBox` 110px): últimas 30 linhas `HH:mm:ss <tool> <detail>` vindas de `GET /api/events?since=`.
- **Favicon/pos**: canto inferior direito, `WorkingArea.Right-18, Bottom-18`.

## Endpoints por trás

| Rota | Descrição |
|------|-----------|
| `GET /api/screenshot` | JPEG único do `FrameHub` (`X-Agentcursor-Source`, `X-Agentcursor-Focus`) |
| `GET /api/stream` | MJPEG `multipart/x-mixed-replace; boundary=frame` (para `GET /live` no browser) |
| `GET /api/events?since=` | `{events, lastId, activity:{tool,running,ageMs}, focus:{label,mode,pid}}` |
| `GET /live` | Dashboard HTML `video | feed` (alternativa ao floating; usa `/api/stream` + poll `/api/events`) |
| `GET /api/live` | `liveViewPid()` check |

## Fluxo técnico

```
tool call (browser/desktop)
  → tracked() → bus.begin + focus.note()
    → FrameHub.capture()
      → if focus==browser → rt.action.screenshot()
      → elif focus==window(pid) → WindowStream.ensure(pid) → read frame.jpg (ou winScreenshot fallback)
      → elif desktop.focusInfo().pid → WindowStream(pid)
      → else winScreenCapture (full screen)
  → bus.end

floating PS1:
  Timer 70ms → GET /api/screenshot → MD5 dedup → PictureBox.Image
  Timer 400ms → GET /api/events?since=lastId → ListBox.Insert(0) + status
```

## Arquivos

- `src/cli/autostart.ts:LIVE_VIEW_PS1` (PS 5.1, BOM, `FloatingLiveForm` com `SetWindowPos TOPMOST | NOACTIVATE`)
- `src/server/frame-hub.ts` (`FrameHub`, `noteWatcher`, `captureWindow`)
- `src/server/window-stream.ts` (`WindowStream`, PS loop com `GetWindowRect` + `CopyFromScreen` @65% JPEG, `Move-Item -Force` atômico)
- `src/server/focus.ts` (`AgentFocus`, `BROWSER_TOOLS` set)
- `src/server/live.html` (dashboard browser)
- `src/server/events.ts` (`AgentEventBus`)
- `%TEMP%\agentcursor-live.pid`, `agentcursor-live-view.ps1`, `ac-winstream-*\frame.jpg`

## Dicas

- Deixe **fechado** por padrão; abra só quando for observar o agente (menos distração, menos CPU/GPU).
- Se a janela do agente for minimizada, o stream pausa até restaurar (detecta `IsIconic`).
- Para gravar: abra `http://127.0.0.1:8931/live` no browser e use gravador de tela; ou `curl http://127.0.0.1:8931/api/stream > out.mjpeg`.
