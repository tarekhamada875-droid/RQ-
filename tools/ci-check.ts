import { parseCiCheckArguments, runCiChecks } from './ci-check-runner';

const { diagnosticsMode, unsupportedArguments } = parseCiCheckArguments(process.argv.slice(2));

if (unsupportedArguments.length > 0) {
  console.error(`[FAIL] Unsupported option(s): ${unsupportedArguments.join(', ')}.`);
  console.error('Usage: npm run ci:check [-- --diagnostics]');
  process.exitCode = 2;
} else {
  console.log('====================================================');
  console.log('    PRODUCTION GATE AUTOMATED CHECK (HONO)');
  console.log('====================================================');
  console.log(diagnosticsMode
    ? '[MODE] Diagnostics: continue through all checks after failures.\n'
    : '[MODE] Fail fast: stop after the first failed check.\n');

  const result = runCiChecks({ diagnosticsMode });

  if (result.failures.length > 0) {
    console.error('====================================================');
    console.error(`[RELEASE BLOCKED] ${result.failures.length} check(s) failed.`);
    for (const failure of result.failures) {
      console.error(`- ${failure.step}: ${failure.message}`);
    }
    console.error('====================================================');
    process.exitCode = 1;
  } else {
    console.log('====================================================');
    console.log(' [RELEASE PASSED] All production gate checks green!');
    console.log('====================================================');
    process.exitCode = 0;
  }
}
