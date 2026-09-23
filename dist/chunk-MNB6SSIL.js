#!/usr/bin/env node

// src/cli/autostart.ts
import { execSync, spawn as spawn4 } from "child_process";
import { existsSync as existsSync3, readFileSync as readFileSync5, writeFileSync as writeFileSync3 } from "fs";
import { tmpdir as tmpdir5 } from "os";
import { join as join6 } from "path";
import { fileURLToPath as fileURLToPath3 } from "url";

// src/server/proxy.ts
import { spawn as spawn3 } from "child_process";
import { openSync, readFileSync as readFileSync4 } from "fs";
import { basename, dirname, join as join5 } from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

// src/util/timing.ts
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
var sleepUntil = (perfTime) => sleep(perfTime - performance.now());
var rand = (min, max) => min + Math.random() * (max - min);

// src/server/create.ts
import { readFileSync as readFileSync3, statSync as statSync2 } from "fs";
import { tmpdir as tmpdir4 } from "os";
import { join as join4 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// src/protocol/index.ts
var DEFAULT_WS_PORT = 8930;
var PROTOCOL_VERSION = 1;
function buildEvalExpression(fn, args = []) {
  const argList = args.map((a) => JSON.stringify(a) ?? "undefined").join(",");
  return `(${fn.trim()})(${argList})`;
}

// src/path-engine/geometry.ts
function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
function cubicBezier(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return {
    x: w0 * p0.x + w1 * p1.x + w2 * p2.x + w3 * p3.x,
    y: w0 * p0.y + w1 * p1.y + w2 * p2.y + w3 * p3.y
  };
}
function smootherstep(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// src/path-engine/profile.ts
function fittsDurationMs(dist, targetWidth, rng, speedFactor = 1) {
  const a = rng.range(70, 130);
  const b = rng.range(80, 150);
  const id = Math.log2(dist / Math.max(targetWidth, 6) + 1);
  return Math.max(90, (a + b * id) / speedFactor);
}
function stepCount(durationMs, rng) {
  return Math.round(clamp(durationMs / rng.range(14, 20), 8, 140));
}
function easeParam(timeFraction, skew) {
  return Math.pow(smootherstep(timeFraction), skew);
}

// src/path-engine/rng.ts
function createRng(seed) {
  let state = (seed ?? Math.floor(Math.random() * 4294967295)) >>> 0;
  const next = () => {
    state = state + 1831565813 >>> 0;
    let z3 = state;
    z3 = Math.imul(z3 ^ z3 >>> 15, z3 | 1);
    z3 ^= z3 + Math.imul(z3 ^ z3 >>> 7, z3 | 61);
    return ((z3 ^ z3 >>> 14) >>> 0) / 4294967296;
  };
  const range = (min, max) => min + (max - min) * next();
  const int = (min, max) => Math.floor(range(min, max + 1));
  const gaussian = (mean = 0, std = 1) => {
    const u = 1 - next();
    const v = next();
    return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const skewed = (min, max, power = 2.2) => min + (max - min) * Math.pow(next(), power);
  const bool = (p) => next() < p;
  return { next, range, int, gaussian, skewed, bool };
}

// src/path-engine/index.ts
var OVERSHOOT_MIN_DISTANCE = 180;
function generateMove(from, to, options = {}) {
  const rng = options.rng ?? createRng();
  const targetWidth = options.targetWidth ?? 24;
  const allowOvershoot = options.overshoot ?? true;
  const seg = {
    targetWidth,
    correction: false,
    speedFactor: options.speedFactor ?? 1,
    curviness: options.curviness ?? 1,
    jitterAmp: options.jitterPx ?? 1.4,
    handedness: options.handedness ?? 0
  };
  const total = distance(from, to);
  const legs = [];
  if (allowOvershoot && total > OVERSHOOT_MIN_DISTANCE && rng.bool(options.overshootProb ?? 0.5)) {
    const past = overshootPoint(from, to, rng, options.overshootMag ?? 0.12);
    legs.push({ a: from, b: past, correction: false });
    legs.push({ a: past, b: to, correction: true });
  } else {
    legs.push({ a: from, b: to, correction: false });
  }
  const samples = [];
  let tOffset = 0;
  for (const leg of legs) {
    const seg2 = { ...seg, correction: leg.correction };
    for (const s of buildSegment(leg.a, leg.b, rng, seg2)) {
      samples.push({ x: s.x, y: s.y, t: s.t + tOffset });
    }
    const last = samples.at(-1);
    tOffset = (last?.t ?? tOffset) + rng.range(12, 45);
  }
  return monotonic(samples);
}
function buildSegment(a, b, rng, opts) {
  const dist = distance(a, b);
  const baseDuration = fittsDurationMs(
    dist,
    opts.correction ? Math.max(opts.targetWidth, 12) : opts.targetWidth,
    rng,
    opts.speedFactor
  );
  const duration = baseDuration * (opts.correction ? 0.55 : 1);
  const steps = stepCount(duration, rng);
  const skew = rng.range(0.85, 1.18);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.max(Math.hypot(dx, dy), 1e-4);
  const nx = -dy / len;
  const ny = dx / len;
  const side = opts.handedness !== 0 ? (rng.bool(0.75) ? 1 : -1) * Math.sign(opts.handedness) : rng.bool(0.5) ? 1 : -1;
  const bow = side * rng.range(dist * 0.04, dist * 0.16) * opts.curviness;
  const c1 = {
    x: a.x + dx * 0.3 + nx * bow * rng.range(0.7, 1),
    y: a.y + dy * 0.3 + ny * bow * rng.range(0.7, 1)
  };
  const c2 = {
    x: a.x + dx * 0.68 + nx * bow * rng.range(0.6, 1),
    y: a.y + dy * 0.68 + ny * bow * rng.range(0.6, 1)
  };
  const out = [];
  let tAcc = 0;
  for (let i = 0; i <= steps; i++) {
    const tf = i / steps;
    const point = cubicBezier(a, c1, c2, b, easeParam(tf, skew));
    const envelope = Math.sin(Math.PI * tf);
    if (i > 0) tAcc += duration / steps * rng.range(0.7, 1.3);
    out.push({
      x: point.x + rng.gaussian(0, opts.jitterAmp) * envelope,
      y: point.y + rng.gaussian(0, opts.jitterAmp) * envelope,
      t: tAcc
    });
  }
  out[0] = { x: a.x, y: a.y, t: 0 };
  out[out.length - 1] = { x: b.x, y: b.y, t: tAcc };
  return out;
}
function overshootPoint(from, to, rng, mag) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.max(Math.hypot(dx, dy), 1e-4);
  const ux = dx / len;
  const uy = dy / len;
  const over = Math.min(len * mag, 110) * rng.range(0.5, 1.1);
  const perp = rng.gaussian(0, 8);
  return { x: to.x + ux * over - uy * perp, y: to.y + uy * over + ux * perp };
}
function monotonic(samples) {
  const out = [];
  let lastT = -1;
  for (const s of samples) {
    const t = s.t <= lastT ? lastT + 1 : s.t;
    out.push({ x: s.x, y: s.y, t });
    lastT = t;
  }
  return out;
}
function offCenterPoint(rect, rng = createRng(), precision = 0.18) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const ox = clamp(
    rng.gaussian(0, rect.width * precision),
    -rect.width * 0.4,
    rect.width * 0.4
  );
  const oy = clamp(
    rng.gaussian(0, rect.height * precision),
    -rect.height * 0.4,
    rect.height * 0.4
  );
  return { x: cx + ox, y: cy + oy };
}
function sampleDwellMs(rng = createRng(), dwellScale = 1) {
  return Math.round(clamp(rng.skewed(60, 300, 2) * dwellScale, 40, 520));
}
function samplePressMs(rng = createRng(), pressScale = 1) {
  return Math.round(rng.skewed(45, 130, 1.8) * pressScale);
}

// src/persona/typing.ts
var NEIGHBORS = {
  a: "sqwz",
  b: "vghn",
  c: "xdfv",
  d: "serfcx",
  e: "wsdr",
  f: "drtgvc",
  g: "ftyhbv",
  h: "gyujnb",
  i: "ujko",
  j: "huikmn",
  k: "jiolm",
  l: "kop",
  m: "njk",
  n: "bhjm",
  o: "iklp",
  p: "ol",
  q: "wa",
  r: "edft",
  s: "awedxz",
  t: "rfgy",
  u: "yhji",
  v: "cfgb",
  w: "qase",
  x: "zsdc",
  y: "tghu",
  z: "asx"
};
function wrongChar(ch, rng) {
  const lower = ch.toLowerCase();
  const opts = NEIGHBORS[lower];
  if (!opts) return null;
  const pick = opts[rng.int(0, opts.length - 1)];
  return ch === lower ? pick : pick.toUpperCase();
}
function buildTypingSchedule(text3, rng, traits) {
  const base2 = 12e3 / traits.wpm;
  const ops = [];
  let first = true;
  for (let i = 0; i < text3.length; i++) {
    const ch = text3[i];
    const prev = text3[i - 1];
    let delay = Math.max(8, rng.gaussian(base2, base2 * 0.35));
    if (first) {
      delay += traits.reactionMs * rng.range(0.6, 1.1);
      first = false;
    } else if (prev === " ") {
      delay += base2 * rng.range(1.5, 3.5);
    } else if (prev && ".?!".includes(prev)) {
      delay += base2 * rng.range(3, 6);
    } else if (rng.bool(0.06)) {
      delay += base2 * rng.range(2, 5);
    }
    if (/[a-zA-Z]/.test(ch) && rng.bool(traits.errorRate)) {
      const wrong = wrongChar(ch, rng);
      if (wrong) {
        ops.push({ t: "key", ch: wrong, delayMs: Math.round(delay) });
        ops.push({ t: "back", delayMs: Math.round(base2 * rng.range(2, 5)) });
        ops.push({ t: "key", ch, delayMs: Math.round(base2 * rng.range(0.8, 1.4)) });
        continue;
      }
    }
    ops.push({ t: "key", ch, delayMs: Math.round(delay) });
  }
  return ops;
}
function scheduleToKeystrokes(ops) {
  const stack = [];
  for (const op of ops) {
    if (op.t === "key") stack.push({ ch: op.ch, delayMs: op.delayMs });
    else stack.pop();
  }
  return stack;
}

// src/persona/index.ts
var FATIGUE_FULL_MS = 20 * 6e4;
var FATIGUE_MAX = 0.15;
var Persona = class {
  seed;
  rng;
  base;
  actions = 0;
  startMs;
  clock;
  constructor(opts = {}) {
    this.seed = (opts.seed ?? Math.floor(Math.random() * 4294967295)) >>> 0;
    this.rng = createRng(this.seed);
    this.clock = opts.now ?? (() => Date.now());
    this.startMs = this.clock();
    this.base = sampleTraits(this.rng);
  }
  /** Advance fatigue bookkeeping; call once per action. */
  tick() {
    this.actions++;
  }
  /** 0..FATIGUE_MAX, grows with elapsed session time. */
  get fatigue() {
    return clamp((this.clock() - this.startMs) / FATIGUE_FULL_MS, 0, 1) * FATIGUE_MAX;
  }
  /** Traits after fatigue drift (slower, shakier, more hesitant over time). */
  traits() {
    const f = this.fatigue;
    return {
      ...this.base,
      speedFactor: this.base.speedFactor * (1 - f),
      jitterPx: this.base.jitterPx * (1 + 0.4 * f),
      thinkScale: this.base.thinkScale * (1 + 0.5 * f)
    };
  }
  info() {
    return { seed: this.seed, traits: this.traits(), actionCount: this.actions, fatigue: this.fatigue };
  }
  /** Cognitive delay before an action; `distancePx` is the cursor travel. */
  thinkTimeMs(distancePx = 0) {
    const t = this.traits();
    const reaction = t.reactionMs * this.rng.range(0.7, 1.3);
    const decide = Math.min(distancePx, 1200) * 0.06 * this.rng.range(0.5, 1.5);
    return Math.round((reaction + decide) * t.thinkScale);
  }
  /** Pause to "read" `chars` of freshly surfaced text, capped. */
  readPauseMs(chars) {
    const t = this.traits();
    const raw = Math.min(chars, 600) * t.readMsPerChar * this.rng.range(0.6, 1.4);
    return Math.round(clamp(raw, 120, 4e3));
  }
  moveOptions(targetWidth) {
    const t = this.traits();
    return {
      rng: this.rng,
      targetWidth,
      speedFactor: t.speedFactor,
      curviness: t.curviness,
      jitterPx: t.jitterPx,
      overshootProb: t.overshootProb,
      overshootMag: t.overshootMag,
      handedness: t.handedness
    };
  }
  keySchedule(text3) {
    const t = this.traits();
    return buildTypingSchedule(text3, this.rng, {
      wpm: t.wpm,
      errorRate: t.errorRate,
      reactionMs: t.reactionMs
    });
  }
};
function createPersona(seed, opts = {}) {
  return new Persona({ seed, ...opts });
}
function sampleTraits(rng) {
  return {
    speedFactor: rng.range(0.75, 1.35),
    curviness: rng.range(0.6, 1.5),
    jitterPx: rng.range(0.7, 2.2),
    overshootProb: rng.range(0.25, 0.7),
    overshootMag: rng.range(0.08, 0.16),
    precision: rng.range(0.1, 0.26),
    dwellScale: rng.range(0.7, 1.5),
    pressScale: rng.range(0.75, 1.4),
    wpm: rng.range(62, 155),
    errorRate: rng.range(0, 0.05),
    reactionMs: rng.range(180, 520),
    thinkScale: rng.range(0.7, 1.5),
    readMsPerChar: rng.range(8, 22),
    handedness: rng.bool(0.5) ? 1 : -1
  };
}

// src/action/service.ts
var ActionService = class {
  constructor(driver, persona) {
    this.driver = driver;
    this.persona = persona ?? createPersona();
  }
  driver;
  snapshot = null;
  lastPos = null;
  persona;
  /** The active session persona (seed + traits), for status/inspection. */
  personaInfo() {
    return this.persona.info();
  }
  async readPage(maxElements = 200, includeText = true) {
    this.snapshot = await this.driver.snapshot(maxElements, includeText);
    return this.snapshot;
  }
  async moveTo(opts) {
    await this.ensureFresh(opts.ref);
    const from = await this.ensureStart();
    const { point, width } = await this.resolveTarget(opts);
    this.persona.tick();
    await this.think(distance(from, point));
    const samples = generateMove(from, point, this.persona.moveOptions(width));
    await this.driver.move(samples, mode(opts.stealth));
    this.lastPos = point;
    return point;
  }
  async click(opts) {
    await this.ensureFresh(opts.ref);
    const from = await this.ensureStart();
    const { point, width } = await this.resolveTarget(opts);
    this.persona.tick();
    await this.think(distance(from, point));
    const t = this.persona.traits();
    const samples = generateMove(from, point, this.persona.moveOptions(width));
    await this.driver.click({
      samples,
      target: point,
      button: opts.button ?? "left",
      dblclick: opts.double ?? false,
      preClickDwellMs: sampleDwellMs(this.persona.rng, t.dwellScale),
      pressMs: samplePressMs(this.persona.rng, t.pressScale),
      mode: mode(opts.stealth)
    });
    this.lastPos = point;
    return point;
  }
  async type(opts) {
    if (opts.ref) await this.click({ ref: opts.ref, stealth: opts.stealth });
    else if (opts.rect) await this.click({ rect: opts.rect, stealth: opts.stealth });
    this.persona.tick();
    const base2 = 12e3 / this.persona.traits().wpm;
    const schedule = opts.replace ? void 0 : this.persona.keySchedule(opts.text);
    await this.driver.type({
      text: opts.text,
      ref: opts.ref,
      perKeyMinMs: Math.round(base2 * 0.6),
      perKeyMaxMs: Math.round(base2 * 1.8),
      mode: mode(opts.stealth),
      replace: opts.replace,
      schedule
    });
  }
  resolveLocator(spec, opts = {}) {
    return this.driver.resolveLocator(spec, {
      timeoutMs: opts.timeoutMs ?? 5e3,
      scrollIntoView: opts.scrollIntoView
    });
  }
  async scroll(opts) {
    this.persona.tick();
    const steps = Math.max(3, Math.round(Math.abs(opts.dy) / this.persona.rng.range(80, 140)));
    await this.driver.scroll({
      dx: opts.dx ?? 0,
      dy: opts.dy,
      steps,
      mode: mode(opts.stealth)
    });
    await sleep(this.persona.readPauseMs(Math.min(Math.abs(opts.dy) / 3, 300)));
  }
  async navigate(url) {
    this.snapshot = null;
    this.lastPos = null;
    await this.driver.navigate(url);
  }
  getUrl() {
    return this.driver.getUrl();
  }
  evaluate(fn, args = []) {
    return this.driver.evaluate(buildEvalExpression(fn, args));
  }
  async waitFor(opts) {
    await this.idleDrift();
    return this.driver.waitFor({
      ref: opts.ref,
      text: opts.text,
      timeoutMs: opts.timeoutMs ?? 1e4,
      condition: opts.condition
    });
  }
  async screenshot(format = "png") {
    return this.driver.screenshot(format);
  }
  async consoleBuffer(clear) {
    return this.driver.consoleBuffer(clear);
  }
  async hover(opts = {}) {
    if (opts.ref || typeof opts.x === "number" && typeof opts.y === "number") {
      await this.moveTo({ ref: opts.ref, x: opts.x, y: opts.y, stealth: opts.stealth });
    }
    await this.driver.hover(opts);
  }
  async drag(from, to, button = "left", stealth) {
    const need = !!(from.ref || to.ref);
    if (from.ref) await this.driver.ensureVisible(from.ref);
    if (to.ref) await this.driver.ensureVisible(to.ref);
    if (need) await this.readPage();
    const start = await this.resolveTarget(from);
    const end = await this.resolveTarget(to);
    this.persona.tick();
    await this.think(distance(start.point, end.point));
    const samples = generateMove(start.point, end.point, this.persona.moveOptions(end.width));
    await this.driver.drag({
      samples,
      target: end.point,
      button,
      mode: mode(stealth)
    });
  }
  /** Identification: rank on-screen elements by how well their text/name matches a query. */
  async find(text3, opts = {}) {
    const snap = await this.readPage(200, true);
    await sleep(this.persona.readPauseMs(Math.min((snap.text ?? "").length, 400)));
    return rankByText(snap.elements, text3).slice(0, opts.maxResults ?? 8);
  }
  /** Identification + interaction: find the best text match, then human-click it (re-reading if needed). */
  async clickText(text3, opts = {}) {
    const scan = await this.readPage(200, true);
    await sleep(this.persona.readPauseMs(Math.min((scan.text ?? "").length, 400)));
    let matches = rankByText(scan.elements, text3);
    for (let attempt = 0; attempt < 2 && matches.length === 0; attempt++) {
      await sleep(400);
      matches = rankByText((await this.readPage(200, true)).elements, text3);
    }
    if (matches.length === 0) {
      throw new Error(
        `No element matching text "${text3}". Call read_page or screenshot to see what's on the page.`
      );
    }
    const matched = matches[Math.min(opts.nth ?? 0, matches.length - 1)];
    const point = await this.click({
      ref: matched.ref,
      stealth: opts.stealth,
      button: opts.button,
      double: opts.double
    });
    return { matched, point };
  }
  async pressKey(key2, stealth) {
    await this.driver.pressKey(key2, mode(stealth));
  }
  async ensureStart() {
    if (this.lastPos) return this.lastPos;
    this.lastPos = await this.driver.cursorState();
    return this.lastPos;
  }
  async ensureFresh(ref) {
    if (ref) {
      await this.driver.ensureVisible(ref);
      await this.readPage();
    }
  }
  async resolveTarget(opts) {
    const precision = this.persona.traits().precision;
    if (opts.rect) {
      const width2 = Math.max(Math.min(opts.rect.width, opts.rect.height), 8);
      return { point: offCenterPoint(opts.rect, this.persona.rng, precision), width: width2 };
    }
    if (typeof opts.x === "number" && typeof opts.y === "number") {
      return { point: { x: opts.x, y: opts.y }, width: 24 };
    }
    if (!opts.ref) {
      throw new Error("Provide either a `ref` or explicit `x`/`y` coordinates.");
    }
    const el = await this.findElement(opts.ref);
    const width = Math.max(Math.min(el.rect.width, el.rect.height), 8);
    return { point: offCenterPoint(el.rect, this.persona.rng, precision), width };
  }
  /** Cognitive delay before an action. */
  think(distancePx) {
    return sleep(this.persona.thinkTimeMs(distancePx));
  }
  /** A small settle move while waiting, the way a hand never sits perfectly still. */
  async idleDrift() {
    if (!this.lastPos || !this.persona.rng.bool(0.4)) return;
    const to = {
      x: this.lastPos.x + this.persona.rng.gaussian(0, 2.5),
      y: this.lastPos.y + this.persona.rng.gaussian(0, 2.5)
    };
    await this.driver.move(generateMove(this.lastPos, to, this.persona.moveOptions(6)), "content");
    this.lastPos = to;
  }
  async findElement(ref) {
    let el = this.snapshot?.elements.find((e) => e.ref === ref);
    if (!el) {
      await this.readPage();
      el = this.snapshot?.elements.find((e) => e.ref === ref);
    }
    if (!el) {
      await this.readPage();
      el = this.snapshot?.elements.find((e) => e.ref === ref);
    }
    if (!el) {
      throw new Error(
        `Element '${ref}' not found. Call read_page to refresh element refs.`
      );
    }
    return el;
  }
};
function mode(stealth) {
  return stealth ? "debugger" : "content";
}
function rankByText(elements, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const el of elements) {
    const name = (el.name ?? "").toLowerCase();
    const val = (el.value ?? "").toLowerCase();
    let score = 0;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 60;
    else if (val.includes(q)) score = 40;
    if (score === 0) continue;
    if (el.visible) score += 5;
    if (el.inViewport) score += 5;
    scored.push({ el, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.el);
}

// src/desktop/service.ts
import { execFile as execFile2 } from "child_process";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

// src/drivers/nut.ts
var loaded = null;
function loadNut() {
  loaded ??= (async () => {
    const spec = "@nut-tree-fork/nut-js";
    try {
      const nut = await import(spec);
      nut.mouse.config.autoDelayMs = 0;
      nut.keyboard.config.autoDelayMs = 0;
      return nut;
    } catch {
      loaded = null;
      throw new Error(
        "OS cursor control needs @nut-tree-fork/nut-js. Install it with: pnpm add @nut-tree-fork/nut-js"
      );
    }
  })();
  return loaded;
}
function nutButton(nut, button) {
  if (button === "right") return nut.Button.RIGHT;
  if (button === "middle") return nut.Button.MIDDLE;
  return nut.Button.LEFT;
}
async function playPath(nut, samples, toScreen = (p) => p) {
  const start = performance.now();
  for (const s of samples) {
    await sleepUntil(start + s.t);
    const p = toScreen(s);
    await nut.mouse.setPosition(new nut.Point(p.x, p.y));
  }
}
async function pressButton(nut, button, pressMs, double = false) {
  const b = nutButton(nut, button);
  for (let i = 0; i < (double ? 2 : 1); i++) {
    if (i) await sleep(40);
    await nut.mouse.pressButton(b);
    await sleep(pressMs);
    await nut.mouse.releaseButton(b);
  }
}
async function typeText(nut, text3, opts) {
  if (opts.schedule?.length) {
    for (const k of scheduleToKeystrokes(opts.schedule)) {
      await nut.keyboard.type(k.ch);
      await sleep(Math.max(0, k.delayMs));
    }
    return;
  }
  for (const ch of text3) {
    await nut.keyboard.type(ch);
    await sleep(rand(opts.perKeyMinMs, opts.perKeyMaxMs));
  }
}
async function scrollSteps(nut, dx, dy, steps) {
  const n = Math.max(1, steps);
  for (let i = 0; i < n; i++) {
    const v = dy ? Math.max(1, Math.round(Math.abs(dy / n))) : 0;
    const h = dx ? Math.max(1, Math.round(Math.abs(dx / n))) : 0;
    if (v) await (dy >= 0 ? nut.mouse.scrollDown(v) : nut.mouse.scrollUp(v));
    if (h) await (dx >= 0 ? nut.mouse.scrollRight(h) : nut.mouse.scrollLeft(h));
    await sleep(rand(12, 28));
  }
}
var KEY_ALIASES = {
  cmd: "LeftCmd",
  command: "LeftCmd",
  meta: "LeftCmd",
  super: "LeftSuper",
  win: "LeftWin",
  ctrl: "LeftControl",
  control: "LeftControl",
  alt: "LeftAlt",
  option: "LeftAlt",
  opt: "LeftAlt",
  shift: "LeftShift",
  enter: "Enter",
  return: "Return",
  esc: "Escape",
  escape: "Escape",
  tab: "Tab",
  space: "Space",
  backspace: "Backspace",
  delete: "Delete",
  del: "Delete",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  arrowup: "Up",
  arrowdown: "Down",
  arrowleft: "Left",
  arrowright: "Right",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  "-": "Minus",
  "=": "Equal",
  ",": "Comma",
  ".": "Period",
  "/": "Slash",
  ";": "Semicolon",
  "'": "Quote",
  "[": "LeftBracket",
  "]": "RightBracket",
  "\\": "Backslash",
  "`": "Grave"
};
function parseKeyCombo(combo2) {
  const parts = combo2.split("+").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) throw new Error("Empty key combo");
  return parts.map((part) => {
    const lower = part.toLowerCase();
    if (KEY_ALIASES[lower]) return KEY_ALIASES[lower];
    if (/^[a-z]$/.test(lower)) return lower.toUpperCase();
    if (/^[0-9]$/.test(lower)) return `Num${lower}`;
    if (/^f([1-9]|1[0-9]|2[0-4])$/.test(lower)) return lower.toUpperCase();
    throw new Error(`Unknown key "${part}" in "${combo2}"`);
  });
}
async function pressCombo(nut, combo2, holdMs) {
  const keys = parseKeyCombo(combo2).map((name) => nut.Key[name]);
  await nut.keyboard.pressKey(...keys);
  await sleep(holdMs);
  await nut.keyboard.releaseKey(...keys.reverse());
}

// src/desktop/ax.ts
import { execFile } from "child_process";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
var helperPath = fileURLToPath(new URL("./native/agentcursor-ax", import.meta.url));
var desktopSupported = () => process.platform === "darwin" && existsSync(helperPath);
function ax(args, timeoutMs = 2e4, stdin) {
  if (process.platform !== "darwin") {
    return Promise.reject(new Error("Desktop control currently supports macOS only."));
  }
  return new Promise((resolve, reject) => {
    const child = execFile(helperPath, args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
      if (err?.code === "ENOENT") {
        return reject(new Error(`Desktop helper missing at ${helperPath}. Run \`pnpm build\`.`));
      }
      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        return reject(new Error(err?.message ?? "Desktop helper returned no output"));
      }
      if (parsed?.error) return reject(new Error(parsed.error));
      resolve(parsed);
    });
    if (stdin !== void 0) child.stdin?.end(stdin);
  });
}
var appArgs = (app) => app === void 0 ? [] : typeof app === "number" ? ["--pid", String(app)] : ["--app", app];

