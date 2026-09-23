import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { desktopSupported } from "../desktop/ax";
import { clientStatus, connectClient, launchEntry } from "../setup/clients";
import wizardHtml from "../setup/wizard.html";
import liveHtml from "./live.html";
import { liveViewPid, toggleLiveView } from "../cli/autostart";
import { BUILD_ID, SELF, createMcpServer, logFile, readVersion, type Runtime } from "./create";
import { isAllowedRequest } from "./guard";
import type { AgentEvent } from "./events";

export interface Health {
  ok: true;
  version: string;
  buildId: number;
  pid: number;
}

export function serve(rt: Runtime, opts: { idleExitMs?: number } = {}): Promise<void> {
  const port = rt.ports.http;
  let lastSeen = Date.now();

  const server = createServer(async (req, res) => {
    lastSeen = Date.now();
    if (!isAllowedRequest(req.headers.host, req.headers.origin, port)) {
      return json(res, 403, { error: "Only local requests from this machine are allowed." });
    }
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    try {
      if (path === "/mcp") return await handleMcp(rt, req, res);
      if (req.method === "GET") {
        if (path === "/") {
          res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
          return res.end(wizardHtml);
        }
        if (path === "/health") return json(res, 200, health());
        if (path === "/api/status") return json(res, 200, await status(rt));
        if (path === "/api/screenshot") {
          const frame = await rt.frames.capture(true);
          if (!frame) {
            return json(res, 503, {
              error: "no screenshot source (extension offline and desktop capture failed)",
              detail: rt.frames.error() || undefined,
            });
          }
          res.writeHead(200, {
            "content-type": "image/jpeg",
            "cache-control": "no-store",
            "content-length": frame.buf.length,
            "x-agentcursor-source": frame.source,
            "x-agentcursor-focus": encodeURIComponent(frame.focus),
          });
          return res.end(frame.buf);
        }
        if (path === "/api/stream") {
          return await handleMjpeg(rt, res);
        }
        if (path === "/api/events") {
          const since = Number(new URL(req.url ?? "/", "http://127.0.0.1").searchParams.get("since") ?? 0);
          const stats = rt.events.stats();
          return json(res, 200, {
            events: rt.events.list(since),
            lastId: stats.lastId,
            activity: stats.activity,
            focus: {
              label: rt.focus.label(),
              ...rt.focus.get(),
            },
          });
        }
        if (path === "/live") {
          res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
          return res.end(liveHtml);
        }
        if (path === "/api/live") {
          const on = liveViewPid() !== null;
          return json(res, 200, { on });
        }
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        if (path === "/api/connect") {
          return json(res, 200, { message: connectClient(String(body.client), launchEntry(SELF)) });
        }
        if (path === "/api/permission") {
          return json(res, 200, await rt.desktop.requestPermission(body.kind === "screen" ? "screen" : "accessibility"));
        }
        if (path === "/api/test-cursor") {
          await rt.desktop.wiggle();
          return json(res, 200, { ok: true });
        }
        if (path === "/api/live") {
          const wantOn = body.on !== false && body.action !== "off";
          const r = await toggleLiveView(port, wantOn);
          return json(res, 200, r);
        }
        if (path === "/shutdown") {
          json(res, 200, { ok: true });
          setTimeout(() => process.exit(0), 50);
          return;
        }
      }
      json(res, 404, { error: "Not found" });
    } catch (e) {
      if (!res.headersSent) json(res, 500, { error: (e as Error).message });
    }
  });

  if (opts.idleExitMs) {
    const idle = opts.idleExitMs;
    setInterval(() => {
      if (Date.now() - lastSeen > idle) process.exit(0);
    }, 15_000).unref();
  }

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      process.stderr.write(
        `agentcursor: serving MCP at http://127.0.0.1:${port}/mcp, setup page http://127.0.0.1:${port}, extension WebSocket ws://127.0.0.1:${rt.ports.ws}, persona seed ${rt.persona.seed}\n`,
      );
      resolve();
    });
  });
}

async function handleMcp(rt: Runtime, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    return json(res, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
  }
  const server = createMcpServer(rt);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}

function health(): Health {
  return { ok: true, version: readVersion(), buildId: BUILD_ID, pid: process.pid };
}

async function status(rt: Runtime) {
  const isWin = process.platform === "win32";
  const supported = isWin ? true : desktopSupported();
  const permissions = supported ? await rt.desktop.permissions().catch(() => null) : null;
  return {
    ...health(),
    platform: process.platform,
    mcpUrl: `http://127.0.0.1:${rt.ports.http}/mcp`,
    stdio: launchEntry(SELF),
    logFile: logFile(rt.ports.http),
    personaSeed: rt.persona.seed,
    extension: {
      connected: rt.extension.connected,
      wsPort: rt.ports.ws,
      path: fileURLToPath(new URL("../extension", import.meta.url)),
    },
    desktop: {
      supported,
      platform: isWin ? "windows" : process.platform === "darwin" ? "macos" : "unsupported",
      accessibility: permissions?.accessibility ?? false,
      screenRecording: permissions?.screenRecording ?? false,
    },
    clients: clientStatus(),
  };
}

function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/** MJPEG contínuo: mesmo hub de frames para todos os clientes do live. */
async function handleMjpeg(rt: Runtime, res: ServerResponse): Promise<void> {
  res.writeHead(200, {
    "content-type": "multipart/x-mixed-replace; boundary=frame",
    "cache-control": "no-cache, no-store, must-revalidate",
    pragma: "no-cache",
    connection: "keep-alive",
  });
  rt.frames.noteWatcher(true);
  let alive = true;
  const onClose = () => {
    alive = false;
    rt.frames.noteWatcher(false);
    try {
      res.end();
    } catch {
      /* ignore */
    }
  };
  res.on("close", onClose);
  res.on("error", onClose);

  let frames = 0;
  let fpsAt = Date.now();
  let fps = 0;
  try {
    while (alive) {
      const frame = await rt.frames.capture(false);
      if (!frame || !alive) {
        await sleep(120);
        continue;
      }
      const head = Buffer.from(
        `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.buf.length}\r\nX-Agentcursor-Source: ${frame.source}\r\nX-Agentcursor-Focus: ${encodeURIComponent(frame.focus)}\r\n\r\n`,
      );
      if (!res.write(head) || !res.write(frame.buf)) {
        await onceDrain(res);
        if (!alive) break;
      }
      frames++;
      const now = Date.now();
      if (now - fpsAt >= 1000) {
        fps = frames;
        frames = 0;
        fpsAt = now;
      }
      // ~12–15fps de push; o hub já coalesce capturas
      const wait = Math.max(20, Math.round(1000 / Math.max(8, fps || 12)) - 8);
      await sleep(wait);
    }
  } catch {
    onClose();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function onceDrain(res: ServerResponse): Promise<void> {
  return new Promise((resolve) => {
    if (res.writableEnded || res.destroyed) return resolve();
    res.once("drain", resolve);
    setTimeout(resolve, 250);
  });
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 65_536) req.destroy(new Error("Body too large"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}
