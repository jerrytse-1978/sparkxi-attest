# SparkXI Prediction Attestations

**Purpose:** cryptographic proof that every SparkXI prediction was published **before kickoff**
and **never altered afterwards**. This repository is the tamper-evident public record behind
[SparkXI](https://sparkxi-web.vercel.app)'s track record.

Most tipsters ask you to trust their history. We make ours **verifiable**.

## What's here

- `attestations/YYYY-MM-DD.json` — a daily **manifest** of every prediction published at that
  moment (probabilities, model version, kickoff). Each manifest embeds the SHA-256 of the
  previous one (**hash chain** — editing any past manifest breaks every later link).
- `attestations/YYYY-MM-DD.json.ots` — an [OpenTimestamps](https://opentimestamps.org) proof
  anchoring that manifest's hash into the **Bitcoin blockchain**.
- `chain.jsonl` — append-only index of `{date, sha256}`.
- `scripts/attest.mjs` + `.github/workflows/attest.yml` — the entire pipeline. It reads only
  SparkXI's **public** data endpoint and uses **no secrets**, so the process itself is auditable.

## How to verify a prediction

1. Pick any manifest dated **before** the match's `kickoff_utc` and find the prediction row.
2. Recompute the manifest's hash and compare with `chain.jsonl`:
   `shasum -a 256 attestations/2026-07-24.json`
3. Check the **git commit timestamp** of that manifest (GitHub's servers, not ours).
4. Independently verify the **Bitcoin anchor**:
   `pip install opentimestamps-client && ots verify attestations/2026-07-24.json.ots`
5. Confirm the hash chain: the manifest's `prev_manifest_sha256` must equal the recomputed
   hash of the previous day's file.

If all checks pass, the prediction provably existed, exactly as shown, before the match was
played — attested by two systems we do not control (GitHub's history and Bitcoin).

## Honest scope

- The verifiable record **starts at this repository's first commit**. Predictions graded
  before then are labelled *pre-attestation* on the site and claim no such proof.
- Manifests may be re-issued during the same day (last write wins); every version is still
  pre-kickoff for the matches it covers, and the git history preserves each issue.
- `.ots` proofs may be *pending* for a few hours until the Bitcoin anchor confirms; the
  workflow upgrades them automatically on later runs.

## Disclaimer

Attestation proves **when** predictions were published — not that they win. SparkXI's model
performance (including its misses and full calibration) is published openly on the site.
Nothing here is betting advice; no outcome is guaranteed.
