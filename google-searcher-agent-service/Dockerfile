# Użyj oficjalnego obrazu Python w wersji 3.11, który jest stabilny i zoptymalizowany.
FROM python:3.11-slim

# Ustaw katalog roboczy wewnątrz kontenera.
WORKDIR /app

# Skopiuj plik z zależnościami. Robimy to jako osobny krok,
# aby wykorzystać mechanizm buforowania warstw Dockera.
COPY requirements.txt requirements.txt

# Zainstaluj wszystkie wymagane biblioteki Python.
RUN pip install --no-cache-dir -r requirements.txt

# Skopiuj resztę kodu aplikacji (main.py, folder app/, itp.) do kontenera.
COPY . .

# Ustaw kluczową zmienną środowiskową, która informuje ADK,
# aby używało uwierzytelniania i infrastruktury Vertex AI.
ENV GOOGLE_GENAI_USE_VERTEXAI=TRUE

# Komenda uruchamiająca serwer. Używamy `uvicorn` do uruchomienia aplikacji
# zdefiniowanej w pliku `main.py`. Serwer będzie nasłuchiwał na wszystkich
# interfejsach sieciowych (`0.0.0.0`) na porcie dostarczonym przez Cloud Run
# w zmiennej środowiskowej `$PORT`.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
