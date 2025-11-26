FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Cloud Run domyślnie używa portu 8080, ale najlepiej jest używać zmiennej środowiskowej PORT
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}