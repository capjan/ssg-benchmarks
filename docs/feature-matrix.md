# Feature parity matrix

This first pass records portable Markdown features used by the shared workload. The candidate version is pinned in [`data/participants.yml`](../data/participants.yml), Node dependency pins are also held in [`package.json`](../package.json), and Python package pins are in [`requirements/`](../requirements/).

“Pending” means the adapter is configured but has not yet passed the hosted smoke run. The initial gate checks rendered page count, a unique marker on every page, basic HTML elements on the edit page, and a visible browser edit. It does not yet prove that every link target or image URL resolves; those checks are required before publishing a ranking.

| Generator | Version | Nested Markdown pages | Headings and paragraphs | Emphasis and inline code | Lists and block quotes | Tables and fenced code | Relative Markdown links | Local images | Live edit to DOM |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MDU | 5.3.0 | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Hugo | 0.167.0 | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Astro + Starlight | Astro 7.4.2; Starlight 0.42.7 | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| VitePress | 1.6.4 | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Docusaurus | 3.10.2 | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Material for MkDocs | Material 9.7.7; MkDocs 1.6.1 | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Zensical | 0.0.72 prerelease | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| MkDocs 2.0 | 2.0.dev6 prerelease | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |

## Out of the first common profile

Material-specific admonitions, tabs and icon sets; Mermaid and other diagram syntaxes; search quality; navigation controls; multilingual content; and theme styling are not timed or claimed as equivalent here. They belong in separate feature profiles after the common-output path is calibrated.