// src/desktop/overlay.ts
import { spawn } from "child_process";
var CursorOverlay = class {
  constructor(opts = {}) {
    this.opts = opts;
  }
  opts;
  proc = null;
  child() {
    if (!this.proc || this.proc.exitCode !== null) {
      const args = ["overlay"];
      if (this.opts.color) args.push("--color", this.opts.color);
      if (this.opts.label) args.push("--label", this.opts.label);
      this.proc = spawn(helperPath, args, { stdio: ["pipe", "ignore", "ignore"] });
      this.proc.on("error", () => this.proc = null);
    }
    return this.proc;
  }
  at(p) {
    this.child().stdin?.write(`${Math.round(p.x)} ${Math.round(p.y)}
`);
  }
  /** Follows a move with the same timing the posted events use. */
  async play(samples) {
    const start = Date.now();
    for (const s of samples) {
      const wait = s.t - (Date.now() - start);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.at(s);
    }
  }
  close() {
    this.proc?.stdin?.end("bye\n");
    this.proc = null;
  }
};

// src/desktop/post.ts
function post(pid, plan) {
  const args = pid === void 0 ? ["post"] : ["post", "--pid", String(pid)];
  return ax(args, 12e4, JSON.stringify(plan));
}
var FLAGS = { cmd: 1 << 20, shift: 1 << 17, alt: 1 << 19, ctrl: 1 << 18, fn: 1 << 23 };
var CODES = {
  a: 0,
  s: 1,
  d: 2,
  f: 3,
  h: 4,
  g: 5,
  z: 6,
  x: 7,
  c: 8,
  v: 9,
  b: 11,
  q: 12,
  w: 13,
  e: 14,
  r: 15,
  y: 16,
  t: 17,
  o: 31,
  u: 32,
  i: 34,
  p: 35,
  l: 37,
  j: 38,
  k: 40,
  n: 45,
  m: 46,
  "1": 18,
  "2": 19,
  "3": 20,
  "4": 21,
  "5": 23,
  "6": 22,
  "7": 26,
  "8": 28,
  "9": 25,
  "0": 29,
  enter: 36,
  return: 36,
  tab: 48,
  space: 49,
  backspace: 51,
  delete: 51,
  escape: 53,
  esc: 53,
  left: 123,
  right: 124,
  down: 125,
  up: 126,
  home: 115,
  end: 119,
  pageup: 116,
  pagedown: 121
};
function combo(keys) {
  let flags = 0;
  let code;
  for (const raw of keys.toLowerCase().split("+")) {
    const part = raw.trim();
    if (part === "cmd" || part === "command" || part === "meta") flags |= FLAGS.cmd;
    else if (part === "shift") flags |= FLAGS.shift;
    else if (part === "alt" || part === "option") flags |= FLAGS.alt;
    else if (part === "ctrl" || part === "control") flags |= FLAGS.ctrl;
    else code = CODES[part];
  }
  if (code === void 0) throw new Error(`agentcursor: no key code for '${keys}'`);
  return { code, flags, delayMs: 0 };
}
function keyOps(schedule) {
  return schedule.map(
    (op) => op.t === "back" ? { code: CODES.backspace, delayMs: op.delayMs } : { ch: op.ch, delayMs: op.delayMs }
  );
}

