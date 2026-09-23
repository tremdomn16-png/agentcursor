import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Ports } from "../server/create";
import { ensureDaemon, health } from "../server/proxy";

const livePidFile = () => join(tmpdir(), "agentcursor-live.pid");
const liveScriptFile = () => join(tmpdir(), "agentcursor-live-view.ps1");

// Pure ASCII + UTF-8 BOM on disk: PS 5.1 mangles fancy glyphs without a BOM.
// Professional floating live: video + agent action feed + status (real-time, not a static print).
const LIVE_VIEW_PS1 = `param([Parameter(Mandatory=$true)][int]$Port)
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

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function liveViewPid(): number | null {
  try {
    const f = livePidFile();
    if (!existsSync(f)) return null;
    const raw = readFileSync(f, "utf8").trim();
    if (!raw) return null;
    const pid = Number(raw);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    return isAlive(pid) ? pid : null;
  } catch {
    return null;
  }
}

function stopLiveView(): boolean {
  const existing = liveViewPid();
  if (existing) {
    try {
      process.kill(existing);
    } catch {
      /* ignore */
    }
  }
  try {
    writeFileSync(livePidFile(), "");
  } catch {
    /* ignore */
  }
  return existing !== null;
}

async function startLiveView(httpPort: number): Promise<number> {
  const existing = liveViewPid();
  if (existing) return existing;
  const ps1 = liveScriptFile();
  // UTF-8 com BOM: PS 5.1 sem BOM le como ANSI e quebra aspas/acentos.
  writeFileSync(ps1, "\uFEFF" + LIVE_VIEW_PS1, "utf8");
  const errLog = join(tmpdir(), "agentcursor-live-view.err.log");
  const outLog = join(tmpdir(), "agentcursor-live-view.out.log");
  try {
    writeFileSync(errLog, "", "utf8");
    writeFileSync(outLog, "", "utf8");
  } catch {
    /* ignore */
  }
  // .NET ProcessStart + ShellExecute: não herda pipes e não trava o CLI.
  const cmd =
    `$psi = New-Object System.Diagnostics.ProcessStartInfo; ` +
    `$psi.FileName = 'powershell.exe'; ` +
    `$psi.Arguments = '-NoProfile -ExecutionPolicy Bypass -File \"${ps1}\" -Port ${httpPort}'; ` +
    `$psi.UseShellExecute = $true; ` +
    `$psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Normal; ` +
    `$p = [System.Diagnostics.Process]::Start($psi); ` +
    `Write-Output $p.Id`;
  return await new Promise<number>((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", cmd], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const finish = (pid: number, ok: boolean) => {
      try {
        writeFileSync(livePidFile(), ok ? String(pid) : "");
      } catch {
        /* ignore */
      }
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      // o form pode estar vivo mesmo se o IPC do spawn falhou
      const found = findLivePowerShell(ps1);
      if (found) {
        finish(found, true);
        resolve(found);
        return;
      }
      reject(new Error(`live view spawn timeout: ${err || out}`));
    }, 8_000);
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

/** Acha o powershell do live view se o pid do spawn se perder. */
function findLivePowerShell(ps1Path: string): number | null {
  try {
    const out = execSync('wmic process where "name=\'powershell.exe\'" get ProcessId,CommandLine /format:csv', {
      encoding: "utf8",
      windowsHide: true,
    });
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes(ps1Path)) continue;
      const parts = line.split(",");
      const pid = Number(parts[parts.length - 1]?.trim());
      if (Number.isFinite(pid) && pid > 0) return pid;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function bridgeConnected(httpPort: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${httpPort}/api/status`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    const j = (await res.json()) as { extension?: { connected?: boolean } };
    return j.extension?.connected === true;
  } catch {
    return false;
  }
}

/**
 * Sobe o stack da IA de uma vez: daemon MCP + janela Chrome dedicada.
 * Usado pelo opencode (autostart) para não precisar de código preparado.
 */
export async function autostart(ports: Ports, opts: { live?: boolean } = {}): Promise<void> {
  await ensureDaemon(ports.http);
  const h = await health(ports.http);
  if (!h) throw new Error("daemon did not come up");

  if (!(await bridgeConnected(ports.http))) {
    const self = fileURLToPath(import.meta.url);
    // num bundle ESM o index é o entry — aponta pro dist/index.js real
    const entry = self.endsWith(".ts")
      ? join(process.cwd(), "dist", "index.js")
      : self.replace(/[/\\]cli[/\\]autostart\.[cm]?js$/i, (m) => m.replace(/cli[/\\]autostart\.[cm]?js$/i, "index.js"));
    const launchEntry = entry.endsWith("index.js") ? entry : join(process.cwd(), "dist", "index.js");
    spawn(process.execPath, [launchEntry, "launch"], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    }).unref();
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (await bridgeConnected(ports.http)) break;
    }
  }

  if (opts.live) await startLiveView(ports.http).catch(() => undefined);
}

/** Abre/fecha o painel live view (sempre no topo). */
export async function toggleLiveView(
  httpPort: number,
  on: boolean,
): Promise<{ on: boolean; pid?: number }> {
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
