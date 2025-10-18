# Instrukcje Budowy i Działania Usługi Puppeteer

Ten dokument opisuje kluczowe techniki i architekturę zastosowaną w usłudze opartej na Puppeteer, która działa jako zdalny silnik przeglądarki dla agentów AI.

## 1. Podstawowa Technologia

- **Puppeteer-extra**: Zamiast standardowego `puppeteer`, używamy `puppeteer-extra`. Jest to nakładka, która pozwala na łatwe dodawanie pluginów.
- **Plugin Stealth (`puppeteer-extra-plugin-stealth`)**: To kluczowy plugin, który modyfikuje różne właściwości przeglądarki (takie jak `navigator.webdriver`), aby ukryć fakt, że jest ona zautomatyzowana. Znacząco zmniejsza to ryzyko bycia wykrytym i zablokowanym przez strony internetowe.

```javascript
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
```

## 2. Zarządzanie Sesjami

Usługa jest stanowa, co oznacza, że utrzymuje aktywne sesje przeglądarki dla różnych zadań lub agentów.

- **Przechowywanie sesji**: Obiekt `Map` o nazwie `sessions` przechowuje aktywne instancje przeglądarki i strony. Kluczem jest `sessionId`.
- **Automatyczne czyszczenie**: Funkcja `setInterval` uruchamiana co minutę sprawdza, kiedy każda sesja była ostatnio używana (`lastAccessed`). Jeśli sesja jest nieaktywna przez ponad 10 minut, jest automatycznie zamykana, a jej zasoby są zwalniane. Zapobiega to wyciekom pamięci i utrzymywaniu "wiszących" procesów przeglądarki.

## 3. Konfiguracja Uruchomienia Przeglądarki (`puppeteer.launch`)

Jest to najważniejszy element zapewniający stabilność w środowiskach kontenerowych (np. Docker, Cloud Run, Cloud Functions).

```javascript
const browser = await puppeteer.launch({
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
    ]
});
```

- **`--no-sandbox`**: Wyłącza piaskownicę (sandbox) Chrome. Jest to **krytycznie wymagane** do uruchomienia przeglądarki w kontenerach, gdzie uprawnienia systemowe są ograniczone.
- **`--disable-setuid-sandbox`**: Dodatkowa flaga uzupełniająca `--no-sandbox`.
- **`--disable-dev-shm-usage`**: Zapobiega problemom z pamięcią współdzieloną (`/dev/shm`), która w niektórych środowiskach kontenerowych jest zbyt mała, co mogłoby prowadzić do awarii przeglądarki.
- **`--disable-gpu`**: Wyłącza akcelerację sprzętową GPU, co jest zbędne w trybie `headless` i może powodować problemy ze sterownikami w środowiskach serwerowych.

## 4. Konfiguracja Strony (`page`)

Przed użyciem strony, ustawiane są na niej parametry, aby symulować zachowanie prawdziwego użytkownika i zwiększyć stabilność.

```javascript
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...');
await page.setViewport({ width: 1280, height: 800 });
await page.setDefaultNavigationTimeout(60000);
```

- **`setUserAgent`**: Ustawia realistyczny User-Agent, aby uniknąć podstawowej weryfikacji botów.
- **`setViewport`**: Definiuje rozmiar okna przeglądarki. Niektóre strony renderują inne treści (np. wersję mobilną) w zależności od tego parametru.
- **`setDefaultNavigationTimeout`**: Zwiększa domyślny czas oczekiwania na załadowanie strony do 60 sekund. Jest to przydatne przy wolniejszych stronach lub niestabilnym połączeniu.

## 5. Architektura Akcji (`handlePuppeteerAction`)

Główna logika jest zamknięta w asynchronicznej funkcji `handlePuppeteerAction`, która działa jak router, wykonując określone zadania na podstawie parametru `action`.

- **`goToURL`**: Nawiguje do podanego adresu URL. Używa `waitUntil: 'networkidle2'`, co oznacza, że czeka, aż aktywność sieciowa na stronie prawie ustanie. Jest to bardziej niezawodne niż domyślne `load`.
- **`clickElement`**: Klika w element i **jednocześnie czeka na potencjalną nawigację**. Użycie `Promise.all` pozwala uniknąć "wyścigów" (race conditions), gdzie skrypt próbowałby wykonać następną akcję, zanim strona po kliknięciu zdążyłaby się załadować.
- **`scrapeContent`**: Pobiera pełną zawartość HTML strony. Posiada wbudowane oczekiwanie na pojawienie się selektora, co zwiększa niezawodność.
- **`lookAtPage`**: **Kluczowa funkcja dla agentów AI**. Zamiast zwracać cały, skomplikowany DOM, przetwarza stronę w poszukiwaniu widocznych i interaktywnych elementów (`a`, `button`, `input` itp.). Następnie zwraca uproszczoną listę tych elementów wraz z ich tekstem i unikalnym selektorem (`data-agent-id`), który agent może wykorzystać do precyzyjnego klikania lub wpisywania tekstu.

