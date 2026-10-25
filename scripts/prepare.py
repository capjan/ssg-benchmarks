#!/usr/bin/env python3
"""Create the deterministic Markdown workload and framework project shells."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / ".bench"
NODE_BIN = ROOT / "node_modules" / ".bin"


def markdown_pages(count: int, seed: int) -> tuple[dict[str, str], str]:
    rng = random.Random(seed)
    words = "architecture adapter benchmark browser cache command content conversion documentation generator heading html incremental input latency link markdown memory output page parser preview process route sample static template workload".split()
    sections = max(1, min(100, math.ceil(count / 50)))
    per_section = math.ceil(count / sections)
    pages: dict[str, str] = {}

    for index in range(1, count + 1):
        section = (index - 1) // per_section
        other = index % count + 1
        other_section = (other - 1) // per_section
        path = f"pages/section-{section:02d}/page-{index:05d}.md"
        related = f"../section-{other_section:02d}/page-{other:05d}.md"
        paragraph = " ".join(rng.choice(words) for _ in range(100))
        marker = "EDIT000" if index == 1 else f"PAGE{index:03d}"
        pages[path] = f"""# Documentation page {index:05d}

BENCHMARK_PAGE={index:05d}

{paragraph}

This page includes **bold text**, *italic text*, and `inline code` for the shared Markdown workload.

> A stable quote used to check block rendering in every generated page.

- First list item
- Second list item

This page also includes a separate ordered list.

1.  Ordered item one
2.  Ordered item two

| Input | Expected output |
| --- | --- |
| Markdown | HTML |
| Stable source | Stable page |

```text
BENCHMARK_CODE={index:05d}
```

![Benchmark image](../../assets/benchmark.svg)

[Related documentation page]({related})

