#!/usr/bin/env node
import {
  BUILD_ID,
  SELF,
  autostart,
  connectClient,
  createMcpServer,
  createRuntime,
  desktopSupported,
  ensureDaemon,
  liveViewPid,
  logFile,
  readVersion,
  resolvePorts,
  runStdioProxy,
  toggleLiveView
} from "./chunk-MNB6SSIL.js";

// src/sdk/launch.ts
import { spawn } from "child_process";
import { once } from "events";
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";
var CHROME_PATHS = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
  ],
  linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"],
  win32: [
    `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
  ]
};
function findChrome(explicit) {
  const path = explicit ?? process.env.AGENTCURSOR_CHROME ?? (CHROME_PATHS[process.platform] ?? []).find(existsSync);
  if (!path || !existsSync(path)) {
    throw new Error("agentcursor: Chrome not found. Pass { executablePath } or set AGENTCURSOR_CHROME.");
  }
  return path;
}
function extensionDir() {
  for (const rel of ["../extension", "../../extension"]) {
    const dir = fileURLToPath(new URL(rel, import.meta.url));
    if (existsSync(join(dir, "dist", "service-worker.js"))) return dir;
  }
  throw new Error("agentcursor: built extension not found. Run `pnpm build` first.");
}
async function launchBrowser(port, options = {}) {
  const chrome = findChrome(options.executablePath);
  const realProfile = options.userDataDir;
  const profile = realProfile ?? mkdtempSync(join(tmpdir(), "agentcursor-"));
  const ext = mkdtempSync(join(tmpdir(), "agentcursor-ext-"));
  const src = extensionDir();
  for (const part of ["manifest.json", "dist", "icons"]) cpSync(join(src, part), join(ext, part), { recursive: true });
  writeFileSync(join(ext, "launch.json"), JSON.stringify({ port }));
  const args = [
    "--remote-debugging-pipe",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-search-engine-choice-screen",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--password-store=basic",
    "--use-mock-keychain",
    ...options.headless ? ["--headless=new"] : [],
    ...options.accessibility ? ["--force-renderer-accessibility"] : [],
    ...options.args ?? [],
    "about:blank"
  ];
  const proc = spawn(chrome, args, { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
  const cdp = new PipeCdp(proc.stdio[3], proc.stdio[4]);
  const exited = once(proc, "exit");
  const cleanup = async () => {
    if (proc.exitCode === null && proc.signalCode === null) {
      await cdp.send("Browser.close", {}, 3e3).catch(() => proc.kill());
      await Promise.race([exited, delay(5e3).then(() => proc.kill("SIGKILL"))]);
    }
    rmSync(ext, { recursive: true, force: true, maxRetries: 5 });
    if (!realProfile) rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  };
  try {
    await Promise.race([
      cdp.send("Extensions.loadUnpacked", { path: ext }, 15e3),
      exited.then(() => {
        throw new Error(`agentcursor: Chrome exited during launch (${chrome})`);
      })
    ]);
  } catch (err) {
    await cleanup();
    throw err;
  }
  return { close: cleanup };
}
var delay = (ms) => new Promise((r) => setTimeout(r, ms));
var PipeCdp = class {
  constructor(out, input) {
    this.out = out;
    input.setEncoding("utf8");
    input.on("data", (chunk) => this.onData(chunk));
    input.on("error", () => void 0);
    out.on("error", () => void 0);
  }
  out;
  nextId = 1;
  buf = "";
  pending = /* @__PURE__ */ new Map();
  send(method, params, timeoutMs) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`agentcursor: CDP ${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => (clearTimeout(timer), resolve(v)),
        reject: (e) => (clearTimeout(timer), reject(e))
      });
      this.out.write(`${JSON.stringify({ id, method, params })}\0`);
    });
  }
  onData(chunk) {
    this.buf += chunk;
    let end;
    while ((end = this.buf.indexOf("\0")) >= 0) {
      const msg = JSON.parse(this.buf.slice(0, end));
      this.buf = this.buf.slice(end + 1);
      const entry = msg.id === void 0 ? void 0 : this.pending.get(msg.id);
      if (!entry) continue;
      this.pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(`agentcursor: CDP ${msg.error.message}`));
      else entry.resolve(msg.result);
    }
  }
};

