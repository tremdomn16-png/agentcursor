# Windows

> Suporte nativo `win32` desde v0.4.1-win. Testado em Windows 10 + PowerShell 5.1 + Node 20.

## O que funciona

- **Apps desktop** via UI Automation (sem binário nativo): `desktop_open` (Notepad/calc/explorer/Slack etc.), `desktop_read` → `[dN]` + `rect`, `desktop_click/move/type/key/scroll/screenshot`.
- **Browser** via extensão Chrome (`extension/` → Load unpacked em `chrome://extensions`).
- **Screenshot fallback**: quando a extensão está offline, `winScreenCapture` captura `VirtualScreen` em JPEG 960px (usado pelo live view).
- **Permissões**: não precisa Accessibility como no Mac; apenas manter a janela visível (UIA só vê janelas visíveis).

## Limitações Windows

- `Add-Type` só funciona com `-File` (não `-Command` multi-linha) — já tratado em `src/desktop/win.ts:psFile`.
- PS 5.1 sem BOM lê UTF-8 como ANSI → scripts `.ps1` são gravados com BOM (`\uFEFF`).
- `node` fecha com `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` no `exit` — cosmético (libuv), pode ignorar.
- `port 8930` (WS) / `8931` (HTTP) precisam estar livres; `AGENTCURSOR_WS_PORT`/`AGENTCURSOR_HTTP_PORT` mudam.
- Caminhos com espaço precisam aspas no `Start-Process`.

## Instalação rápida

```powershell
git clone https://github.com/tremdomn16-png/agentcursor.git
cd agentcursor
pnpm install
pnpm run build:server   # ou pnpm build (também builda extensão + native mac)
# extensão: chrome://extensions → Developer mode → Load unpacked → extension/
node dist/index.js setup
```

`setup` abre `http://127.0.0.1:8931` e lista apps MCP detectadas (opencode incluso).

## Opencode

`opencode.json` (já no repo):

```json
{
  "mcp": {
    "agentcursor": {
      "command": ["C:\\Program Files\\nodejs\\node.exe", "C:\\Users\\mts\\agentcursor\\dist\\index.js", "mcp"],
      "environment": { "AGENTCURSOR_LIVE": "0" }
    }
  }
}
```

Live view **não** auto-abre; use a tool `live_view on` quando quiser ver.

## Troubleshooting

| Sintoma | Causa | Fix |
|---------|-------|-----|
| `no screenshot source (extension offline and desktop capture failed)` | tampa de extensão offline + PS falhou | `GET /api/screenshot` deve cair em `desktop` quando win; veja `%TEMP%\agentcursor-8931.log` |
| `ParserError MissingArrayIndexExpression [:8]` | PS `-Command` com `ToString('N')[:8]` | já fixado: usa `mkdtempSync` + `psFile` |
| Live não abre | `AGENTCURSOR_LIVE=0` | `agentcursor live_view on` ou `POST /api/live {"on":true}` |
| Dois daemons em `8931` | rebuild sem matar antigo | `taskkill /PID <pid> /F` de todo `node dist/index.js serve` antes de `node dist/index.js serve` |
| Janela não encontrada `desktop_read` | app sem janela principal | `desktop_open "Notepad"` antes |

## Arquitetura Win (diff do upstream)

```
src/desktop/win.ts         # ps/psFile, winApps, winSnapshot, winClick, winScreenCapture, winScreenshot
src/desktop/service-win.ts # DesktopServiceWindows (currentPid + focusInfo)
src/server/window-stream.ts# PS loop por pid → %TEMP%\ac-winstream-*\frame.jpg
src/server/frame-hub.ts    # hub que escolhe browser|window|desktop baseado em AgentFocus
src/server/focus.ts        # AgentFocus (browser vs window)
```

## Env vars Windows

| Var | Default | Efeito |
|-----|---------|--------|
| `AGENTCURSOR_WS_PORT` | `8930` | WS da extensão |
| `AGENTCURSOR_HTTP_PORT` | `ws+1` (8931) | HTTP/MCP + `/live`, `/api/*` |
| `AGENTCURSOR_LIVE` | `0` | `1` auto-abre live |
| `AGENTCURSOR_AUTOSTART` | `1` | `0` não sobe daemon no `mcp` |
| `AGENTCURSOR_TOOLS` | `all` | `browser|desktop` filtra |
| `AGENTCURSOR_SEED` | random | reproduz persona |
