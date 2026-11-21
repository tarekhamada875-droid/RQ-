import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Zoom-lock contract (PERMANENT OWNER RULE, reconfirmed 2026-11-21).
 *
 * The owner has decided — twice — that zooming is forbidden in RQ: no
 * pinch-zoom, no double-tap zoom, no trackpad/wheel zoom, on every device
 * and every role. The lock lives entirely in index.html:
 *   1. viewport meta carries user-scalable=no + maximum-scale=1 (Android
 *      Chrome and in-app webviews),
 *   2. an inline blocker script kills iOS Safari gesture zoom
 *      (gesturestart/gesturechange/gestureend) and ctrl/cmd wheel zoom
 *      (trackpad pinch arrives as wheel events with ctrlKey set),
 *   3. touch-action: pan-x pan-y on html/body blocks pinch and double-tap
 *      zoom everywhere (Safari ignores user-scalable=no — this is the real
 *      iOS lock).
 *
 * AGENTS.md ("Permanent owner decisions") and docs/PROJECT.md ("UX
 * boundary") record the rule so no future session "fixes" it back, and
 * this test fails the build if any part of the lock disappears. The lock
 * is intentional product behavior — never list it as a bug, dead code, or
 * an accessibility regression in audits or cleanups.
 */

const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
const agents = readFileSync(join(process.cwd(), 'AGENTS.md'), 'utf8');
const projectDoc = readFileSync(join(process.cwd(), 'docs', 'PROJECT.md'), 'utf8');
const indexCss = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8');

describe('zoom-lock contract (permanent owner rule, reconfirmed 2026-11-21)', () => {
  it('viewport meta forbids user scaling on every load', () => {
    expect(html).toMatch(/name="viewport" content="[^"]*user-scalable=no[^"]*"/);
    expect(html).toMatch(/name="viewport" content="[^"]*maximum-scale=1[^"]*"/);
    expect(html).not.toContain('user-scalable=yes');
  });

  it('marks the lock as a permanent owner rule so humans see it too', () => {
    expect(html).toContain('PERMANENT OWNER RULE');
  });

  it('blocks iOS Safari gesture zoom (pinch) at the document level', () => {
    for (const gesture of ['gesturestart', 'gesturechange', 'gestureend']) {
      expect(html).toContain(`addEventListener('${gesture}'`);
    }
    expect(html).toMatch(/passive:\s*false/);
    expect(html).toContain('e.preventDefault()');
  });

  it('blocks ctrl/cmd + wheel zoom and trackpad pinch', () => {
    expect(html).toContain("addEventListener('wheel'");
    expect(html).toContain('e.ctrlKey || e.metaKey');
  });

  it('locks touch-action to panning on html/body (blocks pinch + double-tap)', () => {
    expect(html).toMatch(/touch-action:\s*pan-x\s+pan-y/);
  });

  it('no stylesheet re-allows zoom on html/body', () => {
    // manipulation / auto / pinch-zoom would re-enable zoom; the page-level
    // lock in index.html must stay the only touch-action rule.
    expect(indexCss).not.toMatch(/touch-action:\s*(auto|manipulation|pinch-zoom|none)/);
    expect(indexCss).not.toContain('user-scalable');
  });

  it('the permanent rule is recorded in AGENTS.md and docs/PROJECT.md', () => {
    expect(agents).toContain('Permanent owner decisions');
    expect(agents).toContain('Zoom is forbidden in RQ');
    expect(projectDoc).toContain('Zooming is disabled product-wide');
  });
});