// src/cli/launch.ts
function parseFlags(rest2) {
  const flags = { headless: false };
  for (let i = 0; i < rest2.length; i++) {
    const raw = rest2[i];
    if (!raw.startsWith("--")) continue;
    const eq = raw.indexOf("=");
    const name = raw.slice(2, eq === -1 ? void 0 : eq);
    if (name === "headless") {
      flags.headless = true;
      continue;
    }
    if (!["user-data-dir", "profile", "chrome", "executable-path", "port"].includes(name)) {
      throw new Error(`unknown flag --${name}`);
    }
    const value = eq === -1 ? rest2[++i] : raw.slice(eq + 1);
    if (value === void 0) throw new Error(`--${name} needs a value`);
    if (name === "user-data-dir" || name === "profile") flags.userDataDir = value;
    else if (name === "chrome" || name === "executable-path") flags.executablePath = value;
    else flags.port = Number(value);
  }
  return flags;
}
async function launchCli(ports2, rest2) {
  let flags;
  try {
    flags = parseFlags(rest2);
  } catch (err) {
    process.stderr.write(`agentcursor launch: ${err.message}
`);
    process.exit(1);
  }
  const wsPort = flags.port ?? ports2.ws;
  await ensureDaemon(ports2.http);
  let browser;
  try {
    browser = await launchBrowser(wsPort, {
      headless: flags.headless,
      userDataDir: flags.userDataDir,
      executablePath: flags.executablePath
    });
  } catch (err) {
    process.stderr.write(`agentcursor launch: ${err.message}
`);
    process.exit(1);
  }
  const where = flags.userDataDir ? `profile ${flags.userDataDir}` : "a throwaway profile";
  process.stderr.write(
    `agentcursor: browser up on ${where}${flags.headless ? " (headless)" : ""}, wired to ws://127.0.0.1:${wsPort}. Drive it from your agent (agentcursor read_page / click / evaluate ...). Ctrl-C to stop.
`
  );
  const stop = async () => {
    await browser.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  await new Promise(() => {
  });
}

// src/cli/run.ts
import { writeFile } from "fs/promises";
import { tmpdir as tmpdir2 } from "os";
import { join as join2 } from "path";
async function runTool(port, argv) {
  const name = argv[0]?.replace(/-/g, "_");
  await ensureDaemon(port);
  const client = await connectClient(port);
  const tools = (await client.listTools()).tools ?? [];
  if (!name || name === "help" || name === "tools" || name === "--help" || name === "-h") {
    process.stdout.write(usage(tools, name === "tools"));
    return 0;
  }
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    process.stderr.write(`agentcursor: unknown command '${argv[0]}'. Try: agentcursor help
`);
    return 1;
  }
  const args = parseArgs(tool, argv.slice(1));
  const result = await client.callTool({ name, arguments: args }, void 0, { timeout: 15 * 6e4 });
  for (const part of result.content ?? []) {
    if (part.type === "text") process.stdout.write(`${part.text}
`);
    else if (part.type === "image" && part.data) process.stdout.write(`${await saveImage(part.data, part.mimeType)}
`);
  }
  return result.isError ? 1 : 0;
}
async function saveImage(data, mimeType = "image/png") {
  const ext = mimeType.includes("jpeg") ? "jpg" : "png";
  const file = join2(process.env.AGENTCURSOR_OUT ?? tmpdir2(), `agentcursor-${Date.now()}.${ext}`);
  await writeFile(file, Buffer.from(data, "base64"));
  return file;
}
function parseArgs(tool, rest2) {
  const props = tool.inputSchema.properties ?? {};
  const order = Object.keys(props);
  const args = {};
  let next = 0;
  for (let i = 0; i < rest2.length; i++) {
    const item = rest2[i];
    if (item.startsWith("--")) {
      const [flag, inline] = splitFlag(item.slice(2));
      const type = props[flag]?.type;
      if (type === "boolean" && inline === void 0) {
        const peek = rest2[i + 1];
        const explicit = peek === "true" || peek === "false";
        args[flag] = explicit ? peek === "true" : true;
        if (explicit) i++;
      } else args[flag] = coerce(inline ?? rest2[++i] ?? "", type);
      continue;
    }
    while (next < order.length && order[next] in args) next++;
    const key = order[next++];
    if (!key) throw new Error(`agentcursor: too many arguments for ${tool.name}`);
    args[key] = coerce(item, props[key]?.type);
  }
  return args;
}
function splitFlag(s) {
  const eq = s.indexOf("=");
  return eq === -1 ? [s, void 0] : [s.slice(0, eq), s.slice(eq + 1)];
}
function coerce(value, type) {
  if (type === "number" || type === "integer") {
    const n = Number(value);
    if (Number.isNaN(n)) throw new Error(`agentcursor: '${value}' is not a number`);
    return n;
  }
  if (type === "boolean") return value !== "false" && value !== "0";
  return value;
}
function usage(tools, full) {
  const plat = process.platform === "win32" ? "Windows" : "Mac";
  const lines = [
    `agentcursor: a visible human cursor for browser tabs and ${plat} apps.`,
    "",
    "  agentcursor <command> [positional...] [--flag value]",
    "",
    "Positionals fill a command's parameters in the order listed below.",
    "State (page, [refs], frontmost app) is kept by one background service, so commands chain.",
    "",
    "Browser (needs the Chrome extension):"
  ];
  const line = (t) => {
    const params = Object.entries(t.inputSchema.properties ?? {}).map(([k, v]) => v.enum ? `${k}=${v.enum.join("|")}` : k).join(" ");
    const desc = full ? `
      ${t.description ?? ""}` : "";
    return `  ${t.name.padEnd(19)} ${params}${desc}`;
  };
  for (const t of tools.filter((t2) => !t2.name.startsWith("desktop_"))) lines.push(line(t));
  const desktop = tools.filter((t) => t.name.startsWith("desktop_"));
  if (desktop.length) {
    lines.push("", `Any ${plat} app (computer use; read is text, not pixels):`);
    for (const t of desktop) lines.push(line(t));
  }
  lines.push(
    "",
    "Also: agentcursor launch [--user-data-dir DIR] [--chrome PATH] [--headless] (attach a real-profile browser in the background)",
    "      agentcursor setup | serve | mcp (stdio MCP server) | tools (same list with full descriptions)",
    "Screenshots are written to a file and the path is printed. AGENTCURSOR_OUT sets the directory.",
    ""
  );
  return lines.join("\n");
}