// src/desktop/service.ts
var run = promisify(execFile2);
var DesktopService = class {
  constructor(persona, opts = {}) {
    this.persona = persona;
    this.opts = opts;
  }
  persona;
  opts;
  view = null;
  currentPid;
  /** This service's own cursor, used in background mode instead of the system pointer. */
  pos = { x: 0, y: 0 };
  overlay = null;
  // Refs stick to the same control across reads of the same app, so an agent's
  // earlier ref stays valid and reads can be diffed. The value is left out of
  // the key so typing into a field does not rename it.
  refKeys = /* @__PURE__ */ new Map();
  refCounter = 0;
  get background() {
    return this.opts.background ?? false;
  }
  get pointer() {
    const want = this.opts.showCursor;
    if (!want || !this.background) return null;
    this.overlay ??= new CursorOverlay(typeof want === "object" ? want : {});
    return this.overlay;
  }
  /** Stops drawing this session's cursor. */
  close() {
    this.overlay?.close();
    this.overlay = null;
  }
  /** Where this service's cursor is (background mode); the system pointer otherwise. */
  cursor() {
    if (this.background) return Promise.resolve(this.pos);
    return loadNut().then(async (nut) => {
      const p = await nut.mouse.getPosition();
      return { x: p.x, y: p.y };
    });
  }
  permissions() {
    return ax(["permissions"]);
  }
  requestPermission(kind) {
    return ax([kind === "screen" ? "request-screen" : "request-accessibility"]);
  }
  apps() {
    return ax(["apps"]);
  }
  /** App/janela em que o agente está trabalhando (para o live view). */
  focusInfo() {
    return {
      pid: this.currentPid,
      name: this.view?.app.name,
      title: this.view?.window.title
    };
  }
  async open(app) {
    if (this.background) return this.openInBackground(app);
    const before = (await this.apps()).find((a) => a.active)?.pid;
    await run("open", ["-a", app]).catch((e) => {
      throw new Error(e.stderr?.trim() || `Could not open "${app}"`);
    });
    const want = app.toLowerCase();
    for (let i = 0; i < 40; i++) {
      const front = (await this.apps()).find((a) => a.active);
      const name = front?.name.toLowerCase() ?? "";
      if (front && (name === want || name.includes(want) || want.includes(name) || front.pid !== before)) {
        this.currentPid = front.pid;
        this.view = null;
        return front;
      }
      await sleep(250);
    }
    throw new Error(`Opened "${app}" but it did not come to the front.`);
  }
  /** Launch or attach without bringing the app to the front (`open -g`). */
  async openInBackground(app) {
    const running = (a) => {
      const name = a.name.toLowerCase();
      const want = app.toLowerCase();
      return name === want || name.includes(want) || want.includes(name);
    };
    let found = (await this.apps()).find(running);
    if (!found) {
      await run("open", ["-g", "-a", app]).catch((e) => {
        throw new Error(e.stderr?.trim() || `Could not open "${app}"`);
      });
      for (let i = 0; i < 40 && !found; i++) {
        await sleep(250);
        found = (await this.apps()).find(running);
      }
    }
    if (!found) throw new Error(`Opened "${app}" but it did not start.`);
    this.currentPid = found.pid;
    this.view = null;
    return found;
  }
  async read(opts = {}) {
    const snap = await ax([
      "snapshot",
      ...appArgs(opts.app ?? this.currentPid),
      "--max",
      String(opts.max ?? 150)
    ]);
    if (snap.pid !== this.currentPid) {
      this.refKeys.clear();
      this.refCounter = 0;
    }
    this.currentPid = snap.pid;
    this.view = {
      app: { name: snap.name, pid: snap.pid, bundleId: snap.bundleId },
      window: snap.window,
      truncated: snap.truncated,
      elements: snap.elements.map((e) => ({
        ref: this.refFor(e),
        role: e.role,
        name: e.name,
        value: e.value,
        rect: { x: e.x, y: e.y, width: e.w, height: e.h },
        enabled: e.enabled,
        focused: e.focused
      }))
    };
    return this.view;
  }
  async find(text3, opts = {}) {
    const view = await this.read({ app: opts.app, max: 400 });
    return rankByText(view.elements, text3).slice(0, opts.maxResults ?? 8);
  }
  async click(t) {
    const target2 = await this.resolve(t);
    await this.front(target2.pid);
    await this.moveHuman(target2.point, target2.width);
    const traits = this.persona.traits();
    const dwellMs = sampleDwellMs(this.persona.rng, traits.dwellScale);
    const pressMs = samplePressMs(this.persona.rng, traits.pressScale);
    if (this.background) {
      await post(target2.pid ?? this.currentPid, {
        click: { x: target2.point.x, y: target2.point.y, button: t.button, double: t.double, dwellMs, pressMs }
      });
    } else {
      await sleep(dwellMs);
      await pressButton(await loadNut(), t.button ?? "left", pressMs, t.double);
    }
    return describe(target2);
  }
  async move(t) {
    const target2 = await this.resolve(t);
    await this.front(target2.pid);
    await this.moveHuman(target2.point, target2.width);
    return describe(target2);
  }
  async type(opts) {
    if (opts.ref || opts.text || typeof opts.x === "number") await this.click(opts);
    else await this.front(this.currentPid);
    this.persona.tick();
    const schedule = this.persona.keySchedule(opts.value);
    if (this.background) {
      const keys = [
        ...opts.clear ? [{ ...combo("cmd+a"), delayMs: 60 }, { ...combo("backspace"), delayMs: 40 }] : [],
        ...keyOps(schedule) ?? [],
        ...opts.submit ? [{ ...combo("enter"), delayMs: samplePressMs(this.persona.rng) }] : []
      ];
      await post(this.currentPid, { keys });
      return;
    }
    const nut = await loadNut();
    if (opts.clear) {
      await pressCombo(nut, process.platform === "darwin" ? "cmd+a" : "ctrl+a", 60);
      await pressCombo(nut, "backspace", 40);
    }
    const base2 = 12e3 / this.persona.traits().wpm;
    await typeText(nut, opts.value, { schedule, perKeyMinMs: base2 * 0.6, perKeyMaxMs: base2 * 1.8 });
    if (opts.submit) await pressCombo(nut, "enter", samplePressMs(this.persona.rng));
  }
  async key(combo2) {
    await this.front(this.currentPid);
    this.persona.tick();
    await sleep(this.persona.thinkTimeMs(0));
    const pressMs = samplePressMs(this.persona.rng, this.persona.traits().pressScale);
    if (this.background) {
      await post(this.currentPid, { keys: [{ ...combo(combo2), delayMs: 0 }] });
      return;
    }
    await pressCombo(await loadNut(), combo2, pressMs);
  }
  async scroll(opts) {
    if (opts.ref || opts.text || typeof opts.x === "number") {
      const target2 = await this.resolve(opts);
      await this.front(target2.pid);
      await this.moveHuman(target2.point, target2.width);
    } else {
      await this.front(this.currentPid);
    }
    this.persona.tick();
    const steps = Math.max(3, Math.round(Math.abs(opts.dy || opts.dx || 0) / this.persona.rng.range(80, 140)));
    if (this.background) await post(this.currentPid, { scroll: { dx: opts.dx ?? 0, dy: opts.dy, steps } });
    else await scrollSteps(await loadNut(), opts.dx ?? 0, opts.dy, steps);
    this.view = null;
  }
  async screenshot(opts = {}) {
    let rect;
    let label;
    if (opts.ref) {
      const el = this.element(opts.ref);
      const pad = 40;
      rect = { x: el.rect.x - pad, y: el.rect.y - pad, width: el.rect.width + pad * 2, height: el.rect.height + pad * 2 };
      label = `around [${el.ref}]`;
    } else {
      const info = await ax(["window", ...appArgs(opts.app ?? this.currentPid)]);
      rect = { x: info.window.x, y: info.window.y, width: info.window.w, height: info.window.h };
      label = `${info.name} window`;
    }
    const dir = await mkdtemp(join(tmpdir(), "agentcursor-shot-"));
    const file = join(dir, "shot.jpg");
    try {
      await run("screencapture", ["-x", "-t", "jpg", `-R${rect.x},${rect.y},${rect.width},${rect.height}`, file]);
      const maxWidth = opts.maxWidth ?? 1024;
      if ((await imageSize(file)).width > maxWidth) {
        await run("sips", ["--resampleWidth", String(maxWidth), file]);
      }
      const size = await imageSize(file);
      const scale = rect.width / size.width;
      return {
        data: (await readFile(file)).toString("base64"),
        mimeType: "image/jpeg",
        note: `${label}: image ${size.width}x${size.height} covers screen ${rect.x},${rect.y} ${rect.width}x${rect.height}. Screen x = ${rect.x} + px*${scale.toFixed(3)}, y = ${rect.y} + py*${scale.toFixed(3)}.`
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  async wiggle() {
    const nut = await loadNut();
    const start = await nut.mouse.getPosition();
    let from = { x: start.x, y: start.y };
    for (const to of [
      { x: start.x + 160, y: start.y - 70 },
      { x: start.x + 70, y: start.y + 100 },
      { x: start.x, y: start.y }
    ]) {
      await playPath(nut, generateMove(from, to, this.persona.moveOptions(24)));
      await sleep(150);
      from = to;
    }
  }
  refFor(e) {
    const key2 = `${e.role}|${e.name}|${Math.round(e.x / 8)},${Math.round(e.y / 8)}`;
    let ref = this.refKeys.get(key2);
    if (!ref) {
      ref = `d${++this.refCounter}`;
      this.refKeys.set(key2, ref);
    }
    return ref;
  }
  element(ref) {
    const el = this.view?.elements.find((e) => e.ref === ref);
    if (!el) throw new Error(`Unknown ref '${ref}'. Refs expire after scrolling or switching apps; call desktop_read again.`);
    return el;
  }
  async resolve(t) {
    if (typeof t.x === "number" && typeof t.y === "number") {
      return { point: { x: t.x, y: t.y }, width: 24, pid: this.currentPid };
    }
    let el;
    if (t.ref) {
      el = this.element(t.ref);
    } else if (t.text) {
      el = (await this.find(t.text, { app: t.app, maxResults: 1 }))[0];
      if (!el) {
        throw new Error(`Nothing labelled "${t.text}" in ${this.view?.app.name ?? "the app"}. Try desktop_read or desktop_screenshot.`);
      }
    } else {
      throw new Error("Provide a ref, text, or x and y.");
    }
    const precision = this.persona.traits().precision;
    return {
      point: offCenterPoint(el.rect, this.persona.rng, precision),
      width: Math.max(Math.min(el.rect.width, el.rect.height), 8),
      pid: this.view?.app.pid,
      el
    };
  }
  async moveHuman(to, width) {
    const from = await this.cursor();
    this.persona.tick();
    await sleep(this.persona.thinkTimeMs(distance(from, to)));
    const samples = generateMove(from, to, this.persona.moveOptions(width));
    if (this.background) {
      const drawn = this.pointer?.play(samples);
      await post(this.currentPid, { moves: samples });
      await drawn;
      this.pos = to;
      return;
    }
    await playPath(await loadNut(), samples);
  }
  async front(pid) {
    if (pid && !this.background) await ax(["activate", "--pid", String(pid)]).catch(() => void 0);
  }
};
function describe(target2) {
  const at = `(${Math.round(target2.point.x)}, ${Math.round(target2.point.y)})`;
  return target2.el ? `[${target2.el.ref}] ${target2.el.role} "${target2.el.name}" at ${at}` : at;
}
async function imageSize(file) {
  const { stdout } = await run("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file]);
  return {
    width: Number(/pixelWidth: (\d+)/.exec(stdout)?.[1] ?? 0),
    height: Number(/pixelHeight: (\d+)/.exec(stdout)?.[1] ?? 0)
  };
}
function formatView(view, only) {
  const w = view.window;
  const lines = [`${view.app.name} window "${w.title}" @${w.x},${w.y} ${w.w}x${w.h} (element @x,y = center)`];
  for (const e of only ?? view.elements) lines.push(formatElement(e));
  if (!only && view.truncated) lines.push("(more elements hidden; pass a larger max)");
  return lines.join("\n");
}
function formatElement(e) {
  const name = e.name ? ` "${e.name}"` : "";
  const value = e.value ? ` value="${e.value.length > 60 ? `${e.value.slice(0, 60)}\u2026` : e.value}"` : "";
  const flags = `${e.enabled === false ? " disabled" : ""}${e.focused ? " focused" : ""}`;
  const cx = Math.round(e.rect.x + e.rect.width / 2);
  const cy = Math.round(e.rect.y + e.rect.height / 2);
  return `[${e.ref}] ${e.role}${name}${value} @${cx},${cy}${flags}`;
}

// src/desktop/win.ts
import { execFile as execFile3 } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir as tmpdir2 } from "os";
import { join as join2 } from "path";
import { promisify as promisify2 } from "util";
var run2 = promisify2(execFile3);
var PS = "powershell.exe";
async function ps(script, timeoutMs = 2e4) {
  const { stdout } = await run2(
    PS,
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script
    ],
    { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true }
  );
  return stdout;
}
async function psFile(script, timeoutMs = 3e4) {
  const dir = mkdtempSync(join2(tmpdir2(), "ac-ps-"));
  const file = join2(dir, "run.ps1");
  writeFileSync(file, script, "utf8");
  try {
    const { stdout } = await run2(
      PS,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file],
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true }
    );
    return stdout;
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
    }
  }
}
var desktopSupportedWin = () => process.platform === "win32";
async function winPermissions() {
  try {
    await ps(
      "Add-Type -AssemblyName UIAutomationClient; [System.Windows.Automation.AutomationElement]::RootElement",
      15e3
    );
    return { supported: true, uiAutomation: true };
  } catch {
    return { supported: desktopSupportedWin(), uiAutomation: false };
  }
}
async function winApps() {
  const out = await ps(`
    Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne '' } |
      Sort-Object MainWindowTitle |
      ForEach-Object {
        $p = $_
        [PSCustomObject]@{
          name = $p.ProcessName
          title = $p.MainWindowTitle
          pid = $p.Id
          path = try { $p.Path } catch { '' }
        }
      } | ConvertTo-Json -Compress
  `);
  const trimmed = out.trim();
  if (!trimmed) return [];
  const j = JSON.parse(trimmed);
  return Array.isArray(j) ? j : [j];
}
async function winOpen(app) {
  const before = new Set((await winApps()).map((a) => a.pid));
  const safe = app.replace(/["']/g, "");
  try {
    await ps(`Start-Process -FilePath "${safe}" -ErrorAction Stop`, 15e3);
  } catch {
    const candidates = [
      safe,
      `${safe}.exe`,
      `C:\\Windows\\System32\\${safe}.exe`,
      `C:\\Windows\\System32\\${safe}`
    ];
    let opened = false;
    for (const c of candidates) {
      try {
        await ps(`Start-Process -FilePath "${c}" -ErrorAction Stop`, 1e4);
        opened = true;
        break;
      } catch {
      }
    }
    if (!opened) throw new Error(`Could not open "${app}". Try a full path or known app name.`);
  }
  const want = safe.toLowerCase().replace(/\.exe$/, "").replace(/^.*[\\/]/, "");
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const apps2 = await winApps();
    const found = apps2.find(
      (a) => !before.has(a.pid) && (a.name.toLowerCase() === want || a.name.toLowerCase().includes(want) || want.includes(a.name.toLowerCase()))
    );
    if (found) return found;
  }
  const apps = await winApps();
  const fresh = apps.find((a) => !before.has(a.pid));
  if (fresh) return fresh;
  throw new Error(`Opened "${app}" but no window appeared.`);
}
async function winSnapshot(pid, max = 150) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName UIAutomationClient",
    "Add-Type -AssemblyName UIAutomationTypes",
    `$root = [System.Windows.Automation.AutomationElement]::RootElement`,
    `$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, ${pid})`,
    `$win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)`,
    `if (-not $win) { Write-Output '{"error":"window not found"}'; exit 1 }`,
    `$rect = $win.Current.BoundingRectangle`,
    `$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker`,
    `$list = New-Object System.Collections.ArrayList`,
    `$stack = New-Object System.Collections.Stack`,
    `$stack.Push(@($win, 0))`,
    `while ($stack.Count -gt 0 -and $list.Count -lt ${max}) {`,
    `  $pair = $stack.Pop()`,
    `  $node = $pair[0]`,
    `  $depth = $pair[1]`,
    `  $child = $walker.GetFirstChild($node)`,
    `  while ($child -and $list.Count -lt ${max}) {`,
    `    $c = $child.Current`,
    `    $r = $c.BoundingRectangle`,
    `    if ($r.Width -gt 0 -and $r.Height -gt 0) {`,
    `      $role = ($c.ControlType.ProgrammaticName -replace 'ControlType\\.','')`,
    `      $val = ''`,
    `      try { $val = $c.ValuePattern.Current.Value } catch { }`,
    `      [void]$list.Add([PSCustomObject]@{`,
    `        role = $role`,
    `        name = $c.Name`,
    `        value = $val`,
    `        automationId = $c.AutomationId`,
    `        x = [int]$r.X`,
    `        y = [int]$r.Y`,
    `        w = [int]$r.Width`,
    `        h = [int]$r.Height`,
    `        enabled = $c.IsEnabled`,
    `        focused = $c.HasKeyboardFocus`,
    `      })`,
    `    }`,
    `    if ($depth -lt 8) { $stack.Push(@($child, $depth + 1)) }`,
    `    $child = $walker.GetNextSibling($child)`,
    `  }`,
    `}`,
    `$result = [PSCustomObject]@{`,
    `  name = $win.Current.Name`,
    `  pid = ${pid}`,
    `  title = $win.Current.Name`,
    `  x = [int]$rect.X`,
    `  y = [int]$rect.Y`,
    `  w = [int]$rect.Width`,
    `  h = [int]$rect.Height`,
    `  elements = $list`,
    `  truncated = ($list.Count -ge ${max})`,
    `}`,
    `$result | ConvertTo-Json -Compress -Depth 6`
  ].join("\n");
  const out2 = await psFile(script, 3e4);
  const trimmed = out2.trim();
  if (!trimmed) throw new Error("UI Automation returned empty output");
  const j = JSON.parse(trimmed);
  if (j.error) throw new Error(j.error);
  if (!Array.isArray(j.elements)) j.elements = [];
  return j;
}
async function winActivate(pid) {
  await ps(`
    $p = Get-Process -Id ${pid} -ErrorAction Stop
    if ($p.MainWindowHandle -eq 0) { exit 0 }
    $sig = @'
using System;
using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
'@
    Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue
    [Win32]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
    [Win32]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
  `, 1e4);
}
async function winClick(x, y, button = "left", double = false) {
  const btnDown = button === "right" ? "RIGHTDOWN" : button === "middle" ? "MIDDLEDOWN" : "LEFTDOWN";
  const btnUp = button === "right" ? "RIGHTUP" : button === "middle" ? "MIDDLEUP" : "LEFTUP";
  const clicks = double ? 2 : 1;
  await ps(`
    $sig = @'
using System;
using System.Runtime.InteropServices;
public class Mouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, UIntPtr dwExtraInfo);
  public const uint LEFTDOWN=0x0002; public const uint LEFTUP=0x0004;
  public const uint RIGHTDOWN=0x0008; public const uint RIGHTUP=0x0010;
  public const uint MIDDLEDOWN=0x0020; public const uint MIDDLEUP=0x0040;
}
'@
    Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue
    [Mouse]::SetCursorPos(${x}, ${y}) | Out-Null
    Start-Sleep -Milliseconds 40
    for ($i=0; $i -lt ${clicks}; $i++) {
      [Mouse]::mouse_event([Mouse]::${btnDown}, 0, 0, 0, [UIntPtr]::Zero)
      Start-Sleep -Milliseconds 50
      [Mouse]::mouse_event([Mouse]::${btnUp}, 0, 0, 0, [UIntPtr]::Zero)
      if ($i -lt ${clicks} - 1) { Start-Sleep -Milliseconds 80 }
    }
  `, 1e4);
}
async function winMovePath(samples) {
  if (!samples.length) return;
  const points = samples.map((s) => `[PSCustomObject]@{x=${Math.round(s.x)};y=${Math.round(s.y)};t=${Math.round(s.t)}}`);
  const arr = points.join(",");
  await ps(`
    $sig = @'
using System;
using System.Runtime.InteropServices;
public class Cursor {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
}
'@
    Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue
    $pts = @(${arr})
    $t0 = [Diagnostics.Stopwatch]::StartNew()
    foreach ($p in $pts) {
      while ($t0.ElapsedMilliseconds -lt $p.t) { Start-Sleep -Milliseconds 1 }
      [Cursor]::SetCursorPos($p.x, $p.y) | Out-Null
    }
  `, Math.max(1e4, (samples[samples.length - 1]?.t ?? 0) + 5e3));
}
async function winType(text3) {
  const escaped = text3.replace(/`/g, "``").replace(/\$/g, "`$").replace(/"/g, '`"');
  if (text3.length > 80) {
    await ps(`
      Set-Clipboard -Value "${escaped}"
      Start-Sleep -Milliseconds 30
      $sig = @'
using System;
using System.Runtime.InteropServices;
public class Key {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  public const byte VK_CONTROL=0x11; public const byte VK_V=0x56;
}
'@
      Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue
      [Key]::keybd_event([Key]::VK_CONTROL,0,0,[UIntPtr]::Zero)
      [Key]::keybd_event([Key]::VK_V,0,0,[UIntPtr]::Zero)
      [Key]::keybd_event([Key]::VK_V,0,2,[UIntPtr]::Zero)
      [Key]::keybd_event([Key]::VK_CONTROL,0,2,[UIntPtr]::Zero)
      Start-Sleep -Milliseconds 40
    `, 1e4);
    return;
  }
  const chars = [...text3];
  const ops = [];
  for (const ch of chars) {
    const code = ch.charCodeAt(0);
    ops.push(`[Cursor2]::SendChar(${code}); Start-Sleep -Milliseconds ${30 + Math.floor(Math.random() * 50)}`);
  }
  await ps(`
    $sig = @'
using System;
using System.Runtime.InteropServices;
public class Cursor2 {
  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  public static extern void SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT { public uint type; public INPUTUNION U; }
  [StructLayout(LayoutKind.Explicit)]
  public struct INPUTUNION { [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  public static void SendChar(int c) {
    INPUT inp = new INPUT();
    inp.type = 1;
    inp.U.ki = new KEYBDINPUT();
    inp.U.ki.wVk = 0;
    inp.U.ki.wScan = (ushort)c;
    inp.U.ki.dwFlags = 0x0004;
    SendInput(1, new INPUT[]{inp}, Marshal.SizeOf(typeof(INPUT)));
    inp.U.ki.dwFlags = 0x0004 | 0x0002;
    SendInput(1, new INPUT[]{inp}, Marshal.SizeOf(typeof(INPUT)));
  }
}
'@
    Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue
    ${ops.join("; ")}
  `, Math.max(15e3, chars.length * 80 + 5e3));
}
async function winKey(keys) {
  const parts = keys.toLowerCase().split("+").map((s) => s.trim());
  const VK = {
    enter: 13,
    return: 13,
    esc: 27,
    escape: 27,
    tab: 9,
    space: 32,
    backspace: 8,
    delete: 46,
    up: 38,
    down: 40,
    left: 37,
    right: 39,
    home: 36,
    end: 35,
    pageup: 33,
    pagedown: 34,
    ctrl: 17,
    control: 17,
    shift: 16,
    alt: 18,
    win: 91,
    f1: 112,
    f2: 113,
    f3: 114,
    f4: 115,
    f5: 116,
    f6: 117,
    f7: 118,
    f8: 119,
    f9: 120,
    f10: 121,
    f11: 122,
    f12: 123,
    s: 83,
    a: 65,
    c: 67,
    v: 86,
    x: 88,
    z: 90,
    y: 89,
    p: 80,
    r: 82,
    n: 78,
    o: 79,
    w: 87,
    q: 81,
    t: 84,
    u: 85,
    i: 73,
    l: 76,
    k: 75,
    j: 74,
    h: 72,
    g: 71,
    f: 70,
    d: 68,
    "1": 49,
    "2": 50,
    "3": 51,
    "4": 52,
    "5": 53,
    "6": 54,
    "7": 55,
    "8": 56,
    "9": 57,
    "0": 48
  };
  const mods = parts.slice(0, -1).map((p) => VK[p]).filter((n) => n !== void 0);
  const main = parts[parts.length - 1];
  const mainVk = VK[main];
  if (mainVk === void 0) throw new Error(`Unknown key '${main}'`);
  const modList = mods.join(",");
  await ps(`
    $sig = @'
using System;
using System.Runtime.InteropServices;
public class KeySend {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  public const uint KEYEVENTF_KEYUP=0x0002;
}
'@
    Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue
    $mods = @(${modList})
    foreach ($m in $mods) { [KeySend]::keybd_event([byte]$m,0,0,[UIntPtr]::Zero) }
    Start-Sleep -Milliseconds 20
    [KeySend]::keybd_event(${mainVk},0,0,[UIntPtr]::Zero)
    Start-Sleep -Milliseconds 40
    [KeySend]::keybd_event(${mainVk},0,2,[UIntPtr]::Zero)
    foreach ($m in $mods) { [KeySend]::keybd_event([byte]$m,0,2,[UIntPtr]::Zero) }
  `, 1e4);
}
async function winScreenCapture(maxWidth = 960) {
  const dir = mkdtempSync(join2(tmpdir2(), "ac-full-"));
  const file = join2(dir, "full.jpg");
  const fileArg = file.replace(/'/g, "''");
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 70L)
if ($bmp.Width -gt ${maxWidth}) {
  $ratio = ${maxWidth} / $bmp.Width
  $nh = [int]($bmp.Height * $ratio)
  $small = New-Object System.Drawing.Bitmap($bmp, ${maxWidth}, $nh)
  $g.Dispose(); $bmp.Dispose()
  $small.Save('${fileArg}', $enc, $ep)
  $small.Dispose()
} else {
  $bmp.Save('${fileArg}', $enc, $ep)
  $g.Dispose(); $bmp.Dispose()
}
`;
  try {
    await psFile(script, 2e4);
    const raw = readFileSync(file);
    if (raw.length < 100) throw new Error(`winScreenCapture: short file (${raw.length})`);
    return {
      data: raw.toString("base64"),
      mimeType: "image/jpeg",
      note: `full screen (desktop fallback), max ${maxWidth}px wide`
    };
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
    }
  }
}
async function winScreenshot(pid, maxWidth = 1024) {
  const snap = await winSnapshot(pid, 5).catch(() => null);
  const rect = snap ? { x: snap.x, y: snap.y, width: snap.w, height: snap.h } : { x: 0, y: 0, width: 1, height: 1 };
  const dir = mkdtempSync(join2(tmpdir2(), "ac-shot-"));
  const file = join2(dir, "shot.jpg");
  const fileArg = file.replace(/'/g, "''");
  await psFile(
    `
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $b = New-Object System.Drawing.Rectangle(${rect.x}, ${rect.y}, ${Math.max(1, rect.width)}, ${Math.max(1, rect.height)})
    $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
    $enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 75L)
    $bmp.Save('${fileArg}', $enc, $ep)
    $g.Dispose(); $bmp.Dispose()
    $img = [System.Drawing.Image]::FromFile('${fileArg}')
    if ($img.Width -gt ${maxWidth}) {
      $ratio = ${maxWidth} / $img.Width
      $nh = [int]($img.Height * $ratio)
      $small = New-Object System.Drawing.Bitmap($img, ${maxWidth}, $nh)
      $img.Dispose()
      $small.Save('${fileArg}', $enc, $ep)
      $small.Dispose()
    } else { $img.Dispose() }
  `,
    2e4
  );
  try {
    const raw = readFileSync(file);
    const note = `window @${rect.x},${rect.y} ${rect.width}x${rect.height} (screen coords). Image may be downscaled to max ${maxWidth}px wide.`;
    return { data: raw.toString("base64"), mimeType: "image/jpeg", note };
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
    }
  }
}

// src/desktop/service-win.ts
var DesktopServiceWindows = class {
  constructor(persona) {
    this.persona = persona;
  }
  persona;
  view = null;
  currentPid;
  refKeys = /* @__PURE__ */ new Map();
  refCounter = 0;
  get background() {
    return false;
  }
  close() {
  }
  async cursor() {
    if (this.view) {
      const w = this.view.window;
      return { x: w.x + w.w / 2, y: w.y + w.h / 2 };
    }
    return { x: 0, y: 0 };
  }
  async permissions() {
    const p = await winPermissions();
    return { accessibility: p.uiAutomation, screenRecording: p.uiAutomation };
  }
  async requestPermission() {
    return this.permissions();
  }
  async apps() {
    const list = await winApps();
    return list.map((a, i) => ({
      name: a.title || a.name,
      pid: a.pid,
      bundleId: a.path ?? a.name,
      active: i === 0
    }));
  }
  async open(app) {
    const p = await winOpen(app);
    this.currentPid = p.pid;
    this.view = null;
    this.refKeys.clear();
    this.refCounter = 0;
    await winActivate(p.pid).catch(() => void 0);
    return { name: p.title || p.name, pid: p.pid, bundleId: p.path ?? p.name, active: true };
  }
  /** App/janela em que o agente está trabalhando (para o live view). */
  focusInfo() {
    return {
      pid: this.currentPid,
      name: this.view?.app.name,
      title: this.view?.window.title
    };
  }
  async read(opts = {}) {
    const pid = this.resolvePid(opts.app);
    if (pid === void 0) {
      throw new Error("No app open. Call desktop_open first, or pass app/pid.");
    }
    const snap = await winSnapshot(pid, opts.max ?? 150);
    if (snap.pid !== this.currentPid) {
      this.refKeys.clear();
      this.refCounter = 0;
    }
    this.currentPid = snap.pid;
    this.view = {
      app: { name: snap.name, pid: snap.pid },
      window: { title: snap.title, x: snap.x, y: snap.y, w: snap.w, h: snap.h },
      truncated: snap.truncated,
      elements: snap.elements.map((e) => ({
        ref: this.refFor(e),
        role: e.role,
        name: e.name,
        value: e.value,
        rect: { x: e.x, y: e.y, width: e.w, height: e.h },
        enabled: e.enabled,
        focused: e.focused
      }))
    };
    return this.view;
  }
  async find(text3, opts = {}) {
    const view = await this.read({ app: opts.app, max: 400 });
    return rankByText(view.elements, text3).slice(0, opts.maxResults ?? 8);
  }
  async click(t) {
    const target2 = await this.resolve(t);
    await this.front(target2.pid);
    await this.moveHuman(target2.point, target2.width);
    const traits = this.persona.traits();
    await sleep(sampleDwellMs(this.persona.rng, traits.dwellScale));
    await winClick(
      Math.round(target2.point.x),
      Math.round(target2.point.y),
      t.button ?? "left",
      t.double ?? false
    );
    await sleep(samplePressMs(this.persona.rng, traits.pressScale));
    return describe2(target2);
  }
  async move(t) {
    const target2 = await this.resolve(t);
    await this.front(target2.pid);
    await this.moveHuman(target2.point, target2.width);
    return describe2(target2);
  }
  async type(opts) {
    if (opts.ref || opts.text || typeof opts.x === "number") await this.click(opts);
    else await this.front(this.currentPid);
    this.persona.tick();
    if (opts.clear) {
      await winKey("ctrl+a");
      await sleep(40);
      await winKey("delete");
      await sleep(40);
    }
    await winType(opts.value);
    if (opts.submit) {
      await sleep(samplePressMs(this.persona.rng, this.persona.traits().pressScale));
      await winKey("enter");
    }
  }
  async key(combo2) {
    await this.front(this.currentPid);
    this.persona.tick();
    await sleep(this.persona.thinkTimeMs(0));
    await winKey(combo2);
  }
  async scroll(opts) {
    if (opts.ref || opts.text || typeof opts.x === "number") {
      const target2 = await this.resolve(opts);
      await this.front(target2.pid);
      await this.moveHuman(target2.point, target2.width);
    } else {
      await this.front(this.currentPid);
    }
    this.persona.tick();
    const steps = Math.max(1, Math.round(Math.abs(opts.dy || 0) / 120));
    for (let i = 0; i < steps; i++) {
      await winKey(opts.dy >= 0 ? "pagedown" : "pageup");
      await sleep(40);
    }
    this.view = null;
  }
  async screenshot(opts = {}) {
    const pid = this.resolvePid(opts.app) ?? this.currentPid;
    if (pid === void 0) throw new Error("No app to screenshot. Call desktop_open first.");
    return winScreenshot(pid, opts.maxWidth ?? 1024);
  }
  async wiggle() {
  }
  resolvePid(app) {
    if (typeof app === "number") return app;
    if (typeof app === "string" && /^\d+$/.test(app)) return Number(app);
    return this.currentPid;
  }
  refFor(e) {
    const key2 = `${e.role}|${e.name}|${Math.round(e.x / 8)},${Math.round(e.y / 8)}`;
    let ref = this.refKeys.get(key2);
    if (!ref) {
      ref = `d${++this.refCounter}`;
      this.refKeys.set(key2, ref);
    }
    return ref;
  }
  element(ref) {
    const el = this.view?.elements.find((e) => e.ref === ref);
    if (!el) {
      throw new Error(
        `Unknown ref '${ref}'. Refs expire after scrolling or switching apps; call desktop_read again.`
      );
    }
    return el;
  }
  async resolve(t) {
    if (typeof t.x === "number" && typeof t.y === "number") {
      return { point: { x: t.x, y: t.y }, width: 24, pid: this.currentPid };
    }
    let el;
    if (t.ref) {
      el = this.element(t.ref);
    } else if (t.text) {
      el = (await this.find(t.text, { app: t.app, maxResults: 1 }))[0];
      if (!el) {
        throw new Error(
          `Nothing labelled "${t.text}" in ${this.view?.app.name ?? "the app"}. Try desktop_read or desktop_screenshot.`
        );
      }
    } else {
      throw new Error("Provide a ref, text, or x and y.");
    }
    const precision = this.persona.traits().precision;
    return {
      point: offCenterPoint(el.rect, this.persona.rng, precision),
      width: Math.max(Math.min(el.rect.width, el.rect.height), 8),
      pid: this.view?.app.pid,
      el
    };
  }
  async moveHuman(to, width) {
    const from = await this.cursor();
    this.persona.tick();
    await sleep(this.persona.thinkTimeMs(distance(from, to)));
    const samples = generateMove(from, to, this.persona.moveOptions(width));
    await winMovePath(samples);
  }
  async front(pid) {
    if (pid) await winActivate(pid).catch(() => void 0);
  }
};
function describe2(target2) {
  const at = `(${Math.round(target2.point.x)}, ${Math.round(target2.point.y)})`;
  return target2.el ? `[${target2.el.ref}] ${target2.el.role} "${target2.el.name}" at ${at}` : at;
}

// src/drivers/extension-driver.ts
var ACTION_TIMEOUT_MS = 6e4;
var ExtensionDriver = class {
  constructor(transport) {
    this.transport = transport;
  }
  transport;
  async snapshot(maxElements, includeText) {
    return await this.transport.send({
      kind: "snapshot",
      maxElements,
      includeText
    });
  }
  async cursorState() {
    return await this.transport.send({ kind: "cursorState" });
  }
  async move(samples, mode2) {
    await this.transport.send(
      { kind: "replayMove", samples, mode: mode2 },
      ACTION_TIMEOUT_MS
    );
  }
  async click(args) {
    await this.transport.send(
      { kind: "replayClick", ...args },
      ACTION_TIMEOUT_MS
    );
  }
  async type(args) {
    await this.transport.send({ kind: "type", ...args }, ACTION_TIMEOUT_MS);
  }
  async scroll(args) {
    await this.transport.send({ kind: "scroll", ...args }, ACTION_TIMEOUT_MS);
  }
  async navigate(url) {
    await this.transport.send({ kind: "navigate", url });
  }
  async getUrl() {
    return await this.transport.send({ kind: "getUrl" });
  }
  async waitFor(args) {
    return await this.transport.send(
      { kind: "waitFor", ...args },
      args.timeoutMs + 5e3
    );
  }
  async screenshot(format = "png") {
    return await this.transport.send({ kind: "screenshot", format });
  }
  async hover(opts) {
    const mode2 = opts.stealth ? "debugger" : "content";
    await this.transport.send(
      { kind: "hover", ref: opts.ref, x: opts.x, y: opts.y, mode: mode2 },
      3e4
    );
  }
  async ensureVisible(ref, point) {
    return await this.transport.send({
      kind: "ensureVisible",
      ref,
      point
    });
  }
  async drag(args) {
    await this.transport.send({ kind: "drag", ...args }, 6e4);
  }
  async pressKey(key2, mode2) {
    await this.transport.send({ kind: "pressKey", key: key2, mode: mode2 }, 1e4);
  }
  async resolveLocator(spec, opts) {
    return await this.transport.send(
      { kind: "resolveLocator", spec, timeoutMs: opts.timeoutMs, scrollIntoView: opts.scrollIntoView },
      opts.timeoutMs + 5e3
    );
  }
  async evaluate(expression) {
    return this.transport.send({ kind: "evaluate", expression }, ACTION_TIMEOUT_MS);
  }
  async consoleBuffer(clear) {
    return await this.transport.send({ kind: "consoleBuffer", clear }, 1e4);
  }
};

// src/drivers/coord-map.ts
function chromeOffsets(g) {
  return {
    left: Math.max(0, (g.outerWidth - g.innerWidth) / 2),
    top: g.outerHeight - g.innerHeight
  };
}
function viewportToScreen(p, g) {
  const { left, top } = chromeOffsets(g);
  return { x: g.screenX + left + p.x, y: g.screenY + top + p.y };
}
function screenToViewport(p, g) {
  const { left, top } = chromeOffsets(g);
  return { x: p.x - g.screenX - left, y: p.y - g.screenY - top };
}

// src/drivers/os-cursor-driver.ts
var OsCursorDriver = class {
  constructor(transport) {
    this.transport = transport;
  }
  transport;
  geom = null;
  async snapshot(maxElements, includeText) {
    return await this.transport.send({
      kind: "snapshot",
      maxElements,
      includeText
    });
  }
  async getUrl() {
    return await this.transport.send({ kind: "getUrl" });
  }
  async navigate(url) {
    this.geom = null;
    await this.transport.send({ kind: "navigate", url });
  }
  async waitFor(args) {
    return await this.transport.send(
      { kind: "waitFor", ...args },
      args.timeoutMs + 5e3
    );
  }
  async screenshot(format = "png") {
    return await this.transport.send({ kind: "screenshot", format });
  }
  async hover(opts) {
    await this.transport.send(
      { kind: "hover", ref: opts.ref, x: opts.x, y: opts.y, mode: "content" },
      3e4
    );
  }
  async ensureVisible(ref, point) {
    return await this.transport.send({
      kind: "ensureVisible",
      ref,
      point
    });
  }
  async drag(args) {
    const nut = await loadNut();
    const g = await this.geometry();
    const first = args.samples[0];
    if (!first) return;
    const button = nutButton(nut, args.button);
    const startScreen = viewportToScreen(first, g);
    await nut.mouse.setPosition(new nut.Point(startScreen.x, startScreen.y));
    await nut.mouse.pressButton(button);
    await sleep(rand(40, 90));
    await this.move(args.samples, args.mode);
    await sleep(rand(40, 90));
    await nut.mouse.releaseButton(button);
  }
  async pressKey(key2, mode2) {
    await this.transport.send({ kind: "pressKey", key: key2, mode: mode2 });
  }
  // Locator resolution is DOM-side, so it goes through the extension bridge even
  // in OS mode (only the cursor itself is driven by nut-js).
  async resolveLocator(spec, opts) {
    return await this.transport.send(
      { kind: "resolveLocator", spec, timeoutMs: opts.timeoutMs, scrollIntoView: opts.scrollIntoView },
      opts.timeoutMs + 5e3
    );
  }
  async evaluate(expression) {
    return this.transport.send({ kind: "evaluate", expression }, 6e4);
  }
  async consoleBuffer(clear) {
    return await this.transport.send({ kind: "consoleBuffer", clear }, 1e4);
  }
  async cursorState() {
    const nut = await loadNut();
    const pos = await nut.mouse.getPosition();
    return screenToViewport(pos, await this.geometry());
  }
  async move(samples, _mode) {
    const g = await this.geometry();
    await playPath(await loadNut(), samples, (p) => viewportToScreen(p, g));
  }
  async click(args) {
    await this.move(args.samples, args.mode);
    await sleep(args.preClickDwellMs);
    await pressButton(await loadNut(), args.button, args.pressMs, args.dblclick);
  }
  async type(args) {
    await typeText(await loadNut(), args.text, args);
  }
  async scroll(args) {
    await scrollSteps(await loadNut(), 0, args.dy, args.steps);
  }
  async geometry() {
    if (!this.geom) {
      this.geom = await this.transport.send({
        kind: "windowGeometry"
      });
    }
    return this.geom;
  }
};

// src/server/desktop-tools.ts
import { z } from "zod";

// src/util/diff.ts
function diffRead(previous, next) {
  const pending = /* @__PURE__ */ new Map();
  for (const line of previous) {
    const list = pending.get(key(line));
    if (list) list.push(line);
    else pending.set(key(line), [line]);
  }
  const added = [];
  let moved = 0;
  let unchanged = 0;
  for (const line of next) {
    const list = pending.get(key(line));
    const match = list?.shift();
    if (match === void 0) added.push(line);
    else if (match === line) unchanged++;
    else moved++;
  }
  const removed = [...pending.values()].flat();
  if (!added.length && !removed.length && !moved) return "no change since the last read";
  const summary = `(${moved ? `${moved} moved, ` : ""}${unchanged} unchanged, ${next.length} total)`;
  return [...removed.map((l) => `- ${l}`), ...added.map((l) => `+ ${l}`), summary].join("\n");
}
function key(line) {
  return line.replace(/ @-?\d+,-?\d+/, "");
}
function readOrDiff(previous, next) {
  const full = next.join("\n");
  if (!previous) return full;
  const diff = diffRead(previous, next);
  return diff.length < full.length ? diff : full;
}

// src/server/desktop-tools.ts
function text(body) {
  return { content: [{ type: "text", text: body }] };
}
function detailOf(args) {
  if (args == null || typeof args !== "object") return "";
  const a = args;
  const bits = [];
  for (const k of ["app", "ref", "text", "keys", "into", "find"]) {
    const v = a[k];
    if (v == null) continue;
    const s = String(v);
    bits.push(`${k}=${s.length > 48 ? s.slice(0, 48) + "\u2026" : s}`);
  }
  if (!bits.length && a.x != null) bits.push(`(${a.x},${a.y})`);
  return bits.join(" ");
}
function tracked(server, bus, name, schema, handler, focus, desktop) {
  const run3 = async (args) => {
    const detail = detailOf(args);
    const d = desktop;
    const info = d?.focusInfo?.();
    focus?.note(name, detail, info?.pid, info?.name);
    if (!bus) return handler(args);
    const id = bus.begin(name, detail);
    try {
      const out = await handler(args);
      bus.end(id, true);
      const after = d?.focusInfo?.();
      if (after?.pid) focus?.noteWindow(after.pid, after.name, after.title);
      return out;
    } catch (e) {
      bus.end(id, false);
      throw e;
    }
  };
  if (!bus && !focus) {
    server.registerTool(name, schema, handler);
    return;
  }
  server.registerTool(name, schema, run3);
}
var target = {
  ref: z.string().optional().describe("[dN] ref from desktop_read"),
  text: z.string().optional().describe("visible text or label to target"),
  x: z.number().optional(),
  y: z.number().optional(),
  app: z.string().optional()
};
var lastRead = /* @__PURE__ */ new WeakMap();
function registerDesktopTools(server, desktop, bus, focus) {
  const isWin = process.platform === "win32";
  const platformLabel = isWin ? "Windows" : "Mac";
  const tr = (name, schema, handler) => tracked(server, bus, name, schema, handler, focus, desktop);
  tr(
    "desktop_apps",
    {
      description: `List running ${platformLabel} apps/windows; * marks the frontmost one.`,
      inputSchema: {}
    },
    async () => text(
      (await desktop.apps()).map((a) => `${a.active ? "*" : " "} ${a.name} (pid ${a.pid})`).join("\n")
    )
  );
  tr(
    "desktop_open",
    {
      description: `Open or switch to a ${platformLabel} app by name (Notepad, calc, explorer, Slack...) and bring it to the front. Safe: opens, never kills.`,
      inputSchema: { app: z.string() }
    },
    async ({ app }) => {
      const a = await desktop.open(app);
      return text(`${a.name} (pid ${a.pid}) is frontmost`);
    }
  );
  tr(
    "desktop_read",
    {
      description: "Read an app window as compact text: buttons, fields, links, menus and visible text, each with a [dN] ref and center point. Costs far fewer tokens than a screenshot, so call it before clicking. `find` returns only the best matches for a label. Defaults to the app you last opened or read.",
      inputSchema: {
        app: z.string().optional(),
        find: z.string().optional(),
        max: z.number().int().min(1).max(500).optional(),
        changes: z.boolean().optional().describe("only what changed since your last read (refs stay valid)")
      }
    },
    async ({ app, find, max, changes }) => {
      if (find) {
        const matches = await desktop.find(find, { app });
        return text(matches.length ? matches.map(formatElement).join("\n") : `Nothing matching "${find}".`);
      }
      const lines = formatView(await desktop.read({ app, max })).split("\n");
      const body = changes ? readOrDiff(lastRead.get(desktop), lines) : lines.join("\n");
      lastRead.set(desktop, lines);
      return text(body);
    }
  );
  tr(
    "desktop_click",
    {
      description: "Move the real cursor along a human path and click: a [dN] ref, visible text/label, or screen x/y. Brings the app to the front first. Always desktop_read first so you know the target \u2014 precision over speed.",
      inputSchema: {
        ...target,
        button: z.enum(["left", "right", "middle"]).optional(),
        double: z.boolean().optional()
      }
    },
    async (args) => text(`clicked ${await desktop.click(args)}`)
  );
  tr(
    "desktop_move",
    {
      description: "Move the real cursor to a ref, label, or x/y without clicking (menus, tooltips, hover states).",
      inputSchema: target
    },
    async (args) => text(`moved to ${await desktop.move(args)}`)
  );
  tr(
    "desktop_type",
    {
      description: "Type with human timing. Clicks a field first when given ref, into (label) or x/y; otherwise types into the focused field. clear replaces the current text, submit presses Enter.",
      inputSchema: {
        text: z.string(),
        ref: z.string().optional(),
        into: z.string().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        app: z.string().optional(),
        clear: z.boolean().optional(),
        submit: z.boolean().optional()
      }
    },
    async ({ text: value, into, ...rest }) => {
      await desktop.type({ ...rest, text: into, value });
      return text(`typed ${value.length} chars${rest.submit ? " and pressed Enter" : ""}`);
    }
  );
  tr(
    "desktop_key",
    {
      description: "Press a key or shortcut in the current app: enter, esc, tab, up, ctrl+s, ctrl+shift+t, ctrl+c.",
      inputSchema: { keys: z.string() }
    },
    async ({ keys }) => {
      await desktop.key(keys);
      return text(`pressed ${keys}`);
    }
  );
  tr(
    "desktop_scroll",
    {
      description: "Scroll by dy (positive = down) and optional dx, over a ref, label or x/y (else where the cursor is). Refs expire after scrolling; desktop_read again.",
      inputSchema: { ...target, dy: z.number(), dx: z.number().optional() }
    },
    async (args) => {
      await desktop.scroll(args);
      return text(`scrolled dy=${args.dy}${args.dx ? ` dx=${args.dx}` : ""}`);
    }
  );
  tr(
    "desktop_screenshot",
    {
      description: "Screenshot one app window (or the area around a ref), downscaled. Use only when desktop_read text is not enough: canvases, images, custom-drawn UI. The reply explains how to turn image pixels into screen x/y for desktop_click.",
      inputSchema: {
        app: z.string().optional(),
        ref: z.string().optional(),
        maxWidth: z.number().int().min(200).max(2e3).optional()
      }
    },
    async (args) => {
      const shot = await desktop.screenshot(args);
      return {
        content: [
          { type: "image", data: shot.data, mimeType: shot.mimeType },
          { type: "text", text: shot.note }
        ]
      };
    }
  );
}

// src/server/events.ts
var MAX = 80;
var AgentEventBus = class {
  seq = 0;
  items = [];
  busyTool = null;
  busySince = 0;
  begin(tool, detail) {
    const id = ++this.seq;
    this.busyTool = tool;
    this.busySince = Date.now();
    this.push({ id, t: Date.now(), tool, detail, ok: true });
    return id;
  }
  end(id, ok) {
    const e = this.items.find((x) => x.id === id);
    if (e) {
      e.ok = ok;
      e.ms = Date.now() - e.t;
    }
    if (this.busyTool && e && e.tool === this.busyTool) {
      this.busyTool = null;
    }
  }
  push(partial) {
    const e = { id: partial.id ?? ++this.seq, ...partial };
    this.items.push(e);
    if (this.items.length > MAX) this.items.splice(0, this.items.length - MAX);
    return e;
  }
  list(since = 0) {
    return this.items.filter((e) => e.t > since);
  }
  activity() {
    const last = this.items[this.items.length - 1];
    if (this.busyTool) {
      return { tool: this.busyTool, running: true, ageMs: Date.now() - this.busySince };
    }
    return {
      tool: last?.tool ?? null,
      running: false,
      ageMs: last ? Date.now() - last.t : 0
    };
  }
  stats() {
    const a = this.activity();
    return {
      count: this.items.length,
      lastId: this.items[this.items.length - 1]?.id ?? 0,
      activity: a,
      recent: this.items.slice(-12)
    };
  }
};

// src/server/focus.ts
var BROWSER_TOOLS = /* @__PURE__ */ new Set([
  "read_page",
  "find",
  "click_text",
  "move_to",
  "click",
  "type",
  "press_key",
  "scroll",
  "navigate",
  "get_url",
  "evaluate",
  "wait_for",
  "screenshot",
  "hover",
  "drag",
  "console_buffer",
  "status"
]);
var AgentFocus = class {
  state = { mode: "idle", at: 0 };
  get() {
    return this.state;
  }
  label() {
    const s = this.state;
    if (s.mode === "browser") return s.name ? `browser \xB7 ${s.name}` : "browser";
    if (s.mode === "window") {
      const n = s.name || s.title || "window";
      return s.pid ? `${n} (${s.pid})` : n;
    }
    return "idle";
  }
  noteBrowser(name) {
    this.state = { mode: "browser", name: name ?? this.state.name, at: Date.now() };
  }
  noteWindow(pid, name, title) {
    if (!Number.isFinite(pid) || pid <= 0) return;
    this.state = { mode: "window", pid, name, title, at: Date.now() };
  }
  /** Called for every tool: browser tools pin browser; desktop tools pin the target app. */
  note(tool, detail, desktopPid, desktopName) {
    if (tool.startsWith("desktop_")) {
      if (desktopPid) this.noteWindow(desktopPid, desktopName, detail || void 0);
      else if (this.state.mode === "idle") this.state = { mode: "window", at: Date.now() };
      return;
    }
    if (BROWSER_TOOLS.has(tool) && tool !== "live_view") {
      this.noteBrowser();
    }
  }
};

// src/server/window-stream.ts
import { spawn as spawn2 } from "child_process";
import { existsSync as existsSync2, mkdtempSync as mkdtempSync2, readFileSync as readFileSync2, rmSync as rmSync2, statSync, writeFileSync as writeFileSync2 } from "fs";
import { tmpdir as tmpdir3 } from "os";
import { join as join3 } from "path";
var WindowStream = class {
  child = null;
  file = "";
  dir = "";
  pid = null;
  startedAt = 0;
  ensure(pid) {
    if (!Number.isFinite(pid) || pid <= 0) {
      this.stop();
      return null;
    }
    if (this.pid === pid && this.child && !this.child.killed) {
      return this.file;
    }
    this.stop();
    this.dir = mkdtempSync2(join3(tmpdir3(), "ac-winstream-"));
    this.file = join3(this.dir, "frame.jpg");
    const script = join3(this.dir, "loop.ps1");
    writeFileSync2(script, streamScript(pid, this.file), "utf8");
    const child = spawn2(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script],
      { windowsHide: true, stdio: "ignore" }
    );
    child.on("error", () => {
      this.child = null;
      this.pid = null;
    });
    child.on("exit", () => {
      if (this.child === child) {
        this.child = null;
        this.pid = null;
      }
    });
    this.child = child;
    this.pid = pid;
    this.startedAt = Date.now();
    return this.file;
  }
  /** Lê o último JPEG da janela; null se ainda não há / stream parado. */
  read() {
    if (!this.file || !existsSync2(this.file)) return null;
    try {
      const st = statSync(this.file);
      if (Date.now() - st.mtimeMs > 2500) return null;
      if (st.size < 80) return null;
      return readFileSync2(this.file);
    } catch {
      return null;
    }
  }
  isUsable(pid) {
    return this.pid === pid && !!this.child && !this.child.killed && Date.now() - this.startedAt > 0;
  }
  stop() {
    if (this.child) {
      try {
        this.child.kill();
      } catch {
      }
      this.child = null;
    }
    if (this.dir) {
      try {
        rmSync2(this.dir, { recursive: true, force: true });
      } catch {
      }
      this.dir = "";
      this.file = "";
    }
    this.pid = null;
  }
};
function streamScript(pid, outFile) {
  const out = outFile.replace(/'/g, "''");
  return `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinRect {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
}
"@
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 65L)
$tmp = '${out}.tmp'
while ($true) {
  try {
    $p = Get-Process -Id ${pid} -ErrorAction Stop
    $h = $p.MainWindowHandle
    if ($h -eq 0 -or -not [WinRect]::IsWindow($h)) { Start-Sleep -Milliseconds 120; continue }
    if ([WinRect]::IsIconic($h)) { Start-Sleep -Milliseconds 200; continue }
    $r = New-Object WinRect+RECT
    if (-not [WinRect]::GetWindowRect($h, [ref]$r)) { Start-Sleep -Milliseconds 80; continue }
    $w = $r.Right - $r.Left
    $ht = $r.Bottom - $r.Top
    if ($w -lt 40 -or $ht -lt 40) { Start-Sleep -Milliseconds 80; continue }
    if ($w -gt 1280) { $w = 1280 }
    if ($ht -gt 800) { $ht = 800 }
    $bmp = New-Object System.Drawing.Bitmap($w, $ht)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $src = New-Object System.Drawing.Rectangle($r.Left, $r.Top, ($r.Right - $r.Left), ($r.Bottom - $r.Top))
    $dst = New-Object System.Drawing.Rectangle(0, 0, $w, $ht)
    $g.CopyFromScreen($src.Location, [System.Drawing.Point]::Empty, $src.Size)
    $g.Dispose()
    $bmp.Save($tmp, $enc, $ep)
    $bmp.Dispose()
    Move-Item -LiteralPath $tmp -Destination '${out}' -Force
  } catch { }
  Start-Sleep -Milliseconds 55
}
`;
}

// src/server/frame-hub.ts
var FrameHub = class {
  constructor(rt, minAgeMs = 60) {
    this.rt = rt;
    this.minAgeMs = minAgeMs;
  }
  rt;
  minAgeMs;
  last = null;
  inflight = null;
  watchers = 0;
  timer = null;
  lastErr = "";
  winStream = new WindowStream();
  noteWatcher(active) {
    this.watchers = Math.max(0, this.watchers + (active ? 1 : -1));
    if (this.watchers > 0) this.ensureLoop();
    else this.stopLoopSoon();
  }
  ensureLoop() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.capture(true);
      if (this.watchers <= 0) this.stopLoop();
    }, 70);
    this.timer.unref?.();
  }
  stopLoopSoon() {
  }
  stopLoop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.winStream.stop();
  }
  desktopTarget() {
    const d = this.rt.desktop;
    try {
      return d.focusInfo?.() ?? {};
    } catch {
      return {};
    }
  }
  async captureWindow(pid, label) {
    const file = this.winStream.ensure(pid);
    if (!file) return null;
    for (let i = 0; i < 8; i++) {
      const raw = this.winStream.read();
      if (raw && raw.length >= 100) {
        const frame = { buf: raw, source: "window", focus: label, ts: Date.now() };
        this.last = frame;
        return frame;
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    try {
      const shot = await winScreenshot(pid, 960);
      if (shot.data && shot.data.length >= 100) {
        const frame = {
          buf: Buffer.from(shot.data, "base64"),
          source: "window",
          focus: label,
          ts: Date.now()
        };
        this.last = frame;
        return frame;
      }
    } catch (e) {
      this.lastErr = e.message;
    }
    return null;
  }
  async capture(force = false) {
    const age = this.last ? Date.now() - this.last.ts : 1e9;
    if (!force && this.last && age < this.minAgeMs) return this.last;
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        const focus = this.rt.focus.get();
        const desk = this.desktopTarget();
        const focusLabel = this.rt.focus.label();
        if (focus.mode === "browser") {
          try {
            const dataUrl = await this.rt.action.screenshot("jpeg");
            const m = /^data:image\/jpeg;base64,(.*)$/s.exec(dataUrl);
            if (m) {
              const frame = {
                buf: Buffer.from(m[1], "base64"),
                source: "browser",
                focus: focusLabel || "browser tab",
                ts: Date.now()
              };
              this.last = frame;
              return frame;
            }
          } catch {
          }
        }
        if (process.platform === "win32") {
          const winPid = focus.mode === "window" && focus.pid ? focus.pid : desk.pid;
          if (winPid) {
            const label = focus.mode === "window" && focus.name ? focusLabel : desk.name ?? desk.title ?? `pid ${winPid}`;
            const w = await this.captureWindow(winPid, label);
            if (w) return w;
          }
        }
        if (process.platform === "win32") {
          try {
            const shot = await winScreenCapture(960);
            if (shot.data && shot.data.length >= 100) {
              const frame = {
                buf: Buffer.from(shot.data, "base64"),
                source: "desktop",
                focus: "full screen",
                ts: Date.now()
              };
              this.last = frame;
              return frame;
            }
          } catch (e) {
            this.lastErr = e.message;
            process.stderr.write(`agentcursor: frame capture failed: ${this.lastErr}
