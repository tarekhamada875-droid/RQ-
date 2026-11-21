import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Money-contract drift guard (owner re-confirmed 1 / 10 / 50 on 2026-11-21).
 *
 * docs/PROJECT.md is the product contract every work session must treat as
 * the source of truth, and the server constants are what the app actually
 * debits/grants. These numbers were once changed in approved PRs (#666,
 * #725) without updating the contract — which invites a future session to
 * "fix" the code back to the stale doc numbers, silently changing what
 * garages pay.
 *
 * This test pins BOTH sides together: change one without the other and the
 * build fails until the contract and the code agree again.
 *   - subscriber renewal: 1 credit per renewal (owner decision, PR #725)
 *   - referral reward:    10 credits (owner decision, PR #666)
 *   - new-garage trial:   exactly 50 credits (owner decision, PR #666)
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('money contract drift guard (owner-confirmed 1 / 10 / 50, 2026-11-21)', () => {
  it('docs/PROJECT.md states the confirmed renewal / referral / trial numbers', () => {
    const doc = read('docs/PROJECT.md');
    expect(doc).toMatch(/subscriber renewal debits 1 credit per renewal/);
    expect(doc).toMatch(/A new trial grants exactly 50 credits/);
    expect(doc).toMatch(/The referral reward is 10 credits/);
    // The stale numbers must never come back.
    expect(doc).not.toMatch(/renewal debits 2 credits/);
    expect(doc).not.toMatch(/exactly 100 credits/);
    expect(doc).not.toMatch(/referral reward is 20 credits/);
  });

  it('README and the other money-mentioning docs carry the same confirmed numbers', () => {
    // README repeats the financial summary — it drifted once already.
    const readme = read('README.md');
    expect(readme).toMatch(/monthly subscriber renewal debits 1 credit/);
    expect(readme).not.toMatch(/renewal debits 2/);

    // The contract-test guidance is what new sessions follow when writing tests.
    const guide = read('docs/testing/CONTRACT-TEST-GUIDANCE.md');
    expect(guide).toMatch(/Trial grants use 50 trial credits/);
    expect(guide).toMatch(/referral award is 10 credits/);
    expect(guide).not.toMatch(/Trial grants use 100/);
    expect(guide).not.toMatch(/exactly one 100 EGP delegate commission/);

    // The launch plan (historical) still gets read — its stale numbers must
    // stay annotated, never presented as current.
    const plan = read('docs/LAST-PLAN-BEFORE-PRODUCTION.md');
    expect(plan).toMatch(/Subscriber renewal debits 1 credit/);
    expect(plan).toMatch(/Referral award: 10 credits/);
    expect(plan).not.toMatch(/renewal debits 2/);
    expect(plan).not.toMatch(/2 EGP per subscriber renewal/);
    expect(plan).not.toMatch(/Referral award: 20 credits/);
    expect(plan).not.toMatch(/100 EGP once per garage/);

    // The security rules header repeats the money summary too — it drifted
    // once already.
    const rules = read('firestore.rules');
    expect(rules).toMatch(/subscriber renewal debits 1 credit/);
    expect(rules).toMatch(/Referral reward: 10 credits/);
    expect(rules).not.toMatch(/renewal debits 2/);
    expect(rules).not.toMatch(/Referral reward: 20 credits/);
  });

  it('the server debit/grant paths use the same confirmed numbers', () => {
    // Renewal debit: exactly 1 credit (same as a regular check-in).
    const subscriberRoutes = read('server/subscriberRoutes.ts');
    const renewalIdx = subscriberRoutes.indexOf('debitSubscriberRenewal({');
    expect(renewalIdx).toBeGreaterThan(-1);
    expect(subscriberRoutes.slice(renewalIdx, renewalIdx + 400)).toMatch(/amount: 1,/);

    // Referral reward: 10 credits.
    const ledger = read('server/domain/prepaidCreditLedger.ts');
    expect(ledger).toMatch(/REFERRAL_AWARD_AMOUNT = 10/);

    // Trial grant on creation: 50 credits for admin-created trial garages.
    const create = read('server/garageRoutes/create.ts');
    expect(create).toMatch(/isTrial \? 50 : 0/);

    // Trial grant on approval: 50 credits for delegate-created garages.
    const update = read('server/garageRoutes/update.ts');
    const grantIdx = update.indexOf('grantTrialCredits({');
    expect(grantIdx).toBeGreaterThan(-1);
    expect(update.slice(grantIdx, grantIdx + 300)).toMatch(/amount: 50,/);
  });
});
