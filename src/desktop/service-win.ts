import { rankByText } from "../action/service";
import { generateMove, offCenterPoint, sampleDwellMs, samplePressMs } from "../path-engine";
import { distance } from "../path-engine/geometry";
import type { Persona } from "../persona";
import type { MouseButton, Point, Rect } from "../protocol";
import { sleep } from "../util/timing";
import {
  winActivate,
  winApps,
  winClick,
  winKey,
  winMovePath,
  winOpen,
  winPermissions,
  winScreenshot,
  winSnapshot,
  winType,
  type WinProcess,
  type WinSnapshot,
} from "./win";

export interface DesktopElement {
  ref: string;
  role: string;
  name: string;
  value?: string;
  rect: Rect;
  enabled?: boolean;
  focused?: boolean;
}

export interface DesktopView {
  app: { name: string; pid: number; bundleId?: string };
  window: { title: string; x: number; y: number; w: number; h: number };
  elements: DesktopElement[];
  truncated: boolean;
}

export interface DesktopTarget {
  ref?: string;
  text?: string;
  x?: number;
  y?: number;
  app?: string;
}

export interface Screenshot {
  data: string;
  mimeType: string;
  note: string;
}

export interface AxApp {
  name: string;
  pid: number;
  bundleId?: string;
  active?: boolean;
}

export interface AxPermissions {
  accessibility: boolean;
  screenRecording: boolean;
}

/**
 * Desktop Windows: abre apps, lê a UI via UI Automation, clica/digita com
 * persona humana. Cuidado: só janelas visíveis, sem forçar kill sem pedido.
 */
export class DesktopServiceWindows {
  private view: DesktopView | null = null;
  private currentPid: number | undefined;
  private refKeys = new Map<string, string>();
  private refCounter = 0;

  constructor(private readonly persona: Persona) {}

  get background(): boolean {
    return false;
  }

  close(): void {
    /* nada a limpar */
  }

  async cursor(): Promise<Point> {
    // posição aproximada do centro da janela atual (não move o cursor real aqui)
    if (this.view) {
      const w = this.view.window;
      return { x: w.x + w.w / 2, y: w.y + w.h / 2 };
    }
    return { x: 0, y: 0 };
  }

  async permissions(): Promise<AxPermissions> {
    const p = await winPermissions();
    return { accessibility: p.uiAutomation, screenRecording: p.uiAutomation };
  }

  async requestPermission(): Promise<Partial<AxPermissions>> {
    return this.permissions();
  }

  async apps(): Promise<AxApp[]> {
    const list = await winApps();
    return list.map((a, i) => ({
      name: a.title || a.name,
      pid: a.pid,
      bundleId: a.path ?? a.name,
      active: i === 0,
    }));
  }

  async open(app: string): Promise<AxApp> {
    const p = await winOpen(app);
    this.currentPid = p.pid;
    this.view = null;
    this.refKeys.clear();
    this.refCounter = 0;
    await winActivate(p.pid).catch(() => undefined);
    return { name: p.title || p.name, pid: p.pid, bundleId: p.path ?? p.name, active: true };
  }

  /** App/janela em que o agente está trabalhando (para o live view). */
  focusInfo(): { pid?: number; name?: string; title?: string } {
    return {
      pid: this.currentPid,
      name: this.view?.app.name,
      title: this.view?.window.title,
    };
  }

