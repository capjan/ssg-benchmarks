#!/usr/bin/env python3
"""Analyze one benchmark run without pooling hosts, versions, or workloads."""
import argparse
import csv
import hashlib
import json
import math
import random
from collections import Counter, defaultdict
from html import escape
from pathlib import Path
from statistics import median

SCENARIOS = ('clean-build', 'warm-build', 'edit-to-dom')
BOOTSTRAPS = 5000


def quantile(values, fraction):
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    low = math.floor(position)
    high = math.ceil(position)
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def describe(values, scenario, seed=20261025):
    if not values:
        return dict(n=0, median_ms=None, mad_ms=None, min_ms=None, max_ms=None,
                    p95_ms=None, ci95_low_ms=None, ci95_high_ms=None,
                    uncertainty='no valid samples')
    middle = median(values)
    result = dict(n=len(values), median_ms=middle,
                  mad_ms=median([abs(value - middle) for value in values]),
                  min_ms=min(values), max_ms=max(values),
                  p95_ms=quantile(values, .95) if len(values) >= 30 else None,
                  ci95_low_ms=None, ci95_high_ms=None,
                  uncertainty='insufficient build samples (need 10)')
    if scenario == 'edit-to-dom':
        result['uncertainty'] = 'descriptive only: edits share one server/browser session'
    elif len(values) >= 10:
        rng = random.Random(seed)
        estimates = [median(rng.choices(values, k=len(values))) for _ in range(BOOTSTRAPS)]
        result.update(ci95_low_ms=quantile(estimates, .025),
                      ci95_high_ms=quantile(estimates, .975),
                      uncertainty='within-run percentile bootstrap; assumes independent samples')
    return result


def analyze(records, features):
    identities = {(r['run_id'], r['environment_profile_id'], r['corpus_sha256'], r['corpus_size']) for r in records}
    if len(identities) != 1:
        raise ValueError('Analyze exactly one run, environment profile, and corpus at a time')
    versions = defaultdict(set)
    groups = defaultdict(list)
    for record in records:
        versions[record['participant']].add(json.dumps(record['tool_version'], sort_keys=True))
        if record['scenario'] not in SCENARIOS:
            raise ValueError(f"Unknown scenario: {record['scenario']}")
        groups[record['participant'], record['scenario']].append(record)
    if any(len(items) != 1 for items in versions.values()):
        raise ValueError('Participant versions differ within this run')
    rows = []
    for (participant, scenario), samples in sorted(groups.items()):
        counts = Counter(r['status'] for r in samples)
        if set(counts) - {'ok', 'failed', 'unsupported'}:
            raise ValueError('Unknown observation status')
        values = [r['elapsed_ms'] for r in samples if r['status'] == 'ok']
        if any(not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v) or v < 0 for v in values):
            raise ValueError('Successful timings must be finite nonnegative numbers')
        rows.append(dict(participant=participant, scenario=scenario,
                         tool_version=json.loads(next(iter(versions[participant]))),
                         feature_parity=features.get(participant, {}).get('status', 'not audited'),
                         failed=counts['failed'], unsupported=counts['unsupported'],
                         **describe(values, scenario), samples_ms=values))
    return rows


def number(value):
    return '—' if value is None else f'{value:.1f}'