// src/server/http.ts
import { createServer } from "http";
import { fileURLToPath as fileURLToPath2 } from "url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// src/setup/clients.ts
import { spawnSync } from "child_process";
import { copyFileSync, existsSync as existsSync2, mkdirSync, readFileSync, writeFileSync as writeFileSync2 } from "fs";
import { homedir } from "os";
import { delimiter, dirname, join as join3 } from "path";
var SERVER_NAME = "agentcursor";
function launchEntry(self) {
  if (self.includes(join3("_npx", ""))) {
    return { command: join3(dirname(process.execPath), "npx"), args: ["-y", "agentcursor"] };
  }
  return { command: process.execPath, args: [self] };
}
var toolPath = () => [
  process.env.PATH,
  dirname(process.execPath),
  join3(homedir(), ".local", "bin"),
  "/opt/homebrew/bin",
  "/usr/local/bin"
].filter(Boolean).join(delimiter);
function which(bin) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [bin], {
    env: { ...process.env, PATH: toolPath() }
  });
  return r.status === 0;
}
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
function writeJsonEntry(path, key, value) {
  let config = {};
  if (existsSync2(path)) {
    const raw = readFileSync(path, "utf8");
    try {
      config = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      throw new Error(
        `${path} is not plain JSON (it may contain comments). Add this by hand:
${JSON.stringify({ [key]: { [SERVER_NAME]: value } }, null, 2)}`
      );
    }
    copyFileSync(path, `${path}.bak`);
  } else {
    mkdirSync(dirname(path), { recursive: true });
  }
  config[key] = { ...config[key] ?? {}, [SERVER_NAME]: value };
  writeFileSync2(path, `${JSON.stringify(config, null, 2)}
`);
  return `added to ${path} (backup at .bak); restart the app to load it`;
}
function jsonClient(id, name, dir, file, key, shape = (e) => e) {
  const path = join3(dir, file);
  return {
    id,
    name,
    detect: () => existsSync2(dir),
    configured: () => Boolean(readJson(path)?.[key]?.[SERVER_NAME]),
    connect: (entry) => writeJsonEntry(path, key, shape(entry))
  };
}
function cliClient(id, name, bin, addArgs, configured) {
  return {
    id,
    name,
    detect: () => which(bin),
    configured,
    connect: (entry) => {
      const args = addArgs(entry);
      const r = spawnSync(bin, args, { encoding: "utf8", env: { ...process.env, PATH: toolPath() } });
      if (r.status !== 0) throw new Error((r.stderr || r.stdout || `${bin} exited ${r.status}`).trim());
      return `added with \`${bin} ${args.slice(0, 4).join(" ")} ...\`; start a new session to load it`;
    }
  };
}
function appDataDir(home, ...parts) {
  if (process.platform === "darwin") return join3(home, "Library", "Application Support", ...parts);
  if (process.platform === "win32") return join3(process.env.APPDATA ?? join3(home, "AppData", "Roaming"), ...parts);
  return join3(home, ".config", ...parts);
}
function clients(home = homedir()) {
  return [
    cliClient(
      "claude-code",
      "Claude Code",
      "claude",
      (e) => ["mcp", "add", "--scope", "user", SERVER_NAME, "--", e.command, ...e.args],
      () => Boolean(readJson(join3(home, ".claude.json"))?.mcpServers?.[SERVER_NAME])
    ),
    jsonClient("cursor", "Cursor", join3(home, ".cursor"), "mcp.json", "mcpServers"),
    jsonClient("vscode", "VS Code", appDataDir(home, "Code", "User"), "mcp.json", "servers", (e) => ({ type: "stdio", ...e })),
    cliClient(
      "codex",
      "Codex",
      "codex",
      (e) => ["mcp", "add", SERVER_NAME, "--", e.command, ...e.args],
      () => {
        try {
          return /^\[mcp_servers\.agentcursor\]/m.test(readFileSync(join3(home, ".codex", "config.toml"), "utf8"));
        } catch {
          return false;
        }
      }
    ),
    jsonClient("windsurf", "Windsurf", join3(home, ".codeium", "windsurf"), "mcp_config.json", "mcpServers"),
    jsonClient("claude-desktop", "Claude Desktop", appDataDir(home, "Claude"), "claude_desktop_config.json", "mcpServers"),
    cliClient(
      "gemini",
      "Gemini CLI",
      "gemini",
      (e) => ["mcp", "add", "--scope", "user", SERVER_NAME, e.command, ...e.args],
      () => Boolean(readJson(join3(home, ".gemini", "settings.json"))?.mcpServers?.[SERVER_NAME])
    )
  ];
}
function clientStatus(home = homedir()) {
  return clients(home).map((c) => ({ id: c.id, name: c.name, detected: c.detect(), configured: c.configured() }));
}
function connectClient2(id, entry, home = homedir()) {
  const client = clients(home).find((c) => c.id === id);
  if (!client) throw new Error(`Unknown client "${id}"`);
  return client.connect(entry);
}

