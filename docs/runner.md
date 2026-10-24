# Automated benchmark runner

The benchmark workflow runs on GitHub's `ubuntu-24.04` hosted runner. It installs the pinned generators before timing, then builds participants sequentially on one VM. The first profile uses the documentation tools' ordinary output/theme defaults; results compare the complete configured toolchain, not only Markdown parsing engines.

## Triggers

- A weekly scheduled calibration run on the default branch.
- A manual run from **Actions → Static site generator benchmark → Run workflow**, with 50, 500, or 5,000 pages and adjustable repetitions.
- A run when benchmark source, versions, requirements, or workload documentation changes on `main` or a `jan/**` branch.

A normal first run uses 50 pages, three clean/warm build pairs, and ten browser-visible edits per participant. These are calibration values, not enough to publish a ranking. The full target in the measurement plan is ten build samples and 30 edits.

## Timed scenarios

- **Clean build:** remove output and known framework build caches, then time the normal production build. Dependencies are already installed.
- **Warm build:** run the same build again without source changes.
- **Edit to DOM:** keep the preview server and Chromium page open, write a same-length edit marker to one Markdown page, and time until the new marker appears in the page's DOM.

The harness records its initial correctness checks, output size, page count, corpus hash, exact tool/runtime versions, npm lockfile hash, Python environment manifests, runner image, CPU model, and raw samples. It does not yet collect peak process memory or audit every local link; those checks are required before rankings. Failed builds and failed edit probes are retained with their logs; they are not silently omitted from the run artifact.

MkDocs 2.0.dev6's preview server does not refresh an already open browser page after a source edit. The edit scenario is therefore recorded as `unsupported` for this prerelease and does not fail the workflow; its clean and warm builds are still measured.

Each workflow run uploads raw JSONL, an environment manifest, the feature audit, a summary, a generated SVG chart, and build/server logs. The feature audit checks each workload feature against the final generated output and resolves every fixture link and image. Feature failures are reported separately and do not discard valid timing samples. Runs on `main` also commit the report files under `data/results/<run-id>/` so the history can be plotted later. Runs on working branches remain artifacts for review.

## Add or update a version

- Update Node tool versions in `package.json`, then regenerate `package-lock.json` with the pinned Node/npm toolchain.
- Update a Python tool pin in `requirements/` and `data/participants.yml`.
- Update MDU or Hugo's exact version in the workflow and participant list.
- Add the adapter and its generated display name in `scripts/prepare.py` and `scripts/run_benchmark.mjs`. Summary rows and charts are generated from measured participant IDs, so they do not need manual data edits.
- Run the 50-page profile first. Each build counts only if its output passes the current smoke checks; edit timings count only when the browser sees the new marker. Unsupported edit scenarios are recorded separately.

The starter workload contains common Markdown syntax, nested routes, local links, and one fixed-length edit marker. The automated gate verifies page count, unique page markers, semantic HTML for each feature, and fixture link/image targets; it times browser-visible edits for participants whose preview server supports them. This verifies only the shared workload, not every feature each generator supports. The first successful hosted run and its raw observations are linked from the repository README.
