"""
MarkItDown API Server — converts files to Markdown with page anchors.
Runs as a containerized microservice.
"""

import os
import re
import tempfile
import httpx
from pathlib import Path
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from markitdown import MarkItDown

app = FastAPI(title="MarkItDown API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

md_converter = MarkItDown()


class ConvertUrlRequest(BaseModel):
    url: str
    page: int | None = None
    search: str | None = None


class ConvertResponse(BaseModel):
    markdown: str
    pages: int
    title: str
    char_count: int
    search_results: list[dict] | None = None


class SearchRequest(BaseModel):
    url: str
    query: str


class MetadataResponse(BaseModel):
    title: str
    pages: int
    char_count: int
    sections: list[str]


def add_anchors(markdown: str) -> tuple[str, int]:
    """Add page/section anchors to converted markdown."""
    lines = markdown.split("\n")
    anchored = []
    page_count = 1
    char_count = 0

    for line in lines:
        # Add anchor to headings
        if re.match(r"^#{1,3}\s", line):
            heading_id = re.sub(
                r"[^a-z0-9]+", "-", line.lower().strip("#").strip()
            ).strip("-")
            if heading_id:
                anchored.append(f'<a id="{heading_id}"></a>')

        anchored.append(line)
        char_count += len(line)

        # Approximate page breaks every ~3000 chars
        if char_count > page_count * 3000:
            page_count += 1
            anchored.append(f'\n<a id="page-{page_count}"></a>\n')

    return "\n".join(anchored), page_count


def extract_title(markdown: str, fallback: str = "Untitled") -> str:
    match = re.search(r"^#\s+(.+)$", markdown, re.MULTILINE)
    return match.group(1).strip() if match else fallback


def extract_sections(markdown: str) -> list[str]:
    return [
        line.strip("#").strip()
        for line in markdown.split("\n")
        if re.match(r"^#{1,3}\s", line)
    ]


def search_in_markdown(markdown: str, query: str) -> list[dict]:
    results = []
    lines = markdown.split("\n")
    query_lower = query.lower()

    for i, line in enumerate(lines):
        if query_lower in line.lower():
            start = max(0, i - 2)
            end = min(len(lines), i + 3)
            context = "\n".join(lines[start:end])
            results.append({"line": i + 1, "context": context})

    return results[:20]  # max 20 results


async def download_file(url: str) -> str:
    """Download a file from URL to temp path."""
    async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    suffix = Path(url.split("?")[0]).suffix or ".pdf"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.write(resp.content)
    tmp.close()
    return tmp.name


def convert_local(file_path: str, page: int | None = None, search: str | None = None) -> ConvertResponse:
    result = md_converter.convert(file_path)
    markdown = result.text_content
    anchored, page_count = add_anchors(markdown)
    title = extract_title(markdown, Path(file_path).stem)

    # Page extraction
    if page is not None:
        chunks = re.split(r'<a id="page-\d+">', anchored)
        output = chunks[page - 1] if 1 <= page <= len(chunks) else anchored
    else:
        output = anchored

    search_results = search_in_markdown(markdown, search) if search else None

    return ConvertResponse(
        markdown=output,
        pages=page_count,
        title=title,
        char_count=len(markdown),
        search_results=search_results,
    )


@app.get("/health")
async def health():
    return {"status": "ok", "service": "markitdown"}


@app.post("/convert/url", response_model=ConvertResponse)
async def convert_url(req: ConvertUrlRequest):
    """Convert a file from URL to Markdown."""
    tmp_path = None
    try:
        tmp_path = await download_file(req.url)
        return convert_local(tmp_path, req.page, req.search)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail=f"Failed to download: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.post("/convert/file", response_model=ConvertResponse)
async def convert_file(
    file: UploadFile = File(...),
    page: int | None = None,
    search: str | None = None,
):
    """Convert an uploaded file to Markdown."""
    tmp_path = None
    try:
        suffix = Path(file.filename or "doc").suffix or ".pdf"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        content = await file.read()
        tmp.write(content)
        tmp.close()
        tmp_path = tmp.name
        return convert_local(tmp_path, page, search)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.post("/metadata", response_model=MetadataResponse)
async def get_metadata(req: ConvertUrlRequest):
    """Get document metadata without full conversion."""
    tmp_path = None
    try:
        tmp_path = await download_file(req.url)
        result = md_converter.convert(tmp_path)
        markdown = result.text_content
        _, page_count = add_anchors(markdown)

        return MetadataResponse(
            title=extract_title(markdown, Path(req.url).stem),
            pages=page_count,
            char_count=len(markdown),
            sections=extract_sections(markdown),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.post("/search")
async def search_document(req: SearchRequest):
    """Search within a document."""
    tmp_path = None
    try:
        tmp_path = await download_file(req.url)
        result = md_converter.convert(tmp_path)
        results = search_in_markdown(result.text_content, req.query)
        return {"query": req.query, "results": results, "count": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
