import { launchCli } from "./cli/launch";
import { runTool } from "./cli/run";
import { autostart } from "./cli/autostart";
import { createRuntime, resolvePorts } from "./server/create";
import { serve } from "./server/http";
import { runStdioProxy } from "./server/proxy";
import { setup } from "./setup/cli";

const [command = "mcp", ...rest] = process.argv.slice(2);
const ports = resolvePorts();

if (command === "serve") {
  await serve(createRuntime(ports), { idleExitMs: rest.includes("--idle-exit") ? 10 * 60_000 : undefined });
} else if (command === "setup") {
  await setup(ports.http, rest);
  process.exit(0);
} else if (command === "launch") {
  await launchCli(ports, rest);
} else if (command === "autostart") {
  // Sobe daemon + janela da IA (e live view se --live). Sai depois de pronto.
  await autostart(ports, { live: rest.includes("--live") });
  process.exit(0);
} else if (command === "mcp") {
  // Autostart implícito no MCP: daemon + janela da IA prontos antes do stdio.
  // Live view só se AGENTCURSOR_LIVE=1 (não abre sozinho; use live_view on).
  if (process.env.AGENTCURSOR_AUTOSTART !== "0") {
    try {
      const live = process.env.AGENTCURSOR_LIVE ?? "0";
      await autostart(ports, { live: live === "1" });
    } catch (e) {
      process.stderr.write(`agentcursor: autostart warning: ${(e as Error).message}\n`);
    }
  }
  await runStdioProxy(ports.http);
} else {
  process.exit(await runTool(ports.http, [command, ...rest]));
}