// src/setup/wizard.html
var wizard_default = '<!doctype html>\r\n<html lang="en">\r\n<head>\r\n<meta charset="utf-8">\r\n<meta name="viewport" content="width=device-width, initial-scale=1">\r\n<title>AgentCursor Setup</title>\r\n<style>\r\n  :root {\r\n    --bg: #070707; --panel: #101010; --line: #1f1f1f; --line-strong: #2c2c2c;\r\n    --text: #f2f2f2; --muted: #8a8a8a; --dim: #555; --ok: #f2f2f2; --warn: #bdbdbd;\r\n  }\r\n  * { box-sizing: border-box; }\r\n  body {\r\n    margin: 0; background: var(--bg); color: var(--text);\r\n    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", sans-serif;\r\n    background-image: radial-gradient(1200px 500px at 50% -200px, #1c1c1c 0%, transparent 70%);\r\n    min-height: 100vh;\r\n  }\r\n  main { max-width: 760px; margin: 0 auto; padding: 48px 16px 80px; }\r\n  header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 28px; flex-wrap: wrap; }\r\n  .brand { display: flex; align-items: center; gap: 12px; }\r\n  .brand svg { width: 26px; height: 26px; }\r\n  .brand h1 { font-size: 20px; font-weight: 600; letter-spacing: -0.01em; margin: 0; }\r\n  .pill { font: 12px/1 ui-monospace, "SF Mono", Menlo, monospace; color: var(--muted); border: 1px solid var(--line-strong); padding: 6px 10px; border-radius: 6px; }\r\n  .lead { color: var(--muted); margin: -12px 0 28px; max-width: 560px; }\r\n  .progress { height: 2px; background: var(--line); border-radius: 2px; overflow: hidden; margin-bottom: 28px; }\r\n  .progress > div { height: 100%; background: linear-gradient(90deg, #6d6d6d, #fff); transition: width .4s ease; }\r\n  section { background: linear-gradient(180deg, #121212, var(--panel)); border: 1px solid var(--line); border-radius: 12px; padding: 20px; margin-bottom: 16px; }\r\n  section h2 { font-size: 15px; font-weight: 600; margin: 0 0 4px; display: flex; align-items: center; gap: 10px; }\r\n  section h2 .n { font: 11px/1 ui-monospace, Menlo, monospace; color: var(--dim); border: 1px solid var(--line-strong); border-radius: 4px; padding: 3px 5px; }\r\n  section > p { color: var(--muted); margin: 0 0 14px; }\r\n  .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); }\r\n  .row:first-of-type { border-top: 0; }\r\n  .row .label { display: flex; align-items: center; gap: 10px; min-width: 0; }\r\n  .row .sub { color: var(--dim); font-size: 12px; }\r\n  .mark { width: 16px; height: 16px; border: 1px solid var(--line-strong); border-radius: 4px; display: inline-grid; place-items: center; flex: none; font-size: 11px; color: var(--bg); }\r\n  .mark.on { background: var(--ok); border-color: var(--ok); }\r\n  .mark.on::after { content: "\u2713"; font-weight: 700; }\r\n  .state { color: var(--muted); font-size: 12px; }\r\n  button {\r\n    font: inherit; font-size: 13px; color: var(--bg); background: var(--text); border: 0; border-radius: 7px;\r\n    padding: 7px 12px; cursor: pointer; white-space: nowrap; box-shadow: inset 0 1px 0 rgba(255,255,255,.5);\r\n  }\r\n  button.ghost { background: transparent; color: var(--text); border: 1px solid var(--line-strong); box-shadow: none; }\r\n  button:disabled { opacity: .45; cursor: default; }\r\n  button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }\r\n  .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }\r\n  code, pre { font: 12px/1.5 ui-monospace, "SF Mono", Menlo, monospace; }\r\n  pre { background: #0a0a0a; border: 1px solid var(--line); border-radius: 8px; padding: 12px; overflow-x: auto; margin: 8px 0 0; color: #cfcfcf; white-space: pre-wrap; word-break: break-all; }\r\n  .prompt { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; margin-top: 8px; color: #d9d9d9; }\r\n  ol { margin: 8px 0 0; padding-left: 20px; color: var(--muted); }\r\n  ol li { margin: 4px 0; }\r\n  details { margin-top: 12px; color: var(--muted); }\r\n  summary { cursor: pointer; }\r\n  .toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: #fff; color: #000; padding: 10px 14px; border-radius: 8px; font-size: 13px; max-width: calc(100vw - 32px); opacity: 0; transition: opacity .2s; pointer-events: none; }\r\n  .toast.show { opacity: 1; }\r\n  .hidden { display: none; }\r\n  @media (max-width: 520px) { .row { flex-wrap: wrap; } }\r\n</style>\r\n</head>\r\n<body>\r\n<main>\r\n  <header>\r\n    <div class="brand">\r\n      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 3l15 7.2-6.4 1.6L9.4 18 4 3z" fill="#fff"/><path d="M13 12.2l5.5 6.3" stroke="#8a8a8a" stroke-width="1.6" stroke-linecap="round"/></svg>\r\n      <h1>AgentCursor</h1>\r\n    </div>\r\n    <span class="pill" id="service">connecting\u2026</span>\r\n  </header>\r\n  <p class="lead">A visible, human-like cursor your AI can use in any desktop app and in your browser. Finish the steps below once; every connected AI app shares this local service.</p>\r\n  <div class="progress" aria-hidden="true"><div id="bar" style="width:0%"></div></div>\r\n\r\n  <section>\r\n    <h2><span class="n">1</span> Connect your AI apps</h2>\r\n    <p>Adds AgentCursor to each app\'s MCP settings. Restart or reload the app afterwards.</p>\r\n    <div id="clients"></div>\r\n    <div class="actions"><button id="connect-all">Connect all detected</button></div>\r\n    <details>\r\n      <summary>Another app? Add it by hand</summary>\r\n      <pre id="manual"></pre>\r\n    </details>\r\n  </section>\r\n\r\n  <section id="desktop-section">\r\n    <h2><span class="n">2</span> Control any desktop app</h2>\r\n    <p>macOS asks you to allow this once. Grant it to the app your AI runs in (Terminal, Cursor, Claude...), then come back here.</p>\r\n    <div class="row"><div class="label"><span class="mark" id="ax-mark"></span><div>Accessibility<div class="sub">Read app windows and move the cursor</div></div></div><button class="ghost" id="ax-btn">Allow</button></div>\r\n    <div class="row"><div class="label"><span class="mark" id="sr-mark"></span><div>Screen Recording<div class="sub">Only for desktop_screenshot</div></div></div><button class="ghost" id="sr-btn">Allow</button></div>\r\n    <div class="actions"><button id="wiggle">Test the cursor</button></div>\r\n  </section>\r\n\r\n  <section>\r\n    <h2><span class="n">3</span> Browser tabs <span class="state">optional</span></h2>\r\n    <p>For web pages, load the Chrome extension once. Desktop control works without it.</p>\r\n    <div class="row"><div class="label"><span class="mark" id="ext-mark"></span><div>Chrome extension<div class="sub" id="ext-sub"></div></div></div><button class="ghost" id="ext-copy">Copy folder path</button></div>\r\n    <ol id="ext-steps">\r\n      <li>Open <code>chrome://extensions</code> and turn on Developer mode.</li>\r\n      <li>Click Load unpacked and pick the folder path you copied.</li>\r\n      <li>Open any normal web page. This turns green on its own.</li>\r\n    </ol>\r\n  </section>\r\n\r\n  <section>\r\n    <h2><span class="n">4</span> Try it</h2>\r\n    <p>Paste one of these into your AI app.</p>\r\n    <div id="prompts"></div>\r\n  </section>\r\n\r\n  <details>\r\n    <summary>Details</summary>\r\n    <pre id="details"></pre>\r\n  </details>\r\n</main>\r\n<div class="toast" id="toast" role="status" aria-live="polite"></div>\r\n\r\n<script>\r\n  const $ = (id) => document.getElementById(id);\r\n  const esc = (s) => String(s).replace(/[&<>"\']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", \'"\': "&quot;", "\'": "&#39;" })[c]);\r\n  let state = null;\r\n\r\n  const PROMPTS = [\r\n    "Use agentcursor: open Notes, create a new note and write a 3 item shopping list.",\r\n    "Use agentcursor: open Finder, go to Downloads and tell me the three newest files.",\r\n    "Use agentcursor: in my browser, open news.ycombinator.com and click the top story.",\r\n  ];\r\n\r\n  function toast(msg) {\r\n    const t = $("toast");\r\n    t.textContent = msg;\r\n    t.classList.add("show");\r\n    clearTimeout(toast.timer);\r\n    toast.timer = setTimeout(() => t.classList.remove("show"), 4000);\r\n  }\r\n\r\n  async function api(path, body) {\r\n    const res = await fetch(path, body === undefined ? {} : {\r\n      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),\r\n    });\r\n    const data = await res.json();\r\n    if (!res.ok) throw new Error(data.error || res.statusText);\r\n    return data;\r\n  }\r\n\r\n  async function busy(button, fn) {\r\n    button.disabled = true;\r\n    try { await fn(); } catch (e) { toast(e.message); } finally { button.disabled = false; refresh(); }\r\n  }\r\n\r\n  async function copy(text, label) {\r\n    try { await navigator.clipboard.writeText(text); toast(`${label} copied`); } catch { toast(text); }\r\n  }\r\n\r\n  function render(s) {\r\n    state = s;\r\n    $("service").textContent = `running \xB7 v${s.version}`;\r\n\r\n    const detected = s.clients.filter((c) => c.detected);\r\n    $("clients").innerHTML = s.clients.map((c) => `\r\n      <div class="row">\r\n        <div class="label"><span class="mark ${c.configured ? "on" : ""}"></span><div>${esc(c.name)}<div class="sub">${c.configured ? "Connected" : c.detected ? "Installed, not connected" : "Not found on this machine"}</div></div></div>\r\n        ${c.detected && !c.configured ? `<button class="ghost" data-client="${esc(c.id)}">Connect</button>` : ""}\r\n      </div>`).join("");\r\n    $("connect-all").disabled = !detected.some((c) => !c.configured);\r\n    $("manual").textContent = JSON.stringify({ mcpServers: { agentcursor: s.stdio } }, null, 2) + `\\n\\nHTTP transport: ${s.mcpUrl}`;\r\n\r\n    const d = s.desktop;\r\n    $("desktop-section").classList.toggle("hidden", !d.supported);\r\n    $("ax-mark").classList.toggle("on", d.accessibility);\r\n    $("sr-mark").classList.toggle("on", d.screenRecording);\r\n    $("ax-btn").classList.toggle("hidden", d.accessibility);\r\n    $("sr-btn").classList.toggle("hidden", d.screenRecording);\r\n    $("wiggle").disabled = !d.accessibility;\r\n\r\n    $("ext-mark").classList.toggle("on", s.extension.connected);\r\n    $("ext-sub").textContent = s.extension.connected ? "Connected" : s.extension.path;\r\n    $("ext-steps").classList.toggle("hidden", s.extension.connected);\r\n\r\n    const steps = [detected.some((c) => c.configured), !d.supported || d.accessibility, !d.supported || d.screenRecording, s.extension.connected];\r\n    $("bar").style.width = `${Math.round((steps.filter(Boolean).length / steps.length) * 100)}%`;\r\n\r\n    $("details").textContent = [\r\n      `MCP (HTTP): ${s.mcpUrl}`,\r\n      `MCP (stdio): ${s.stdio.command} ${s.stdio.args.join(" ")}`,\r\n      `Extension WebSocket: ws://127.0.0.1:${s.extension.wsPort}`,\r\n      `Persona seed: ${s.personaSeed}`,\r\n      `Service pid: ${s.pid}`,\r\n      `Log: ${s.logFile}`,\r\n    ].join("\\n");\r\n  }\r\n\r\n  async function refresh() {\r\n    try { render(await api("/api/status")); }\r\n    catch { $("service").textContent = "service not running: run agentcursor setup"; }\r\n  }\r\n\r\n  $("clients").addEventListener("click", (e) => {\r\n    const b = e.target.closest("button[data-client]");\r\n    if (b) busy(b, async () => toast((await api("/api/connect", { client: b.dataset.client })).message));\r\n  });\r\n  $("connect-all").addEventListener("click", (e) => busy(e.currentTarget, async () => {\r\n    const pending = state.clients.filter((c) => c.detected && !c.configured);\r\n    const results = [];\r\n    for (const c of pending) {\r\n      try { await api("/api/connect", { client: c.id }); results.push(`${c.name} connected`); }\r\n      catch (err) { results.push(`${c.name}: ${err.message}`); }\r\n    }\r\n    toast(results.join(" \xB7 "));\r\n  }));\r\n  $("ax-btn").addEventListener("click", (e) => busy(e.currentTarget, () => api("/api/permission", { kind: "accessibility" })));\r\n  $("sr-btn").addEventListener("click", (e) => busy(e.currentTarget, () => api("/api/permission", { kind: "screen" })));\r\n  $("wiggle").addEventListener("click", (e) => busy(e.currentTarget, async () => { await api("/api/test-cursor", {}); toast("That was AgentCursor moving your cursor"); }));\r\n  $("ext-copy").addEventListener("click", () => state && copy(state.extension.path, "Extension folder path"));\r\n\r\n  $("prompts").innerHTML = PROMPTS.map((p, i) => `<div class="prompt"><span>${esc(p)}</span><button class="ghost" data-prompt="${i}">Copy</button></div>`).join("");\r\n  $("prompts").addEventListener("click", (e) => {\r\n    const b = e.target.closest("button[data-prompt]");\r\n    if (b) copy(PROMPTS[Number(b.dataset.prompt)], "Prompt");\r\n  });\r\n\r\n  refresh();\r\n  setInterval(refresh, 2000);\r\n</script>\r\n</body>\r\n</html>\r\n';

