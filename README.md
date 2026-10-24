# Static Site Generator Benchmarks

A reproducible, versioned benchmark for static site generators used to publish technical documentation. MDU is the first-party subject; the comparison set covers both general-purpose generators and documentation-focused tools.

**Status:** hosted calibration results and the first automated feature audit are available. The latest successful run measured eight generators with 50 pages, three clean/no-op build samples, and ten browser edits per supported preview server. It contains 118 valid timings and one explicitly unsupported MkDocs 2.0 edit scenario; these are exploratory measurements, not a ranking. Six generators pass every checked feature in the shared fixture. Hugo has unresolved relative links and image paths; Astro + Starlight has unresolved relative Markdown links. These compatibility findings are reported separately from valid performance samples.

See the [latest run summary](data/results/40139448552-1/summary.md), [raw observations](data/results/40139448552-1/results.jsonl), [feature audit evidence](data/results/40139448552-1/feature-matrix.json), [environment manifest](data/results/40139448552-1/environment.json), and generated [chart](data/results/40139448552-1/chart.svg). The full run and logs are available in [GitHub Actions](https://github.com/capjan/ssg-benchmarks/actions/runs/40139448552). The [first calibration run](data/results/40016228825-1/summary.md) is retained as historical data.

![Latest calibration run: build and edit medians](data/results/40139448552-1/chart.svg)

## What we plan to measure

- Clean production build time
- Repeated and warm build time
- Time from a Markdown edit to updated output and visible browser content
- Generated output size; peak process memory is planned for a later measurement pass
- Feature and output parity, so a fast but incomplete build does not count as a successful run

See the [measurement plan](docs/measurement-plan.md), [runner guide](docs/runner.md), [shared workload](docs/workload.md), [feature matrix](docs/feature-matrix.md), [tool landscape](docs/tool-landscape.md), and [version policy](docs/version-policy.md).

## Initial comparison set

- MDU
- Hugo
- Astro with Starlight
- VitePress
- Docusaurus
- Material for MkDocs
- Zensical

MkDocs 2.0 is included as a separate prerelease experiment, not in stable rankings. Eleventy and Jekyll remain follow-up general-purpose baselines. Material for MkDocs is in its final maintenance period; Zensical is its successor.

## Versioning

Every result will record exact generator, theme/plugin, language runtime, dependency-lock, benchmark source, browser, operating system, and container versions. A latest release is resolved before a run and never left floating inside its raw result. Prereleases are a separate channel.

## Principles

1. Same deterministic content corpus and resource limits for every candidate.
2. Report generated-route, content, feature-parity, and browser-visible edit checks alongside timings; feature mismatches remain visible without discarding otherwise valid timings.
3. Publish raw samples and environment metadata alongside summaries and charts.
4. Keep build performance separate from the performance of deployed pages.
5. Never combine measurements from different hardware profiles into one ranking.
6. Keep all raw observations and retain failed parity checks.