`);
          }
        }
        return null;
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }
  peek() {
    return this.last;
  }
  error() {
    return this.lastErr;
  }
  dispose() {
    this.stopLoop();
  }
};

// src/server/tools.ts
import { z as z2 } from "zod";
function text2(body) {
  return { content: [{ type: "text", text: body }] };
}
function image(dataUrl) {
  const m = /^data:(image\/[\w.+-]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  return { type: "image", data: m[2], mimeType: m[1] };
}
async function withAutoReport(action, result) {
  if (process.env.AGENTCURSOR_AUTOREPORT === "0") return result;
  try {
    await new Promise((r) => setTimeout(r, 250));
    const entries = await action.consoleBuffer(true).catch(() => []);
    const errors = entries.filter((e) => e.level === "error" || e.level === "warning");
    let shot = null;
    try {
      shot = await action.screenshot("jpeg");
    } catch {
      shot = null;
    }
    const parts = [...result.content];
    if (errors.length) {
      const lines = errors.slice(-8).map((e) => `  [${e.level}] ${e.text}${e.url ? ` (${e.url}${e.line ? `:${e.line}` : ""})` : ""}`).join("\n");
      parts.push({
        type: "text",
        text: `

Auto-relat\xF3rio \u2014 console (${errors.length} aviso/erro desde \xFAltima a\xE7\xE3o):
${lines}`
      });
    } else {
      parts.push({ type: "text", text: "\n\nAuto-relat\xF3rio \u2014 console limpo (sem erros)." });
    }
    const img = shot ? image(shot) : null;
    if (img) parts.push(img);
    return { content: parts };
  } catch {
    return result;
  }
}
var lastRead2 = /* @__PURE__ */ new WeakMap();
function detailOf2(args) {
  if (args == null || typeof args !== "object") return "";
  const a = args;
  const bits = [];
  for (const k of ["ref", "url", "key", "text", "find", "query", "button", "dy", "function"]) {
    const v = a[k];
    if (v == null) continue;
    const s = String(v);
    bits.push(`${k}=${s.length > 48 ? s.slice(0, 48) + "\u2026" : s}`);
  }
  if (!bits.length && a.x != null) bits.push(`(${a.x},${a.y})`);
  return bits.join(" ");
}
function tracked2(server, bus, name, schema, handler, focus) {
  const run3 = async (args) => {
    const detail = detailOf2(args);
    focus?.note(name, detail);
    if (!bus) return handler(args);
    const id = bus.begin(name, detail);
    try {
      const out = await handler(args);
      bus.end(id, true);
      return out;
    } catch (e) {
      bus.end(id, false);
      throw e;
    }
  };
  if (!bus && !focus) {
    server.registerTool(name, schema, handler);
    return;
  }
  server.registerTool(name, schema, run3);
}
function registerTools(server, action, bus, focus) {
  const tr = (name, schema, handler) => tracked2(server, bus, name, schema, handler, focus);
  tr(
    "read_page",
    {
      description: "Read the current page: interactive elements with stable [ref] handles, their roles/names and on-screen rectangles, plus visible text. Call before clicking or typing by ref.",
      inputSchema: {
        maxElements: z2.number().int().min(1).max(200).optional(),
        includeText: z2.boolean().optional(),
        changes: z2.boolean().optional().describe("only what changed since your last read (refs stay valid)")
      }
    },
    async ({ maxElements, includeText, changes }) => {
      const snap = await action.readPage(maxElements ?? 60, includeText ?? true);
      const lines = formatSnapshot(snap);
      const body = changes ? readOrDiff(lastRead2.get(action), lines) : lines.join("\n");
      lastRead2.set(action, lines);
      return text2(body);
    }
  );
  tr(
    "find",
    {
      description: "Identification: locate on-screen elements by their visible text or accessible name (shadow-DOM aware), the way a human scans a page. Returns ranked matches with [ref], role, and on-screen rect. Use when you don't already have a ref, then click/move_to/hover by [ref] \u2014 or use click_text to do it in one step.",
      inputSchema: {
        text: z2.string(),
        maxResults: z2.number().int().min(1).max(20).optional()
      }
    },
    async ({ text: query, maxResults }) => {
      const matches = await action.find(query, { maxResults });
      if (!matches.length) return text2(`No elements matching "${query}".`);
      return text2(matches.map(formatElement2).join("\n"));
    }
  );
  tr(
    "click_text",
    {
      description: "Identification + interaction in one step: find the element that best matches the given text/label, then human-move the cursor to it and click. Re-reads the page if the element isn't there yet. `nth` picks a later match, `stealth:true` delivers trusted events, `double` double-clicks.",
      inputSchema: {
        text: z2.string(),
        nth: z2.number().int().min(0).optional(),
        double: z2.boolean().optional(),
        stealth: z2.boolean().optional()
      }
    },
    async ({ text: query, nth, double, stealth }) => {
      const { matched, point } = await action.clickText(query, { nth, double, stealth });
      return withAutoReport(action, text2(
        `clicked "${matched.name || matched.ref}" [${matched.ref}] at (${point.x.toFixed(0)}, ${point.y.toFixed(0)})`
      ));
    }
  );
  tr(
    "move_to",
    {
      description: "Move the cursor to an element ([ref] from read_page) or to absolute viewport x/y along a human-like path. Does not click. stealth:true delivers trusted events via the debugger driver.",
      inputSchema: {
        ref: z2.string().optional(),
        x: z2.number().optional(),
        y: z2.number().optional(),
        stealth: z2.boolean().optional()
      }
    },
    async (args) => {
      const p = await action.moveTo(args);
      return text2(`moved to (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
    }
  );
  tr(
    "click",
    {
      description: "Human-like move + click on an element ([ref]) or x/y. Supports button, double-click, and stealth (trusted-event) mode.",
      inputSchema: {
        ref: z2.string().optional(),
        x: z2.number().optional(),
        y: z2.number().optional(),
        button: z2.enum(["left", "right", "middle"]).optional(),
        double: z2.boolean().optional(),
        stealth: z2.boolean().optional()
      }
    },
    async (args) => {
      const p = await action.click(args);
      const where = args.ref ? `'${args.ref}'` : `(${p.x.toFixed(0)}, ${p.y.toFixed(0)})`;
      return withAutoReport(action, text2(`clicked ${where}`));
    }
  );
  tr(
    "type",
    {
      description: "Type text with human key timing. If a ref is given, the input is human-clicked to focus first. stealth:true uses the debugger driver.",
      inputSchema: {
        text: z2.string(),
        ref: z2.string().optional(),
        stealth: z2.boolean().optional()
      }
    },
    async (args) => {
      await action.type(args);
      return withAutoReport(action, text2(`typed ${args.text.length} chars`));
    }
  );
  tr(
    "press_key",
    {
      description: "Press a single key on the focused element: Enter, Escape, Tab, Backspace, Delete, ArrowUp/Down/Left/Right, Home, End, PageUp, PageDown, Space, or a single character. Use to submit (Enter), dismiss dialogs (Escape), or tab between fields. stealth:true delivers a trusted key event via the debugger driver.",
      inputSchema: {
        key: z2.string(),
        stealth: z2.boolean().optional()
      }
    },
    async ({ key: key2, stealth }) => {
      await action.pressKey(key2, stealth);
      return withAutoReport(action, text2(`pressed ${key2}`));
    }
  );
  tr(
    "scroll",
    {
      description: "Scroll the page by dy (and optional dx) pixels in eased human steps.",
      inputSchema: {
        dy: z2.number(),
        dx: z2.number().optional(),
        stealth: z2.boolean().optional()
      }
    },
    async (args) => {
      await action.scroll(args);
      return withAutoReport(action, text2(`scrolled dy=${args.dy}`));
    }
  );
  tr(
    "navigate",
    {
      description: "Navigate the active tab to a URL.",
      inputSchema: { url: z2.string() }
    },
    async ({ url }) => {
      await action.navigate(url);
      await new Promise((r) => setTimeout(r, 800));
      return withAutoReport(action, text2(`navigating to ${url}`));
    }
  );
  tr(
    "get_url",
    { description: "Return the active tab's current URL.", inputSchema: {} },
    async () => text2(await action.getUrl())
  );
  tr(
    "evaluate",
    {
      description: "Run a JavaScript function in the active page and return its JSON result. Pass a function source string, e.g. `() => document.title` or `async () => (await fetch('/api/x', { method: 'POST', credentials: 'include' })).status`. Runs in the page realm via CDP, so it uses the page's own cookies/session, awaits promises, and is not blocked by the page CSP. Return value must be JSON-serializable. Use for reads and requests the UI has no button for; the debugger banner shows while it runs.",
      inputSchema: {
        function: z2.string(),
        args: z2.array(z2.any()).optional()
      }
    },
    async ({ function: fn, args }) => {
      const result = await action.evaluate(fn, args);
      return text2(typeof result === "string" ? result : JSON.stringify(result, null, 2));
    }
  );
  tr(
    "wait_for",
    {
      description: "Wait until an element [ref] appears or some visible text is present (or specific condition), up to timeoutMs (default 10000). Supports condition: 'exists' | 'visible' | 'text'. Use in testing and automation flows for resilience on dynamic sites.",
      inputSchema: {
        ref: z2.string().optional(),
        text: z2.string().optional(),
        timeoutMs: z2.number().int().optional(),
        condition: z2.enum(["exists", "visible", "text"]).optional()
      }
    },
    async (args) => {
      const ok = await action.waitFor(args);
      return text2(ok ? "found" : "timed out");
    }
  );
  tr(
    "screenshot",
    {
      description: "Capture the visible tab as an image, scaled so 1 image pixel = 1 click coordinate. SEE the page, then click(x,y)/move_to(x,y) at coordinates read off the image. This is the vision loop (screenshot -> decide coords -> click -> screenshot) and needs no DOM refs.",
      inputSchema: {
        format: z2.enum(["png", "jpeg"]).optional()
      }
    },
    async ({ format }) => {
      const dataUrl = await action.screenshot(format ?? "png");
      const m = /^data:(image\/[\w.+-]+);base64,(.*)$/s.exec(dataUrl);
      if (!m) return text2(dataUrl);
      return { content: [{ type: "image", data: m[2], mimeType: m[1] }] };
    }
  );
  tr(
    "hover",
    {
      description: "Human-like move the cursor to an element or coordinates and fire hover events (mouseover, mouseenter). Essential for dropdowns, tooltips, navigation menus, and realistic workflow/testing automation.",
      inputSchema: {
        ref: z2.string().optional(),
        x: z2.number().optional(),
        y: z2.number().optional(),
        stealth: z2.boolean().optional()
      }
    },
    async (args) => {
      await action.hover(args);
      const where = args.ref ? `'${args.ref}'` : args.x != null ? `(${args.x},${args.y})` : "current position";
      return withAutoReport(action, text2(`hovered ${where}`));
    }
  );
  tr(
    "status",
    {
      description: "Return current MCP server status, driver in use (extension or os), whether the browser bridge is connected, and the active tab URL if available. Use for health checks in long-running tests, CI workflows, and agent monitoring.",
      inputSchema: {}
    },
    async () => {
      const url = await action.getUrl().catch(() => null);
      const connected = url !== null;
      const p = action.personaInfo();
      const t = p.traits;
      return text2(
        [
          `driver: ${process.env.AGENTCURSOR_DRIVER ?? "extension"}`,
          `bridge_connected: ${connected}`,
          `active_url: ${url ?? "none (extension not connected or no http tab)"}`,
          `ws_port: ${process.env.AGENTCURSOR_WS_PORT ?? 8930}`,
          "protocol_version: 1",
          `persona_seed: ${p.seed} (set AGENTCURSOR_SEED to reproduce)`,
          `persona_actions: ${p.actionCount}`,
          `persona_fatigue: ${p.fatigue.toFixed(3)}`,
          `persona_traits: speed=${t.speedFactor.toFixed(2)} curviness=${t.curviness.toFixed(2)} jitter=${t.jitterPx.toFixed(2)}px precision=${t.precision.toFixed(2)} wpm=${Math.round(t.wpm)} errorRate=${t.errorRate.toFixed(3)}`
        ].join("\n")
      );
    }
  );
  tr(
    "drag",
    {
      description: "Perform a human-like drag from one element/ref or coords to another (e.g. for sliders, reordering, canvas drawing). Uses the realistic path engine while holding the mouse button.",
      inputSchema: {
        fromRef: z2.string().optional(),
        fromX: z2.number().optional(),
        fromY: z2.number().optional(),
        toRef: z2.string().optional(),
        toX: z2.number().optional(),
        toY: z2.number().optional(),
        button: z2.enum(["left", "right", "middle"]).optional(),
        stealth: z2.boolean().optional()
      }
    },
    async (args) => {
      await action.drag(
        { ref: args.fromRef, x: args.fromX, y: args.fromY },
        { ref: args.toRef, x: args.toX, y: args.toY },
        args.button ?? "left",
        args.stealth
      );
      return withAutoReport(action, text2("dragged"));
    }
  );
  tr(
    "console_buffer",
    {
      description: "Read (and optionally clear) the buffered console errors/warnings from the active page since the last read. Use after navigate/click to check for JS errors without opening DevTools.",
      inputSchema: {
        clear: z2.boolean().optional().describe("clear the buffer after reading (default true)")
      }
    },
    async ({ clear }) => {
      const entries = await action.consoleBuffer(clear ?? true);
      if (!entries.length) return text2("console buffer empty (no errors/warnings).");
      const lines = entries.map((e) => `[${e.level}] ${e.text}${e.url ? ` (${e.url}${e.line ? `:${e.line}` : ""})` : ""}`);
      return text2(lines.join("\n"));
    }
  );
  tr(
    "live_view",
    {
      description: "Open/close the floating Live View panel on demand. Does NOT auto-start at MCP boot \u2014 call action:'on' only when the human asks to watch the agent, 'off' to close it, 'status' to check. Panel is always-on-top, never steals focus, out of Alt+Tab. Shows the window/tab the agent is actually using plus a live action feed.",
      inputSchema: {
        action: z2.enum(["on", "off", "status"]).describe("on = open panel, off = close, status = check")
      }
    },
    async ({ action: act }) => {
      const { toggleLiveView: toggleLiveView2 } = await import("./autostart-ZBD6HEJ5.js");
      const port = Number(process.env.AGENTCURSOR_HTTP_PORT ?? 8931);
      if (act === "status") {
        const { liveViewPid: liveViewPid2 } = await import("./autostart-ZBD6HEJ5.js");
        const pid = liveViewPid2();
        return text2(pid ? `live_view: on (pid ${pid})` : "live_view: off");
      }
      const r = await toggleLiveView2(port, act === "on");
      return text2(r.on ? `live_view: on (pid ${r.pid})` : "live_view: off");
    }
  );
  server.registerPrompt(
    "human-browser-task",
    {
      description: "Guide for performing realistic, human-like browser automation tasks using agentcursor tools. Use this for any non-trivial interaction on real websites."
    },
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `When using agentcursor:
1. Always call status and read_page first to understand the current page and connection.
2. Use [ref] from read_page for all clicks, hovers, types.
3. For complex pages, use screenshot often to ground yourself.
4. Prefer human-like: move_to or hover before click, use wait_for for dynamic content.
5. On modern sites (X, Reddit etc), the snapshot now handles shadow DOM.
6. For stealth on sensitive sites, use stealth:true (but it shows debugger banner).
7. After navigate or major changes, re-read_page.
8. Use ensureVisible implicitly via the tools (scrolls targets into view).
Be patient with SPAs - combine wait_for + read_page loops.`
          }
        }
      ]
    })
  );
}
function formatSnapshot(snap) {
  const lines = [
    `URL: ${snap.url}`,
    `Title: ${snap.title}`,
    `Viewport: ${snap.viewport.width}x${snap.viewport.height} scroll ${snap.viewport.scrollX},${snap.viewport.scrollY} (element @x,y = center)`,
    `Elements (${snap.elements.length}):`
  ];
  for (const e of snap.elements) lines.push(formatElement2(e));
  if (snap.text) lines.push("", "Text:", ...truncate(snap.text, 4e3).split("\n"));
  return lines;
}
function truncate(s, n) {
  return s.length > n ? `${s.slice(0, n)}\u2026` : s;
}
function formatElement2(e) {
  const name = e.name ? ` "${truncate(e.name, 60)}"` : "";
  const val = e.value ? ` value="${truncate(e.value, 40)}"` : "";
  const tag = e.tag && e.tag !== e.role ? ` <${e.tag}>` : "";
  const flags = `${e.visible === false ? " hidden" : ""}${e.inViewport === false ? " off-view" : ""}`;
  const cx = Math.round(e.rect.x + e.rect.width / 2);
  const cy = Math.round(e.rect.y + e.rect.height / 2);
  return `[${e.ref}] ${e.role}${name}${val}${tag} @${cx},${cy}${flags}`;
}

