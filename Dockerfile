FROM python:3.12-slim AS builder
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/.venv ./.venv
COPY beaverhabits ./beaverhabits
ENV PATH="/app/.venv/bin:$PATH"
ENV DATA_DIR=/data
EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -f http://localhost:8765/health || exit 1
CMD ["uvicorn", "beaverhabits.main:app", "--host", "0.0.0.0", "--port", "8765"]
