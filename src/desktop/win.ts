import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Rect } from "../protocol";

const run = promisify(execFile);

export interface WinProcess {
  name: string;
  title: string;
  pid: number;
  path?: string;
}

export interface WinUiElement {
  role: string;
  name: string;
  value?: string;
  automationId?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  enabled?: boolean;
  focused?: boolean;
}

export interface WinSnapshot {
  name: string;
  pid: number;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  elements: WinUiElement[];
  truncated: boolean;
}

export interface WinPermissions {
  supported: boolean;
  uiAutomation: boolean;
}

/** PowerShell + UI Automation — sem dependências nativas extras. */
const PS = "powershell.exe";

async function ps(script: string, timeoutMs = 20_000): Promise<string> {
  const { stdout } = await run(
    PS,
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ],
    { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
  );
  return stdout;
}

/** Multi-line UIA scripts: -File, porque -Command multi-linha não carrega Add-Type. */
async function psFile(script: string, timeoutMs = 30_000): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "ac-ps-"));
  const file = join(dir, "run.ps1");
  writeFileSync(file, script, "utf8");
  try {
    const { stdout } = await run(
      PS,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file],
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
    );
    return stdout;
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

export const desktopSupportedWin = (): boolean => process.platform === "win32";

export async function winPermissions(): Promise<WinPermissions> {
  try {
    await ps(
      "Add-Type -AssemblyName UIAutomationClient; [System.Windows.Automation.AutomationElement]::RootElement",
      15_000,
    );
    return { supported: true, uiAutomation: true };
  } catch {
    return { supported: desktopSupportedWin(), uiAutomation: false };
  }
}

/** Lista janelas visíveis de apps (processos com janela). */
export async function winApps(): Promise<WinProcess[]> {
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

/** Abre um app pelo nome (ex: notepad, calc, explorer) ou caminho .exe/.lnk. */
export async function winOpen(app: string): Promise<WinProcess> {
  const before = new Set((await winApps()).map((a) => a.pid));
  const safe = app.replace(/["']/g, "");
  // Tenta Start-Process (cobre .exe, Appx, atalhos)
  try {
    await ps(`Start-Process -FilePath "${safe}" -ErrorAction Stop`, 15_000);
  } catch {
    // fallback: caminho comum do Windows
    const candidates = [
      safe,
      `${safe}.exe`,
      `C:\\Windows\\System32\\${safe}.exe`,
      `C:\\Windows\\System32\\${safe}`,
    ];
    let opened = false;
    for (const c of candidates) {
      try {
        await ps(`Start-Process -FilePath "${c}" -ErrorAction Stop`, 10_000);
        opened = true;
        break;
      } catch {
        /* next */
      }
    }
    if (!opened) throw new Error(`Could not open "${app}". Try a full path or known app name.`);
  }
  // espera a janela aparecer
  const want = safe.toLowerCase().replace(/\.exe$/, "").replace(/^.*[\\/]/, "");
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const apps = await winApps();
    const found = apps.find(
      (a) =>
        !before.has(a.pid) &&
        (a.name.toLowerCase() === want ||
          a.name.toLowerCase().includes(want) ||
          want.includes(a.name.toLowerCase())),
    );
    if (found) return found;
  }
  // última chance: janela nova qualquer
  const apps = await winApps();
  const fresh = apps.find((a) => !before.has(a.pid));
  if (fresh) return fresh;
  throw new Error(`Opened "${app}" but no window appeared.`);
}

const UIA_SCRIPT = `
param([int]$Pid, [int]$Max)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $Pid)
$win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
if (-not $win) { Write-Output '{"error":"window not found"}'; exit 1 }
$rect = $win.Current.BoundingRectangle
$w = if ($rect.Width -gt 0) { [int]$rect.Width } else { 1 }
$h = if ($rect.Height -gt 0) { [int]$rect.Height } else { 1 }
$walk = {
  param($parent, $depth, $list, $max)
  if ($list.Count -ge $max) { return }
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $child = $walker.GetFirstChild($parent)
  while ($child -and $list.Count -lt $max) {
    $c = $child.Current
    $r = $c.BoundingRectangle
    if ($r.Width -gt 0 -and $r.Height -gt 0 -and $r.X -ge -10000) {
      $list.Add([PSCustomObject]@{
        role = $c.ControlType.ProgrammaticName -replace 'ControlType\\.',''
        name = $c.Name
        value = try { $c.ValuePattern.Current.Value } catch { '' }
        automationId = $c.AutomationId
        x = [int]$r.X
        y = [int]$r.Y
        w = [int]$r.Width
        h = [int]$r.Height
        enabled = $c.IsEnabled
        focused = ($c.IsKeyboardFocusable -and $c.HasKeyboardFocus)
      }) | Out-Null
    }
    if ($depth -lt 8) { & $walk $child ($depth + 1) $list $max }
    $child = $walker.GetNextSibling($child)
  }
}
$list = New-Object System.Collections.ArrayList
& $walk $win 0 $list $Max
$result = [PSCustomObject]@{
  name = $win.Current.Name
  pid = $Pid
  title = $win.Current.Name
  x = [int]$rect.X
  y = [int]$rect.Y
  w = $w
  h = $h
  elements = $list
  truncated = ($list.Count -ge $Max)
}
$result | ConvertTo-Json -Compress -Depth 6
`;

/** Lê a janela de um processo via UI Automation. */
export async function winSnapshot(pid: number, max = 150): Promise<WinSnapshot> {
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
    `$result | ConvertTo-Json -Compress -Depth 6`,
  ].join("\n");
  const out2 = await psFile(script, 30_000);
  const trimmed = out2.trim();
  if (!trimmed) throw new Error("UI Automation returned empty output");
  const j = JSON.parse(trimmed) as WinSnapshot & { error?: string };
  if (j.error) throw new Error(j.error);
  if (!Array.isArray(j.elements)) j.elements = [];
  return j;
}

/** Traz a janela para frente (SetForegroundWindow). */
export async function winActivate(pid: number): Promise<void> {
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
  `, 10_000);
}

/**
 * Clique de precisão em x/y (coords de tela absolutas).
 * Usa SendInput via PowerShell — evento real, sem hooks frágeis.
 * Cuidado: só chame após desktop_read/screenshot mapear o alvo.
 */
export async function winClick(x: number, y: number, button: "left" | "right" | "middle" = "left", double = false): Promise<void> {
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
  `, 10_000);
}

