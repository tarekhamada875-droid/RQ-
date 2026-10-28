import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rollbackWorkflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/worker-rollback.yml'),
  'utf8'
);

const releaseWorkflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/production-gate.yml'),
  'utf8'
);

const deployStep = rollbackWorkflow.split('      - name: Deploy selected artifact and verify selected SHA\n')[1] ?? '';

describe('manual Worker rollback workflow', () => {
  it('is a deliberate manual action serialized with production releases', () => {
    expect(rollbackWorkflow).toContain('workflow_dispatch:');
    expect(rollbackWorkflow).toContain('target_sha:');
    expect(rollbackWorkflow).toContain('source_run_id:');
    expect(rollbackWorkflow).not.toMatch(/^  push:/m);
    expect(rollbackWorkflow).not.toMatch(/^  pull_request:/m);
    expect(rollbackWorkflow).toContain('group: production-gate-${{ github.ref }}');
    expect(rollbackWorkflow).toContain('cancel-in-progress: false');
    expect(rollbackWorkflow).toContain('test "$GITHUB_REF" = "refs/heads/main"');
  });

  it('requires the source run to be the successful main Production Gate for the exact selected SHA', () => {
    expect(rollbackWorkflow).toContain("/^[0-9a-f]{40}$/");
    expect(rollbackWorkflow).toContain("/^\\d+$/");
    expect(rollbackWorkflow).toContain("run.name !== 'Production Gate'");
    expect(rollbackWorkflow).toContain("run.path !== '.github/workflows/production-gate.yml'");
    expect(rollbackWorkflow).toContain("run.event !== 'push'");
    expect(rollbackWorkflow).toContain("run.head_branch !== 'main'");
    expect(rollbackWorkflow).toContain('run.head_sha !== targetSha');
    expect(rollbackWorkflow).toContain("run.conclusion !== 'success'");
  });

  it('downloads the artifact named for that exact commit from that exact successful run', () => {
    expect(rollbackWorkflow).toContain('name: rq-production-${{ steps.source.outputs.target_sha }}');
    expect(rollbackWorkflow).toContain('run-id: ${{ steps.source.outputs.source_run_id }}');
    expect(rollbackWorkflow).toContain('test "$(git rev-parse HEAD)" = "$TARGET_SHA"');
    expect(rollbackWorkflow).toContain("grep -q 'commitSha' dist/worker.js");
    expect(rollbackWorkflow).toContain('Read selected release version label');
    expect(rollbackWorkflow).toContain('if [[ ! "$worker_version" =~ ^[A-Za-z0-9._-]+$ ]]');
    expect(releaseWorkflow).toContain('retention-days: 30');
  });

  it('deploys the selected artifact with its selected SHA and smokes only after deploy succeeds', () => {
    const deployCommand = deployStep.indexOf('wrangler deploy');
    const smokeCommand = deployStep.indexOf('tsx tools/release-smoke.ts');

    expect(deployCommand).toBeGreaterThanOrEqual(0);
    expect(smokeCommand).toBeGreaterThan(deployCommand);
    expect(deployStep).toContain('--var WORKER_COMMIT_SHA:$TARGET_SHA');
    expect(deployStep).toContain('SMOKE_EXPECTED_VERSION=$WORKER_VERSION');
    expect(deployStep).toContain('SMOKE_EXPECTED_COMMIT_SHA=$TARGET_SHA');
    expect(deployStep).toContain('&& env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID');
    expect(deployStep).toContain('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
  });
});
