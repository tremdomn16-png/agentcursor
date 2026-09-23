/** Rastreia a janela/aba em que o agente está trabalhando (para o live view). */

export type FocusMode = "idle" | "browser" | "window";

export interface FocusState {
  mode: FocusMode;
  pid?: number;
  name?: string;
  title?: string;
  at: number;
}

const BROWSER_TOOLS = new Set([
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
  "status",
]);

export class AgentFocus {
  private state: FocusState = { mode: "idle", at: 0 };

  get(): FocusState {
    return this.state;
  }

  label(): string {
    const s = this.state;
    if (s.mode === "browser") return s.name ? `browser · ${s.name}` : "browser";
    if (s.mode === "window") {
      const n = s.name || s.title || "window";
      return s.pid ? `${n} (${s.pid})` : n;
    }
    return "idle";
  }

  noteBrowser(name?: string): void {
    this.state = { mode: "browser", name: name ?? this.state.name, at: Date.now() };
  }

  noteWindow(pid: number, name?: string, title?: string): void {
    if (!Number.isFinite(pid) || pid <= 0) return;
    this.state = { mode: "window", pid, name, title, at: Date.now() };
  }

  /** Called for every tool: browser tools pin browser; desktop tools pin the target app. */
  note(tool: string, detail: string, desktopPid?: number, desktopName?: string): void {
    if (tool.startsWith("desktop_")) {
      if (desktopPid) this.noteWindow(desktopPid, desktopName, detail || undefined);
      else if (this.state.mode === "idle") this.state = { mode: "window", at: Date.now() };
      return;
    }
    if (BROWSER_TOOLS.has(tool) && tool !== "live_view") {
      this.noteBrowser();
    }
  }
}
