#!/usr/bin/env python3
"""Audit the shared Markdown features in one generated site output."""

from __future__ import annotations

import json
import posixpath
import re
import sys
from collections import Counter, defaultdict
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tags: Counter[str] = Counter()
        self.text: list[str] = []
        self.anchors: list[dict[str, str]] = []
        self.images: list[dict[str, str]] = []
        self.anchor_stack: list[dict[str, str]] = []
        self.inline_codes: list[str] = []
        self.inline_code_buffer: list[str] | None = None
        self.strong_text: list[str] = []
        self.emphasis_text: list[str] = []
        self.strong_depth = 0
        self.emphasis_depth = 0
        self.pre_depth = 0
        self.has_fenced_code = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.tags[tag] += 1
        values = dict(attrs)
        if tag == "pre":
            self.pre_depth += 1
            self.has_fenced_code = True
        elif tag == "code":
            if self.pre_depth:
                self.has_fenced_code = True
            else:
                self.inline_code_buffer = []
        elif tag == "strong":
            self.strong_depth += 1
        elif tag == "em":
            self.emphasis_depth += 1
        elif tag == "a":
            anchor = {"href": values.get("href") or "", "text": ""}
            self.anchors.append(anchor)
            self.anchor_stack.append(anchor)
        elif tag == "img":
            self.images.append({"src": values.get("src") or "", "alt": values.get("alt") or ""})

    def handle_endtag(self, tag: str) -> None:
        if tag == "pre" and self.pre_depth:
            self.pre_depth -= 1
        elif tag == "code" and self.inline_code_buffer is not None:
            self.inline_codes.append("".join(self.inline_code_buffer))
            self.inline_code_buffer = None
        elif tag == "strong" and self.strong_depth:
            self.strong_depth -= 1
        elif tag == "em" and self.emphasis_depth:
            self.emphasis_depth -= 1
        elif tag == "a" and self.anchor_stack:
            self.anchor_stack.pop()

    def handle_data(self, data: str) -> None:
        self.text.append(data)
        if self.inline_code_buffer is not None:
            self.inline_code_buffer.append(data)
        if self.strong_depth:
            self.strong_text.append(data)
        if self.emphasis_depth:
            self.emphasis_text.append(data)
        for anchor in self.anchor_stack:
            anchor["text"] += data


def route_for_file(relative_path: str) -> str:
    if relative_path == "index.html":
        return "/"
    if relative_path.endswith("/index.html"):
        return "/" + relative_path[: -len("index.html")]
    return "/" + relative_path


def build_route_map(files: list[Path], output: Path) -> dict[str, Path]:
    routes: dict[str, Path] = {}
    for file in files:
        relative = file.relative_to(output).as_posix()
        route = route_for_file(relative)
        routes[route] = file
        routes[route.rstrip("/") or "/"] = file
        if relative.endswith("/index.html"):
            routes[route + "index.html"] = file
        elif relative.endswith(".html"):
            routes[route[: -len(".html")]] = file
    return routes


def resolve_local(reference: str, page_url: str, routes: dict[str, Path]) -> bool:
    resolved = urljoin(page_url, reference)
    parsed = urlsplit(resolved)
    if parsed.scheme in {"data", "blob"}:
        return True
    if parsed.scheme not in {"", "http", "https"}:
        return True
    if parsed.hostname and parsed.hostname not in {"127.0.0.1", "localhost", "benchmark.invalid"}:
        return True
    path = unquote(parsed.path or "/")
    path = "/" + posixpath.normpath(path).lstrip("/")
    candidates = [path, path.rstrip("/") or "/", path.rstrip("/") + "/index.html"]
    if not Path(path).suffix:
        candidates.append(path.rstrip("/") + ".html")
    return any(candidate in routes for candidate in candidates)


def feature(status: bool, **evidence: object) -> dict[str, object]:
    return {"status": "pass" if status else "fail", **evidence}


