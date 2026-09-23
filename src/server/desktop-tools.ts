import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatElement, formatView, type DesktopService } from "../desktop/service";
import type { DesktopServiceWindows } from "../desktop/service-win";
import { readOrDiff } from "../util/diff";
import type { AgentEventBus } from "./events";
import type { AgentFocus } from "./focus";

function text(body: string) {
  return { content: [{ type: "text" as const, text: body }] };
}

function detailOf(args: unknown): string {
  if (args == null || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  const bits: string[] = [];
  for (const k of ["app", "ref", "text", "keys", "into", "find"]) {
    const v = a[k];
    if (v == null) continue;
    const s = String(v);
    bits.push(`${k}=${s.length > 48 ? s.slice(0, 48) + "…" : s}`);
  }
  if (!bits.length && a.x != null) bits.push(`(${a.x},${a.y})`);
  return bits.join(" ");
}

function tracked<T extends object>(
  server: McpServer,
  bus: AgentEventBus | undefined,
  name: string,
  schema: T,
  handler: (args: any) => Promise<any>,
  focus?: AgentFocus,
  desktop?: AnyDesktop,
): void {
  const run = async (args: any) => {
    const detail = detailOf(args);
    const d = desktop as unknown as { focusInfo?: () => { pid?: number; name?: string; title?: string } } | undefined;
    const info = d?.focusInfo?.();
    focus?.note(name, detail, info?.pid, info?.name);
    if (!bus) return handler(args);
    const id = bus.begin(name, detail);
    try {
      const out = await handler(args);
      bus.end(id, true);
      // re-read focus after open/read/click which update currentPid
      const after = d?.focusInfo?.();
      if (after?.pid) focus?.noteWindow(after.pid, after.name, after.title);
      return out;
    } catch (e) {
      bus.end(id, false);
      throw e;
    }
  };
  if (!bus && !focus) {
    server.registerTool(name, schema as never, handler as never);
    return;
  }
  server.registerTool(name, schema as never, run as never);
}

const target = {
  ref: z.string().optional().describe("[dN] ref from desktop_read"),
  text: z.string().optional().describe("visible text or label to target"),
  x: z.number().optional(),
  y: z.number().optional(),
  app: z.string().optional(),
};

const lastRead = new WeakMap<object, string[]>();

type AnyDesktop = DesktopService | DesktopServiceWindows;

export function registerDesktopTools(server: McpServer, desktop: AnyDesktop, bus?: AgentEventBus, focus?: AgentFocus): void {
  const isWin = process.platform === "win32";
  const platformLabel = isWin ? "Windows" : "Mac";
  const tr = (name: string, schema: object, handler: (args: any) => Promise<any>): void =>
    tracked(server, bus, name, schema as never, handler, focus, desktop);

  tr("desktop_apps",
    {
      description: `List running ${platformLabel} apps/windows; * marks the frontmost one.`,
      inputSchema: {},
    },
    async () =>
      text(
        (await desktop.apps())
          .map((a) => `${a.active ? "*" : " "} ${a.name} (pid ${a.pid})`)
          .join("\n"),
      ),
  );

  tr("desktop_open",
    {
      description: `Open or switch to a ${platformLabel} app by name (Notepad, calc, explorer, Slack...) and bring it to the front. Safe: opens, never kills.`,
      inputSchema: { app: z.string() },
    },
    async ({ app }) => {
      const a = await desktop.open(app);
      return text(`${a.name} (pid ${a.pid}) is frontmost`);
    },
  );

  tr("desktop_read",
    {
      description:
        "Read an app window as compact text: buttons, fields, links, menus and visible text, each with a [dN] ref and center point. Costs far fewer tokens than a screenshot, so call it before clicking. `find` returns only the best matches for a label. Defaults to the app you last opened or read.",
      inputSchema: {
        app: z.string().optional(),
        find: z.string().optional(),
        max: z.number().int().min(1).max(500).optional(),
        changes: z.boolean().optional().describe("only what changed since your last read (refs stay valid)"),
      },
    },
    async ({ app, find, max, changes }) => {
      if (find) {
        const matches = await desktop.find(find, { app: app as never });
        return text(matches.length ? matches.map(formatElement).join("\n") : `Nothing matching "${find}".`);
      }
      const lines = formatView(await desktop.read({ app: app as never, max })).split("\n");
      const body = changes ? readOrDiff(lastRead.get(desktop), lines) : lines.join("\n");
      lastRead.set(desktop, lines);
      return text(body);
    },
  );

  tr("desktop_click",
    {
      description:
        "Move the real cursor along a human path and click: a [dN] ref, visible text/label, or screen x/y. Brings the app to the front first. Always desktop_read first so you know the target — precision over speed.",
      inputSchema: {
        ...target,
        button: z.enum(["left", "right", "middle"]).optional(),
        double: z.boolean().optional(),
      },
    },
    async (args) => text(`clicked ${await desktop.click(args)}`),
  );

  tr("desktop_move",
    {
      description: "Move the real cursor to a ref, label, or x/y without clicking (menus, tooltips, hover states).",
      inputSchema: target,
    },
    async (args) => text(`moved to ${await desktop.move(args)}`),
  );

  tr("desktop_type",
    {
      description:
        "Type with human timing. Clicks a field first when given ref, into (label) or x/y; otherwise types into the focused field. clear replaces the current text, submit presses Enter.",
      inputSchema: {
        text: z.string(),
        ref: z.string().optional(),
        into: z.string().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        app: z.string().optional(),
        clear: z.boolean().optional(),
        submit: z.boolean().optional(),
      },
    },
    async ({ text: value, into, ...rest }) => {
      await desktop.type({ ...rest, text: into, value });
      return text(`typed ${value.length} chars${rest.submit ? " and pressed Enter" : ""}`);
    },
  );

  tr("desktop_key",
    {
      description: "Press a key or shortcut in the current app: enter, esc, tab, up, ctrl+s, ctrl+shift+t, ctrl+c.",
      inputSchema: { keys: z.string() },
    },
    async ({ keys }) => {
      await desktop.key(keys);
      return text(`pressed ${keys}`);
    },
  );

  tr("desktop_scroll",
    {
      description:
        "Scroll by dy (positive = down) and optional dx, over a ref, label or x/y (else where the cursor is). Refs expire after scrolling; desktop_read again.",
      inputSchema: { ...target, dy: z.number(), dx: z.number().optional() },
    },
    async (args) => {
      await desktop.scroll(args);
      return text(`scrolled dy=${args.dy}${args.dx ? ` dx=${args.dx}` : ""}`);
    },
  );

  tr("desktop_screenshot",
    {
      description:
        "Screenshot one app window (or the area around a ref), downscaled. Use only when desktop_read text is not enough: canvases, images, custom-drawn UI. The reply explains how to turn image pixels into screen x/y for desktop_click.",
      inputSchema: {
        app: z.string().optional(),
        ref: z.string().optional(),
        maxWidth: z.number().int().min(200).max(2000).optional(),
      },
    },
    async (args) => {
      const shot = await desktop.screenshot(args);
      return {
        content: [
          { type: "image" as const, data: shot.data, mimeType: shot.mimeType },
          { type: "text" as const, text: shot.note },
        ],
      };
    },
  );
}
