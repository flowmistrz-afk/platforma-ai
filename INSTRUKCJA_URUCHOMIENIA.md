
# Instrukcja Uruchomienia Projektu "platforma-ai"

Niniejszy dokument opisuje kroki niezbędne do skonfigurowania i uruchomienia projektu "platforma-ai" w nowym środowisku Google Cloud Platform po sklonowaniu go z repozytorium Git.

---

## 1. Wymagania Wstępne

Upewnij się, że w Twoim środowisku (np. nowym Cloud Shell) zainstalowane są następujące narzędzia:

- **Node.js** (wersja 20 lub nowsza, zgodnie z `functions/package.json`)
- **npm** (zazwyczaj instalowany z Node.js)
- **Firebase CLI:**
  ```bash
  npm install -g firebase-tools
  ```
- **Google Cloud SDK (`gcloud`):** Zazwyczaj preinstalowany w Cloud Shell.
- **Git**

---

## 2. Konfiguracja Projektu w Google Cloud

1.  **Stwórz nowy projekt w Google Cloud Platform:**
    - Przejdź do [konsoli Google Cloud](https://console.cloud.google.com/) i utwórz nowy projekt. Zanotuj jego **ID Projektu** (Project ID).

2.  **Połącz Firebase z projektem GCP:**
    - Przejdź do [konsoli Firebase](https://console.firebase.google.com/) i dodaj projekt, wybierając opcję "Dodaj projekt" i wskazując istniejący projekt GCP stworzony w kroku 1.

3.  **Włącz niezbędne usługi (API):**
    - W konsoli GCP, w sekcji "APIs & Services", upewnij się, że włączone są następujące API dla Twojego projektu:
      - Cloud Functions API
      - Cloud Build API (często wymagane do wdrożeń)
      - Cloud Run API (dla mikrousług agentów)
      - Firestore API
      - Secret Manager API
      - Vertex AI API
      - Discovery Engine API
      - I inne, których mogą wymagać Twoje funkcje i agenty.

4.  **Utwórz Klucz Konta Serwisowego (Service Account Key):**
    - W konsoli GCP przejdź do "IAM & Admin" -> "Service Accounts".
    - Wybierz domyślne konto serwisowe (lub utwórz nowe z odpowiednimi uprawnieniami, np. Editor lub Owner na potrzeby deweloperskie).
    - W zakładce "Keys" dla tego konta, kliknij "Add Key" -> "Create new key".
    - Wybierz format **JSON** i pobierz plik.
    - **Zmień nazwę pobranego pliku na `key.json`**. Ten plik będzie potrzebny do lokalnej autoryzacji. **NIGDY NIE UMIESZCZAJ TEGO PLIKU W GIT!**

---

## 3. Klonowanie i Instalacja Projektu

1.  **Sklonuj repozytorium:**
    - Adres repozytorium: `https://github.com/flowmistrz-afk/platforma-ai.git`
    - Użyj poniższej komendy, aby pobrać projekt na swoje nowe środowisko:
    ```bash
    git clone https://github.com/flowmistrz-afk/platforma-ai.git
    cd platforma-ai
    ```

2.  **Połącz Firebase CLI z Twoim projektem:**
    - Zaloguj się do Firebase:
      ```bash
      firebase login
      ```
    - Powiąż lokalny projekt z Twoim projektem Firebase w chmurze. Użyj ID Projektu zanotowanego wcześniej.
      ```bash
      firebase use --add
      ```
      Wybierz z listy swój projekt i nadaj mu alias, np. `default`.

3.  **Zainstaluj zależności dla frontendu (React):**
    - W głównym katalogu `platforma-ai`:
      ```bash
      npm install
      ```

4.  **Zainstaluj zależności dla backendu (Cloud Functions):**
    ```bash
    cd functions
    npm install
    cd ..
    ```

5.  **Zainstaluj zależności dla mikrousług (Agentów):**
    - Każdy katalog `agent-*-service`, `google-service-v2` itp. jest osobną aplikacją. Musisz wejść do każdego z nich i zainstalować zależności. Sprawdź, czy zawierają `package.json` (dla Node.js) czy `requirements.txt` (dla Pythona).
    - Przykład dla usługi opartej o Pythona:
      ```bash
      cd agent-zniwiarz-service
      pip install -r requirements.txt
      cd ..
      ```
    - Powtórz ten proces dla wszystkich katalogów z mikrousługami.

---

## 4. Konfiguracja Lokalna

1.  **Umieść klucz `key.json`:**
    - Skopiuj pobrany wcześniej plik `key.json` do bezpiecznej lokalizacji. Wiele aplikacji Google szuka go na podstawie zmiennej środowiskowej.

2.  **Ustaw zmienną środowiskową:**
    - Aby aplikacje mogły automatycznie znaleźć klucz, ustaw zmienną środowiskową `GOOGLE_APPLICATION_CREDENTIALS`.
    ```bash
    export GOOGLE_APPLICATION_CREDENTIALS="/sciezka/do/twojego/pliku/key.json"
    ```
    - **Ważne:** Tę komendę należy dodać do pliku startowego powłoki (np. `~/.bashrc`), aby była ustawiana automatycznie przy każdej nowej sesji terminala.
      ```bash
      echo 'export GOOGLE_APPLICATION_CREDENTIALS="/sciezka/do/twojego/pliku/key.json"' >> ~/.bashrc && source ~/.bashrc
      ```

3.  **Sprawdź pliki `.env`:**
    - Przejrzyj kod w poszukiwaniu użycia zmiennych środowiskowych (np. `process.env.NAZWA_ZMIENNEJ`). Jeśli projekt ich wymaga, utwórz plik `.env` w odpowiednich katalogach (głównym, `functions`, katalogach agentów) i uzupełnij go wymaganymi wartościami (np. kluczami API, adresami URL).

---

## 5. Uruchamianie i Wdrażanie

### Uruchamianie lokalne (deweloperskie)

1.  **Frontend React:**
    ```bash
    npm start
    ```
    Aplikacja będzie dostępna pod adresem `http://localhost:3000`.

2.  **Emulatory Firebase:**
    - Aby testować funkcje i reguły Firestore lokalnie, użyj emulatorów Firebase.
    ```bash
    firebase emulators:start
    ```

### Wdrażanie na Google Cloud

1.  **Zbuduj aplikację React:**
    ```bash
    npm run build
    ```

2.  **Wdróż zasoby Firebase (Hosting, Functions, Firestore Rules):**
    - Ta komenda wdroży zawartość katalogu `build` na Firebase Hosting, wdroży funkcje z katalogu `functions` oraz zaktualizuje reguły Firestore.
    ```bash
    firebase deploy
    ```

3.  **Wdróż mikrousługi (Agenty):**
    - Każda mikrousługa musi zostać wdrożona osobno, najprawdopodobniej jako usługa Cloud Run.
    - Poszukaj w katalogach agentów plików `Dockerfile` lub skryptów `.sh` (np. `deploy.sh`).
    - Jeśli istnieje `Dockerfile`, możesz zbudować obraz kontenera i wdrożyć go w Cloud Run. Zastąp `[SERVICE-NAME]` i `[PROJECT-ID]` odpowiednimi wartościami.
      ```bash
      # Przykład dla jednej usługi
      cd agent-zniwiarz-service
      gcloud builds submit --tag gcr.io/[PROJECT-ID]/[SERVICE-NAME]
      gcloud run deploy [SERVICE-NAME] --image gcr.io/[PROJECT-ID]/[SERVICE-NAME] --platform managed --region [TWOJ-REGION] --allow-unauthenticated
      cd ..
      ```
    - Powtórz ten proces dla każdej mikrousługi, dostosowując polecenia do jej specyfiki.