// src/server/transport.ts
import { randomUUID } from "crypto";
import { once } from "events";
import { WebSocket, WebSocketServer } from "ws";
var NOT_CONNECTED = "AgentCursor extension is not connected. Load the extension and open a normal browser tab.";
var ExtensionTransport = class {
  wss;
  socket = null;
  pending = /* @__PURE__ */ new Map();
  constructor(port = DEFAULT_WS_PORT) {
    this.wss = new WebSocketServer({ host: "127.0.0.1", port });
    this.wss.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        process.stderr.write(
          `agentcursor: port ${port} is already in use. Set AGENTCURSOR_WS_PORT to a free port.
`
        );
        process.exit(1);
      }
      process.stderr.write(`agentcursor: WebSocket server error: ${err.message}
`);
    });
    this.wss.on("connection", (ws, req) => {
      const origin = req.headers.origin;
      if (origin && !origin.startsWith("chrome-extension://")) {
        ws.close(1008, "origin not allowed");
        return;
      }
      this.socket = ws;
      ws.on("message", (data) => this.onMessage(data.toString()));
      ws.on("close", () => {
        if (this.socket === ws) this.socket = null;
      });
      ws.on("error", () => void 0);
    });
  }
  /** Resolves to the bound port; pass port 0 to the constructor for a free one. */
  async listening() {
    if (!this.wss.address()) await once(this.wss, "listening");
    return this.wss.address().port;
  }
  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }
  send(command, timeoutMs = 3e4) {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(NOT_CONNECTED));
    }
    const id = randomUUID();
    const envelope = { v: PROTOCOL_VERSION, id, command };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Command '${command.kind}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify(envelope));
    });
  }
  onMessage(raw) {
    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      return;
    }
    const entry = this.pending.get(result.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(result.id);
    if (result.ok) entry.resolve(result.data);
    else entry.reject(new Error(result.error));
  }
  close() {
    for (const entry of this.pending.values()) clearTimeout(entry.timer);
    this.pending.clear();
    this.wss.close();
  }
};

