import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/production-gate.yml'),
  'utf8'
);
const workerBuildScript = readFileSync(resolve(process.cwd(), 'tools/build-cloudflare.mjs'), 'utf8');

const verifyJob = workflow.split('\n  verify:\n')[1]?.split('\n  deploy:\n')[0] ?? '';
const deployJob = workflow.split('\n  deploy:\n')[1] ?? '';

describe('production release workflow', () => {
  it('installs once and runs the full test suite once without a duplicate subscriber rerun', () => {
    expect(workflow.match(/^\s+run: npm ci\b/gm)).toHaveLength(1);
    expect(workflow.match(/^\s+run: npm run test$/gm)).toHaveLength(1);
    expect(workflow.match(/\bnpx --yes\b/g)).toHaveLength(1);
    expect(workflow).not.toContain('npm test -- --run server/subscriberLifecycle.test.ts');
  });

  it('uploads the verified commit artifact and deploys that artifact only after verification passes', () => {
    expect(workflow).toContain('cancel-in-progress: false');
    expect(verifyJob).toContain('uses: actions/upload-artifact@v4');
    expect(verifyJob).toContain('name: rq-production-${{ github.sha }}');
    expect(verifyJob).toContain('git rev-parse HEAD)" = "$GITHUB_SHA"');

    expect(deployJob).toContain('needs: verify');
    expect(deployJob).toContain('uses: actions/download-artifact@v4');
    expect(deployJob).toContain('name: rq-production-${{ github.sha }}');
    expect(deployJob).toContain('git rev-parse HEAD)" = "$GITHUB_SHA"');
    expect(deployJob).toContain('--no-bundle');
    expect(deployJob).toContain('--var WORKER_COMMIT_SHA:$GITHUB_SHA');
    expect(deployJob).toContain('SMOKE_EXPECTED_COMMIT_SHA: ${{ github.sha }}');
    expect(workerBuildScript).toContain('minify: true');
  });

  it('runs the live smoke check only after the verified Worker artifact deploy succeeds', () => {
    const deployCommand = deployJob.indexOf('wrangler deploy');
    const smokeCommand = deployJob.indexOf('tsx tools/release-smoke.ts');

    expect(deployCommand).toBeGreaterThanOrEqual(0);
    expect(smokeCommand).toBeGreaterThan(deployCommand);
    expect(deployJob).toContain('&& env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID tsx tools/release-smoke.ts');
  });
});
