import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Stream contínuo de UMA janela (pid): um PowerShell loop grava JPEG em disco;
 * o FrameHub só lê o arquivo — fluido, sem spawn de processo a cada frame.
 */
export class WindowStream {
  private child: ChildProcess | null = null;
  private file = "";
  private dir = "";
  private pid: number | null = null;
  private startedAt = 0;

  ensure(pid: number): string | null {
    if (!Number.isFinite(pid) || pid <= 0) {
      this.stop();
      return null;
    }
    if (this.pid === pid && this.child && !this.child.killed) {
      return this.file;
    }
    this.stop();
    this.dir = mkdtempSync(join(tmpdir(), "ac-winstream-"));
    this.file = join(this.dir, "frame.jpg");
    const script = join(this.dir, "loop.ps1");
    writeFileSync(script, streamScript(pid, this.file), "utf8");
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script],
      { windowsHide: true, stdio: "ignore" },
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
  read(): Buffer | null {
    if (!this.file || !existsSync(this.file)) return null;
    try {
      const st = statSync(this.file);
      // frame “velho” demais => janela morreu ou stream travou
      if (Date.now() - st.mtimeMs > 2500) return null;
      if (st.size < 80) return null;
      return readFileSync(this.file);
    } catch {
      return null;
    }
  }

  isUsable(pid: number): boolean {
    return this.pid === pid && !!this.child && !this.child.killed && Date.now() - this.startedAt > 0;
  }

  stop(): void {
    if (this.child) {
      try {
        this.child.kill();
      } catch {
        /* ignore */
      }
      this.child = null;
    }
    if (this.dir) {
      try {
        rmSync(this.dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      this.dir = "";
      this.file = "";
    }
    this.pid = null;
  }
}

function streamScript(pid: number, outFile: string): string {
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
