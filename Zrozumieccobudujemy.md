# Zrozumieć Co Budujemy - Instrukcja Krok po Kroku

## 1. Inteligentne Wykorzystanie Agenta 'Enricher' przez 'Mózg' (Orkiestratora)

W architekturze `AgentProMax`, "Mózg" (orkiestrator) działa jako inteligentny menedżer, który dynamicznie decyduje, którzy agenci-specjaliści są potrzebni do wykonania zadania. Jednym z kluczowych agentów jest `enricher`, odpowiedzialny za wzbogacanie początkowego zapytania użytkownika.

**Zasada działania:**

*   **Pochodzenie zapytania:** Zapytanie użytkownika trafia do "Mózgu" z formularza w komponencie `workflowbuilder.tsx`.
*   **Decyzja "Mózgu":**
    *   **Jeśli zapytanie jest niekompletne** lub użytkownik **nie wybrał konkretnych kodów PKD** w formularzu (np. pozostawił pola wyboru PKD puste, jak to widać na obrazku poniżej), "Mózg" podejmuje decyzję o uruchomieniu agenta `enricher`. Agent ten (działający analogicznie do `functions/src/agents/enricher.ts` z Agenta PRO) zajmie się wyodrębnieniem głównej usługi, wygenerowaniem słów kluczowych oraz doborem najbardziej trafnych kodów PKD z dostępnej bazy.
    *   **Jeśli użytkownik precyzyjnie podał kody PKD** w formularzu `workflowbuilder.tsx`, "Mózg" stwierdza, że zadanie wzbogacania nie jest konieczne. W takim przypadku `enricher` **nie zostanie uruchomiony**, a "Mózg" przejdzie bezpośrednio do kolejnych etapów workflow z danymi dostarczonymi przez użytkownika.

Poniższy schemat ilustruje tę logikę:

<!-- IMAGES/enricher_logic.png -->
# Zrozumieć Co Budujemy - Instrukcja Krok po Kroku

## 1. Inteligentne Wykorzystanie Agenta 'Enricher' przez 'Mózg' (Orkiestratora)

W architekturze `AgentProMax`, "Mózg" (orkiestrator) działa jako inteligentny menedżer, który dynamicznie decyduje, którzy agenci-specjaliści są potrzebni do wykonania zadania. Jednym z kluczowych agentów jest `enricher`, odpowiedzialny za wzbogacanie początkowego zapytania użytkownika.

**Zasada działania:**

*   **Pochodzenie zapytania:** Zapytanie użytkownika trafia do "Mózgu" z formularza w komponencie `src/components/workflow-builder/WorkflowBuilder.tsx` (lub powiązanego, jak `workflowbuilder.tsx`).
*   **Decyzja "Mózgu":**
    *   **Jeśli zapytanie jest niekompletne** lub użytkownik **nie wybrał konkretnych kodów PKD** w formularzu (np. pozostawił pola wyboru PKD puste, jak to widać na obrazku poniżej), "Mózg" podejmuje decyzję o uruchomieniu agenta `enricher`. Agent ten (działający analogicznie do `functions/src/agents/enricher.ts` z Agenta PRO) zajmie się wyodrębnieniem głównej usługi, wygenerowaniem słów kluczowych oraz doborem najbardziej trafnych kodów PKD z dostępnej bazy.
    *   **Jeśli użytkownik precyzyjnie podał kody PKD** w formularzu, "Mózg" stwierdza, że zadanie wzbogacania nie jest konieczne. W takim przypadku `enricher` **nie zostanie uruchomiony**, a "Mózg" przejdzie bezpośrednio do kolejnych etapów workflow z danymi dostarczonymi przez użytkownika.

Poniższe schematy ilustrują tę logikę:

### Schemat działania "Mózgu" i "Enrichera"

![Logika działania Enrichera](IMAGES/enricher_logic.png)

### Przykład formularza - brak wybranych kodów PKD

![Formularz WorkflowBuilder](IMAGES/workflow_fcat functions/src/agents/orchestrator.ts
orm.png)

Ta warunkowa logika zapewnia efektywność systemu, wykorzystując zasoby AI tylko wtedy, gdy są faktycznie potrzebne do uzupełnienia lub doprecyzowania danych wejściowych.

## 2. Warunkowe Wyszukiwanie i Wzbogacanie Danych: Ścieżka CEIDG

Po etapie wzbogacania zapytania (jeśli był potrzebny), "Mózg" przechodzi do fazy wyszukiwania. W `AgentProMax` użytkownik ma kontrolę nad tym, z jakich źródeł danych agent ma korzystać. Jedną z kluczowych ścieżek jest wyszukiwanie wyłącznie w CEIDG.

