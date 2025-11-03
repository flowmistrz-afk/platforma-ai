FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV GOOGLE_GENAI_USE_VERTEXAI=TRUE

CMD ["python", "a2a_server.py"]