/** Move o cursor com curva humana (amostrada no Node, aplicada no PS). */
export async function winMovePath(samples: Array<{ x: number; y: number; t: number }>): Promise<void> {
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
  `, Math.max(10_000, (samples[samples.length - 1]?.t ?? 0) + 5_000));
}

/** Digita texto no campo focado (SendInput Unicode). */
export async function winType(text: string): Promise<void> {
  // Usa Clipboard + Ctrl+V para texto longo/unicode de forma segura e rápida.
  // Para texto curto, SendInput char a char com timing humano.
  const escaped = text.replace(/`/g, "``").replace(/\$/g, "`$").replace(/"/g, '`"');
  if (text.length > 80) {
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
    `, 10_000);
    return;
  }
  // SendInput por caractere
  const chars = [...text];
  const ops: string[] = [];
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
  `, Math.max(15_000, chars.length * 80 + 5_000));
}

/** Pressiona tecla/atalho (enter, esc, ctrl+s, ...). */
export async function winKey(keys: string): Promise<void> {
  const parts = keys.toLowerCase().split("+").map((s) => s.trim());
  const VK: Record<string, number> = {
    enter: 0x0d, return: 0x0d, esc: 0x1b, escape: 0x1b, tab: 0x09,
    space: 0x20, backspace: 0x08, delete: 0x2e, up: 0x26, down: 0x28,
    left: 0x25, right: 0x27, home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22,
    ctrl: 0x11, control: 0x11, shift: 0x10, alt: 0x12, win: 0x5b,
    f1: 0x70, f2: 0x71, f3: 0x72, f4: 0x73, f5: 0x74, f6: 0x75,
    f7: 0x76, f8: 0x77, f9: 0x78, f10: 0x79, f11: 0x7a, f12: 0x7b,
    s: 0x53, a: 0x41, c: 0x43, v: 0x56, x: 0x58, z: 0x5a, y: 0x59,
    p: 0x50, r: 0x52, n: 0x4e, o: 0x4f, w: 0x57, q: 0x51, t: 0x54,
    u: 0x55, i: 0x49, l: 0x4c, k: 0x4b, j: 0x4a, h: 0x48, g: 0x47,
    f: 0x46, d: 0x44,
    "1": 0x31, "2": 0x32, "3": 0x33, "4": 0x34, "5": 0x35,
    "6": 0x36, "7": 0x37, "8": 0x38, "9": 0x39, "0": 0x30,
  };
  const mods = parts.slice(0, -1).map((p) => VK[p]).filter((n): n is number => n !== undefined);
  const main = parts[parts.length - 1]!;
  const mainVk = VK[main];
  if (mainVk === undefined) throw new Error(`Unknown key '${main}'`);
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
  `, 10_000);
}

/** Tela cheia (primary screen) em JPEG — fallback do live view sem extensão. */
export async function winScreenCapture(maxWidth = 960): Promise<{ data: string; mimeType: string; note: string }> {
  const dir = mkdtempSync(join(tmpdir(), "ac-full-"));
  const file = join(dir, "full.jpg");
  const fileArg = file.replace(/'/g, "''");
  // Dir em Node (PS 5.1 -Command quebra em [:8]); captura via -File + Add-Type.
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
    await psFile(script, 20_000);
    const raw = readFileSync(file);
    if (raw.length < 100) throw new Error(`winScreenCapture: short file (${raw.length})`);
    return {
      data: raw.toString("base64"),
      mimeType: "image/jpeg",
      note: `full screen (desktop fallback), max ${maxWidth}px wide`,
    };
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/** Screenshot da janela de um processo (retorna data URL JPEG). */
export async function winScreenshot(pid: number, maxWidth = 1024): Promise<{ data: string; mimeType: string; note: string }> {
  const snap = await winSnapshot(pid, 5).catch(() => null);
  const rect: Rect = snap
    ? { x: snap.x, y: snap.y, width: snap.w, height: snap.h }
    : { x: 0, y: 0, width: 1, height: 1 };
  const dir = mkdtempSync(join(tmpdir(), "ac-shot-"));
  const file = join(dir, "shot.jpg");
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
    20_000,
  );
  try {
    const raw = readFileSync(file);
    const note = `window @${rect.x},${rect.y} ${rect.width}x${rect.height} (screen coords). Image may be downscaled to max ${maxWidth}px wide.`;
    return { data: raw.toString("base64"), mimeType: "image/jpeg", note };
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/** Fecha janela com cuidado: só processos de janela, pede confirmação implícita via force. */
export async function winClose(pid: number, force = false): Promise<void> {
  if (force) {
    await ps(`Stop-Process -Id ${pid} -Force -ErrorAction Stop`, 10_000);
    return;
  }
  await ps(`Stop-Process -Id ${pid} -ErrorAction Stop`, 10_000);
}
