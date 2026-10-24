# Feature parity matrix

This matrix reports a small set of portable Markdown features in the shared 50-page workload. It is evidence for this fixture and configuration, not a claim that a generator supports or lacks a feature in every setup. The candidate version is pinned in [`data/participants.yml`](../data/participants.yml), Node dependency pins are also held in [`package.json`](../package.json), and Python package pins are in [`requirements/`](../requirements/).

The latest audit checked the generated HTML and resolved fixture links/images in [run 40139448552-1](../data/results/40139448552-1/feature-matrix.json). Hugo's link and image paths did not resolve from its generated routes; Astro + Starlight's relative Markdown links did not resolve. These feature findings do not invalidate otherwise valid build or edit timings. “Measured (10)” means ten browser-visible edits were timed. MkDocs 2.0's preview does not refresh an already open browser page after a source edit, so its live edit scenario is unsupported. See the [latest run summary](../data/results/40139448552-1/summary.md).

| Generator | Version | Nested Markdown pages | Headings and paragraphs | Emphasis and inline code | Lists and block quotes | Tables and fenced code | Relative Markdown links | Local images | Live edit to DOM |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MDU | 5.3.0 | Pass | Pass | Pass | Pass | Pass | Pass | Pass | Measured (10) |
| Hugo | 0.167.0 | Pass | Pass | Pass | Pass | Pass | Fail | Fail | Measured (10) |
| Astro + Starlight | Astro 7.4.2; Starlight 0.42.7 | Pass | Pass | Pass | Pass | Pass | Fail | Pass | Measured (10) |
| VitePress | 1.6.4 | Pass | Pass | Pass | Pass | Pass | Pass | Pass | Measured (10) |
| Docusaurus | 3.10.2 | Pass | Pass | Pass | Pass | Pass | Pass | Pass | Measured (10) |
| Material for MkDocs | Material 9.7.7; MkDocs 1.6.1 | Pass | Pass | Pass | Pass | Pass | Pass | Pass | Measured (10) |
| Zensical | 0.0.72 prerelease | Pass | Pass | Pass | Pass | Pass | Pass | Pass | Measured (10) |
| MkDocs 2.0 | 2.0.dev6 prerelease | Pass | Pass | Pass | Pass | Pass | Pass | Pass | Unsupported |

## Out of the first common profile

Material-specific admonitions, tabs and icon sets; Mermaid and other diagram syntaxes; search quality; navigation controls; multilingual content; and theme styling are not timed or claimed as equivalent here. They belong in separate feature profiles after the common-output path is calibrated.
