#!/usr/bin/env python3
"""
MarkItDown wrapper for Node.js — converts files to Markdown with page anchors.
Usage: python3 markitdown-convert.py <file_path> [--page N] [--search "query"]
Output: JSON { "markdown": "...", "pages": N, "title": "..." }
"""

import sys
import json
import os
import re
from pathlib import Path

def convert_file(file_path: str, page: int | None = None, search_query: str | None = None):
    from markitdown import MarkItDown

    md = MarkItDown()
    result = md.convert(file_path)
    markdown = result.text_content

    # Add page anchors: detect page breaks or section headers
    lines = markdown.split('\n')
    page_count = 1
    anchored_lines = []
    current_page = 1

    for line in lines:
        # Detect page breaks (common patterns in PDF conversion)
        if re.match(r'^-{3,}$|^\*{3,}$|^_{3,}$', line.strip()) or \
           re.match(r'^#{1,2}\s', line):
            if re.match(r'^#{1,2}\s', line):
                # Add anchor to headings
                heading_id = re.sub(r'[^a-z0-9]+', '-', line.lower().strip('#').strip()).strip('-')
                anchored_lines.append(f'<a id="{heading_id}"></a>')

        anchored_lines.append(line)

        # Count approximate pages (every ~3000 chars)
        if len('\n'.join(anchored_lines)) > current_page * 3000:
            current_page += 1
            anchored_lines.append(f'\n<a id="page-{current_page}"></a>\n')
            page_count = current_page

    full_markdown = '\n'.join(anchored_lines)

    # Extract title from first heading
    title_match = re.search(r'^#\s+(.+)$', markdown, re.MULTILINE)
    title = title_match.group(1) if title_match else Path(file_path).stem

    # If specific page requested, extract that chunk
    if page is not None:
        chunks = re.split(r'<a id="page-\d+">', full_markdown)
        if 1 <= page <= len(chunks):
            output_md = chunks[page - 1]
        else:
            output_md = full_markdown
    else:
        output_md = full_markdown

    # If search query, find matching sections
    search_results = []
    if search_query:
        query_lower = search_query.lower()
        for i, line in enumerate(lines):
            if query_lower in line.lower():
                context_start = max(0, i - 2)
                context_end = min(len(lines), i + 3)
                context = '\n'.join(lines[context_start:context_end])
                search_results.append({
                    "line": i + 1,
                    "context": context,
                })

    return {
        "markdown": output_md,
        "pages": page_count,
        "title": title,
        "searchResults": search_results if search_query else None,
        "charCount": len(markdown),
    }


def extract_images(file_path: str):
    """Extract image descriptions from PDF using markitdown."""
    from markitdown import MarkItDown

    md = MarkItDown()
    result = md.convert(file_path)

    # Find image references in markdown
    images = []
    for match in re.finditer(r'!\[([^\]]*)\]\(([^)]+)\)', result.text_content):
        images.append({
            "alt": match.group(1),
            "url": match.group(2),
        })

    return {
        "images": images,
        "count": len(images),
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: markitdown-convert.py <file_path> [--page N] [--search query] [--images]"}))
        sys.exit(1)

    file_path = sys.argv[1]

    if not os.path.exists(file_path):
        print(json.dumps({"error": f"File not found: {file_path}"}))
        sys.exit(1)

    page = None
    search_query = None
    images_mode = False

    i = 2
    while i < len(sys.argv):
        if sys.argv[i] == '--page' and i + 1 < len(sys.argv):
            page = int(sys.argv[i + 1])
            i += 2
        elif sys.argv[i] == '--search' and i + 1 < len(sys.argv):
            search_query = sys.argv[i + 1]
            i += 2
        elif sys.argv[i] == '--images':
            images_mode = True
            i += 1
        else:
            i += 1

    try:
        if images_mode:
            result = extract_images(file_path)
        else:
            result = convert_file(file_path, page, search_query)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
