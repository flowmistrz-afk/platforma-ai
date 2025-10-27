
# Projekt "AgentProMax": Dziennik Pokładowy i Architektura Systemu

*Data: 18.10.2025*

Ten dokument to nasza "księga projektu". W przystępny sposób opisuje całą naszą dotychczasową pracę, kluczowe decyzje, problemy i ich rozwiązania. Jest to żywy dokument, który będzie służył jako przewodnik i baza wiedzy dla każdego, kto dołączy do projektu, niezależnie od jego wiedzy technicznej.

---

## Rozdział 1: Wielka Zmiana Kursu – Od Monolitu do Mikroserwisów

Początkowo nasz cel był prosty: dodać nową logikę do istniejącej aplikacji. Jednak ta prosta misja szybko zamieniła się w fascynującą podróż przez świat nowoczesnych technologii, która doprowadziła nas do fundamentalnej zmiany strategii.

#### Punkt zwrotny: Odkrycie prawdziwej natury ADK

Kluczowym momentem było odkrycie, że **Agent Development Kit (ADK)**, czyli zestaw narzędzi od Google, na którym chcemy oprzeć naszych agentów, jest technologią stworzoną dla języka **Python**. Nasze próby integracji z istniejącym kodem w Node.js/TypeScript prowadziły do serii błędów i problemów z kompatybilnością.

To doprowadziło nas do pierwszej, strategicznej decyzji: **zamiast na siłę wciskać nową technologię w stare ramy, budujemy dla niej dedykowany, nowy dom.**

## Rozdział 2: Nasza Architektura: Firma Pełna Specjalistów

Zdecydowaliśmy się na architekturę **mikroserwisów**. To nowoczesne i niezwykle potężne podejście, które najlepiej zwizualizować jako budowanie firmy.

*   **Zamiast jednego wielkiego biura (monolit):** gdzie wszyscy pracownicy siedzą w jednym pomieszczeniu i awaria jednego działu paraliżuje resztę...
*   **Budujemy firmę złożoną z niezależnych, wyspecjalizowanych działów (mikroserwisy):** Każdy "dział" (agent) ma własne biuro (kontener na Cloud Run), własne narzędzia i pracuje niezależnie.

#### Nasz System w tej Analogii:

1.  **Agenci-Pracownicy (Worker Agents):**
    *   To nasi specjaliści. Każdy z nich ma jedną, wąską dziedzinę, w której jest ekspertem. Będziemy mieli więc:
        *   `EnricherProMax`: Specjalista od analizy zapytań i dobierania do nich danych (np. kodów PKD).
        *   `SearcherProMax`: Specjalista od przeszukiwania internetu.
        *   `ClassifierProMax`: Specjalista od kategoryzacji danych.
    *   Każdy z nich będzie osobnym **mikroserwisem na Google Cloud Run**.

2.  **Agent-Orkiestrator ("Mózg", `AgentProMax`):**
    *   To **menedżer całej firmy**. On sam nie wykonuje pracy specjalistów. Jego zadaniem jest przyjąć zlecenie od klienta (nasz interfejs użytkownika), zrozumieć je i **delegować zadania** do odpowiednich pracowników (agentów).
    *   On również będzie swoim własnym, osobnym mikroserwisem.

3.  **Komunikacja (Protokół A2A):**
    *   Menedżer nie podchodzi do biurka pracownika i nie mówi mu, co ma robić. Zamiast tego, dzwoni do niego lub wysyła e-mail z zadaniem (w naszym świecie jest to **zapytanie API przez HTTP**).
    *   Ta komunikacja między agentami to właśnie **protokół A2A (Agent-to-Agent)**. Dzięki temu system jest elastyczny i zdecentralizowany.

## Rozdział 3: Chrzest Bojowy – Nasza Walka z Cloud Run

Proces wdrażania naszego pierwszego "pracownika" (`EnricherProMax`) był wyboistą drogą, ale nauczył nas wszystkiego, co potrzebne do dalszej pracy. Oto problemy, które rozwiązaliśmy:

#### Problem 0: Chaos w Skrzynce z Narzędziami (Konflikt Zależności)
*   **Analiza problemu:** Wyobraź sobie, że wszystkie narzędzia do wszystkich projektów trzymasz w jednej, wielkiej skrzyni. Szybko okaże się, że klucz z jednego zestawu nie pasuje do śruby z innego. Dokładnie to działo się, gdy próbowaliśmy zainstalować pakiety Pythona w systemie – różne biblioteki wymagały różnych, niekompatybilnych ze sobą wersji innych narzędzi.
*   **Rozwiązanie:** Stworzyliśmy **wirtualne środowisko (`.venv`)**. To tak, jakbyśmy dla naszego projektu stworzyli nową, czystą i pustą skrzynkę na narzędzia. Dzięki temu wszystkie pakiety, które w niej zainstalowaliśmy, idealnie do siebie pasowały, nie konfliktując z niczym innym.