**Przebieg dla wyboru "Wyszukiwanie tylko w CEIDG":**

1.  **Dane wejściowe:** "Mózg" otrzymuje zestandaryzowane dane: zidentyfikowaną usługę, słowa kluczowe i kody PKD (pochodzące od `enrichera` lub bezpośrednio od użytkownika).

2.  **Cele i dostępne "narzędzia" dla "Mózgu":**
    *   Użytkownik, poprzez interfejs `workflowbuilder.tsx`, informuje "Mózg" o dostępnych źródłach (np. "Wyszukiwanie w CEIDG") oraz o **preferowanych celach dodatkowych**, takich jak "Zaweź wyszukiwanie", "Pobierz szczegóły" i "Spróbuj pozyskać kontakty".
    *   **To "Mózg" (główny agent LLM) dynamicznie analizuje te cele i dostępne mu "narzędzia" (innych agentów), aby zbudować optymalny plan działania (pipeline) i zdecydować o kolejności oraz sposobie ich użycia.**

3.   **Potencjalni agenci w akcji (wykorzystywani przez "Mózg" do realizacji celów):**
    *   **a. Agent "CEIDG - Wyszukiwarka Firm"** (`functions/src/agents/ceidg-firm-searcher.ts` - **NOWY**):
        *   **Cel:** Znalezienie firm w bazie CEIDG, które odpowiadają podanym kodom PKD (i ewentualnie lokalizacji/promieniowi).
        *   **Akcja:** Wykonuje zapytanie do API CEIDG, zwracając **podstawowe podsumowania firm** spełniających kryteria (np. `id`, `nazwa`, `nip`, `regon`, `adresDzialalnosci`). Nie pobiera jeszcze pełnych szczegółów.
    *   **b. Agent "CEIDG - Pobieracz Danych Firm"** (`functions/src/agents/ceidg-firm-details-fetcher.ts` - **NOWY**):
        *   **Cel:** Uzyskanie **pełnych, szczegółowych danych** dla każdej z firm, których listę otrzymał (np. od "CEIDG - Wyszukiwarki Firm" po wstępnym filtrowaniu).
        *   **Akcja:** Dla każdej firmy (na podstawie jej ID lub innych identyfikatorów), wykonuje osobne zapytanie do API CEIDG, aby pobrać wszystkie dostępne informacje (np. `email`, `telefon`, lista wszystkich PKD).
        *   Wyniki są standaryzowane do formatu `SearchResultItem`, gotowego do dalszego przetwarzania. Ten agent jest kluczowy, gdy użytkownik zaznaczy cel "Pobierz szczegóły" (dla CEIDG).
    *   **c. Agent "Zaweż Wyszukiwanie Firm"** (nowy lub rozbudowa istniejącego `classifier.ts`):
        *   **Cel:** Odfiltrowanie z listy zwróconej przez "CEIDG - Wyszukiwarkę Firm" pozycji, które nie pasują do **oryginalnego zapytania użytkownika**, mimo zgodności PKD.
        *   **Akcja:** Analizuje nazwy i podstawowe opisy firm z CEIDG (np. "Zakład Fryzjerski") i porównuje je z `identifiedService` (np. "firma brukarska"), usuwając niepasujące pozycje. To zwiększa trafność wyników. Ten agent jest uruchamiany, gdy użytkownik zaznaczy cel "Zaweź wyszukiwanie".
    *   **d. Agent "Poszukiwacz Kontaktów Online"** (`contact-enricher.ts` lub `browser-searcher.ts` + `scraper.ts`):
        *   **Cel:** Uzupełnienie brakujących danych kontaktowych (np. adresu email, numeru telefonu), których nie udało się pozyskać bezpośrednio z CEIDG.
        *   **Akcja:** Dla firm, dla których brakuje kluczowych danych kontaktowych, agent próbuje wyszukać je w ogólnym internecie (np. Google Search, strony firmowe), korzystając z nazwy firmy i adresu, a następnie je scrapuje. W tym etapie może być wykorzystany `puppeteer-service`. Ten agent jest uruchamiany, gdy użytkownik zaznaczy cel "Spróbuj pozyskać kontakty".

---
## 3++ rozwiniecie ##3. Instrukcja Budowy: Integracja z API CEIDG (Agenci "CEIDG - Wyszukiwarka Firm" i "CEIDG - Pobieracz Danych Firm")

