#!/usr/bin/env node
// `pnpm db:start`: preflight checks + `supabase start` with classified errors and safe retries.
// Never resets the database and never changes registry configuration unless --registry is passed.
import { spawn, spawnSync } from 'node:child_process';
import { statfsSync } from 'node:fs';
import { backoffMs, CATEGORIES, classifyFailure, formatAdvice, interpretProbe, summarizePulls } from './supabase-diagnostics.mjs';

const args = process.argv.slice(2);
const registryArg = args.find((a) => a.startsWith('--registry='));
const passthrough = args.filter((a) => !a.startsWith('--registry=') && a !== '--skip-probe');
const maxAttempts = Math.max(1, Number(process.env.SUPABASE_START_RETRIES ?? 3));
const env = { ...process.env };
if (registryArg) {
  env.SUPABASE_INTERNAL_IMAGE_REGISTRY = registryArg.split('=')[1];
  console.log(`→ Using registry ${env.SUPABASE_INTERNAL_IMAGE_REGISTRY} for this run only (--registry).`);
}

const sh = (cmd, cmdArgs) => spawnSync(cmd, cmdArgs, { encoding: 'utf8', env });
const fail = (category, extra) => {
  if (extra) console.error(extra);
  console.error(`\n${formatAdvice(category)}\n`);
  process.exit(1);
};

// 1. Docker CLI and daemon
const dockerVersion = sh('docker', ['--version']);
if (dockerVersion.error) fail('docker_missing');
const info = sh('docker', ['info', '--format', '{{.ServerVersion}}']);
if (info.status !== 0) fail('docker_daemon', info.stderr.trim());
console.log(`✓ Docker daemon ${info.stdout.trim()}`);

// 2. Disk space (images need ~5 GB)
try {
  const s = statfsSync('/');
  const freeGb = (s.bavail * s.bsize) / 1e9;
  if (freeGb < 6) console.warn(`! Only ${freeGb.toFixed(1)} GB free on /. Image pulls may fail.`);
} catch {
  /* statfs unsupported on this platform */
}

// 3. Already running?
const status = sh('pnpm', ['exec', 'supabase', 'status', '-o', 'env']);
if (status.status === 0 && /API_URL=/.test(status.stdout)) {
  console.log('✓ Local Supabase is already running. Nothing to do (`pnpm exec supabase status` shows the URLs and keys).');
  process.exit(0);
}

// 4. Registry probe: anonymous token + manifest HEAD for the pinned Postgres image.
async function probe(registry, repo, tag) {
  const tokenUrl = registry === 'ghcr.io' ? `https://ghcr.io/token?scope=repository:${repo}:pull` : `https://public.ecr.aws/token/?scope=repository:${repo}:pull`;
  try {
    const t = await fetch(tokenUrl, { signal: AbortSignal.timeout(10_000) });
    if (!t.ok) return interpretProbe(t.status);
    const { token } = await t.json();
    const m = await fetch(`https://${registry}/v2/${repo}/manifests/${tag}`, {
      method: 'HEAD',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json',
      },
      signal: AbortSignal.timeout(10_000),
    });
    return interpretProbe(m.status);
  } catch {
    return 'unreachable';
  }
}

if (!args.includes('--skip-probe')) {
  const services = sh('pnpm', ['exec', 'supabase', 'services', '-o', 'json']);
  let pgTag = null;
  try {
    pgTag = JSON.parse(services.stdout).services.find((s) => s.name === 'supabase/postgres')?.local ?? null;
  } catch {
    /* older CLI: skip tag-specific probe */
  }
  if (pgTag) {
    const [ecr, ghcr] = await Promise.all([probe('public.ecr.aws', 'supabase/postgres', pgTag), probe('ghcr.io', 'supabase/postgres', pgTag)]);
    console.log(`  Registry probe for supabase/postgres:${pgTag} → public.ecr.aws: ${ecr}, ghcr.io: ${ghcr}`);
    if (ecr === 'throttled' && ghcr === 'ok') console.log('  ECR Public is throttling anonymous pulls; the CLI will retry and fall back to ghcr.io (slower, but works).');
    if (ecr === 'unreachable' && ghcr === 'unreachable') fail('network');
    if (ecr === 'missing' && ghcr === 'missing') fail('image_not_found', `supabase/postgres:${pgTag} not found in either registry.`);
  }
}

// 5. supabase start with retries for transient registry/network failures only.
function runStart() {
  return new Promise((resolve) => {
    let output = '';
    const child = spawn('pnpm', ['exec', 'supabase', 'start', ...passthrough], { env });
    const tee = (stream, out) => stream.on('data', (d) => { output += d; out.write(d); });
    tee(child.stdout, process.stdout);
    tee(child.stderr, process.stderr);
    child.on('close', (code) => resolve({ code, output }));
  });
}

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const { code, output } = await runStart();
  const pulls = summarizePulls(output);
  if (code === 0) {
    if (pulls.ecrThrottled) console.log(`\n! Started, but ECR Public throttled ${pulls.retries} pull attempt(s)${pulls.fellBackToGhcr ? ' and images came from ghcr.io' : ''}. See \`pnpm db:start --help-registry\` advice in README.`);
    process.exit(0);
  }
  const category = classifyFailure(output);
  if (!CATEGORIES[category].retryable || attempt === maxAttempts) fail(category, `\nsupabase start failed (attempt ${attempt}/${maxAttempts}).`);
  const wait = backoffMs(attempt);
  console.error(`\n${formatAdvice(category)}\n→ Retrying in ${wait / 1000}s (attempt ${attempt + 1}/${maxAttempts}). Partially pulled layers are kept.\n`);
  sh('pnpm', ['exec', 'supabase', 'stop']);
  await new Promise((r) => setTimeout(r, wait));
}
