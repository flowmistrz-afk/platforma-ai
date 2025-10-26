# Dockerfile for the BigQuery Agent Service
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

# Set environment variable for Vertex AI
ENV GOOGLE_GENAI_USE_VERTEXAI=TRUE

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