#### Problem 1: Przesyłka bez Adresu (Brak ID Projektu GCP)
*   **Analiza problemu:** Kontener Docker jest jak szczelnie zamknięta paczka wysłana w świat. Aplikacja wewnątrz nie ma pojęcia, gdzie się znajduje. Gdy próbowała połączyć się z usługami Google, nie wiedziała, jaki jest adres (ID projektu). Stąd błąd: `Unable to find your project`.
*   **Rozwiązanie:** Musieliśmy "nakleić adres na paczkę". Zrobiliśmy to, podając ID projektu jako **zmienną środowiskową** podczas uruchamiania kontenera. To powiedziało aplikacji: "Jesteś w projekcie `automatyzacja-pesamu`".

#### Problem 2: Zły Numer Wewnętrzny (Błędy Importu w Kodzie)
*   **Analiza problemu:** Wiedzieliśmy, że potrzebujemy narzędzia `AgentCard` z pakietu `a2a-sdk`, ale próbowaliśmy go znaleźć pod złym "adresem wewnętrznym" w bibliotece. To tak, jakby dzwonić do pracownika, znając jego imię, ale nie znając numeru jego biurka.
*   **Rozwiązanie:** Dostarczyłeś mi działający fragment kodu (`enricher.py`), który był jak firmowa książka telefoniczna. Dzięki niemu znaleźliśmy poprawny "numer wewnętrzny": `from a2a.types import AgentCard`.

#### Problem 3: Przejęzyczenie (Błąd w Nazwie Modelu AI)
*   **Analiza problemu:** Nasz agent próbował wywołać model `gemini-1.5-pro`, ale serwery Google odpowiadały błędem `404 NOT_FOUND` – "nie ma takiego modelu".
*   **Rozwiązanie:** Twoja uwaga, że wszędzie używacie `2.5-pro`, oraz dostarczona tabela modeli potwierdziły, że to zwykła literówka. Poprawiliśmy nazwę na `gemini-2.5-pro`.

#### Problem 4: Źle Wypełniony Formularz (Błędy Formatu JSON)
*   **Analiza problemu:** Gdy w końcu udało nam się połączyć z serwerem, ten odrzucał nasze zapytania, skarżąc się na zły format danych. To jak wypełnianie urzędowego formularza, wpisując dane w złe rubryki.
*   **Rozwiązanie:** Krok po kroku, czytając komunikaty błędów serwera ("pole `content` musi być listą", "nie ma pola `parts`"), doszliśmy do idealnie wypełnionego "formularza" (struktury JSON), który serwer w końcu zaakceptował.

#### Problem 5: Zbyt Gorliwy Menedżer (Problem Cichego Wyłączania)
*   **Analiza problemu:** Nasz agent przyjmował zadanie, ale po 24 sekundach jego "biuro" (kontener) gasło. Dzieje się tak, ponieważ domyślnie Cloud Run oszczędza zasoby i wyłącza instancje, które nie obsługują aktywnie żadnych zapytań. To przerywało pracę naszego agenta w tle.
*   **Rozwiązanie (proponowane):** Należy zmienić konfigurację serwisu Cloud Run. Ustawienie **Alokacja procesora** musi zostać zmienione na **"Procesor jest zawsze przydzielony"**. To jak zostawienie zapalonego światła w biurze specjalisty, aby mógł dokończyć swoją pracę po godzinach.

## 4. Wzór Postępowania na Przyszłość

`EnricherProMax` jest naszym pierwszym sukcesem i wzorcem do naśladowania.

**Jak tworzyć nowych agentów (np. `SearcherProMax`):**
1.  **Stwórz nowe "biuro":** Utwórz nowy, dedykowany katalog (np. `searcher-pro-max-service`).
2.  **Wyposaż biuro:** Skopiuj do niego podstawowe pliki: `Dockerfile`, `requirements.txt`.
3.  **Zatrudnij specjalistę:** Stwórz pliki `main.py` i `app/agents/searcher.py`.
4.  **Wpisz zakres obowiązków:** W pliku `searcher.py` zaimplementuj całą logikę dla tego konkretnego agenta.
5.  **Otwórz biuro:** W `main.py` skonfiguruj serwer tak, aby obsługiwał tego agenta.
6.  **Zgłoś do centrali:** Wdróż serwis na Cloud Run jako nową, niezależną usługę (`gcloud run deploy searcher-pro-max-service ...`).

---

