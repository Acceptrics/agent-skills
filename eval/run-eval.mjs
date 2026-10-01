// Report eval for the acceptrics-compliance skill.
//
//   node eval/run-eval.mjs --dry-run     show the plan, call nothing
//   node eval/run-eval.mjs               6 fixtures × 2 models, exit 1 on any failure
//
// Each run gives a model SKILL.md as its system prompt plus one fixture (a scan
// result and the setup step 2 found), and asks for step 3's report only. The
// report is graded by check-report.mjs: deterministic rules, no model judge.
// Run it before every release of the skill, and after any change to SKILL.md.
//
// Cost: SKILL.md is ~2.5k tokens, cached after the first call per model, so a
// full run is 12 short requests (well under $1 at list prices).

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, readdirSync } from 'node:fs';
import { checkReport } from './check-report.mjs';

const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5'];
const SKILL = readFileSync(new URL('../acceptrics-compliance/SKILL.md', import.meta.url), 'utf-8');
const FIXTURE_DIR = new URL('./fixtures/', import.meta.url);
const fixtures = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({ name: f.replace(/\.json$/, ''), ...JSON.parse(readFileSync(new URL(f, FIXTURE_DIR), 'utf-8')) }));

function prompt(fx) {
  return [
    'You are partway through the acceptrics-compliance skill. Steps 1 and 2 are done.',
    'Write ONLY the step 3 report for this site, in markdown, exactly as the skill instructs.',
    'Do not start step 4. Today is 1 October 2026.',
    '',
    `Step 2 found: ${JSON.stringify(fx.setup)}`,
    `Scan result: ${JSON.stringify(fx.scan)}`,
  ].join('\n');
}

if (process.argv.includes('--dry-run')) {
  console.log(`${fixtures.length} fixtures × ${MODELS.length} models = ${fixtures.length * MODELS.length} requests`);
  for (const fx of fixtures) console.log(`  ${fx.name.padEnd(22)} ${fx.why}`);
  console.log(`models: ${MODELS.join(', ')}`);
  process.exit(0);
}

const client = new Anthropic();
const results = [];

for (const model of MODELS) {
  for (const fx of fixtures) {
    let report = '';
    let note = '';
    try {
      const response = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        // Report writing is a short, well-specified task: medium effort is set
        // explicitly because the two models default differently.
        output_config: { effort: 'medium' },
        // If a safety classifier declines, re-run on Anthropic's recommended
        // fallback instead of failing the case on a refusal.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        // SKILL.md is identical across all 12 calls: cache it.
        system: [{ type: 'text', text: SKILL, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: prompt(fx) }],
      });
      if (response.stop_reason === 'refusal') {
        note = `refused (${response.stop_details?.category ?? 'no category'})`;
      } else {
        report = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
        if (response.model !== model) note = `served by ${response.model}`;
      }
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) note = 'rate limited';
      else if (err instanceof Anthropic.APIError) note = `API error ${err.status}: ${err.message}`;
      else throw err;
    }

    const verdict = report ? checkReport(report, fx) : { ok: false, failures: [note || 'no report'] };
    results.push({ model, fixture: fx.name, ...verdict, note, report });
    console.log(`${verdict.ok ? 'PASS' : 'FAIL'}  ${model.padEnd(18)} ${fx.name.padEnd(22)} ${note}`);
    for (const f of verdict.failures) console.log(`        - ${f}`);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log('\nFailing reports, for reading:');
  for (const r of failed) console.log(`\n=== ${r.model} / ${r.fixture} ===\n${r.report || r.note}`);
  process.exit(1);
}
