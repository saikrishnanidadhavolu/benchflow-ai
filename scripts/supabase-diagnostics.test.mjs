import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backoffMs, classifyFailure, formatAdvice, interpretProbe, summarizePulls } from './supabase-diagnostics.mjs';

const ECR_THEN_GHCR = `Error response from daemon: error from registry: Data limit exceeded
Retrying after 4s: public.ecr.aws/supabase/kong:2.8.1
2.8.1: Pulling from supabase/kong
Status: Downloaded newer image for ghcr.io/supabase/kong:2.8.1`;

test('classifies ECR throttling', () => {
  assert.equal(classifyFailure('Error response from daemon: toomanyrequests: Data limit exceeded'), 'registry_throttled');
  assert.equal(classifyFailure(ECR_THEN_GHCR), 'registry_throttled');
});

test('a later migration error wins over earlier throttling noise', () => {
  const out = `${ECR_THEN_GHCR}\nApplying migration 2026_x.sql...\n{"_tag":"Error","error":{"code":"MigrationApplyError","message":"ERROR: syntax error (SQLSTATE 42601)"}}`;
  assert.equal(classifyFailure(out), 'migration_error');
});

test('classifies docker, disk, ports, network, missing image, auth', () => {
  assert.equal(classifyFailure('Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?'), 'docker_daemon');
  assert.equal(classifyFailure('write /var/lib/docker/tmp: no space left on device'), 'disk_full');
  assert.equal(classifyFailure('Bind for 0.0.0.0:54322 failed: port is already allocated'), 'port_in_use');
  assert.equal(classifyFailure('dial tcp: lookup public.ecr.aws: no such host'), 'network');
  assert.equal(classifyFailure('manifest unknown: manifest unknown'), 'image_not_found');
  assert.equal(classifyFailure('unauthorized: authentication required'), 'registry_auth');
  assert.equal(classifyFailure('something odd'), 'unknown');
});

test('advice never suggests resetting the database as a fix', () => {
  const advice = formatAdvice('registry_throttled');
  assert.match(advice, /docker login/);
  assert.match(advice, /Do NOT run `supabase db reset`/);
  for (const c of ['docker_daemon', 'network', 'image_not_found', 'disk_full', 'port_in_use', 'migration_error', 'unknown']) {
    assert.doesNotMatch(formatAdvice(c), /db reset/);
  }
});

test('summarizes registry fallback and probes', () => {
  assert.deepEqual(summarizePulls(ECR_THEN_GHCR), { ecrThrottled: true, fellBackToGhcr: true, retries: 1 });
  assert.equal(interpretProbe(429), 'throttled');
  assert.equal(interpretProbe(200), 'ok');
  assert.equal(interpretProbe(404), 'missing');
  assert.equal(interpretProbe(0), 'unreachable');
  assert.equal(backoffMs(1), 30_000);
  assert.equal(backoffMs(10), 300_000);
});
