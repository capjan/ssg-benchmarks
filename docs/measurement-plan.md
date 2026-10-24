# Measurement plan

## Goal

Compare the cost of building and editing the same documentation site with MDU and representative static-site tools. Keep measurements repeatable as generator releases change. Report build speed, memory, output size, and the developer feedback loop separately.

## Workload profiles

Use the same generated source corpus for every adapter:

- **Smoke:** 50 pages; validates adapters and feature parity.
- **Medium:** 500 pages; primary comparison.
- **Large:** 5,000 pages; shows scaling behavior.

The corpus is generated deterministically from a committed seed. Each page has unique, fixed-shape content and stable paths. Dependencies and source assets are prepared before timing; dependency installation is measured separately if we decide it is useful.

The long-term plan has two site profiles:

1. **Native-docs profile:** each tool's recommended documentation theme. This represents the complete toolchain, so its numbers must not be presented as a pure engine comparison. The first calibration run uses this profile.
2. **Common-output profile (later phase):** a small, equivalent HTML shell and shared CSS. This aims to isolate generator and adapter work.

## Timed scenarios

| Scenario | Setup | Measurement |
| --- | --- | --- |
| Clean build | Remove generated output and generator caches; keep dependencies installed; start a fresh process | Monotonic wall time from command start to successful exit |
| Warm build | Run the same normal build again with unchanged source and generated output still present | Wall time; note whether the tool performs a full or incremental/no-op build |
| Page edit | Keep the official preview server and one Chromium session running; replace a fixed-length marker in one Markdown page | Time from completed file write to updated generated HTML, and separately to the new marker appearing in the browser DOM |
| Server startup | Start the preview server against the prepared corpus | Time to server-ready signal and time until the target page is usable |

Keep production builds and preview-server measurements separate. Do not count package installation, browser installation, or fixture generation in build time. Include generator-specific page generation, syntax processing, and required plugins.

For the edit scenario, use a browser session because that captures file watching, rebuild, server response, reload/HMR, and DOM update. A file timestamp alone can miss stale output. The browser will stay warm across edits; reset the source marker to the original value and wait for the previous state before each sample.

## Getting stable numbers

- Start with GitHub Actions `ubuntu-24.04` on the standard public-repository runner (4 vCPUs and 16 GB RAM). Record the runner image, CPU model, core count, memory, OS/kernel, filesystem, and runtime versions on every run. The hosted VM is not a dedicated quiet machine and its underlying CPU/image can change, so treat the first runs as calibration and split trend series when the recorded hardware profile changes. If noise prevents useful comparisons, move the same harness to a dedicated runner.
- Never run candidates concurrently. Randomize candidate order within each measurement block to reduce thermal and background-load bias.
- Use a monotonic high-resolution clock for command wall time. The initial harness does not yet collect CPU time, process-tree data, or per-process peak memory; add those before publishing resource comparisons.
- The initial workflow uses three clean/warm build pairs and ten page edits. Those are calibration samples only. Before publishing a ranking, collect at least 10 measured samples for build scenarios and 30 page edits. Increase the sample count if the confidence interval remains wider than 10%; keep all raw observations.
- Report median, p95 where sample count supports it, median absolute deviation, and a bootstrap 95% confidence interval. Do not rank results whose uncertainty overlaps materially.
- Keep browser version, viewport, cache policy, and local-network setup fixed. Disable external requests in benchmark pages.
- Repeat a full comparison after any host, container, runtime, fixture, theme, or benchmark-harness change. Give the new environment a new profile ID; do not blend the two series.

These are initial targets. The first calibration run should measure fixture parity and noise before we publish a ranking.

## Correctness gate

The runner keeps two correctness dimensions separate. Its smoke gate verifies generated page count, each unique page marker, required HTML elements, and browser-visible marker updates. The feature audit records semantic HTML and whether all fixture links and images resolve. A feature mismatch does not invalidate otherwise valid timing samples, but participants with different feature parity must not be presented as equivalent in a ranking. A timing sample is valid only if the adapter:

- exits successfully and emits the expected page count and route markers;
- passes the target-page HTML smoke check;
- reflects the edit marker in generated HTML and in the browser;
- reports no fatal parser or theme errors.

Store failed attempts and feature mismatches with evidence; do not silently discard them. Before publishing a comparative ranking, resolve mismatches in the common profile or separate participants into clearly labeled parity groups.

## Raw data and charts

Write one machine-readable record per sample with a run ID, participant/version, scenario, sample number, elapsed time, output bytes, correctness status, and environment/lockfile identifiers. The first run omits peak RSS; add it before publishing memory comparisons. Preserve raw records and generate summaries and charts from them.

Planned chart views:

- clean and warm build time by generator and corpus size (log scale if needed);
- page-edit-to-DOM latency as distributions, with median and p95;
- peak memory and output size;
- version-over-time trends for the same participant and hardware profile.

The public dashboard should link each point back to its raw data, environment manifest, and feature-parity report.