// src/server/live.html
var live_default = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AgentCursor Live</title>
<style>
  :root {
    --bg: #070708; --panel: #0f0f13; --line: #1e1e26; --text: #f3f3f5;
    --muted: #8b8b98; --dim: #5a5a66; --ok: #6dffa0; --warn: #ffc857;
    --err: #ff6b7a; --accent: #7aa2ff;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; background: var(--bg); color: var(--text);
    font: 13px/1.45 ui-monospace, "Cascadia Mono", Consolas, monospace;
    display: grid; grid-template-rows: 44px 1fr auto;
  }
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 14px; background: #121216; border-bottom: 1px solid var(--line);
    letter-spacing: .02em;
  }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; }
  .pulse {
    width: 8px; height: 8px; border-radius: 50%; background: var(--ok);
    box-shadow: 0 0 10px var(--ok); animation: pulse 1.2s ease-in-out infinite;
  }
  .pulse.busy { background: var(--warn); box-shadow: 0 0 12px var(--warn); }
  @keyframes pulse { 0%,100% { opacity: .45; transform: scale(.85); } 50% { opacity: 1; transform: scale(1.1); } }
  .meta { color: var(--muted); font-size: 12px; }
  .pill {
    border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px;
    color: var(--muted); font-size: 11px;
  }
  main {
    display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 340px);
    min-height: 0;
  }
  #stage {
    background: #050507; display: flex; align-items: center; justify-content: center;
    position: relative; overflow: hidden; min-height: 240px;
  }
  #stage img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
  #stage .placeholder {
    position: absolute; inset: 0; display: grid; place-items: center;
    color: var(--dim); text-align: center; padding: 24px;
  }
  #feed {
    background: var(--panel); border-left: 1px solid var(--line);
    display: flex; flex-direction: column; min-height: 0;
  }
  #feed h2 {
    margin: 0; padding: 10px 12px; font-size: 11px; letter-spacing: .12em;
    text-transform: uppercase; color: var(--muted); border-bottom: 1px solid var(--line);
    display: flex; justify-content: space-between; align-items: center;
  }
  #list { overflow: auto; padding: 8px; flex: 1; display: flex; flex-direction: column; gap: 6px; }
  .ev {
    border: 1px solid var(--line); background: #0b0b0f; border-radius: 8px;
    padding: 8px 10px; animation: in .18s ease;
  }
  @keyframes in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  .ev .row1 { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--dim); }
  .ev .tool { color: var(--accent); font-weight: 700; }
  .ev.ok .tool { color: var(--ok); }
  .ev.err .tool { color: var(--err); }
  .ev .detail { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
  footer {
    border-top: 1px solid var(--line); background: #0c0c10; color: var(--muted);
    padding: 8px 14px; display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px;
  }
  footer b { color: var(--text); font-weight: 600; }
  .idle { color: var(--dim); }
  @media (max-width: 720px) {
    main { grid-template-columns: 1fr; grid-template-rows: 45vh 1fr; }
    #feed { border-left: 0; border-top: 1px solid var(--line); }
  }
</style>
</head>
<body>
  <header>
    <div class="brand"><span class="pulse" id="pulse"></span> AgentCursor Live</div>
    <div class="meta" id="activity">standby</div>
    <div class="pill" id="src">\u2014</div>
  </header>
  <main>
    <div id="stage">
      <img id="frame" alt="live" draggable="false">
      <div class="placeholder" id="ph">conectando ao stream\u2026</div>
    </div>
    <aside id="feed">
      <h2><span>Agent feed</span><span id="count">0</span></h2>
      <div id="list"></div>
    </aside>
  </main>
  <footer>
    <span>fps <b id="fps">0</b></span>
    <span>frames <b id="frames">0</b></span>
    <span>events <b id="evn">0</b></span>
    <span>status <b id="st">ok</b></span>
    <span class="idle">focus-safe \xB7 topmost</span>
  </footer>
<script>
(() => {
  const img = document.getElementById("frame");
  const ph = document.getElementById("ph");
  const list = document.getElementById("list");
  const pulse = document.getElementById("pulse");
  const activity = document.getElementById("activity");
  const srcEl = document.getElementById("src");
  const fpsEl = document.getElementById("fps");
  const framesEl = document.getElementById("frames");
  const evnEl = document.getElementById("evn");
  const countEl = document.getElementById("count");
  const stEl = document.getElementById("st");

  let lastId = 0;
  let frameCount = 0;
  let windowStart = performance.now();
  let evCount = 0;

  function connectStream() {
    ph.style.display = "grid";
    ph.textContent = "conectando ao stream\u2026";
    img.onload = () => {
      ph.style.display = "none";
      frameCount++;
      const now = performance.now();
      if (now - windowStart >= 1000) {
        const fps = Math.round((frameCount * 1000) / (now - windowStart));
        fpsEl.textContent = String(fps);
        framesEl.textContent = String(frameCount);
        windowStart = now;
        frameCount = 0;
      }
    };
    img.onerror = () => {
      ph.style.display = "grid";
      ph.textContent = "stream indispon\xEDvel \u2014 reconectando\u2026";
      setTimeout(connectStream, 800);
    };
    img.src = "/api/stream?t=" + Date.now();
  }

  function renderEvent(e, prepend) {
    const el = document.createElement("div");
    el.className = "ev " + (e.ok ? "ok" : "err");
    const t = new Date(e.t).toLocaleTimeString();
    const ms = e.ms != null ? " \xB7 " + e.ms + "ms" : "";
    el.innerHTML =
      '<div class="row1"><span class="tool"></span><span class="ts"></span></div>' +
      '<div class="detail"></div>';
    el.querySelector(".tool").textContent = e.tool;
    el.querySelector(".ts").textContent = t + ms;
    el.querySelector(".detail").textContent = e.detail || "";
    if (prepend && list.firstChild) list.insertBefore(el, list.firstChild);
    else list.appendChild(el);
    while (list.children.length > 40) list.removeChild(list.lastChild);
    evCount++;
    countEl.textContent = String(list.children.length);
    evnEl.textContent = String(evCount);
  }

  async function pollEvents() {
    try {
      const r = await fetch("/api/events?since=" + lastId, { cache: "no-store" });
      if (!r.ok) throw new Error("events " + r.status);
      const j = await r.json();
      stEl.textContent = "ok";
      const events = j.events || [];
      if (events.length) {
        for (let i = events.length - 1; i >= 0; i--) renderEvent(events[i], true);
        lastId = j.lastId || events[events.length - 1].id;
      } else if (j.lastId) {
        lastId = Math.max(lastId, j.lastId);
      }
      const a = j.activity || {};
      if (a.running) {
        pulse.classList.add("busy");
        activity.textContent = "executando \xB7 " + (a.tool || "?");
      } else {
        pulse.classList.remove("busy");
        activity.textContent = a.tool ? "\xFAltima \xB7 " + a.tool : "aguardando o agente";
      }
    } catch (e) {
      stEl.textContent = "reconnecting";
    }
    setTimeout(pollEvents, 350);
  }

  async function pollSource() {
    try {
      const r = await fetch("/api/screenshot", { method: "HEAD", cache: "no-store" });
      srcEl.textContent = r.headers.get("x-agentcursor-source") || "\u2014";
    } catch {
      srcEl.textContent = "offline";
    }
    setTimeout(pollSource, 3000);
  }

  connectStream();
  pollEvents();
  pollSource();
})();
</script>
</body>
</html>
`;

// src/server/guard.ts
function isAllowedRequest(host, origin, port) {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!host || !hosts.includes(host)) return false;
  return origin === void 0 || hosts.some((h) => origin === `http://${h}`);
}

