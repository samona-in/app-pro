#!/usr/bin/env node
/**
 * Applies `patches/` with patch-package, but only to packages that are actually
 * installed.
 *
 * Vercel builds one workspace (apps/admin) from a monorepo that also contains
 * the React Native apps. Its install does not necessarily put every workspace's
 * dependencies in `node_modules`, so the mobile-only bottom-sheet patch has no
 * target there. patch-package treats a missing target as fatal in CI, which
 * fails `npm install` before Next.js ever runs.
 *
 * A patch whose package is absent has nothing to patch, so skipping it is
 * correct — a patch whose package *is* present still fails loudly, as it should.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const patchDir = join(root, 'patches');

/** `@scope+name+1.2.3.patch` and `name+1.2.3.dev.patch` -> `@scope/name`. */
const packageNameFromPatch = (file) => {
  const withoutSuffix = file.replace(/\.patch$/, '').replace(/\.dev$/, '');
  const lastPlus = withoutSuffix.lastIndexOf('+');
  if (lastPlus === -1) return undefined;
  return withoutSuffix.slice(0, lastPlus).replaceAll('+', '/');
};

const patchFiles = existsSync(patchDir)
  ? readdirSync(patchDir).filter((file) => file.endsWith('.patch'))
  : [];

const installed = (file) => {
  const name = packageNameFromPatch(file);
  // A file we cannot parse is left to patch-package, which will report it.
  return name === undefined || existsSync(join(root, 'node_modules', name));
};

const missing = patchFiles.filter((file) => !installed(file));
const applicable = patchFiles.filter(installed);

for (const file of missing) {
  console.log(`[apply-patches] skipping ${file}: target package is not installed`);
}

if (applicable.length === 0) {
  if (patchFiles.length > 0) console.log('[apply-patches] nothing to apply');
  process.exit(0);
}

/** Runs the local patch-package binary and mirrors its exit status. */
const runPatchPackage = (args) => {
  const binary = join(
    root,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'patch-package.cmd' : 'patch-package',
  );
  const result = spawnSync(binary, args, { cwd: root, stdio: 'inherit' });
  if (result.error) {
    console.error('[apply-patches] could not run patch-package:', result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
};

if (missing.length === 0) {
  runPatchPackage([]);
} else {
  // Apply only the patches whose packages exist. --patch-dir must be relative,
  // so the temporary directory lives beside the repository's own files and is
  // removed before this process exits.
  const temporaryDir = mkdtempSync('.patch-package-');
  try {
    for (const file of applicable) copyFileSync(join(patchDir, file), join(temporaryDir, file));
    runPatchPackage(['--patch-dir', temporaryDir]);
  } finally {
    rmSync(temporaryDir, { recursive: true, force: true });
  }
}