## Rozdział 5: Instrukcja Wdrożenia Mikroserwisu na Cloud Run (Podsumowanie Lekcji)

Proces wdrażania naszych pierwszych mikroserwisów (`ceidg-firm-searcher-service` i `agent-pro-max-service`) był pełen wyzwań, ale doprowadził nas do wypracowania niezawodnej procedury. Poniższa instrukcja krok po kroku to esencja naszej wiedzy.

### Krok 1: Przygotowanie Kodu Agenta

Każdy agent musi być kompletną, niezależną aplikacją. Upewnij się, że jego katalog zawiera:

1.  **Kod aplikacji (`main.py`, `app/`):** Pełna logika serwera FastAPI i agenta.
2.  **Zależności (`requirements.txt`):** Kompletna lista pakietów Pythona.
3.  **`Dockerfile` (Kluczowy plik!):** Prawidłowo skonfigurowany plik do budowy kontenera.

**Wzorcowy `Dockerfile`:**
```dockerfile
# 1. Użyj kompatybilnej wersji Pythona (co najmniej 3.10)
FROM python:3.11-slim

# 2. Ustaw katalog roboczy
WORKDIR /app

# 3. Skopiuj i zainstaluj zależności
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# 4. Skopiuj resztę kodu
COPY . .

# 5. Uruchom serwer na porcie 8080 (wymagane przez Cloud Run)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```
*   **Najczęstszy błąd:** Zbyt stara wersja Pythona, która nie obsługuje wszystkich zależności (np. `a2a-sdk`). Zawsze używaj `3.10` lub nowszej.
*   **Najczęstszy błąd:** Użycie zmiennej `$PORT` zamiast "na sztywno" wpisanego portu `8080`. Chociaż `$PORT` powinno działać, wpisanie `8080` jest bardziej niezawodne.

### Krok 2: Włączenie Niezbędnych API w Google Cloud

Zanim cokolwiek wdrożysz, upewnij się, że w Twoim projekcie Google Cloud włączone są następujące interfejsy API. **Wystarczy to zrobić tylko raz na projekt.**

*   **Cloud Build API:** [Włącz tutaj](https://console.cloud.google.com/apis/library/cloudbuild.googleapis.com?project=automatyzacja-pesamu)
*   **Cloud Run API:** [Włącz tutaj](https://console.cloud.google.com/apis/library/run.googleapis.com?project=automatyzacja-pesamu)
*   **Artifact Registry API:** [Włącz tutaj](https://console.cloud.google.com/apis/library/artifactregistry.googleapis.com?project=automatyzacja-pesamu)

*   **Najczęstszy błąd:** Próba wdrożenia bez włączonych API prowadzi do mylących błędów `PERMISSION_DENIED`.

### Krok 3: Wdrożenie za pomocą jednej komendy `gcloud`

Zapomnij o `docker build`, `docker push` czy `gcloud builds submit`. Używaj jednej, potężnej komendy, która robi wszystko za nas: `gcloud run deploy`.

```bash
gcloud run deploy [NAZWA_SERWISU] --source [KATALOG_Z_KODEM] --region [REGION] --project [ID_PROJEKTU] --allow-unauthenticated
```
gcloud run deploy google-searcher-agent-service --source ./google-searcher-agent-service --platform managed --region europe-west1 --allow-unauthenticated --set-env-vars="PUPPETEER_SERVICE_URL=https://puppeteer-executor-service-567539916654.europe-west1.run.app"

**Przykład dla naszego "pracownika":**
```bash
gcloud run deploy ceidg-firm-searcher-service --source ceidg-firm-searcher-service/ --region europe-west1 --project automatyzacja-pesamu --allow-unauthenticated
```

*   `--allow-unauthenticated`: Jest kluczowe, aby nasze mikroserwisy mogły się ze sobą swobodnie komunikować.

### Krok 4: Debugowanie (Jeśli coś pójdzie nie tak)

Jeśli wdrożenie się nie uda, **zawsze sprawdzaj logi w Cloud Build**:

[https://console.cloud.google.com/cloud-build/builds?project=automatyzacja-pesamu](https://console.cloud.google.com/cloud-build/builds?project=automatyzacja-pesamu)

Znajdź na liście ostatnią, nieudaną próbę i przeanalizuj błędy. Najczęstsze problemy to:
*   Błędy w `Dockerfile`.
*   Brakujące lub niekompatybilne pakiety w `requirements.txt`.

Jeśli wdrożenie się uda, ale serwis nie działa, **sprawdzaj logi w Cloud Run**:
[https://console.cloud.google.com/run?project=automatyzacja-pesamu](https://console.cloud.google.com/run?project=automatyzacja-pesamu)
Kliknij na swoją usługę, a następnie przejdź do zakładki "LOGI".
