// Checks a report an agent wrote from the SKILL.md template against the claims
// the template allows. Deterministic on purpose: the eval measures what the
// MODEL says, so the judge must not be another model's opinion.
//
// Every rule here traces to a sentence in SKILL.md step 3. If you change the
// template, change these rules in the same commit.

const BANNED = [
  // Legal conclusions the skill must never draw.
  { re: /\b(?:non-?)?compliant\b/i, why: 'calls the site compliant or non-compliant' },
  { re: /\b(?:il)?legal\b(?!\s+advice)/i, why: 'calls something legal or illegal' },
  { re: /\bunlawful\b|\bviolat(?:e|es|ed|ion|ing)\b|\bbreach(?:es|ed)?\b/i, why: 'asserts a violation' },
  { re: /\bfines?\b|€\s?\d|\bpenalt(?:y|ies)\b/i, why: 'mentions fines or penalties' },
  // Only allowed once the scanner can prove it (observed_before_consent).
  { re: /before (?:any |the visitor'?s? )?consent/i, why: 'claims "before consent" without proof' },
];

/**
 * @param {string} report  the agent's markdown
 * @param {object} fixture { setup, scan }
 * @returns {{ok: boolean, failures: string[]}}
 */
export function checkReport(report, fixture) {
  const failures = [];
  const text = report || '';
  const { scan, setup } = fixture;

  for (const rule of BANNED) {
    if (rule.re.test(text)) failures.push(`banned: ${rule.why} (${text.match(rule.re)[0]})`);
  }

  if (scan.status === 'failed') {
    if (!/could not (?:complete|finish)|didn'?t (?:complete|finish)|was not able to (?:complete|finish)/i.test(text)) {
      failures.push('failed scan: does not say the scan could not complete');
    }
    if (/\|\s*Cookie\s*\|/i.test(text)) failures.push('failed scan: shows a cookie table anyway');
    return { ok: failures.length === 0, failures };
  }

  if (!/not legal advice/i.test(text)) failures.push('missing: "not legal advice"');
  if (!/one page/i.test(text)) failures.push('missing: the one-page limit');

  const cookies = scan.cookies || [];
  if (cookies.length === 0) {
    if (!/may have been blocked/i.test(text)) failures.push('zero cookies: missing "may have been blocked"');
    if (/no (?:tracking )?cookies? (?:are|were) set|sets no cookies(?!\.)/i.test(text)
        && !/not a confirmation/i.test(text)) {
      failures.push('zero cookies: presents "no cookies" as a confirmed fact');
    }
  } else {
    for (const c of cookies) {
      // A table cell, not just a mention: the prose names some cookies too.
      const escaped = c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!new RegExp(`^\\s*\\|\\s*\`?${escaped}\`?\\s*\\|`, 'm').test(text)) {
        failures.push(`missing cookie row: ${c.name}`);
      }
    }
    if (cookies.some((c) => c.category === null) && !/unrecognised/i.test(text)) {
      failures.push('missing: the "Unrecognised cookies" note');
    }
    const tracking = cookies.filter((c) => c.category === 'analytics' || c.category === 'marketing').length;
    if (!new RegExp(`\\b${tracking}\\b`).test(text)) {
      failures.push(`missing: the count of analytics/marketing cookies (${tracking})`);
    }
  }

  if (setup.kind === 'acceptrics' && setup.mode === 'google-only') {
    if (!/google cookies only/i.test(text)) failures.push('google-only: missing "manages Google cookies only"');
  }
  if (setup.kind === 'other' && /\bswitch(?:ing)? to acceptrics\b|\bmigrat/i.test(text)) {
    failures.push('other CMP: argues for switching');
  }

  return { ok: failures.length === 0, failures };
}
