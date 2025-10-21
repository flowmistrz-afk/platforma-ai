# Rozważania architektoniczne z dnia 2024-10-27

## 1. Porządkowanie struktury projektu
- **Problem:** Zidentyfikowano zduplikowany katalog `platforma-ai` w głównej strukturze projektu, który był lustrzaną kopią całego repozytorium.
- **Akcja:** Przed usunięciem, zweryfikowano za pomocą polecenia `diff -qr --exclude="platforma-ai" --exclude=".git" . platforma-ai`, że zawartość jest identyczna.
- **Decyzja:** Po potwierdzeniu, że jest to zbędny duplikat, katalog `platforma-ai` został usunięty (`rm -rf platforma-ai`), aby uporządkować strukturę i uniknąć pomyłek w przyszłości.

## 2. Architektura mikroserwisów: `main.py` vs `orchestrator.py`
- **Pytanie:** Dlaczego logika jest rozdzielona między te dwa pliki?
- **Odpowiedź:** Wynika to z zasady **separacji odpowiedzialności (Separation of Concerns)**.
    - **`main.py` (Kelner):** Jest punktem wejściowym API (FastAPI). Odpowiada za komunikację ze światem zewnętrznym, walidację danych przychodzących i obsługę żądań HTTP. Nie wie, *jak* wykonać zadanie.
    - **`orchestrator.py` (Szef Kuchni):** Zawiera "mózg" i logikę biznesową agenta. To on decyduje, jak przetworzyć dane i które narzędzia wywołać. Nie zajmuje się komunikacją webową.
- **Korzyści:** Łatwiejsze testowanie, większa elastyczność i czystszy kod.

## 3. Problem asynchroniczności: "Mózg się wyłącza"
- **Problem:** `agent-pro-max-service` ("mózg") wysyłał zadanie do serwisu-narzędzia (np. `puppeteer-service`), ale jego instancja w Cloud Run była zamykana z powodu braku aktywności, zanim narzędzie zdążyło zwrócić odpowiedź.
- **Przyczyna:** Synchroniczne oczekiwanie na odpowiedź w architekturze serverless (Cloud Run), która jest bezstanowa i efemeryczna, jest anty-wzorcem.

## 4. Rozwiązanie: Wdrożenie architektury opartej na zdarzeniach z Pub/Sub
- **Decyzja:** Przebudowa systemu w celu wykorzystania **Google Cloud Pub/Sub** do asynchronicznej komunikacji między serwisami.

### 4.1. Nowy przepływ pracy
1.  **Mózg (`agent-pro-max-service`)** otrzymuje żądanie, tworzy `task_id`, zapisuje zadanie w Firestore i **publikuje** wiadomość z zadaniem do dedykowanego tematu Pub/Sub. Natychmiast zwraca `task_id` do klienta.
2.  **Serwis-narzędzie** (np. `ceidg-details-fetcher-service`) **subskrybuje** swój dedykowany temat. Otrzymuje zadanie poprzez subskrypcję typu **Push**.
3.  Po wykonaniu pracy, serwis-narzędzie **publikuje wynik** do centralnego tematu `agent-results-topic`, dołączając `task_id`.
4.  **Mózg** ma w tle aktywną subskrypcję typu **Pull** na `agent-results-topic`. Po otrzymaniu wyniku, aktualizuje odpowiedni dokument w Firestore.

### 4.2. Routing zadań: Jak agent wie, co subskrybować?
- **Problem:** Gdyby wszystkie narzędzia subskrybowały jeden temat `agent-tasks-topic`, każdy serwis otrzymywałby każde zadanie.
- **Rozwiązanie (Rekomendowane): Dedykowane tematy dla każdego serwisu.**
    - Tworzymy osobne tematy, np. `ceidg-firm-searcher-topic`, `ceidg-details-fetcher-topic` itd.
    - "Mózg" decyduje, które narzędzie wywołać, i publikuje zadanie do odpowiedniego, dedykowanego tematu.
    - Każdy serwis-narzędzie subskrybuje tylko i wyłącznie swój własny temat.
- **Korzyści:** Pełna izolacja, maksymalna wydajność (brak niepotrzebnych wybudzeń serwisów) i przejrzystość architektury.

## 5. Konkretne zmiany w kodzie
- **`agent-pro-max-service`:**
    - Zmiana endpointu `/execute` na publikujący zadanie do Pub/Sub.
    - Dodanie mechanizmu subskrypcji (Pull) na `startup`, który nasłuchuje na wyniki w tle.
    - Wprowadzenie logiki routingu, która kieruje zadania do dedykowanych tematów poszczególnych narzędzi.
- **Serwisy-narzędzia (np. `ceidg-details-fetcher-service`):**
    - Zmiana głównego endpointu na `POST "/"`, aby mógł przyjmować żądania typu Push z Pub/Sub.
    - Dodanie logiki do dekodowania wiadomości z Pub/Sub.
    - Implementacja publikowania wyników do tematu `agent-results-topic`.