## 6. Funkcje Pomocnicze

- **`normalizeUrl`**: Prosta, ale użyteczna funkcja, która naprawia typowe błędy w adresach URL (np. brakujący protokół `https://` lub pomyłka `https.`).

## 7. Serwer API (Express)

Cała funkcjonalność jest udostępniana przez prosty serwer `Express` na punkcie końcowym `/execute`. Przyjmuje on żądania POST z `action`, `params` i `sessionId`, co pozwala na zdalne sterowanie przeglądarką przez dowolną aplikację zdolną do wysyłania żądań HTTP.

## 8. Definicja i Przykłady Użycia API

Ta sekcja zawiera techniczne szczegóły dotyczące sposobu komunikacji z usługą Puppeteer.

### Adres URL Punktu Końcowego (Endpoint)

Usługa nasłuchuje na pojedynczym punkcie końcowym, który przyjmuje wszystkie polecenia.

- **Metoda**: `POST`
- **Ścieżka**: `/execute`
- **Pełny adres URL**: `http://<adres-ip-usługi>:8080/execute` (domyślny port to 8080, ale może być inny w zależności od zmiennej środowiskowej `PORT`).

### Format Zapytania (Request Body)

Każde zapytanie musi być w formacie JSON i zawierać trzy kluczowe pola:

- `sessionId` (string): Unikalny identyfikator sesji. Jeśli sesja o danym ID nie istnieje, zostanie automatycznie utworzona. Pozwala na prowadzenie wielu niezależnych interakcji jednocześnie.
- `action` (string): Nazwa akcji do wykonania (np. `goToURL`, `clickElement`).
- `params` (object): Obiekt zawierający parametry specyficzne dla danej akcji.

### Przykładowe Kody (Wywołania `curl`)

Poniżej znajdują się przykłady wywołań API przy użyciu narzędzia `curl`.

**1. Rozpoczęcie sesji i nawigacja do strony:**

```bash
curl -X POST http://localhost:8080/execute \
-H "Content-Type: application/json" \
-d 
{
    "sessionId": "sesja-agenta-123",
    "action": "goToURL",
    "params": {
        "url": "https://www.google.com"
    }
}
```

**2. Wpisywanie tekstu w pole wyszukiwania:**

(Zakładając, że poprzednia komenda została wykonana w tej samej sesji)

```bash
curl -X POST http://localhost:8080/execute \
-H "Content-Type: application/json" \
-d 
{
    "sessionId": "sesja-agenta-123",
    "action": "typeText",
    "params": {
        "selector": "textarea[name=q]",
        "text": "pogoda w Warszawie"
    }
}
```

**3. Kliknięcie w przycisk wyszukiwania:**

```bash
curl -X POST http://localhost:8080/execute \
-H "Content-Type: application/json" \
-d 
{
    "sessionId": "sesja-agenta-123",
    "action": "clickElement",
    "params": {
        "selector": "input[name=btnK]"
    }
}
```

**4. Analiza widocznych elementów na stronie (dla AI):**

```bash
curl -X POST http://localhost:8080/execute \
-H "Content-Type: application/json" \
-d 
{
    "sessionId": "sesja-agenta-123",
    "action": "lookAtPage",
    "params": {}
}
```
**Odpowiedź (przykład):**
```json
{
    "success": true,
    "simplifiedDom": "Oto co widzę na stronie:\n- A: \"Grafika\" (selektor: [data-agent-id=\"a1b2c3d4\"])\n- A: \"Wiadomości\" (selektor: [data-agent-id=\"e5f6g7h8\"])\n"
}
```

**5. Pobranie pełnej zawartości HTML:**

```bash
curl -X POST http://localhost:8080/execute \
-H "Content-Type: application/json" \
-d 
{
    "sessionId": "sesja-agenta-123",
    "action": "scrapeContent",
    "params": {}
}
```

**6. Zakończenie sesji:**

```bash
curl -X POST http://localhost:8080/execute \
-H "Content-Type: application/json" \
-d 
{
    "sessionId": "sesja-agenta-123",
    "action": "closeSession",
    "params": {}
}
```

### Format Odpowiedzi (Response Body)

Odpowiedź serwera jest zawsze w formacie JSON.

- **Sukces**:
  ```json
  {
      "success": true,
      "message": "Operacja zakończona sukcesem.",
      // ... inne dane, np. "content" lub "simplifiedDom"
  }
  ```
- **Błąd**:
  ```json
  {
      "success": false,
      "error": "Opis błędu, który wystąpił."
  }
  ```