// src/server/http.ts
function serve(rt, opts = {}) {
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
          return res.end(wizard_default);
        }
        if (path === "/health") return json(res, 200, health());
        if (path === "/api/status") return json(res, 200, await status(rt));
        if (path === "/api/screenshot") {
          const frame = await rt.frames.capture(true);
          if (!frame) {
            return json(res, 503, {
              error: "no screenshot source (extension offline and desktop capture failed)",
              detail: rt.frames.error() || void 0
            });
          }
          res.writeHead(200, {
            "content-type": "image/jpeg",
            "cache-control": "no-store",
            "content-length": frame.buf.length,
            "x-agentcursor-source": frame.source,
            "x-agentcursor-focus": encodeURIComponent(frame.focus)
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
              ...rt.focus.get()
            }
          });
        }
        if (path === "/live") {
          res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
          return res.end(live_default);
        }
        if (path === "/api/live") {
          const on = liveViewPid() !== null;
          return json(res, 200, { on });
        }
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        if (path === "/api/connect") {
          return json(res, 200, { message: connectClient2(String(body.client), launchEntry(SELF)) });
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
      if (!res.headersSent) json(res, 500, { error: e.message });
    }
  });
  if (opts.idleExitMs) {
    const idle = opts.idleExitMs;
    setInterval(() => {
      if (Date.now() - lastSeen > idle) process.exit(0);
    }, 15e3).unref();
  }
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      process.stderr.write(
        `agentcursor: serving MCP at http://127.0.0.1:${port}/mcp, setup page http://127.0.0.1:${port}, extension WebSocket ws://127.0.0.1:${rt.ports.ws}, persona seed ${rt.persona.seed}
`
      );
      resolve();
    });
  });
}
async function handleMcp(rt, req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { jsonrpc: "2.0", error: { code: -32e3, message: "Method not allowed." }, id: null });
  }
  const server = createMcpServer(rt);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: void 0, enableJsonResponse: true });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}