// src/server/create.ts
var SELF = fileURLToPath2(import.meta.url);
var BUILD_ID = Math.round(statSync2(SELF).mtimeMs);
function readVersion() {
  try {
    return JSON.parse(readFileSync3(new URL("../package.json", import.meta.url), "utf8")).version;
  } catch {
    return "0.0.0";
  }
}
function resolvePorts(env = process.env) {
  const ws = Number(env.AGENTCURSOR_WS_PORT ?? DEFAULT_WS_PORT);
  return { ws, http: Number(env.AGENTCURSOR_HTTP_PORT ?? ws + 1) };
}
function createRuntime(ports) {
  const seedEnv = process.env.AGENTCURSOR_SEED;
  const seed = seedEnv && seedEnv.trim() !== "" && Number.isFinite(Number(seedEnv)) ? Number(seedEnv) : void 0;
  const persona = createPersona(seed);
  const extension = new ExtensionTransport(ports.ws);
  const driver = (process.env.AGENTCURSOR_DRIVER ?? "extension").toLowerCase() === "os" ? new OsCursorDriver(extension) : new ExtensionDriver(extension);
  const isWin = process.platform === "win32";
  const desktop = isWin ? new DesktopServiceWindows(persona) : new DesktopService(persona, {
    background: process.env.AGENTCURSOR_BACKGROUND === "1",
    showCursor: process.env.AGENTCURSOR_SHOW_CURSOR === "1"
  });
  const events = new AgentEventBus();
  const focus = new AgentFocus();
  const rt = {
    action: new ActionService(driver, persona),
    desktop,
    extension,
    persona,
    ports,
    events,
    focus,
    frames: void 0
  };
  rt.frames = new FrameHub(rt);
  return rt;
}
function createMcpServer(rt) {
  const tools = (process.env.AGENTCURSOR_TOOLS ?? "all").toLowerCase();
  const browser = tools !== "desktop";
  const desktop = tools !== "browser" && (process.platform === "darwin" || process.platform === "win32");
  const server = new McpServer(
    { name: "agentcursor", version: readVersion() },
    { instructions: instructions(rt.ports, browser, desktop) }
  );
  if (browser) registerTools(server, rt.action, rt.events, rt.focus);
  if (desktop) registerDesktopTools(server, rt.desktop, rt.events, rt.focus);
  return server;
}
function instructions(ports, browser, desktop) {
  return [
    "AgentCursor moves a visible, human-like cursor for you.",
    desktop && "Desktop apps: desktop_open (by name/exe), then desktop_read (compact text with [dN] refs, far cheaper than screenshots), then desktop_click / desktop_type / desktop_key. Use desktop_screenshot only when the text is not enough. Always desktop_read before clicking so you know the target \u2014 precision and care, never blind clicks.",
    browser && "Browser tabs (needs the Chrome extension): read_page, then click / type by [ref], or click_text.",
    `If a tool reports missing permissions or a disconnected extension, send the user to http://127.0.0.1:${ports.http} to finish setup.`
  ].filter(Boolean).join("\n");
}
var logFile = (port) => join4(tmpdir4(), `agentcursor-${port}.log`);

