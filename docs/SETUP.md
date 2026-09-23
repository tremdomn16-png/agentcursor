# Setup & Instalação

## Requisitos

- Node `>=20` (`node --version`), `pnpm` (`npm i -g pnpm`), Chrome/Edge/Brave (Chromium), Windows 10+ ou macOS, PowerShell 5.1 no Win.

## Passo a passo (Windows)

```powershell
git clone https://github.com/tremdomn16-png/agentcursor.git
cd agentcursor
pnpm install
pnpm run build:server   # tsup → dist/
# ou pnpm build (também builda extension/dist + native mac)

# 1) Extensão (browser)
# chrome://extensions → Developer mode ON → Load unpacked → selecione extension/

# 2) Serviço + wizard
node dist/index.js setup
# abre http://127.0.0.1:8931 — conecte opencode/VS Code/Cursor/etc. com 1 clique

# 3) Teste rápido (sem IA)
node dist/index.js desktop_open notepad
node dist/index.js desktop_read
node dist/index.js live_view on   # abre floating on-demand
```

## Opencode (recomendado)

`opencode.json` já vem com `AGENTCURSOR_LIVE=0`:

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

Reinicie o opencode após editar.

## CLI útil

```bash
agentcursor help
agentcursor read_page
agentcursor desktop_apps
agentcursor screenshot           # salva em %TEMP%\agentcursor-*.jpg e imprime path
agentcursor live_view status
curl http://127.0.0.1:8931/health
curl http://127.0.0.1:8931/live        # dashboard no browser
```

## Build / dev

```bash
pnpm dev          # tsx src/index.ts (sem build)
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest
pnpm build:server # só tsup
pnpm build:ext    # só extensão
pnpm reload       # bump de versão da extensão (dev loop)
```

## Env vars

| Var | Default | Efeito |
|-----|---------|--------|
| `AGENTCURSOR_WS_PORT` | 8930 | WS extensão |
| `AGENTCURSOR_HTTP_PORT` | 8931 | HTTP/MCP |
| `AGENTCURSOR_LIVE` | 0 | 1 auto-abre live |
| `AGENTCURSOR_AUTOSTART` | 1 | 0 não sobe daemon no `mcp` |
| `AGENTCURSOR_TOOLS` | all | browser/desktop |
| `AGENTCURSOR_SEED` | random | reproduz persona |
| `AGENTCURSOR_OUT` | %TEMP% | onde screenshots da CLI caem |

## Troubleshooting

Veja `docs/WINDOWS.md` e `docs/LIVE_VIEW.md`.

- Port em uso: `netstat -ano | findstr 8931` → `taskkill /PID <pid> /F`.
- Live não abre: `AGENTCURSOR_LIVE=0` é intencional — `live_view on`.
- Preview vazio: extensão offline + PS falhou — veja `%TEMP%\agentcursor-8931.log`.
