# Tool landscape

Research snapshot: **2026-10-23**. Release channels change frequently. The exact version used in a benchmark run will be resolved from the official stable channel, then pinned in that run's lock manifest.

## First wave

| Candidate | Why include it | Release status at research time |
| --- | --- | --- |
| MDU | First-party documentation renderer being evaluated | Pin the git commit and .NET runtime for every run |
| Hugo | General-purpose Go generator and useful fast-build reference | v0.167.0 |
| Astro + Starlight | Modern component-based generator with a documentation theme | Astro 7.4.2 stable; pin Starlight separately |
| VitePress | Vue/Vite documentation generator | v1.6.4 stable; v2.0.0-alpha.20 is prerelease |
| Docusaurus | Established React/MDX documentation generator | v3.10.2 stable |
| Material for MkDocs | Established documentation framework and useful feature-rich product baseline | v9.7.7 with MkDocs 1.6.1; maintenance through 2027-05-05 |
| Zensical | New documentation-focused system from the Material for MkDocs team | v0.0.68; pre-1.0 release line |
| MkDocs 2.0 | New architecture and independent documentation toolchain; exploratory prerelease track | v2.0.dev6; prerelease only, no stable release date announced |

Material for MkDocs must be pinned with MkDocs 1.x; its current package constrains MkDocs to below 2. MkDocs 2.0 is a separate candidate and cannot use Material for MkDocs. Its prerelease results must stay in an experimental series, apart from stable rankings.

The set intentionally spans general-purpose builders and documentation products. Astro must be paired with Starlight for a docs-site comparison; Astro without a docs theme is a different profile.

Hugo is not docs-only: its core is a general-purpose generator designed for speed and flexibility, and its official introduction lists documentation sites among its use cases. The docs-specific experience comes from the chosen theme; the official theme gallery includes Book and Docsy. For the native-docs profile, benchmark Hugo with a pinned docs theme. [Hugo introduction](https://gohugo.io/about/introduction/) · [Hugo themes](https://themes.gohugo.io/themes/)


## Follow-up/reference candidates

- **Eleventy 3.1.7:** a simple, general-purpose generator rather than a docs-first product. Its official starter list is blog-heavy but also includes documentation starters such as eleventy-libdoc. Keep it as an optional minimal-engine baseline if that comparison is useful. [Eleventy overview](https://www.11ty.dev/) · [Starter projects](https://www.11ty.dev/docs/starter/)
- **Jekyll 4.4.1:** useful as a long-running, general-purpose Markdown baseline and for continuity with older comparisons.

## Sources

- [Hugo releases](https://github.com/gohugoio/hugo/releases)
- [Eleventy version history](https://www.11ty.dev/docs/versions/)
- [Astro releases](https://github.com/withastro/astro/releases) and [Starlight](https://starlight.astro.build/)
- [VitePress releases](https://github.com/vuejs/vitepress/releases)
- [Docusaurus releases](https://github.com/facebook/docusaurus/releases)
- [Zensical releases](https://github.com/zensical/zensical/releases/) and [roadmap](https://zensical.org/roadmap/)
- [Jekyll releases](https://github.com/jekyll/jekyll/releases)
- [MkDocs 2.0 prereleases](https://pypi.org/project/mkdocs/) and [MkDocs 2 repository](https://github.com/encode/mkdocs)
- [Material for MkDocs changelog](https://github.com/squidfunk/mkdocs-material/blob/master/CHANGELOG) and [maintenance notice](https://squidfunk.github.io/mkdocs-material/)