Aby "Mózg" mógł skutecznie korzystać z danych CEIDG, niezbędna jest poprawna konfiguracja i komunikacja z zewnętrznym API. Poniżej przedstawiono kluczowe aspekty tej integracji.

### 3.1. Uwierzytelnianie i Adres Bazowy

*   **Klucz API:** Dostęp do API CEIDG wymaga klucza. Musi on być przechowywany bezpiecznie jako zmienna środowiskowa, np. `CEIDG_API_KEY`. W środowisku Firebase Functions, zmienne te konfiguruje się za pomocą Firebase CLI (np. `firebase functions:config:set ceidg.apikey="YOUR_API_KEY"`).
*   **Adres bazowy API:**
    ```
    https://api.ceidg.gov.pl/
    ```

### 3.2. Agent "CEIDG - Wyszukiwarka Firm" (Searcher)

Ten agent odpowiada za pobieranie listy firm na podstawie ogólnych kryteriów.

*   **Endpoint:** `/firma`
*   **Metoda:** `GET`
*   **Nagłówki (Headers):**
    *   `Authorization: Bearer [TWÓJ_KLUCZ_API_CEIDG]`
    *   `Content-Type: application/json`
*   **Parametry Zapytania (Query Parameters):**
    *   `pkd`: Kod(y) PKD (jako string lub array stringów, jeśli API obsługuje wiele). Przykład: `pkd=6201Z`
    *   `adresMiasto`: Nazwa miejscowości. Przykład: `adresMiasto=Warszawa`
    *   `promien`: Promień wyszukiwania w kilometrach od centrum miejscowości (opcjonalnie, jeśli API to wspiera). Przykład: `promien=20`
*   **Przykładowe Zapytanie (GET):**
    ```
    GET https://api.ceidg.gov.pl/firma?pkd=6201Z&adresMiasto=Warszawa&promien=20
    Authorization: Bearer YOUR_CEIDG_API_KEY
    ```
*   **Oczekiwana Struktura Odpowiedzi (fragmentarycznie, lista firm):**
    ```json
    [
      {
        "id": "UNIKALNE_ID_FIRMY_1",
        "nazwa": "Nazwa Firmy Sp. z o.o.",
        "nip": "1234567890",
        "regon": "123456789",
        "adresDzialalnosci": {
          "ulica": "Kwiatowa",
          "numerBudynku": "10",
          "kodPocztowy": "00-001",
          "miejscowosc": "Warszawa",
          "wojewodztwo": "MAZOWIECKIE"
        }
      },
      // ... kolejne firmy
    ]
    ```
    *   **Uwaga:** Dokładny format odpowiedzi należy zweryfikować z dokumentacją CEIDG (`HD CEIDG - API v3 HD - Dokumentacja dla integratorów v1.0.txt`).

### 3.3. Agent "CEIDG - Pobieracz Danych Firm" (Details Fetcher)

Ten agent odpowiada za pobieranie pełnych szczegółów o pojedynczej firmie na podstawie jej ID.

*   **Endpoint:** `/firma/{id}` (gdzie `{id}` to unikalny identyfikator firmy uzyskany z Zapytania 1)
*   **Metoda:** `GET`
*   **Nagłówki (Headers):**
    *   `Authorization: Bearer [TWÓJ_KLUCZ_API_CEIDG]`
    *   `Content-Type: application/json`
*   **Przykładowe Zapytanie (GET):**
    ```
    GET https://api.ceidg.gov.pl/firma/UNIKALNE_ID_FIRMY_1
    Authorization: Bearer YOUR_CEIDG_API_KEY
    ```
*   **Oczekiwana Struktura Odpowiedzi (szczegóły pojedynczej firmy):**
    ```json
    {
      "id": "UNIKALNE_ID_FIRMY_1",
      "nazwa": "Nazwa Firmy Sp. z o.o.",
      "nip": "1234567890",
      "regon": "123456789",
      "adresDzialalnosci": { /* ... pełny obiekt adresu ... */ },
      "adresKorespondencyjny": { /* ... obiekt adresu ... */ },
      "email": "kontakt@firma.pl",
      "telefon": "123456789",
      "stronaInternetowa": "www.firma.pl",
      "pkdGlowny": "6201Z",
      "pkd": ["6201Z", "6202Z", "6209Z"], // Lista wszystkich PKD
      "dataRozpoczeciaDzialalnosci": "YYYY-MM-DD",
      // ... inne szczegółowe dane
    }
    ```
    *   **Uwaga:** Ponownie, dokładny format odpowiedzi należy zweryfikować z dokumentacją CEIDG.

