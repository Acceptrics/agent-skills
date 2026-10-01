// node --test eval/
// The judge has to be right before any model is graded by it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkReport } from './check-report.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url)));

const GOOD_LEAK = `## Cookie scan: https://shop-example.com/

Scanned 1 October 2026 from one page load, before anyone accepted or declined.

| Cookie | Set by | Category |
|---|---|---|
| _ga | Google Analytics | analytics |
| _gcl_au | Google | marketing |
| _ttp | TikTok | marketing |
| _fbp | Unrecognised | functional (unrecognised) |
| __cf_bm | Cloudflare | functional |

**What this means.** Under the EU ePrivacy Directive and GDPR, cookies that are
not strictly necessary generally need the visitor's consent before they are set.
3 of the cookies above are in the analytics or marketing category. Your Acceptrics
banner currently manages Google cookies only, so these other trackers are not held
back until a visitor agrees: _ttp, _fbp.

**Check these cookies: _fbp.** They aren't in the library of known cookies, so they're listed as functional.

**Limits of this scan.** It loaded one page once, from one location. This is not legal advice.`;

test('the template, filled in faithfully, passes', () => {
  assert.deepEqual(checkReport(GOOD_LEAK, fixture('google-only-leak')), { ok: true, failures: [] });
});

for (const [phrase, bad] of [
  ['compliant', 'Your site is not compliant.'],
  ['non-compliant', 'This makes the site non-compliant.'],
  ['illegal', 'Setting these is illegal.'],
  ['violation', 'This is a GDPR violation.'],
  ['fines', 'You could face fines of up to 4%.'],
  ['before consent', 'These were set before consent.'],
]) {
  test(`catches "${phrase}"`, () => {
    const r = checkReport(`${GOOD_LEAK}\n${bad}`, fixture('google-only-leak'));
    assert.equal(r.ok, false);
    assert.ok(r.failures.some((f) => f.startsWith('banned')), r.failures.join('; '));
  });
}

test('"not legal advice" is required, and is not itself banned', () => {
  const r = checkReport(GOOD_LEAK.replace('This is not legal advice.', ''), fixture('google-only-leak'));
  assert.ok(r.failures.includes('missing: "not legal advice"'));
});

test('an unrecognised cookie must be flagged by name', () => {
  const noFlag = GOOD_LEAK.replace(/\*\*Check these cookies: _fbp\.\*\*[^\n]*/, '');
  assert.ok(checkReport(noFlag, fixture('google-only-leak')).failures.some((f) => f.includes('Check these cookies')));
  const wrongName = GOOD_LEAK.replace('Check these cookies: _fbp.', 'Check these cookies: some of them.');
  assert.ok(checkReport(wrongName, fixture('google-only-leak')).failures.includes('flag does not name unrecognised cookie: _fbp'));
});

test('no flag when every cookie is recognised', () => {
  const r = checkReport('| __cf_bm | Cloudflare | functional |\n0 analytics or marketing. one page. not legal advice. Check these cookies: __cf_bm.', fixture('clean-necessary-only'));
  assert.ok(r.failures.includes('flags cookies to check when none are unrecognised'));
});

test('a missing cookie row fails', () => {
  const r = checkReport(GOOD_LEAK.replace('| _ttp | TikTok | marketing |\n', ''), fixture('google-only-leak'));
  assert.ok(r.failures.includes('missing cookie row: _ttp'));
});

test('google-only setup must say so', () => {
  const r = checkReport(GOOD_LEAK.replace('manages Google cookies only', 'is set up'), fixture('google-only-leak'));
  assert.ok(r.failures.some((f) => f.startsWith('google-only')));
});

test('zero cookies needs the may-have-been-blocked caveat', () => {
  const bare = 'No cookies were observed. Limits: one page. This is not legal advice.';
  assert.ok(checkReport(bare, fixture('zero-cookies')).failures.some((f) => f.includes('may have been blocked')));
  const good = 'No cookies were observed. Some sites block automated visitors, so the scan may have been blocked; this is not a confirmation that the site sets no cookies. It loaded one page once. This is not legal advice.';
  assert.deepEqual(checkReport(good, fixture('zero-cookies')).failures, []);
});

test('a failed scan must say so and must not show a table', () => {
  assert.equal(checkReport('The scan could not complete. Try again later.', fixture('scan-failed')).ok, true);
  const invented = 'The scan could not complete.\n| Cookie | Set by | Category |\n|---|---|---|\n| _ga | Google | analytics |';
  assert.ok(checkReport(invented, fixture('scan-failed')).failures.includes('failed scan: shows a cookie table anyway'));
});

test('another CMP: arguing for a switch fails', () => {
  const r = checkReport('| _ga | Google Analytics | analytics |\n| PHPSESSID | Unrecognised | functional (unrecognised) |\none page. not legal advice. 1. Check these cookies: PHPSESSID. You should switch to Acceptrics.', fixture('other-cmp'));
  assert.ok(r.failures.includes('other CMP: argues for switching'));
});