function health() {
  return { ok: true, version: readVersion(), buildId: BUILD_ID, pid: process.pid };
}
async function status(rt) {
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
      path: fileURLToPath2(new URL("../extension", import.meta.url))
    },
    desktop: {
      supported,
      platform: isWin ? "windows" : process.platform === "darwin" ? "macos" : "unsupported",
      accessibility: permissions?.accessibility ?? false,
      screenRecording: permissions?.screenRecording ?? false
    },
    clients: clientStatus()
  };
}
function json(res, code, body) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
async function handleMjpeg(rt, res) {
  res.writeHead(200, {
    "content-type": "multipart/x-mixed-replace; boundary=frame",
    "cache-control": "no-cache, no-store, must-revalidate",
    pragma: "no-cache",
    connection: "keep-alive"
  });
  rt.frames.noteWatcher(true);
  let alive = true;
  const onClose = () => {
    alive = false;
    rt.frames.noteWatcher(false);
    try {
      res.end();
    } catch {
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
        `--frame\r
Content-Type: image/jpeg\r
Content-Length: ${frame.buf.length}\r
X-Agentcursor-Source: ${frame.source}\r
X-Agentcursor-Focus: ${encodeURIComponent(frame.focus)}\r
\r
`
      );
      if (!res.write(head) || !res.write(frame.buf)) {
        await onceDrain(res);
        if (!alive) break;
      }
      frames++;
      const now = Date.now();
      if (now - fpsAt >= 1e3) {
        fps = frames;
        frames = 0;
        fpsAt = now;
      }
      const wait = Math.max(20, Math.round(1e3 / Math.max(8, fps || 12)) - 8);
      await sleep(wait);
    }
  } catch {
    onClose();
  }
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function onceDrain(res) {
  return new Promise((resolve) => {
    if (res.writableEnded || res.destroyed) return resolve();
    res.once("drain", resolve);
    setTimeout(resolve, 250);
  });
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 65536) req.destroy(new Error("Body too large"));
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