---## 3. Warunkowe Wyszukiwanie i Wzbogacanie Danych: Ścieżka CEIDG

Po etapie wzbogacania zapytania (jeśli był potrzebny), "Mózg" przechodzi do fazy wyszukiwania. W `AgentProMax` użytkownik ma kontrolę nad tym, z jakich źródeł danych agent ma korzystać. Jedną z kluczowych ścieżek jest wyszukiwanie wyłącznie w CEIDG.

**Przebieg dla wyboru "Wyszukiwanie tylko w CEIDG":**

1.  **Dane wejściowe:** "Mózg" otrzymuje zestandaryzowane dane: zidentyfikowaną usługę, słowa kluczowe i kody PKD (pochodzące od `enrichera` lub bezpośrednio od użytkownika).

2.  **Cele i dostępne "narzędzia" dla "Mózgu":**
    *   Użytkownik, poprzez interfejs `workflowbuilder.tsx`, informuje "Mózg" o dostępnych źródłach (np. "Wyszukiwanie w CEIDG") oraz o **preferowanych celach dodatkowych**, takich jak "Zaweź wyszukiwanie", "Pobierz szczegóły" i "Spróbuj pozyskać kontakty".
    *   **To "Mózg" (główny agent LLM) dynamicznie analizuje te cele i dostępne mu "narzędzia" (innych agentów), aby zbudować optymalny plan działania (pipeline) i zdecydować o kolejności oraz sposobie ich użycia.**

3.  **Potencjalni agenci w akcji (wykorzystywani przez "Mózg" do realizacji celów):**
    *   **a. Agent "CEIDG - Wyszukiwarka Firm"** (`/ceidg-firm-searcher-service/` - **NOWY MIKROSERWIS**):
        *   **Cel:** Znalezienie firm w bazie CEIDG, które odpowiadają podanym kodom PKD (i ewentualnie lokalizacji/promieniowi).
        *   **Akcja:** Wykonuje zapytanie do API CEIDG, zwracając **podstawowe podsumowania firm** spełniających kryteria (np. `id`, `nazwa`, `nip`, `regon`, `adresDzialalnosci`). Nie pobiera jeszcze pełnych szczegółów.
    *   **b. Agent "CEIDG - Pobieracz Danych Firm"** (`/ceidg-details-fetcher-service/` - **NOWY MIKROSERWIS**):
        *   **Cel:** Uzyskanie **pełnych, szczegółowych danych** dla każdej z firm, których listę otrzymał (np. od "CEIDG - Wyszukiwarki Firm" po wstępnym filtrowaniu).
        *   **Akcja:** Dla każdej firmy (na podstawie jej ID lub innych identyfikatorów), wykonuje osobne zapytanie do API CEIDG, aby pobrać wszystkie dostępne informacje (np. `email`, `telefon`, lista wszystkich PKD).
        *   Wyniki są standaryzowane do formatu `SearchResultItem`, gotowego do dalszego przetwarzania. Ten agent jest kluczowy, gdy użytkownik zaznaczy cel "Pobierz szczegóły" (dla CEIDG).
    *   **c. Agent "Zaweż Wyszukiwanie Firm"** (nowy mikroserwis, np. `/firm-classifier-service/`):
        *   **Cel:** Odfiltrowanie z listy zwróconej przez "CEIDG - Wyszukiwarkę Firm" pozycji, które nie pasują do **oryginalnego zapytania użytkownika**, mimo zgodności PKD.
        *   **Akcja:** Analizuje nazwy i podstawowe opisy firm z CEIDG (np. "Zakład Fryzjerski") i porównuje je z `identifiedService` (np. "firma brukarska"), usuwając niepasujące pozycje. To zwiększa trafność wyników. Ten agent jest uruchamiany, gdy użytkownik zaznaczy cel "Zaweź wyszukiwanie".
    *   **d. Agent "Poszukiwacz Kontaktów Online"** (nowy mikroserwis, np. `/contact-enricher-service/`):
        *   **Cel:** Uzupełnienie brakujących danych kontaktowych (np. adresu email, numeru telefonu), których nie udało się pozyskać bezpośrednio z CEIDG.
        *   **Akcja:** Dla firm, dla których brakuje kluczowych danych kontaktowych, agent próbuje wyszukać je w ogólnym internecie (np. Google Search, strony firmowe), korzystając z nazwy firmy i adresu, a następnie je scrapuje. W tym etapie może być wykorzystany `puppeteer-service`. Ten agent jest uruchamiany, gdy użytkownik zaznaczy cel "Spróbuj pozyskać kontakty".

