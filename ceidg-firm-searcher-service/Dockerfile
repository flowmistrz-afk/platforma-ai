# Użyj oficjalnego obrazu Python
FROM python:3.9-slim

# Ustaw katalog roboczy
WORKDIR /app

# Skopiuj plik z zależnościami
COPY requirements.txt requirements.txt

# Zainstaluj zależności
RUN pip install --no-cache-dir -r requirements.txt

# Skopiuj resztę kodu aplikacji
COPY . .

# Uruchom aplikację używając uvicorn, nasłuchując "na sztywno" na porcie 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