This page contains the live edit marker `BENCHMARK_EDIT_MARKER={marker}`.
"""

    return pages, "pages/section-00/page-00001.md"


def write_source(root: Path, count: int, seed: int) -> dict[str, object]:
    pages, target = markdown_pages(count, seed)
    docs = root / "source"
    if docs.exists():
        shutil.rmtree(docs)
    (docs / "assets").mkdir(parents=True)
    (docs / "index.md").write_text(
        "# Documentation benchmark\n\n"
        "A deterministic generated site used to compare static documentation builders.\n\n"
        "[Open the first page](pages/section-00/page-00001.md).\n",
        encoding="utf-8",
    )
    (docs / "assets" / "benchmark.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">'
        '<rect width="32" height="32" fill="#3568d4"/><circle cx="16" cy="16" r="8" fill="#fff"/>'
        '</svg>\n',
        encoding="utf-8",
    )
    for relative, content in pages.items():
        path = docs / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    digest = hashlib.sha256()
    for path in sorted(docs.rglob("*")):
        if path.is_file():
            digest.update(path.relative_to(docs).as_posix().encode())
            digest.update(path.read_bytes())
    return {"page_count": count, "seed": seed, "corpus_sha256": digest.hexdigest(), "target_source": target}


def copy_tree(src: Path, dest: Path) -> None:
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(src, dest)


def setup_projects(root: Path, page_count: int) -> dict[str, dict[str, object]]:
    source = root / "source"
    participants: dict[str, dict[str, object]] = {}

    def add(identifier: str, docs_dir: str, output_dir: str, build: list[str], serve: list[str], port: int, clean_dirs: list[str]) -> Path:
        project = root / "projects" / identifier
        project.mkdir(parents=True, exist_ok=True)
        docs = project / docs_dir
        docs.parent.mkdir(parents=True, exist_ok=True)
        copy_tree(source, docs)
        participants[identifier] = {
            "project": str(project.relative_to(ROOT)),
            "docs_dir": docs_dir,
            "output_dir": output_dir,
            "build": build,
            "serve": serve,
            "port": port,
            "clean_dirs": clean_dirs,
            "page_count": page_count,
        }
        return project

    add("mdu", "docs", "site", [str(ROOT / ".tools/mdu/mdu"), "render", "docs", "site"], [str(ROOT / ".tools/mdu/mdu"), "serve", "docs", "site", "--port", "4173", "--no-browser"], 4173, ["site"])

    hugo = add("hugo", "content", "public", [str(ROOT / ".tools/hugo/hugo"), "--source", ".", "--destination", "public"], [str(ROOT / ".tools/hugo/hugo"), "server", "--bind", "127.0.0.1", "--port", "1313"], 1313, ["public", "resources/_gen", ".hugo_build.lock"])
    (hugo / "content" / "index.md").replace(hugo / "content" / "_index.md")
    (hugo / "static").mkdir(parents=True, exist_ok=True)
    shutil.move(hugo / "content" / "assets", hugo / "static" / "assets")
    (hugo / "hugo.toml").write_text('baseURL = "http://localhost/"\ntitle = "SSG Benchmark"\n', encoding="utf-8")
    (hugo / "layouts" / "_default").mkdir(parents=True, exist_ok=True)
    (hugo / "layouts" / "_default" / "baseof.html").write_text(
        '<!doctype html><html><head><meta charset="utf-8"><title>{{ .Title }}</title></head>'
        '<body><main>{{ block "main" . }}{{ end }}</main></body></html>\n', encoding="utf-8")
    (hugo / "layouts" / "_default" / "single.html").write_text('{{ define "main" }}{{ .Content }}{{ end }}\n', encoding="utf-8")
    (hugo / "layouts" / "_default" / "list.html").write_text(
        '{{ define "main" }}{{ range .Pages }}<a href="{{ .RelPermalink }}">{{ .Title }}</a>{{ end }}{{ end }}\n', encoding="utf-8")

    astro = add("astro-starlight", "src/content/docs", "dist", [str(NODE_BIN / "astro"), "build"], [str(NODE_BIN / "astro"), "dev", "--host", "127.0.0.1", "--port", "4321"], 4321, ["dist", ".astro"])
    astro_docs = astro / "src" / "content" / "docs"
    (astro_docs / "index.md").write_text(
        '---\ntitle: Documentation benchmark\ndescription: Generated documentation benchmark.\n---\n\n'
        'A deterministic generated site used to compare static documentation builders.\n\n'
        '[Open the first page](pages/section-00/page-00001/).\n', encoding="utf-8")
    for md in (astro_docs / "pages").rglob("*.md"):
        title = md.stem.replace("-", " ").title()
        content = md.read_text(encoding="utf-8")
        md.write_text(f"---\ntitle: {title}\ndescription: Generated benchmark page.\n---\n\n{content}", encoding="utf-8")
    (astro / "astro.config.mjs").write_text(
        "import { defineConfig } from 'astro/config';\n"
        "import starlight from '@astrojs/starlight';\n"
        "export default defineConfig({ site: 'https://benchmark.invalid', integrations: [starlight({ title: 'SSG Benchmark', sidebar: [{ label: 'Pages', items: [{ autogenerate: { directory: 'pages' } }] }] })] });\n",
        encoding="utf-8")
    (astro / "src" / "content.config.ts").write_text(
        "import { defineCollection } from 'astro:content';\n"
        "import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';\n"
        "import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';\n"
        "export const collections = {\n"
        "  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),\n"
        "  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),\n"
        "};\n",
        encoding="utf-8")
    (astro / "public").mkdir(exist_ok=True)
    shutil.copytree(source / "assets", astro / "public" / "assets")

    vite = add("vitepress", "docs", "docs/.vitepress/dist", [str(NODE_BIN / "vitepress"), "build", "docs"], [str(NODE_BIN / "vitepress"), "dev", "docs", "--host", "127.0.0.1", "--port", "4174"], 4174, ["docs/.vitepress/dist", "docs/.vitepress/cache"])
    sections: dict[str, list[dict[str, str]]] = {}
    for md in sorted((vite / "docs" / "pages").rglob("*.md")):
        section = md.parent.name
        sections.setdefault(section, []).append({"text": md.stem.replace("-", " ").title(), "link": "/" + md.relative_to(vite / "docs").as_posix().removesuffix(".md")})
    (vite / "docs" / ".vitepress").mkdir(parents=True, exist_ok=True)
    (vite / "docs" / ".vitepress" / "config.mts").write_text(
        "import { defineConfig } from 'vitepress';\n"
        "const sidebar = " + json.dumps([{"text": section.replace("-", " ").title(), "items": items} for section, items in sorted(sections.items())]) + ";\n"
        "export default defineConfig({ title: 'SSG Benchmark', themeConfig: { sidebar } });\n",
        encoding="utf-8")

    docusaurus = add("docusaurus", "docs", "build", [str(NODE_BIN / "docusaurus"), "build"], [str(NODE_BIN / "docusaurus"), "start", "--host", "127.0.0.1", "--port", "3000", "--no-open"], 3000, ["build", ".docusaurus"])
    (docusaurus / "sidebars.js").write_text("module.exports = { docs: [{ type: 'autogenerated', dirName: '.' }] };\n", encoding="utf-8")
    (docusaurus / "package.json").write_text('{"name":"benchmark-docs","version":"0.0.0","private":true}\n', encoding="utf-8")
    (docusaurus / "src" / "pages").mkdir(parents=True, exist_ok=True)
    (docusaurus / "src" / "pages" / "index.js").write_text(
        "import React from 'react';\n"
        "export default function Home() { return <main><h1>Documentation benchmark</h1><p>A deterministic generated documentation site.</p><a href='/docs/pages/section-00/page-00001'>Open the first page</a></main>; }\n",
        encoding="utf-8")
    (docusaurus / "docusaurus.config.js").write_text(
        "module.exports = {\n"
        "  title: 'SSG Benchmark', tagline: 'Generated documentation workload', url: 'http://localhost', baseUrl: '/',\n"
        "  onBrokenLinks: 'throw',\n"
        "  presets: [['classic', { docs: { routeBasePath: 'docs', sidebarPath: require.resolve('./sidebars.js') }, blog: false }]],\n"
        "};\n", encoding="utf-8")

    material = add("material-for-mkdocs", "docs", "site", [str(ROOT / ".tools/material/bin/mkdocs"), "build"], [str(ROOT / ".tools/material/bin/mkdocs"), "serve", "--dev-addr", "127.0.0.1:8000"], 8000, ["site", ".cache"])
    (material / "mkdocs.yml").write_text(
        "site_name: SSG Benchmark\ndocs_dir: docs\nsite_dir: site\ntheme:\n  name: material\ndev_addr: 127.0.0.1:8000\n", encoding="utf-8")

    zensical = add("zensical", "docs", "site", [str(ROOT / ".tools/zensical/bin/zensical"), "build"], [str(ROOT / ".tools/zensical/bin/zensical"), "serve"], 8001, ["site", ".cache"])
    (zensical / "zensical.toml").write_text(
        '[project]\nsite_name = "SSG Benchmark"\ndocs_dir = "docs"\nsite_dir = "site"\ndev_addr = "127.0.0.1:8001"\n\n[project.theme]\nvariant = "classic"\n', encoding="utf-8")

    mkdocs_command = str(ROOT / ".tools/mkdocs-2/bin/mkdocs")
    add("mkdocs-2", "docs", "site", [mkdocs_command, "build", "--dir", "docs", "--output", "site"], [mkdocs_command, "serve", "--dir", "docs"], 8080, ["site", ".cache"])
    participants["mkdocs-2"]["edit_to_dom"] = "unsupported"

    return participants


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pages", type=int, default=50)
    parser.add_argument("--seed", type=int, default=20261023)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    if args.pages < 1:
        parser.error("--pages must be positive")
    out = args.out.resolve()
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    corpus = write_source(out, args.pages, args.seed)
    participants = setup_projects(out, args.pages)
    manifest = {**corpus, "participants": participants}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"page_count": args.pages, "corpus_sha256": corpus["corpus_sha256"], "participants": list(participants)}))


if __name__ == "__main__":
    main()
