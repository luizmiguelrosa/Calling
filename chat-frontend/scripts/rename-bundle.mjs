// Produces the project's release artifacts from what Tauri emits, under the
// naming convention `Talk_v<version>_<arch>`:
//
//   Talk_v<version>_<arch>.exe          portable (the raw binary)
//   Talk_v<version>_<arch>-setup.exe    NSIS installer
//   Talk_v<version>_<arch>_en-US.msi    MSI
//
// Tauri v2 has no config option for the bundle file name, so this runs after
// `tauri build` (wired as the `posttauri` npm script) and rewrites the names in
// place, then copies the raw binary out as the portable build. It is
// idempotent: already-renamed artifacts are left untouched, and a run with no
// matching files (for example after `tauri dev`) is a no-op.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
} from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const tauriDir = join(scriptDir, '..', 'src-tauri');
const confPath = join(tauriDir, 'tauri.conf.json');

if (!existsSync(confPath)) {
  console.error(`[rename-bundle] tauri.conf.json not found at ${confPath}`);
  process.exit(1);
}

const { productName, version } = JSON.parse(readFileSync(confPath, 'utf8'));

const releaseDir = join(tauriDir, 'target', 'release');
const bundleRoot = join(releaseDir, 'bundle');

const archNames = { x64: 'x64', arm64: 'arm64', ia32: 'x86' };
const arch = archNames[process.arch] ?? process.arch;
const exeExt = process.platform === 'win32' ? '.exe' : '';

// `Talk_1.0.3_x64-setup.exe` -> `Talk_v1.0.3_x64-setup.exe`
const oldPrefix = `${productName}_${version}_`;
const newPrefix = `${productName}_v${version}_`;

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

let renamed = 0;
if (existsSync(bundleRoot)) {
  for (const file of walk(bundleRoot)) {
    const name = basename(file);
    if (!name.startsWith(oldPrefix)) continue;

    const next = `${newPrefix}${name.slice(oldPrefix.length)}`;
    if (next === name) continue;

    renameSync(file, join(dirname(file), next));
    console.log(`[rename-bundle] ${name} -> ${next}`);
    renamed++;
  }
}

// The portable build is the raw binary, which Tauri names after the Cargo
// package. Copy it out so the installer and the portable can coexist as
// distinct release assets.
const cargoToml = readFileSync(join(tauriDir, 'Cargo.toml'), 'utf8');
const binName = cargoToml.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1] ?? productName.toLowerCase();
const binPath = join(releaseDir, `${binName}${exeExt}`);

let portable = false;
if (existsSync(binPath)) {
  const dest = join(bundleRoot, 'portable', `${productName}_v${version}_${arch}${exeExt}`);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(binPath, dest);
  console.log(`[rename-bundle] portable -> ${dest}`);
  portable = true;
}

if (!renamed && !portable) {
  console.log('[rename-bundle] No artifacts to process.');
}
