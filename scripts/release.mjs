#!/usr/bin/env node
// Cria um zip de release (dist + extension/dist + docs) e imprime o comando de tag.
// Uso: node scripts/release.mjs [version]
// Ex: node scripts/release.mjs 0.4.1-win
import { execSync } from "node:child_process";
import { createWriteStream, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ver = process.argv[2] || JSON.parse(readFileSync("package.json", "utf8")).version;
const out = `agentcursor-${ver}.zip`;
console.log(`[release] version ${ver} → ${out}`);

// garante build
try { execSync("pnpm run build:server", { stdio: "inherit" }); } catch {}
try { execSync("node extension/build.mjs", { stdio: "inherit" }); } catch {}

const files = [
  "dist",
  "extension/dist",
  "extension/manifest.json",
  "extension/icons",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "docs",
  "package.json",
];

const cmd = `powershell -NoProfile -Command "Compress-Archive -Force -Path ${files.join(",")} -DestinationPath ${out}"`;
try {
  execSync(cmd, { stdio: "inherit", shell: "powershell.exe" });
  const st = statSync(out);
  console.log(`[release] wrote ${out} (${(st.size/1024).toFixed(1)} KB)`);
} catch (e) {
  console.error("[release] zip failed, fallback: zip manually", e.message);
}

console.log(`\nPróximos passos:\n  git tag v${ver} && git push origin v${ver}\n  # depois crie a Release no GitHub com ${out} em https://github.com/tremdomn16-png/agentcursor/releases/new\n`);