// src/setup/cli.ts
import { spawn as spawn2 } from "child_process";
async function setup(port, argv) {
  await ensureDaemon(port);
  const all = argv.includes("--all");
  const only = argv.find((a) => a.startsWith("--client="))?.slice("--client=".length).split(",");
  const entry = launchEntry(SELF);
  console.log("AI apps on this machine:");
  for (const c of clients()) {
    if (!c.detect()) continue;
    let state = c.configured() ? "connected" : "not connected";
    if (state === "not connected" && (all || only?.includes(c.id))) {
      try {
        state = `connected (${c.connect(entry)})`;
      } catch (e) {
        state = `failed: ${e.message}`;
      }
    }
    console.log(`  ${c.name.padEnd(15)} ${state}`);
  }
  const url = `http://127.0.0.1:${port}`;
  console.log(`
Setup page: ${url}`);
  console.log("Connect everything at once: agentcursor setup --all");
  if (!argv.includes("--no-open")) openUrl(url);
}
function openUrl(url) {
  const [cmd, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  spawn2(cmd, args, { stdio: "ignore", detached: true }).unref();
}

// src/index.ts
var [command = "mcp", ...rest] = process.argv.slice(2);
var ports = resolvePorts();
if (command === "serve") {
  await serve(createRuntime(ports), { idleExitMs: rest.includes("--idle-exit") ? 10 * 6e4 : void 0 });
} else if (command === "setup") {
  await setup(ports.http, rest);
  process.exit(0);
} else if (command === "launch") {
  await launchCli(ports, rest);
} else if (command === "autostart") {
  await autostart(ports, { live: rest.includes("--live") });
  process.exit(0);
} else if (command === "mcp") {
  if (process.env.AGENTCURSOR_AUTOSTART !== "0") {
    try {
      const live = process.env.AGENTCURSOR_LIVE ?? "0";
      await autostart(ports, { live: live === "1" });
    } catch (e) {
      process.stderr.write(`agentcursor: autostart warning: ${e.message}
`);
    }
  }
  await runStdioProxy(ports.http);
} else {
  process.exit(await runTool(ports.http, [command, ...rest]));
}
