// Runs at document_start in the page realm (isolated world not needed here —
// we want the real console). Buffers errors/warnings so the MCP can attach them
// to auto-reports after navigate/click/type.
(() => {
  type ConsoleEntry = { level: string; text: string; source?: string; url?: string; line?: number };
  interface AgentCursorWindow extends Window {
    __agentcursorConsoleHook?: boolean;
    __agentcursorConsole?: ConsoleEntry[];
  }
  const w = window as AgentCursorWindow;
  if (w.__agentcursorConsoleHook) return;
  w.__agentcursorConsoleHook = true;

  const buf = (w.__agentcursorConsole = [] as ConsoleEntry[]);

  const fmt = (args: unknown[]): string =>
    args
      .map((a) => {
        try {
          if (a instanceof Error) return a.stack ?? a.message;
          if (typeof a === "object") return JSON.stringify(a);
          return String(a);
        } catch {
          return String(a);
        }
      })
      .join(" ");

  const origError = console.error;
  const origWarn = console.warn;

  console.error = function (...args: unknown[]) {
    buf.push({ level: "error", text: fmt(args) });
    if (buf.length > 200) buf.shift();
    return origError.apply(console, args as []);
  };
  console.warn = function (...args: unknown[]) {
    buf.push({ level: "warning", text: fmt(args) });
    if (buf.length > 200) buf.shift();
    return origWarn.apply(console, args as []);
  };

  window.addEventListener("error", (e) => {
    buf.push({
      level: "error",
      text: e.message,
      source: e.filename,
      line: e.lineno,
    });
    if (buf.length > 200) buf.shift();
  });

  window.addEventListener("unhandledrejection", (e) => {
    let text: string;
    try {
      text = e.reason instanceof Error ? (e.reason.stack ?? e.reason.message) : String(e.reason);
    } catch {
      text = String(e.reason);
    }
    buf.push({ level: "error", text: `Unhandled rejection: ${text}` });
    if (buf.length > 200) buf.shift();
  });
})();
