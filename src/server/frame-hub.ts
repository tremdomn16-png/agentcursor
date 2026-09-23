import { winScreenCapture, winScreenshot, winSnapshot } from "../desktop/win";
import type { Runtime } from "./create";
import { WindowStream } from "./window-stream";

export interface Frame {
  buf: Buffer;
  source: "browser" | "window" | "desktop";
  focus: string;
  ts: number;
}

/**
 * Capture inteligente: mostra a janela/aba em que o agente está mexendo.
 * - window: stream contínuo do pid focado (fluid, sem respawn por frame)
 * - browser: screenshot da aba (extensão) quando conectada
 * - desktop: fallback tela cheia
 */
export class FrameHub {
  private last: Frame | null = null;
  private inflight: Promise<Frame | null> | null = null;
  private watchers = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastErr = "";
  private winStream = new WindowStream();

  constructor(private readonly rt: Runtime, private readonly minAgeMs = 60) {}

  noteWatcher(active: boolean): void {
    this.watchers = Math.max(0, this.watchers + (active ? 1 : -1));
    if (this.watchers > 0) this.ensureLoop();
    else this.stopLoopSoon();
  }

  private ensureLoop(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.capture(true);
      if (this.watchers <= 0) this.stopLoop();
    }, 70);
    this.timer.unref?.();
  }

  private stopLoopSoon(): void {
    /* keep last frame; loop stops when watchers hit 0 on next tick */
  }

  private stopLoop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.winStream.stop();
  }

  private desktopTarget(): { pid?: number; name?: string; title?: string } {
    const d = this.rt.desktop as unknown as { focusInfo?: () => { pid?: number; name?: string; title?: string } };
    try {
      return d.focusInfo?.() ?? {};
    } catch {
      return {};
    }
  }

  private async captureWindow(pid: number, label: string): Promise<Frame | null> {
    const file = this.winStream.ensure(pid);
    if (!file) return null;
    // dá ~150ms pro primeiro frame do loop PS
    for (let i = 0; i < 8; i++) {
      const raw = this.winStream.read();
      if (raw && raw.length >= 100) {
        const frame: Frame = { buf: raw, source: "window", focus: label, ts: Date.now() };
        this.last = frame;
        return frame;
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    // fallback pontual enquanto o stream sobe
    try {
      const shot = await winScreenshot(pid, 960);
      if (shot.data && shot.data.length >= 100) {
        const frame: Frame = {
          buf: Buffer.from(shot.data, "base64"),
          source: "window",
          focus: label,
          ts: Date.now(),
        };
        this.last = frame;
        return frame;
      }
    } catch (e) {
      this.lastErr = (e as Error).message;
    }
    return null;
  }

  async capture(force = false): Promise<Frame | null> {
    const age = this.last ? Date.now() - this.last.ts : 1e9;
    if (!force && this.last && age < this.minAgeMs) return this.last;
    if (this.inflight) return this.inflight;

    this.inflight = (async () => {
      try {
        const focus = this.rt.focus.get();
        const desk = this.desktopTarget();
        const focusLabel = this.rt.focus.label();

        // 1) Browser: o que a aba mostra (extensão), se o foco for browser
        if (focus.mode === "browser") {
          try {
            const dataUrl = await this.rt.action.screenshot("jpeg");
            const m = /^data:image\/jpeg;base64,(.*)$/s.exec(dataUrl);
            if (m) {
              const frame: Frame = {
                buf: Buffer.from(m[1]!, "base64"),
                source: "browser",
                focus: focusLabel || "browser tab",
                ts: Date.now(),
              };
              this.last = frame;
              return frame;
            }
          } catch {
            /* fall through to window/desktop */
          }
        }

        // 2) Janela desktop que o agente está usando (stream contínuo)
        if (process.platform === "win32") {
          const winPid = focus.mode === "window" && focus.pid ? focus.pid : desk.pid;
          if (winPid) {
            const label =
              focus.mode === "window" && focus.name
                ? focusLabel
                : (desk.name ?? desk.title ?? `pid ${winPid}`);
            const w = await this.captureWindow(winPid, label);
            if (w) return w;
          }
        }

        // 3) Tela cheia (último recurso)
        if (process.platform === "win32") {
          try {
            const shot = await winScreenCapture(960);
            if (shot.data && shot.data.length >= 100) {
              const frame: Frame = {
                buf: Buffer.from(shot.data, "base64"),
                source: "desktop",
                focus: "full screen",
                ts: Date.now(),
              };
              this.last = frame;
              return frame;
            }
          } catch (e) {
            this.lastErr = (e as Error).message;
            process.stderr.write(`agentcursor: frame capture failed: ${this.lastErr}\n`);
          }
        }
        return null;
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  peek(): Frame | null {
    return this.last;
  }

  error(): string {
    return this.lastErr;
  }

  dispose(): void {
    this.stopLoop();
  }
}