---

## 4. Instrukcja Budowy: Integracja z API CEIDG

Aby "Mózg" mógł skutecznie korzystać z danych CEIDG, niezbędna jest poprawna konfiguracja i komunikacja z zewnętrznym API. Poniżej przedstawiono kluczowe aspekty tej integracji.

### 4.1. Uwierzytelnianie i Adres Bazowy

*   **Klucz API:** Dostęp do API CEIDG wymaga klucza. Musi on być przechowywany bezpiecznie jako zmienna środowiskowa, np. `CEIDG_API_KEY`.
*   **Adres bazowy API:**
    ```
    https://api.ceidg.gov.pl/
    ```

### 4.2. Agent "CEIDG - Wyszukiwarka Firm" (Searcher)

Ten agent odpowiada za pobieranie listy firm na podstawie ogólnych kryteriów.

*   **Endpoint:** `/firma`
*   **Metoda:** `GET`
*   **Nagłówki (Headers):**
    *   `Authorization: Bearer [TWÓJ_KLUCZ_API_CEIDG]`
    *   `Content-Type: application/json`
*   **Parametry Zapytania (Query Parameters):**
    *   `pkd`: Kod(y) PKD (jako string lub array stringów, jeśli API obsługuje wiele). Przykład: `pkd=6201Z`
    *   `adresMiasto`: Nazwa miejscowości. Przykład: `adresMiasto=Warszawa`
    *   `promien`: Promień wyszukiwania w kilometrach od centrum miejscowości (opcjonalnie, jeśli API to wspiera). Przykład: `promien=20`
*   **Przykładowe Zapytanie (GET):**
    ```
    GET https://api.ceidg.gov.pl/firma?pkd=6201Z&adresMiasto=Warszawa&promien=20
    Authorization: Bearer YOUR_CEIDG_API_KEY
    ```
*   **Oczekiwana Struktura Odpowiedzi (fragmentarycznie, lista firm):**
    ```json
    [
      {
        "id": "UNIKALNE_ID_FIRMY_1",
        "nazwa": "Nazwa Firmy Sp. z o.o.",
        "nip": "1234567890",
        "regon": "123456789",
        "adresDzialalnosci": {
          "ulica": "Kwiatowa",
          "numerBudynku": "10",
          "kodPocztowy": "00-001",
          "miejscowosc": "Warszawa",
          "wojewodztwo": "MAZOWIECKIE"
        }
      },
      // ... kolejne firmy
    ]
    ```
    *   **Uwaga:** Dokładny format odpowiedzi należy zweryfikować z dokumentacją CEIDG (`HD CEIDG - API v3 HD - Dokumentacja dla integratorów v1.0.txt`).

### 4.3. Agent "CEIDG - Pobieracz Danych Firm" (Details Fetcher)

Ten agent odpowiada za pobieranie pełnych szczegółów o pojedynczej firmie na podstawie jej ID.

*   **Endpoint:** `/firma/{id}` (gdzie `{id}` to unikalny identyfikator firmy uzyskany z Zapytania 1)
*   **Metoda:** `GET`
*   **Nagłówki (Headers):**
    *   `Authorization: Bearer [TWÓJ_KLUCZ_API_CEIDG]`
    *   `Content-Type: application/json`
*   **Przykładowe Zapytanie (GET):**
    ```
    GET https://api.ceidg.gov.pl/firma/UNIKALNE_ID_FIRMY_1
    Authorization: Bearer YOUR_CEIDG_API_KEY
    ```
*   **Oczekiwana Struktura Odpowiedzi (szczegóły pojedynczej firmy):**
    ```json
    {
      "id": "UNIKALNE_ID_FIRMY_1",
      "nazwa": "Nazwa Firmy Sp. z o.o.",
      "nip": "1234567890",
      "regon": "123456789",
      "adresDzialalnosci": { /* ... pełny obiekt adresu ... */ },
      "adresKorespondencyjny": { /* ... obiekt adresu ... */ },
      "email": "kontakt@firma.pl",
      "telefon": "123456789",
      "stronaInternetowa": "www.firma.pl",
      "pkdGlowny": "6201Z",
      "pkd": ["6201Z", "6202Z", "6209Z"], // Lista wszystkich PKD
      "dataRozpoczeciaDzialalnosci": "YYYY-MM-DD",
      // ... inne szczegółowe dane
    }
    ```
    *   **Uwaga:** Ponownie, dokładny format odpowiedzi należy zweryfikować z dokumentacją CEIDG.
---