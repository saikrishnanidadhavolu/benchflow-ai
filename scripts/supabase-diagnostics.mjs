// Classifies `supabase start` failures into actionable categories. Pure functions, unit tested.

export const CATEGORIES = {
  docker_missing: {
    title: 'Docker CLI not found',
    retryable: false,
    advice: ['Install Docker Engine or Docker Desktop: https://docs.docker.com/get-docker/', 'Make sure `docker` is on your PATH, then re-run `pnpm db:start`.'],
  },
  docker_daemon: {
    title: 'Docker daemon is not reachable',
    retryable: false,
    advice: [
      'Start Docker (Docker Desktop, or `sudo systemctl start docker` on Linux).',
      'On Linux, check your user can reach the socket: `docker info` should work without sudo (add yourself to the `docker` group).',
    ],
  },
  registry_throttled: {
    title: 'Container registry is throttling anonymous pulls',
    retryable: true,
    advice: [
      'This is a registry quota/rate limit (HTTP 429 "toomanyrequests" / "Data limit exceeded"), not a problem with your project or database.',
      'The Supabase CLI pulls from public.ecr.aws first and falls back to ghcr.io after retries. Shared or CI IP addresses hit the anonymous quota more often.',
      'Options, from least to most invasive:',
      '  1. Wait a few minutes and re-run `pnpm db:start` (this script retries automatically).',
      '  2. Authenticate to ECR Public for a higher quota: `aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws`',
      '  3. Opt in to GHCR for this run only: `pnpm db:start --registry=ghcr.io` (sets SUPABASE_INTERNAL_IMAGE_REGISTRY for this process; nothing is persisted).',
      'Do NOT run `supabase db reset` for this: it does not affect image pulls and wipes local data.',
    ],
  },
  image_not_found: {
    title: 'Image or tag not found in the registry',
    retryable: false,
    advice: [
      'The CLI asked for an image version the registry does not have.',
      'Check for stale pinned versions in `supabase/.temp/*-version` (created by `supabase link`) and remove the one named in the error.',
      'Otherwise update the CLI: `pnpm up supabase`, then `pnpm exec supabase services` to compare versions.',
    ],
  },
  registry_auth: {
    title: 'Registry rejected the credentials',
    retryable: false,
    advice: ['A stale `docker login` for public.ecr.aws or ghcr.io is being sent. Run `docker logout public.ecr.aws` (or ghcr.io) and retry, or log in again.'],
  },
  network: {
    title: 'Network error reaching the registry',
    retryable: true,
    advice: [
      'Check internet access, DNS, and any proxy: `curl -I https://public.ecr.aws/v2/` and `curl -I https://ghcr.io/v2/` should return HTTP 401.',
      'Behind a proxy, configure it for the Docker daemon (not just your shell): https://docs.docker.com/engine/daemon/proxy/',
    ],
  },
  disk_full: {
    title: 'Not enough disk space for images',
    retryable: false,
    advice: ['Free space for Docker: `docker system df`, then `docker image prune` (removes unused images only). The Supabase images need about 5 GB.'],
  },
  port_in_use: {
    title: 'A required port is already in use',
    retryable: false,
    advice: [
      'Another Supabase project or service is using ports 54321-54324.',
      'Run `pnpm exec supabase status` / `docker ps` to find it and stop it with `supabase stop --project-id <id>`, or change ports in supabase/config.toml.',
    ],
  },
  migration_error: {
    title: 'Containers started but a migration or seed failed',
    retryable: false,
    advice: [
      'This is a SQL error in supabase/migrations or supabase/seed.sql, not an image problem. The failing statement is printed above.',
      'Fix the SQL and run `pnpm db:start` again.',
    ],
  },
  unknown: {
    title: 'supabase start failed',
    retryable: false,
    advice: ['Re-run with `pnpm db:start --debug` for verbose CLI logs.', 'Run `pnpm exec supabase stop` before retrying if containers were left half-started.'],
  },
};

const RULES = [
  ['docker_daemon', /Cannot connect to the Docker daemon|Is the docker daemon running|failed to inspect service|error during connect|permission denied while trying to connect to the Docker daemon/i],
  ['registry_throttled', /toomanyrequests|Data limit exceeded|rate limit|429 Too Many Requests/i],
  ['registry_auth', /unauthorized: authentication required|denied: requested access to the resource is denied|invalid username\/password/i],
  ['image_not_found', /manifest unknown|manifest for .* not found|not found: manifest|repository does not exist/i],
  ['disk_full', /no space left on device/i],
  ['port_in_use', /port is already allocated|address already in use|ports are not available/i],
  ['network', /i\/o timeout|TLS handshake timeout|no such host|connection refused|connection reset by peer|net\/http: request canceled|Client\.Timeout exceeded/i],
  ['migration_error', /MigrationApplyError|SQLSTATE [0-9A-Z]{5}|Error status \d+: .*seed/i],
];

/**
 * Picks the most relevant category for a failed run. Pull throttling followed by a successful GHCR
 * fallback is common, so throttling only wins when no later, more specific failure is present.
 */
export function classifyFailure(output) {
  const text = String(output ?? '');
  const hits = RULES.filter(([, re]) => re.test(text)).map(([cat]) => cat);
  if (hits.length === 0) return 'unknown';
  const priority = ['docker_daemon', 'disk_full', 'port_in_use', 'migration_error', 'image_not_found', 'registry_auth', 'registry_throttled', 'network'];
  return priority.find((c) => hits.includes(c)) ?? hits[0];
}

/** Reports which registries the CLI hit while pulling, e.g. ECR throttled then GHCR fallback. */
export function summarizePulls(output) {
  const text = String(output ?? '');
  return {
    ecrThrottled: /Data limit exceeded|toomanyrequests/i.test(text),
    fellBackToGhcr: /ghcr\.io\/supabase\//.test(text),
    retries: (text.match(/Retrying after \d+s/g) ?? []).length,
  };
}

export function formatAdvice(category) {
  const c = CATEGORIES[category] ?? CATEGORIES.unknown;
  return [`✖ ${c.title}`, ...c.advice.map((a) => (a.startsWith('  ') ? a : `  • ${a}`))].join('\n');
}

export function backoffMs(attempt, baseMs = 30_000) {
  return Math.min(baseMs * 2 ** (attempt - 1), 5 * 60_000);
}

/** Interprets a registry probe status code (anonymous token + manifest HEAD). */
export function interpretProbe(status) {
  if (status === 200) return 'ok';
  if (status === 429) return 'throttled';
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'missing';
  return status ? `http_${status}` : 'unreachable';
}
