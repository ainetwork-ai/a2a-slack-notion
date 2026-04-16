FROM python:3.12-slim

WORKDIR /app

# System deps for PDF parsing
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .
COPY x402_ain_gateway.py .

EXPOSE 8300

ENV PUBLIC_URL=http://localhost:8300
ENV USE_TESTNET=true
ENV MIN_AIN_BALANCE=1000000000000000000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8300/health').raise_for_status()"

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8300"]
