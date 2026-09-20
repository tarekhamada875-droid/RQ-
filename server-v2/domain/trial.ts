export type TrialDecision = Readonly<{
  eligible: boolean;
  reason: 'eligible' | 'already_used' | 'invalid_duration';
  endsAt?: string;
}>;

export function evaluateTrialEligibility(input: Readonly<{
  alreadyUsed: boolean;
  durationDays: number;
  now: Date;
}>): TrialDecision {
  if (!Number.isInteger(input.durationDays) || input.durationDays < 1 || input.durationDays > 30) {
    return { eligible: false, reason: 'invalid_duration' };
  }
  if (input.alreadyUsed) return { eligible: false, reason: 'already_used' };
  if (Number.isNaN(input.now.getTime())) throw new Error('Invalid trial start date');
  const endsAt = new Date(input.now.getTime() + input.durationDays * 86_400_000).toISOString();
  return { eligible: true, reason: 'eligible', endsAt };
}