// src/server/proxy.ts
var base = (port) => `http://127.0.0.1:${port}`;
async function health(port) {
  try {
    const res = await fetch(`${base(port)}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
async function until(check, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return true;
    await sleep(150);
  }
  return false;
}
function cliEntry() {
  if (SELF.endsWith(".ts")) return SELF;
  if (basename(SELF) === "index.js") return SELF;
  const sibling = join5(dirname(SELF), "index.js");
  return sibling.endsWith("index.js") ? sibling : SELF;
}
function tailLog(port, lines = 12) {
  try {
    const raw = readFileSync4(logFile(port), "utf8");
    return raw.split(/\r?\n/).filter(Boolean).slice(-lines).join("\n");
  } catch {
    return "(no log)";
  }
}
async function ensureDaemon(port) {
  const current = await health(port);
  if (current && current.buildId >= BUILD_ID) return;
  if (current) {
    await fetch(`${base(port)}/shutdown`, { method: "POST" }).catch(() => void 0);
    await until(async () => !await health(port), 5e3);
  }
  const log = openSync(logFile(port), "a");
  const entry = cliEntry();
  spawn3(process.execPath, [entry, "serve", "--idle-exit"], {
    detached: true,
    stdio: ["ignore", log, log],
    env: process.env,
    cwd: dirname(entry)
  }).unref();
  const ready = await until(async () => ((await health(port))?.buildId ?? 0) >= BUILD_ID, 2e4);
  if (!ready) {
    throw new Error(
      `agentcursor could not start its local service on port ${port}. Entry: ${entry}. Log: ${logFile(port)}
${tailLog(port)}`
    );
  }
}
async function connectClient(port) {
  const client = new Client({ name: "agentcursor-stdio", version: readVersion() });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base(port)}/mcp`)));
  return client;
}
var slim = (t) => {
  const { $schema, ...schema } = t.inputSchema;
  const { execution: _execution, ...rest } = t;
  return { ...rest, inputSchema: schema };
};
var unreachable = (e) => {
  const err = e;
  return /fetch failed|ECONNREFUSED|ECONNRESET|socket hang up/i.test(`${err?.message} ${err?.cause?.code}`);
};
async function runStdioProxy(port) {
  await ensureDaemon(port);
  let client = await connectClient(port);
  const call = async (fn) => {
    try {
      return await fn(client);
    } catch (e) {
      if (!unreachable(e)) throw e;
      await ensureDaemon(port);
      client = await connectClient(port);
      return fn(client);
    }
  };
  const server = new Server(
    { name: "agentcursor", version: readVersion() },
    { capabilities: { tools: {}, prompts: {} }, instructions: client.getInstructions() }
  );
  const long = { timeout: 15 * 6e4 };
  server.setRequestHandler(ListToolsRequestSchema, async (req) => {
    const res = await call((c) => c.listTools(req.params));
    return { ...res, tools: res.tools.map(slim) };
  });
  server.setRequestHandler(CallToolRequestSchema, (req) => call((c) => c.callTool(req.params, void 0, long)));
  server.setRequestHandler(ListPromptsRequestSchema, (req) => call((c) => c.listPrompts(req.params)));
  server.setRequestHandler(GetPromptRequestSchema, (req) => call((c) => c.getPrompt(req.params)));
  await server.connect(new StdioServerTransport());
  setInterval(() => void health(port), 6e4).unref();
}