def audit(output: Path, expected_pages: int) -> dict[str, object]:
    files = sorted(output.rglob("*"))
    html_files = [path for path in files if path.is_file() and path.suffix.lower() == ".html"]
    routes = build_route_map([path for path in files if path.is_file()], output)
    by_marker: dict[str, list[tuple[Path, PageParser]]] = defaultdict(list)
    for path in html_files:
        parser = PageParser()
        parser.feed(path.read_text(encoding="utf-8", errors="replace"))
        for marker in re.findall(r"BENCHMARK_PAGE=(\d{5})", "".join(parser.text)):
            by_marker[marker].append((path, parser))

    target_items = by_marker.get("00001", [])
    target = target_items[0][1] if target_items else PageParser()
    normalized = lambda value: " ".join(value.split())
    target_text = normalized(" ".join(target.text))

    sections = max(1, min(100, (expected_pages + 49) // 50))
    per_section = (expected_pages + sections - 1) // sections
    route_mismatches = []
    for page_number in range(1, expected_pages + 1):
        marker = f"{page_number:05d}"
        marker_items = by_marker.get(marker, [])
        section = (page_number - 1) // per_section
        expected_path = f"section-{section:02d}/page-{page_number:05d}"
        if len(marker_items) == 1 and expected_path not in marker_items[0][0].relative_to(output).as_posix():
            route_mismatches.append({"marker": marker, "expected_path": expected_path, "actual_path": marker_items[0][0].relative_to(output).as_posix()})

    related_links: list[tuple[Path, str]] = []
    image_refs: list[tuple[Path, str]] = []
    for marker_items in by_marker.values():
        for path, parser in marker_items:
            page_url = "http://benchmark.invalid" + route_for_file(path.relative_to(output).as_posix())
            for anchor in parser.anchors:
                if normalized(anchor["text"]) == "Related documentation page":
                    related_links.append((path, anchor["href"]))
            for image in parser.images:
                if image["alt"] == "Benchmark image":
                    image_refs.append((path, image["src"]))

    broken_links = [
        {"from": path.relative_to(output).as_posix(), "href": href}
        for path, href in related_links
        if not resolve_local(href, "http://benchmark.invalid" + route_for_file(path.relative_to(output).as_posix()), routes)
    ]
    broken_images = [
        {"from": path.relative_to(output).as_posix(), "src": src}
        for path, src in image_refs
        if not src or not resolve_local(src, "http://benchmark.invalid" + route_for_file(path.relative_to(output).as_posix()), routes)
    ]

    features = {
        "nested_markdown_pages": feature(
            len(by_marker) == expected_pages and all(len(items) == 1 for items in by_marker.values()) and not route_mismatches,
            expected=expected_pages,
            rendered=len(by_marker),
            duplicate_markers=sum(1 for items in by_marker.values() if len(items) != 1),
            incorrect_routes=route_mismatches[:10],
        ),
        "headings_and_paragraphs": feature(target.tags["h1"] > 0 and target.tags["p"] > 0, h1=target.tags["h1"], paragraphs=target.tags["p"]),
        "emphasis_and_inline_code": feature(
            normalized(" ".join(target.strong_text)) == "bold text"
            and normalized(" ".join(target.emphasis_text)) == "italic text"
            and any(normalized(value) == "inline code" for value in target.inline_codes),
            strong=normalized(" ".join(target.strong_text)),
            emphasis=normalized(" ".join(target.emphasis_text)),
            inline_code=any(normalized(value) == "inline code" for value in target.inline_codes),
        ),
        "lists_and_block_quotes": feature(
            target.tags["ul"] > 0 and target.tags["ol"] > 0 and target.tags["blockquote"] > 0,
            unordered_lists=target.tags["ul"], ordered_lists=target.tags["ol"], block_quotes=target.tags["blockquote"],
        ),
        "tables_and_fenced_code": feature(
            target.tags["table"] > 0 and target.tags["pre"] > 0 and target.has_fenced_code and "BENCHMARK_CODE=00001" in target_text,
            tables=target.tags["table"], preformatted_blocks=target.tags["pre"],
            fenced_code=target.has_fenced_code and "BENCHMARK_CODE=00001" in target_text,
        ),
        "relative_markdown_links": feature(
            len(related_links) == expected_pages and not broken_links,
            expected=expected_pages,
            checked=len(related_links),
            broken=broken_links[:10],
        ),
        "local_images": feature(
            len(image_refs) == expected_pages and not broken_images,
            expected=expected_pages,
            checked=len(image_refs),
            broken=broken_images[:10],
        ),
    }
    return {"status": "pass" if all(item["status"] == "pass" for item in features.values()) else "fail", "features": features}


if __name__ == "__main__":
    try:
        result = audit(Path(sys.argv[1]).resolve(), int(sys.argv[2]))
    except Exception as error:
        result = {"status": "fail", "error": f"{type(error).__name__}: {error}", "features": {}}
    print(json.dumps(result, sort_keys=True))
