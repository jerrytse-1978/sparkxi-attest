#!/usr/bin/env node
// SparkXI prediction attestation — builds today's canonical manifest of ALL currently
// published upcoming predictions, hash-chained to the previous manifest, so that any
// third party can verify a prediction existed (unaltered) BEFORE kickoff.
//
// Data source is the PUBLIC, anonymously-readable projection the web client itself uses
// (https://sparkxi.base44.app/functions/publicDirectory) — so this script needs no
// secrets, and everything in this repo (logic + data + proofs) is publicly auditable.
//
// Output:
//   attestations/YYYY-MM-DD.json   canonical manifest (contains prev-manifest hash → chain)
//   chain.jsonl                    append-only index: {date, sha256} per manifest
//
// The GitHub commit provides one independent timestamp; the OpenTimestamps proof
// (created in the workflow, .json.ots) anchors the same hash into Bitcoin for a second.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const EP = 'https://sparkxi.base44.app/functions/publicDirectory';
const ROOT = new URL('..', import.meta.url).pathname;
const DIR = join(ROOT, 'attestations');
const day = (offset) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
const today = day(0);

async function call(action, extra = {}) {
  const r = await fetch(EP, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
  if (!r.ok) throw new Error(`${action} -> HTTP ${r.status}`);
  const j = await r.json();
  if (j?.ok !== true) throw new Error(`${action} -> ok=${j?.ok}`);
  return j;
}

// 1) fetch every published prediction (paginate per competition; wide forward window)
const comps = (await call('competitions')).competitions || [];
let preds = [];
for (const c of comps) {
  const p = await call('predictions', { competition_code: c.competition_code, from: day(-1), to: day(180), limit: 500 });
  preds = preds.concat(p.predictions || []);
}
if (preds.length === 0) throw new Error('no predictions returned — refusing to attest an empty manifest');

// 2) canonical rows: fixed key order, stable sort, numbers as published
const rows = preds.map((p) => ({
  game_code: p.game_code ?? null,
  competition_code: p.competition_code ?? null,
  kickoff_utc: p.kickoff_utc ?? null,
  home: p.home?.name ?? null,
  away: p.away?.name ?? null,
  model_version: p.model_version ?? null,
  prob_home: p.prob_home ?? null,
  prob_draw: p.prob_draw ?? null,
  prob_away: p.prob_away ?? null,
  most_likely_score: p.most_likely_score ?? null,
  calibrated_prob: p.calibrated_prob ?? null,
  generated_at: p.generated_at ?? null,
  updated_at: p.updated_at ?? null,
})).sort((a, b) => String(a.game_code).localeCompare(String(b.game_code)));

// 3) hash-chain to the previous manifest
mkdirSync(DIR, { recursive: true });
const prevFiles = readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f !== `${today}.json`).sort();
const prevName = prevFiles.at(-1) || null;
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const prev = prevName ? { prev_date: prevName.slice(0, 10), prev_manifest_sha256: sha256(readFileSync(join(DIR, prevName))) } : { prev_date: null, prev_manifest_sha256: null };

const manifest = {
  schema: 'sparkxi-attestation-v1',
  date: today,
  generated_at: new Date().toISOString(),
  source: `${EP} (public read-only projection; anonymously verifiable)`,
  note: 'All predictions published by SparkXI as of generated_at. Verify: recompute sha256 of this file, check it in chain.jsonl, the git commit timestamp, and the OpenTimestamps proof (.ots). A prediction is attested iff it appears in a manifest whose timestamps precede its kickoff_utc.',
  ...prev,
  count: rows.length,
  predictions: rows,
};

const file = join(DIR, `${today}.json`);
const bytes = JSON.stringify(manifest, null, 1) + '\n';
writeFileSync(file, bytes);
const digest = sha256(Buffer.from(bytes));
appendFileSync(join(ROOT, 'chain.jsonl'), JSON.stringify({ date: today, file: `attestations/${today}.json`, sha256: digest }) + '\n');
console.log(`attested ${rows.length} predictions -> attestations/${today}.json`);
console.log(`sha256: ${digest}`);
console.log(`chained to: ${prev.prev_date ?? 'GENESIS'}`);