def chart(rows):
    """Each panel has its own linear scale; show every valid observation."""
    participants = sorted({r['participant'] for r in rows})
    width, height = 1260, 150 + 40 * len(participants)
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" role="img" aria-labelledby="title desc">',
             '<title id="title">Within-run timing distributions</title>',
             '<desc id="desc">Dots are individual observations; orange diamonds are medians. Each panel uses a separate millisecond scale. Feature failures are marked.</desc>',
             '<rect width="100%" height="100%" fill="white"/>',
             '<style>text{font-family:system-ui,sans-serif;fill:#172033;font-size:12px}.sample{fill:#4263eb;opacity:.6}.median{fill:#b45309}</style>',
             '<text x="20" y="25" style="font-size:20px">Timing distributions · calibration</text>',
             '<text x="20" y="48">Dots: samples · orange diamond: median · * feature audit failed · axes scale independently</text>']
    for index, participant in enumerate(participants):
        parity = next(r['feature_parity'] for r in rows if r['participant'] == participant)
        parts.append(f'<text x="15" y="{111 + index * 40}">{escape(participant)}{" *" if parity == "fail" else ""}</text>')
    for panel, scenario in enumerate(SCENARIOS):
        x0, plot_width = 210 + panel * 350, 310
        selected = {r['participant']: r for r in rows if r['scenario'] == scenario}
        maximum = max(1, max((r['max_ms'] or 0 for r in selected.values()), default=1)) * 1.05
        parts.append(f'<text x="{x0}" y="78">{scenario} (ms)</text>')
        for tick in range(5):
            x = x0 + plot_width * tick / 4
            parts.append(f'<path d="M{x} 92V{height - 45}" stroke="#e5e9f0"/>')
            parts.append(f'<text x="{x}" y="{height - 26}" text-anchor="middle">{maximum * tick / 4:.0f}</text>')
        for index, participant in enumerate(participants):
            row = selected.get(participant)
            y = 107 + index * 40
            if not row or not row['n']:
                status = 'unsupported' if row and row['unsupported'] else 'no valid samples'
                parts.append(f'<text x="{x0 + 5}" y="{y + 4}">{status}</text>')
                continue
            for sample_index, value in enumerate(row['samples_ms']):
                x = x0 + plot_width * value / maximum
                offset = (sample_index % 5 - 2) * 3
                parts.append(f'<circle cx="{x:.2f}" cy="{y + offset}" r="3" class="sample"><title>{value:.3f} ms</title></circle>')
            x = x0 + plot_width * row['median_ms'] / maximum
            parts.append(f'<path d="M{x:.2f} {y-6}l5 6l-5 6l-5-6Z" class="median"><title>Median {row["median_ms"]:.3f} ms; n={row["n"]}; failed={row["failed"]}</title></path>')
    parts.append('<text x="20" y="' + str(height - 6) + '">Variation within one runner/session does not estimate variation between fresh machines. See statistics.md for failures and uncertainty.</text></svg>')
    return '\n'.join(parts) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('run_dir', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    raw = (args.run_dir / 'results.jsonl').read_bytes()
    records = [json.loads(line) for line in raw.splitlines() if line.strip()]
    feature_path = args.run_dir / 'feature-matrix.json'
    features = json.loads(feature_path.read_text())['participants'] if feature_path.exists() else {}
    rows = analyze(records, features)
    report = dict(schema_version=1, run_id=records[0]['run_id'],
                  environment_profile_id=records[0]['environment_profile_id'],
                  corpus_sha256=records[0]['corpus_sha256'], corpus_size=records[0]['corpus_size'],
                  source_results_sha256=hashlib.sha256(raw).hexdigest(),
                  analyzer_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                  bootstrap_repetitions=BOOTSTRAPS, bootstrap_seed=20261025, groups=rows)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'statistics.json').write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
    fields = [key for key in rows[0] if key != 'samples_ms']
    with (args.output / 'statistics.csv').open('w', newline='') as file:
        writer = csv.DictWriter(file, fieldnames=fields, extrasaction='ignore')
        writer.writeheader()
        for row in rows:
            writer.writerow({**row, 'tool_version': json.dumps(row['tool_version'], sort_keys=True)})
    lines = ['# Within-run statistics', '', f"Run: {report['run_id']}", '',
             'MAD is the median absolute deviation. All valid samples are retained; failed and unsupported observations are counted separately.', '',
             '95% percentile-bootstrap intervals for the median use 5,000 resamples with a fixed seed, only for builds with n ≥ 10. They assume independent observations and describe this run only. Shared host caches can violate this assumption. Edits share one server/browser session, so no confidence interval is reported for them. p95 uses linear interpolation and is shown only for n ≥ 30. Neither threshold makes a ranking reliable; repeat on fresh runners and resolve feature differences first.', '',
             '| Participant | Scenario | Feature audit | n | Failed | Unsupported | Median ms | MAD ms | Min–max ms | p95 ms | Median CI95 ms |',
             '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |']
    for row in rows:
        interval = '—' if row['ci95_low_ms'] is None else f"{number(row['ci95_low_ms'])}–{number(row['ci95_high_ms'])}"
        lines.append(f"| {row['participant']} | {row['scenario']} | {row['feature_parity']} | {row['n']} | {row['failed']} | {row['unsupported']} | {number(row['median_ms'])} | {number(row['mad_ms'])} | {number(row['min_ms'])}–{number(row['max_ms'])} | {number(row['p95_ms'])} | {interval} |")
    lines.extend(['', '![Individual timing samples](distribution.svg)', ''])
    (args.output / 'statistics.md').write_text('\n'.join(lines))
    (args.output / 'distribution.svg').write_text(chart(rows))
    print(f'Analyzed {len(records)} observations in {len(rows)} groups: {args.output}')


if __name__ == '__main__':
    main()
