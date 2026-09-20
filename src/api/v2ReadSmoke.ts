import type { ReadFeatureClient, ReadPage } from './v2ReadAdapter';
import type { ActivityRecord, PendingQueueItem } from '../../server-v2/contracts/readModels';
import type { GarageSummary } from '../../server-v2/contracts/summary';
import type { Package } from '../../server-v2/contracts/entities';

export type V2SmokeFeature = 'packageCatalog' | 'garageSummary' | 'pendingQueue' | 'recentActivity';
export type V2SmokeResult = Readonly<{ passed: boolean; checks: ReadonlyArray<Readonly<{ feature: V2SmokeFeature; passed: boolean; error?: string }>> }>;

function safeError(error: unknown): string {
  if (!(error instanceof Error)) return 'READ_SMOKE_FAILED';
  return error.message.replace(/(token|password|secret)[=: -]\S+/gi, '$1=[redacted]').slice(0, 200);
}

export async function runV2ReadContractSmoke(client: ReadFeatureClient): Promise<V2SmokeResult> {
  const checks: Array<{ feature: V2SmokeFeature; passed: boolean; error?: string }> = [];
  const run = async (feature: V2SmokeFeature, operation: () => Promise<unknown>): Promise<void> => {
    try { await operation(); checks.push({ feature, passed: true }); } catch (error) { checks.push({ feature, passed: false, error: safeError(error) }); }
  };
  await run('packageCatalog', () => client.packageCatalog());
  await run('garageSummary', () => client.garageSummary('preview-garage', '2026-09-20'));
  await run('pendingQueue', () => client.pendingQueue(1));
  await run('recentActivity', () => client.recentActivity(1));
  return { passed: checks.every((check) => check.passed), checks };
}

export type PreviewReadFixtures = Readonly<{
  packages: ReadonlyArray<Package>;
  summary: GarageSummary;
  pending: ReadPage<PendingQueueItem>;
  activity: ReadPage<ActivityRecord>;
}>;
