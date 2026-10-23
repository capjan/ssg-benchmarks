# Feature parity matrix

This first pass records portable Markdown features used by the shared workload. The candidate version is pinned in [`data/participants.yml`](../data/participants.yml), Node dependency pins are also held in [`package.json`](../package.json), and Python package pins are in [`requirements/`](../requirements/).

“Pending” means per-feature parity has not yet been verified. The smoke gate checks rendered page count, a unique marker on every page, and basic HTML elements on the edit page; it does not yet prove that every link target or image URL resolves. MkDocs 2.0's preview does not refresh an already open browser page after a source edit, so that edit scenario is recorded as unsupported for this prerelease.

| Generator | Version | Nested Markdown pages | Headings and paragraphs | Emphasis and inline code | Lists and block quotes | Tables and fenced code | Relative Markdown links | Local images | Live edit to DOM |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MDU | 5.3.0 | Pass | Pass | Pass | Pass | Pass | Pass* | Pass* | Pass |
| Hugo | 0.167.0 | Pass | Pass | Pass | Pass | Pass | Pass* | Pass* | Pass |
| Astro + Starlight | Astro 7.4.2; Starlight 0.42.7 | Pass | Pass | Pass | Pass | Pass | Pass* | Pass* | Pass |
| VitePress | 1.6.4 | Pass | Pass | Pass | Pass | Pass | Pass* | Pass* | Pass |
| Docusaurus | 3.10.2 | Pass | Pass | Pass | Pass | Pass | Pass* | Pass* | Pass |
| Material for MkDocs | Material 9.7.7; MkDocs 1.6.1 | Pass | Pass | Pass | Pass | Pass | Pass* | Pass* | Pass |
| Zensical | 0.0.72 prerelease | Pass | Pass | Pass | Pass | Pass | Pass* | Pass* | Pass |
| MkDocs 2.0 | 2.0.dev6 prerelease | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Unsupported |

## Out of the first common profile

Material-specific admonitions, tabs and icon sets; Mermaid and other diagram syntaxes; search quality; navigation controls; multilingual content; and theme styling are not timed or claimed as equivalent here. They belong in separate feature profiles after the common-output path is calibrated.
