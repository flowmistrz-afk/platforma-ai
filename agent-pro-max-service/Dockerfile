# Użyj oficjalnego obrazu Python w nowszej wersji (np. 3.11)
FROM python:3.11-slim

# Ustaw katalog roboczy
WORKDIR /app

# Skopiuj plik z zależnościami
COPY requirements.txt requirements.txt

# Zainstaluj zależności
RUN pip install --no-cache-dir -r requirements.txt

# Skopiuj resztę kodu aplikacji
COPY . .

# --- KLUCZOWA ZMIANA: Ustaw zmienną środowiskową, aby wymusić użycie Vertex AI ---
ENV GOOGLE_GENAI_USE_VERTEXAI=TRUE

# Uruchom aplikację używając uvicorn, nasłuchując na porcie zdefiniowanym przez zmienną środowiskową PORT
CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