// src/cli/autostart.ts
var livePidFile = () => join6(tmpdir5(), "agentcursor-live.pid");
var liveScriptFile = () => join6(tmpdir5(), "agentcursor-live-view.ps1");
var LIVE_VIEW_PS1 = `param([Parameter(Mandatory=$true)][int]$Port)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Net.Http
$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Windows.Forms;
using System.Runtime.InteropServices;

public class FloatingLiveForm : Form {
  protected override bool ShowWithoutActivation { get { return true; } }

  protected override CreateParams CreateParams {
    get {
      CreateParams cp = base.CreateParams;
      cp.ExStyle |= 0x00000008;
      cp.ExStyle |= 0x00000080;
      cp.ExStyle |= 0x08000000;
      return cp;
    }
  }

  [DllImport("user32.dll")]
  private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
  private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
  private const uint SWP_NOSIZE = 0x0001;
  private const uint SWP_NOMOVE = 0x0002;
  private const uint SWP_NOACTIVATE = 0x0010;

  public void KeepTopmost() {
    SetWindowPos(Handle, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  }
}
"@ -ReferencedAssemblies System.Windows.Forms, System.Drawing, System, System.Runtime.InteropServices

$http = New-Object System.Net.Http.HttpClient
$http.Timeout = [TimeSpan]::FromMilliseconds(900)
$script:lastHash = ""
$script:frames = 0
$script:fpsAt = [Diagnostics.Stopwatch]::StartNew()
$script:fps = 0
$script:busy = $false
$script:hidden = $false
$script:lastId = 0
$script:evBusy = $false
$script:source = "-"
$script:running = $false

$form = New-Object FloatingLiveForm
$form.Text = "AgentCursor Live"
$form.Size = New-Object System.Drawing.Size(520, 400)
$form.MinimumSize = New-Object System.Drawing.Size(320, 240)
$form.StartPosition = "Manual"
$form.TopMost = $true
$form.FormBorderStyle = "Sizable"
$form.ShowInTaskbar = $false
$form.Opacity = 0.96
$form.BackColor = [System.Drawing.Color]::FromArgb(8, 8, 10)

$header = New-Object System.Windows.Forms.Panel
$header.Dock = "Top"
$header.Height = 30
$header.BackColor = [System.Drawing.Color]::FromArgb(18, 18, 22)
$form.Controls.Add($header)

$title = New-Object System.Windows.Forms.Label
$title.Text = "LIVE | AgentCursor"
$title.Dock = "Fill"
$title.TextAlign = "MiddleLeft"
$title.Padding = New-Object System.Windows.Forms.Padding(8, 0, 0, 0)
$title.ForeColor = [System.Drawing.Color]::FromArgb(120, 255, 160)
$title.BackColor = [System.Drawing.Color]::Transparent
$title.Font = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Bold)
$header.Controls.Add($title)

$btnMin = New-Object System.Windows.Forms.Label
$btnMin.Text = "-"
$btnMin.Dock = "Right"
$btnMin.Width = 32
$btnMin.TextAlign = "MiddleCenter"
$btnMin.ForeColor = [System.Drawing.Color]::FromArgb(180, 180, 180)
$btnMin.BackColor = [System.Drawing.Color]::Transparent
$btnMin.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$btnMin.Cursor = [System.Windows.Forms.Cursors]::Hand
$btnMin.Add_Click({
  if ($script:hidden) {
    $form.Opacity = 0.96
    $title.Text = "LIVE | AgentCursor"
    $script:hidden = $false
  } else {
    $form.Opacity = 0.12
    $title.Text = "LIVE (hover -)"
    $script:hidden = $true
  }
})
$btnMin.Add_MouseEnter({ if ($script:hidden) { $form.Opacity = 0.85 } })
$btnMin.Add_MouseLeave({ if ($script:hidden) { $form.Opacity = 0.12 } })
$header.Controls.Add($btnMin)

$btnClose = New-Object System.Windows.Forms.Label
$btnClose.Text = "X"
$btnClose.Dock = "Right"
$btnClose.Width = 32
$btnClose.TextAlign = "MiddleCenter"
$btnClose.ForeColor = [System.Drawing.Color]::FromArgb(180, 180, 180)
$btnClose.BackColor = [System.Drawing.Color]::Transparent
$btnClose.Font = New-Object System.Drawing.Font("Segoe UI", 8)
$btnClose.Cursor = [System.Windows.Forms.Cursors]::Hand
$btnClose.Add_Click({ $form.Close() })
$header.Controls.Add($btnClose)

$status = New-Object System.Windows.Forms.Label
$status.Text = "connecting..."
$status.Dock = "Bottom"
$status.Height = 24
$status.ForeColor = [System.Drawing.Color]::FromArgb(140, 140, 150)
$status.BackColor = [System.Drawing.Color]::FromArgb(14, 14, 18)
$status.Font = New-Object System.Drawing.Font("Consolas", 8)
$status.TextAlign = "MiddleLeft"
$status.Padding = New-Object System.Windows.Forms.Padding(8, 0, 0, 0)
$form.Controls.Add($status)

$feed = New-Object System.Windows.Forms.ListBox
$feed.Dock = "Bottom"
$feed.Height = 110
$feed.BackColor = [System.Drawing.Color]::FromArgb(12, 12, 16)
$feed.ForeColor = [System.Drawing.Color]::FromArgb(170, 200, 255)
$feed.Font = New-Object System.Drawing.Font("Consolas", 8)
$feed.IntegralHeight = $false
$feed.BorderStyle = "None"
$form.Controls.Add($feed)

$pic = New-Object System.Windows.Forms.PictureBox
$pic.Dock = "Fill"
$pic.SizeMode = "Zoom"
$pic.BackColor = [System.Drawing.Color]::FromArgb(6, 6, 8)
$form.Controls.Add($pic)
$pic.BringToFront()
$feed.BringToFront()
$status.BringToFront()

$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form.Location = New-Object System.Drawing.Point(($area.Right - $form.Width - 18), ($area.Bottom - $form.Height - 18))

$script:drag = $false
$script:dragStart = [System.Drawing.Point]::Empty
$header.Add_MouseDown({
  param($s, $e)
  if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
    $script:drag = $true
    $script:dragStart = $e.Location
  }
})
$header.Add_MouseMove({
  param($s, $e)
  if ($script:drag) {
    $form.Location = New-Object System.Drawing.Point(
      ($form.Left + $e.X - $script:dragStart.X),
      ($form.Top + $e.Y - $script:dragStart.Y)
    )
  }
})
$header.Add_MouseUp({ param($s, $e) $script:drag = $false })

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 70
$timer.Add_Tick({
  if ($script:busy) { return }
  $script:busy = $true
  try {
    $form.KeepTopmost()
    $url = "http://127.0.0.1:$Port/api/screenshot"
    try {
      $task = $http.GetAsync($url)
      if (-not $task.Wait(700)) {
        $status.Text = "LIVE | waiting for frames..."
        return
      }
      $resp = $task.Result
      if (-not $resp.IsSuccessStatusCode) {
        $status.Text = "LIVE | no shot yet..."
        return
      }
      $src = "browser"
      try { $src = $resp.Headers.GetValues("X-Agentcursor-Source")[0] } catch { }
      $script:source = $src
      $bytes = $resp.Content.ReadAsByteArrayAsync().Result
      $md5 = [System.Security.Cryptography.MD5]::Create()
      $hash = [BitConverter]::ToString($md5.ComputeHash($bytes))
      $md5.Dispose()
      if ($hash -ne $script:lastHash) {
        $script:lastHash = $hash
        $ms = New-Object System.IO.MemoryStream(,$bytes)
        $img = [System.Drawing.Image]::FromStream($ms)
        $old = $pic.Image
        $pic.Image = $img
        if ($old) { $old.Dispose() }
      }
      $script:frames++
      if ($script:fpsAt.ElapsedMilliseconds -ge 1000) {
        $script:fps = $script:frames
        $script:frames = 0
        $script:fpsAt.Restart()
      }
      $kb = [Math]::Round($bytes.Length / 1024.0, 1)
      $act = if ($script:running) { "RUNNING " + $script:lastTool } else { "idle | " + $script:lastTool }
      $status.Text = "LIVE | " + $src + " | " + $script:fps + " fps | " + $kb + " KB | " + $act
      if ($script:running) { $title.ForeColor = [System.Drawing.Color]::FromArgb(255, 200, 80) }
      else { $title.ForeColor = [System.Drawing.Color]::FromArgb(120, 255, 160) }
    } catch {
      $status.Text = "LIVE | reconnecting..."
    }
  } finally {
    $script:busy = $false
  }
})
$timer.Start()

$evTimer = New-Object System.Windows.Forms.Timer
$evTimer.Interval = 400
$evTimer.Add_Tick({
  if ($script:evBusy) { return }
  $script:evBusy = $true
  try {
    $u = "http://127.0.0.1:$Port/api/events?since=" + $script:lastId
    $t = $http.GetAsync($u)
    if (-not $t.Wait(350)) { return }
    $r = $t.Result
    if (-not $r.IsSuccessStatusCode) { return }
    $json = $r.Content.ReadAsStringAsync().Result
    $j = $json | ConvertFrom-Json
    if ($j.lastId) { $script:lastId = [int]$j.lastId }
    foreach ($e in @($j.events)) {
      if (-not $e) { continue }
      $line = ("{0} {1} {2}" -f (Get-Date -Format HH:mm:ss), $e.tool, $e.detail)
      [void]$feed.Items.Insert(0, $line)
      while ($feed.Items.Count -gt 30) { $feed.Items.RemoveAt($feed.Items.Count - 1) }
      $script:lastTool = [string]$e.tool
    }
    if ($j.activity) {
      $script:running = [bool]$j.activity.running
      if ($j.activity.tool) { $script:lastTool = [string]$j.activity.tool }
    }
  } catch { }
  finally { $script:evBusy = $false }
})
$script:lastTool = "standby"
$evTimer.Start()

[System.Windows.Forms.Application]::Run($form)
$timer.Stop()
$timer.Dispose()
$evTimer.Stop()
$evTimer.Dispose()
$http.Dispose()
if ($pic.Image) { $pic.Image.Dispose() }
`;
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function liveViewPid() {
  try {
    const f = livePidFile();
    if (!existsSync3(f)) return null;
    const raw = readFileSync5(f, "utf8").trim();
    if (!raw) return null;
    const pid = Number(raw);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    return isAlive(pid) ? pid : null;
  } catch {
    return null;
  }
}
function stopLiveView() {
  const existing = liveViewPid();
  if (existing) {
    try {
      process.kill(existing);
    } catch {
    }
  }
  try {
    writeFileSync3(livePidFile(), "");
  } catch {
  }
  return existing !== null;
}
async function startLiveView(httpPort) {
  const existing = liveViewPid();
  if (existing) return existing;
  const ps1 = liveScriptFile();
  writeFileSync3(ps1, "\uFEFF" + LIVE_VIEW_PS1, "utf8");
  const errLog = join6(tmpdir5(), "agentcursor-live-view.err.log");
  const outLog = join6(tmpdir5(), "agentcursor-live-view.out.log");
  try {
    writeFileSync3(errLog, "", "utf8");
    writeFileSync3(outLog, "", "utf8");
  } catch {
  }
  const cmd = `$psi = New-Object System.Diagnostics.ProcessStartInfo; $psi.FileName = 'powershell.exe'; $psi.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "${ps1}" -Port ${httpPort}'; $psi.UseShellExecute = $true; $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Normal; $p = [System.Diagnostics.Process]::Start($psi); Write-Output $p.Id`;
  return await new Promise((resolve, reject) => {
    const child = spawn4("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", cmd], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let out = "";
    let err = "";
    const finish = (pid, ok) => {
      try {
        writeFileSync3(livePidFile(), ok ? String(pid) : "");
      } catch {
      }
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
      }
      const found = findLivePowerShell(ps1);
      if (found) {
        finish(found, true);
        resolve(found);
        return;
      }
      reject(new Error(`live view spawn timeout: ${err || out}`));
    }, 8e3);
    child.stdout?.on("data", (d) => {
      out += String(d);
      const pid = Number(out.trim().split(/\s+/).pop());
      if (Number.isFinite(pid) && pid > 0) {
        clearTimeout(timer);
        finish(pid, true);
        resolve(pid);
      }
    });
    child.stderr?.on("data", (d) => {
      err += String(d);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      const found = findLivePowerShell(ps1);
      if (found) {
        finish(found, true);
        resolve(found);
        return;
      }
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const pid = Number(out.trim().split(/\s+/).pop());
      if (Number.isFinite(pid) && pid > 0) {
        finish(pid, true);
        resolve(pid);
        return;
      }
      const found = findLivePowerShell(ps1);
      if (found) {
        finish(found, true);
        resolve(found);
        return;
      }
      reject(new Error(`live view spawn failed (code ${code}): ${err || out}`));
    });
  });
}
function findLivePowerShell(ps1Path) {
  try {
    const out = execSync(`wmic process where "name='powershell.exe'" get ProcessId,CommandLine /format:csv`, {
      encoding: "utf8",
      windowsHide: true
    });
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes(ps1Path)) continue;
      const parts = line.split(",");
      const pid = Number(parts[parts.length - 1]?.trim());
      if (Number.isFinite(pid) && pid > 0) return pid;
    }
  } catch {
  }
  return null;
}
async function bridgeConnected(httpPort) {
  try {
    const res = await fetch(`http://127.0.0.1:${httpPort}/api/status`, {
      signal: AbortSignal.timeout(2e3)
    });
    if (!res.ok) return false;
    const j = await res.json();
    return j.extension?.connected === true;
  } catch {
    return false;
  }
}
async function autostart(ports, opts = {}) {
  await ensureDaemon(ports.http);
  const h = await health(ports.http);
  if (!h) throw new Error("daemon did not come up");
  if (!await bridgeConnected(ports.http)) {
    const self = fileURLToPath3(import.meta.url);
    const entry = self.endsWith(".ts") ? join6(process.cwd(), "dist", "index.js") : self.replace(/[/\\]cli[/\\]autostart\.[cm]?js$/i, (m) => m.replace(/cli[/\\]autostart\.[cm]?js$/i, "index.js"));
    const launchEntry = entry.endsWith("index.js") ? entry : join6(process.cwd(), "dist", "index.js");
    spawn4(process.execPath, [launchEntry, "launch"], {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    }).unref();
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (await bridgeConnected(ports.http)) break;
    }
  }
  if (opts.live) await startLiveView(ports.http).catch(() => void 0);
}
async function toggleLiveView(httpPort, on) {
  if (on) {
    try {
      const pid = await startLiveView(httpPort);
      return { on: true, pid };
    } catch {
      return { on: false };
    }
  }
  stopLiveView();
  return { on: false };
}

export {
  desktopSupported,
  liveViewPid,
  autostart,
  toggleLiveView,
  SELF,
  BUILD_ID,
  readVersion,
  resolvePorts,
  createRuntime,
  createMcpServer,
  logFile,
  ensureDaemon,
  connectClient,
  runStdioProxy
};
