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

# x402 AIN gateway — optional, enabled when x402_ain_gateway is available
try:
    from x402_ain_gateway import ain_holder_middleware, create_payment_required_response
    X402_ENABLED = True
except ImportError:
    X402_ENABLED = False


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
    return {"status": "ok", "service": "markitdown", "x402": X402_ENABLED}


@app.get("/.well-known/agent-card.json")
async def agent_card():
    """A2A agent card for the MarkItDown service."""
    base_url = os.getenv("PUBLIC_URL", "http://localhost:8300")
    card = {
        "name": "MarkItDown",
        "description": "Convert PDF, DOCX, PPTX, images to Markdown with section anchors and search",
        "version": "1.0.0",
        "url": f"{base_url}/a2a",
        "provider": {"organization": "Slack-A2A"},
        "defaultInputModes": ["text/plain", "application/pdf", "image/*"],
        "defaultOutputModes": ["text/plain", "text/markdown"],
        "capabilities": {
            "streaming": False,
            "pushNotifications": False,
            "extensions": [
                {
                    "uri": "urn:a2a:ext:x402-ain-holder",
                    "description": "Requires AIN token balance on Base network",
                    "required": True,
                    "params": {
                        "token": "0xd4423795fd904d9b87554940a95fb7016f172773",
                        "network": "base",
                        "type": "token-balance",
                    },
                }
            ] if X402_ENABLED else [],
        },
        "skills": [
            {
                "id": "convert",
                "name": "Document Convert",
                "description": "Convert document to Markdown with page anchors for reference linking",
                "tags": ["pdf", "docx", "pptx", "markdown", "convert"],
            },
            {
                "id": "search",
                "name": "Document Search",
                "description": "Search for text within a document",
                "tags": ["search", "find", "query"],
            },
            {
                "id": "metadata",
                "name": "Document Metadata",
                "description": "Get document structure — title, page count, sections",
                "tags": ["metadata", "info", "structure"],
            },
        ],
    }
    return card


@app.post("/convert/url", response_model=ConvertResponse)
async def convert_url(req: ConvertUrlRequest, request: Request):
    """Convert a file from URL to Markdown. x402 gated if enabled."""
    if X402_ENABLED:
        await ain_holder_middleware(request)
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
    request: Request,
    file: UploadFile = File(...),
    page: int | None = None,
    search: str | None = None,
):
    """Convert an uploaded file to Markdown. x402 gated if enabled."""
    if X402_ENABLED:
        await ain_holder_middleware(request)
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
async def get_metadata(req: ConvertUrlRequest, request: Request):
    """Get document metadata. x402 gated if enabled."""
    if X402_ENABLED:
        await ain_holder_middleware(request)
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
async def search_document(req: SearchRequest, request: Request):
    """Search within a document. x402 gated if enabled."""
    if X402_ENABLED:
        await ain_holder_middleware(request)
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
