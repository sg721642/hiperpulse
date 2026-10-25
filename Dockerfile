FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements-lock.txt .
RUN pip install --no-cache-dir -r requirements-lock.txt && useradd --uid 10001 --create-home appuser
ARG GIT_SHA="unknown"
ENV GIT_SHA=${GIT_SHA}
COPY app ./app
COPY web ./web
RUN echo "{\"git_sha\": \"${GIT_SHA}\"}" > build_info.json
USER appuser
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --limit-concurrency 20 --no-access-log"]
