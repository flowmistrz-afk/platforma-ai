# Użyj oficjalnego obrazu Pythona
FROM python:3.10-slim

# Ustaw katalog roboczy w kontenerze
WORKDIR /app

# Skopiuj plik z zależnościami i zainstaluj je
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Skopiuj resztę aplikacji do katalogu roboczego
COPY . .

# Wystaw port, na którym będzie działać Uvicorn
EXPOSE 8080

# Uruchom serwer Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
