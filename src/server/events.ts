/** Ring buffer de ações do agente para o live view. */

export interface AgentEvent {
  id: number;
  t: number;
  tool: string;
  detail: string;
  ok: boolean;
  ms?: number;
}

const MAX = 80;

export class AgentEventBus {
  private seq = 0;
  private items: AgentEvent[] = [];
  private busyTool: string | null = null;
  private busySince = 0;

  begin(tool: string, detail: string): number {
    const id = ++this.seq;
    this.busyTool = tool;
    this.busySince = Date.now();
    this.push({ id, t: Date.now(), tool, detail, ok: true });
    return id;
  }

  end(id: number, ok: boolean): void {
    const e = this.items.find((x) => x.id === id);
    if (e) {
      e.ok = ok;
      e.ms = Date.now() - e.t;
    }
    if (this.busyTool && e && e.tool === this.busyTool) {
      this.busyTool = null;
    }
  }

  push(partial: Omit<AgentEvent, "id"> & { id?: number }): AgentEvent {
    const e: AgentEvent = { id: partial.id ?? ++this.seq, ...partial } as AgentEvent;
    this.items.push(e);
    if (this.items.length > MAX) this.items.splice(0, this.items.length - MAX);
    return e;
  }

  list(since = 0): AgentEvent[] {
    return this.items.filter((e) => e.t > since);
  }

  activity(): { tool: string | null; running: boolean; ageMs: number } {
    const last = this.items[this.items.length - 1];
    if (this.busyTool) {
      return { tool: this.busyTool, running: true, ageMs: Date.now() - this.busySince };
    }
    return {
      tool: last?.tool ?? null,
      running: false,
      ageMs: last ? Date.now() - last.t : 0,
    };
  }

  stats() {
    const a = this.activity();
    return {
      count: this.items.length,
      lastId: this.items[this.items.length - 1]?.id ?? 0,
      activity: a,
      recent: this.items.slice(-12),
    };
  }
}