  async read(opts: { app?: string | number; max?: number } = {}): Promise<DesktopView> {
    const pid = this.resolvePid(opts.app);
    if (pid === undefined) {
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
        focused: e.focused,
      })),
    };
    return this.view;
  }

  async find(text: string, opts: { app?: string | number; maxResults?: number } = {}): Promise<DesktopElement[]> {
    const view = await this.read({ app: opts.app, max: 400 });
    return rankByText(view.elements, text).slice(0, opts.maxResults ?? 8);
  }

  async click(t: DesktopTarget & { button?: MouseButton; double?: boolean }): Promise<string> {
    const target = await this.resolve(t);
    await this.front(target.pid);
    await this.moveHuman(target.point, target.width);
    const traits = this.persona.traits();
    await sleep(sampleDwellMs(this.persona.rng, traits.dwellScale));
    await winClick(
      Math.round(target.point.x),
      Math.round(target.point.y),
      t.button ?? "left",
      t.double ?? false,
    );
    await sleep(samplePressMs(this.persona.rng, traits.pressScale));
    return describe(target);
  }

  async move(t: DesktopTarget): Promise<string> {
    const target = await this.resolve(t);
    await this.front(target.pid);
    await this.moveHuman(target.point, target.width);
    return describe(target);
  }

  async type(opts: DesktopTarget & { value: string; clear?: boolean; submit?: boolean }): Promise<void> {
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

  async key(combo: string): Promise<void> {
    await this.front(this.currentPid);
    this.persona.tick();
    await sleep(this.persona.thinkTimeMs(0));
    await winKey(combo);
  }

  async scroll(opts: DesktopTarget & { dy: number; dx?: number }): Promise<void> {
    // Windows: usa PageUp/PageDown aproximado via wheel no centro da janela
    if (opts.ref || opts.text || typeof opts.x === "number") {
      const target = await this.resolve(opts);
      await this.front(target.pid);
      await this.moveHuman(target.point, target.width);
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

  async screenshot(opts: { app?: string | number; ref?: string; maxWidth?: number } = {}): Promise<Screenshot> {
    const pid = this.resolvePid(opts.app) ?? this.currentPid;
    if (pid === undefined) throw new Error("No app to screenshot. Call desktop_open first.");
    return winScreenshot(pid, opts.maxWidth ?? 1024);
  }

  async wiggle(): Promise<void> {
    // não mexe o cursor real do usuário no Windows por segurança
  }

  private resolvePid(app?: string | number): number | undefined {
    if (typeof app === "number") return app;
    if (typeof app === "string" && /^\d+$/.test(app)) return Number(app);
    return this.currentPid;
  }

  private refFor(e: { role: string; name: string; x: number; y: number }): string {
    const key = `${e.role}|${e.name}|${Math.round(e.x / 8)},${Math.round(e.y / 8)}`;
    let ref = this.refKeys.get(key);
    if (!ref) {
      ref = `d${++this.refCounter}`;
      this.refKeys.set(key, ref);
    }
    return ref;
  }

  private element(ref: string): DesktopElement {
    const el = this.view?.elements.find((e) => e.ref === ref);
    if (!el) {
      throw new Error(
        `Unknown ref '${ref}'. Refs expire after scrolling or switching apps; call desktop_read again.`,
      );
    }
    return el;
  }

  private async resolve(
    t: DesktopTarget,
  ): Promise<{ point: Point; width: number; pid?: number; el?: DesktopElement }> {
    if (typeof t.x === "number" && typeof t.y === "number") {
      return { point: { x: t.x, y: t.y }, width: 24, pid: this.currentPid };
    }
    let el: DesktopElement | undefined;
    if (t.ref) {
      el = this.element(t.ref);
    } else if (t.text) {
      el = (await this.find(t.text, { app: t.app as never, maxResults: 1 }))[0];
      if (!el) {
        throw new Error(
          `Nothing labelled "${t.text}" in ${this.view?.app.name ?? "the app"}. Try desktop_read or desktop_screenshot.`,
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
      el,
    };
  }

  private async moveHuman(to: Point, width: number): Promise<void> {
    const from = await this.cursor();
    this.persona.tick();
    await sleep(this.persona.thinkTimeMs(distance(from, to)));
    const samples = generateMove(from, to, this.persona.moveOptions(width));
    await winMovePath(samples);
  }

  private async front(pid?: number): Promise<void> {
    if (pid) await winActivate(pid).catch(() => undefined);
  }
}

function describe(target: { point: Point; el?: DesktopElement }): string {
  const at = `(${Math.round(target.point.x)}, ${Math.round(target.point.y)})`;
  return target.el ? `[${target.el.ref}] ${target.el.role} "${target.el.name}" at ${at}` : at;
}

export function formatView(view: DesktopView, only?: DesktopElement[]): string {
  const w = view.window;
  const lines = [
    `${view.app.name} window "${w.title}" @${w.x},${w.y} ${w.w}x${w.h} (element @x,y = center)`,
  ];
  for (const e of only ?? view.elements) lines.push(formatElement(e));
  if (!only && view.truncated) lines.push("(more elements hidden; pass a larger max)");
  return lines.join("\n");
}

export function formatElement(e: DesktopElement): string {
  const name = e.name ? ` "${e.name}"` : "";
  const value = e.value
    ? ` value="${e.value.length > 60 ? `${e.value.slice(0, 60)}…` : e.value}"`
    : "";
  const flags = `${e.enabled === false ? " disabled" : ""}${e.focused ? " focused" : ""}`;
  const cx = Math.round(e.rect.x + e.rect.width / 2);
  const cy = Math.round(e.rect.y + e.rect.height / 2);
  return `[${e.ref}] ${e.role}${name}${value} @${cx},${cy}${flags}`;
}
