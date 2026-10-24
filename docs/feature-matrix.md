# Feature parity matrix

This first pass records portable Markdown features used by the shared workload. The candidate version is pinned in [`data/participants.yml`](../data/participants.yml), Node dependency pins are also held in [`package.json`](../package.json), and Python package pins are in [`requirements/`](../requirements/).

“Pending” means the detailed feature audit has not yet run for that result; it is not a failure. The first calibration run predates the audit. New runs check semantic HTML on the generated fixture and resolve every fixture link and image, then save evidence in `feature-matrix.json`. “Measured (10)” means ten browser-visible edits were timed. MkDocs 2.0's preview did not refresh an already open browser page in the first run, so that edit scenario was recorded as unsupported. See the [first run summary](../data/results/40016228825-1/summary.md).

| Generator | Version | Nested Markdown pages | Headings and paragraphs | Emphasis and inline code | Lists and block quotes | Tables and fenced code | Relative Markdown links | Local images | Live edit to DOM |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MDU | 5.3.0 | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Measured (10) |
| Hugo | 0.167.0 | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Measured (10) |
| Astro + Starlight | Astro 7.4.2; Starlight 0.42.7 | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Measured (10) |
| VitePress | 1.6.4 | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Measured (10) |
| Docusaurus | 3.10.2 | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Measured (10) |
| Material for MkDocs | Material 9.7.7; MkDocs 1.6.1 | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Measured (10) |
| Zensical | 0.0.72 prerelease | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Measured (10) |
| MkDocs 2.0 | 2.0.dev6 prerelease | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Unsupported |

## Out of the first common profile

Material-specific admonitions, tabs and icon sets; Mermaid and other diagram syntaxes; search quality; navigation controls; multilingual content; and theme styling are not timed or claimed as equivalent here. They belong in separate feature profiles after the common-output path is calibrated.
