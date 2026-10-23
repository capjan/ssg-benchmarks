# Shared documentation workload

## Proposed common feature set

The common profile uses portable Markdown and avoids framework-specific syntax until every pinned version passes the parity checks.

- Nested page paths and one first-level heading per page
- Paragraphs, bold and italic text, inline code, ordered and unordered lists, and block quotes
- Relative links between pages and links to a fixed local image
- Fenced code blocks with language labels
- Tables, after confirming equivalent support in every selected version

No front matter is required in the initial corpus; page titles come from the first heading and navigation order from the shared path manifest. This keeps content portable and avoids testing metadata conventions instead of rendering.

Before the first timed run, each feature must be marked in a versioned parity matrix as native, enabled by an official extension, enabled by a third-party extension, or unsupported. If a feature cannot be made equivalent without custom preprocessing, remove it from the common profile and record it as a separate extension profile.

## Corpus shape

- Generate 50, 500, and 5,000 Markdown pages from a fixed seed.
- Use a stable tree with multiple nesting depths, deterministic sibling order, and cross-links within and across sections.
- Keep page length and syntax distribution consistent; use varied deterministic text rather than thousands of identical files.
- Reuse the same local image assets and code samples across candidates.
- Include a fixed-length, visible edit marker on a designated page. An edit changes only the marker value, not the file length or page structure.
- Commit the generator and seed, not a large generated corpus. Save a corpus hash in each run.

## Output parity

The adapter may translate the shared page manifest into each tool's native configuration, but it must not rewrite Markdown content or pre-render HTML. Validate route count, required text and elements, link destinations, and edit propagation.

The common-output profile uses the same small HTML/CSS shell as far as each templating system permits. A later native-docs profile can add default themes and richer features such as Mermaid diagrams, admonitions, search, and syntax highlighting. Results from those two profiles answer different questions and stay in separate chart series.

