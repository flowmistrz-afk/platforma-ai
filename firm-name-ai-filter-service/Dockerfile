# Użyj oficjalnego obrazu Python jako obrazu bazowego
FROM python:3.12-slim

# Ustaw zmienną środowiskową, aby wymusić użycie Vertex AI
ENV GOOGLE_GENAI_USE_VERTEXAI=TRUE

# Ustaw katalog roboczy w kontenerze
WORKDIR /app

# Skopiuj plik z zależnościami do katalogu roboczego
COPY requirements.txt .

# Zainstaluj zależności
RUN pip install --no-cache-dir -r requirements.txt

# Skopiuj resztę kodu aplikacji do katalogu roboczego
COPY . .

# Uruchom aplikację Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
