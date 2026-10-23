# Static Site Generator Benchmarks

A reproducible, versioned benchmark for static site generators used to publish technical documentation. MDU is the first-party subject; the comparison set covers both general-purpose generators and documentation-focused tools.

**Status:** benchmark design and candidate roster. No performance results have been collected or published yet.

## What we plan to measure

- Clean production build time
- Repeated and no-op build time
- Time from a Markdown edit to updated output and visible browser content
- Peak process memory and generated output size
- Feature and output parity, so a fast but incomplete build does not count as a successful run

See the [measurement plan](docs/measurement-plan.md), [shared workload](docs/workload.md), [tool landscape](docs/tool-landscape.md), and [version policy](docs/version-policy.md).

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
2. Verify generated routes, required content, local links, and browser-visible edits before recording timings.
3. Publish raw samples and environment metadata alongside summaries and charts.
4. Keep build performance separate from the performance of deployed pages.
5. Never combine measurements from different hardware profiles into one ranking.

