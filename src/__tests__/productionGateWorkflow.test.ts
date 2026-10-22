import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/production-gate.yml'),
  'utf8'
);
const postMergeWorkflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/deploy-after-merge.yml'),
  'utf8'
);
const workerBuildScript = readFileSync(resolve(process.cwd(), 'tools/build-cloudflare.mjs'), 'utf8');
const smokeScript = readFileSync(resolve(process.cwd(), 'tools/release-smoke.ts'), 'utf8');
const artifactSmokeScript = readFileSync(resolve(process.cwd(), 'tools/worker-artifact-smoke.mjs'), 'utf8');
const ciCheckScript = readFileSync(resolve(process.cwd(), 'tools/ci-check.ts'), 'utf8');
const ciCheckRunnerScript = readFileSync(resolve(process.cwd(), 'tools/ci-check-runner.ts'), 'utf8');

const verifyJob = workflow.split('\n  verify:\n')[1]?.split('\n  deploy:\n')[0] ?? '';
const deployJob = workflow.split('\n  deploy:\n')[1] ?? '';
const explicitDeploySha = '${{ inputs.deploy_sha || github.sha }}';

describe('production release workflow', () => {
  it('validates pull requests and main pushes, and permits explicit main-commit dispatches', () => {
    expect(workflow).toMatch(/^  push:\n    branches: \[main\]$/m);
    expect(workflow).toMatch(/^  pull_request:\n    branches: \[main\]$/m);
    expect(workflow).toMatch(/^  workflow_dispatch:$/m);
    expect(workflow).toContain('deploy_sha:');
    expect(workflow).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
    expect(deployJob).toContain("if: (github.event_name == 'push' || github.event_name == 'workflow_dispatch') && github.ref == 'refs/heads/main'");
    expect(verifyJob).toContain('git merge-base --is-ancestor "$DEPLOY_SHA" origin/main');
  });

  it('installs once and runs the full test suite once without a duplicate subscriber rerun', () => {
    expect(workflow.match(/^\s+run: npm ci\b/gm)).toHaveLength(1);
    expect(workflow.match(/^\s+run: npm run test$/gm)).toHaveLength(1);
    expect(workflow.match(/\bnpx --yes\b/g)).toHaveLength(1);
    expect(workflow).not.toContain('npm test -- --run server/subscriberLifecycle.test.ts');
  });

  it('uploads and deploys the artifact for the exact verified commit', () => {
    expect(workflow).toContain('group: production-gate-${{ github.ref }}');
    expect(verifyJob).toContain('uses: actions/upload-artifact@v4');
    expect(verifyJob).toContain(`name: rq-production-${explicitDeploySha}`);
    expect(verifyJob).toContain(`DEPLOY_SHA: ${explicitDeploySha}`);

    expect(deployJob).toContain('needs: verify');
    expect(deployJob).toContain('uses: actions/download-artifact@v4');
    expect(deployJob).toContain(`name: rq-production-${explicitDeploySha}`);
    expect(deployJob).toContain(`DEPLOY_SHA: ${explicitDeploySha}`);
    expect(deployJob).toContain('--no-bundle');
    expect(deployJob).toContain('--var WORKER_COMMIT_SHA:$SMOKE_EXPECTED_COMMIT_SHA');
    expect(deployJob).toContain(`SMOKE_EXPECTED_COMMIT_SHA: ${explicitDeploySha}`);
    expect(workerBuildScript).toContain('minify: true');
  });

  it('dispatches post-merge only after successful PR verification and avoids duplicate push deployments', () => {
    expect(postMergeWorkflow).toContain('workflows: [Production Gate]');
    expect(postMergeWorkflow).toContain("github.event.workflow_run.event == 'pull_request'");
    expect(postMergeWorkflow).toContain('listPullRequestsAssociatedWithCommit');
    expect(postMergeWorkflow).toContain("run.event === 'push' && run.head_branch === 'main'");
    expect(postMergeWorkflow).toContain('createWorkflowDispatch');
    expect(postMergeWorkflow).toContain("inputs: { deploy_sha: process.env.DEPLOY_SHA }");
  });

  it('imports and smoke-tests the built artifact in local CI, verification, and before deployment', () => {
    const buildCommand = verifyJob.indexOf('run: npm run build');
    const verifySmokeCommand = verifyJob.indexOf('run: npm run smoke:worker-artifact');
    const artifactUpload = verifyJob.indexOf('uses: actions/upload-artifact@v4');
    const artifactDownload = deployJob.indexOf('uses: actions/download-artifact@v4');
    const deploySmokeCommand = deployJob.indexOf('run: npm run smoke:worker-artifact');
    const deployCommand = deployJob.indexOf('wrangler deploy');

    expect(buildCommand).toBeGreaterThanOrEqual(0);
    expect(verifySmokeCommand).toBeGreaterThan(buildCommand);
    expect(artifactUpload).toBeGreaterThan(verifySmokeCommand);
    expect(deploySmokeCommand).toBeGreaterThan(artifactDownload);
    expect(deployCommand).toBeGreaterThan(deploySmokeCommand);
    expect(ciCheckScript).toContain('runCiChecks({ diagnosticsMode })');
    expect(ciCheckRunnerScript).toContain("name: 'Built Cloudflare Worker artifact smoke'");
    expect(ciCheckRunnerScript).toContain("run: () => runCommand('npm run smoke:worker-artifact')");
    expect(artifactSmokeScript).toContain('await import(pathToFileURL(artifactPath).href)');
    expect(artifactSmokeScript).toContain("typeof worker.fetch === 'function'");
    expect(artifactSmokeScript).toContain("method: 'OPTIONS'");
    expect(artifactSmokeScript).toContain("method: 'GET'");
    expect(artifactSmokeScript).not.toContain('FIREBASE_SERVICE_ACCOUNT');
  });

  it('runs the live smoke check only after the verified Worker artifact deploy succeeds', () => {
    const deployCommand = deployJob.indexOf('wrangler deploy');
    const smokeCommand = deployJob.indexOf('tsx tools/release-smoke.ts');

    expect(deployCommand).toBeGreaterThanOrEqual(0);
    expect(smokeCommand).toBeGreaterThan(deployCommand);
    expect(deployJob).toContain('&& env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID tsx tools/release-smoke.ts');
    expect(deployJob).toContain('SMOKE_MAX_ATTEMPTS: 60');
    expect(deployJob).toContain('SMOKE_RETRY_DELAY_MS: 10000');
  });

  it('keeps health and frontend smoke checks read-only GET requests', () => {
    expect(smokeScript).toContain('fetch(`${baseUrl}/api/health`, {');
    expect(smokeScript).toContain("fetch(frontendUrl, { headers: { Accept: 'text/html' } })");
    expect(smokeScript).not.toMatch(/method:\s*['\"](?:POST|PUT|PATCH|DELETE)['\"]/);
  });
});
