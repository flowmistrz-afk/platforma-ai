# Analiza i rozwiązanie problemu z funkcją Cloud Function: Studium przypadku

Ten dokument opisuje krok po kroku proces diagnozy i naprawy złożonego problemu z funkcją Firebase Cloud Function (`agent1_expandKeywords`), która zwracała błąd 500. Może służyć jako instrukcja rozwiązywania podobnych problemów w przyszłości.

## 1. Problem Początkowy

**Objaw:** Aplikacja kliencka (React) przy próbie wywołania funkcji `agent1_expandKeywords` otrzymywała błąd `500 (Internal Server Error)`. Komunikat błędu po stronie klienta był ogólny (`FirebaseError: Błąd podczas generowania sugestii AI`) i nie wskazywał na przyczynę.

**Cel funkcji:** Funkcja miała przyjmować od klienta słowo kluczowe (`specialization`), wysyłać je do modelu AI (Vertex AI Gemini), a następnie zwracać listę powiązanych słów kluczowych i kodów PKD w formacie JSON.

## 2. Proces Diagnostyczny i Błędne Ścieżki

Nasza droga do rozwiązania była długa, ponieważ kilka początkowych tropów okazało się mylnych. To ważna lekcja w procesie debugowania.

#### Podejrzenie #1: Błąd w logice kodu (odrzucone)
Pierwsza hipoteza zakładała błąd typu `TypeError` w kodzie, jeśli klient nie przesłał obiektu `sources`. Szybko okazało się to nieprawdą, ponieważ błąd występował nawet przy poprawnych danych.

#### Podejrzenie #2: Błąd wdrożenia i niepoprawny typ funkcji (błędna diagnoza)
Przez długi czas zmagaliśmy się z teorią, że narzędzie `firebase-tools` ma błąd i niepoprawnie wdraża funkcję `onCall` jako zwykłą funkcję `HTTP`. Dowody wydawały się mocne:
*   **UI Konsoli Google Cloud:** Pokazywało "HTTP" jako typ wyzwalacza.
*   **Logi Audytu:** Pokazywały, że żądanie API zawierało `httpsTrigger`.

**Wniosek z tej ścieżki (który okazał się błędny):** Myśleliśmy, że to bug w `firebase-tools`. Próbowaliśmy obejść problem przez aktualizację narzędzi, czyszczenie zależności, a nawet refaktoryzację funkcji na `onRequest`, co tylko wprowadziło więcej błędów składniowych.

**Lekcja:** Analiza dostarczona później przez użytkownika wykazała, że **funkcje `onCall` zawsze są wdrażane jako `HTTP` pod spodem**, a o ich specjalnym charakterze decydują metadane (label `deployment-callable: "true"`). Skupienie się na typie wyzwalacza w konsoli było błędem, który kosztował nas dużo czasu.

## 3. Przełom w Diagnozie: Analiza Logów Serwera

Prawdziwy postęp nastąpił dopiero wtedy, gdy uzyskaliśmy i dokładnie przeanalizowaliśmy **logi serwera** z Cloud Functions.

#### Rzeczywisty Błąd #1: Dostępność Modelu AI (Błąd `NOT_FOUND`)
Pierwszy konkretny błąd znaleziony w logach serwera to `status: 'NOT_FOUND'` pochodzący z Vertex AI.

*   **Diagnoza:** Funkcja próbowała wywołać model `gemini-1.0-pro` w regionie `europe-west1`. Po sprawdzeniu dokumentacji okazało się, że ten model **nie jest dostępny** w tym regionie.
*   **Rozwiązanie:** Zmiana konfiguracji klienta Vertex AI tak, aby łączył się z punktem końcowym `global` lub z regionem, gdzie model jest dostępny (np. `europe-west4`) i zaktualizowanie nazwy modelu do wersji dostępnej w tym regionie (np. `gemini-2.5-pro`).

**Poprawiony kod inicjalizacji AI:**
```typescript
const vertex_ai = new VertexAI({ project: "automatyzacja-pesamu", location: "europe-west4" });
const generativeModel = vertex_ai.getGenerativeModel({
  model: "gemini-2.5-pro",
});
```

#### Rzeczywisty Błąd #2: Błąd Parsowania Odpowiedzi JSON
Po rozwiązaniu problemu z dostępnością modelu, pojawił się nowy błąd, również widoczny tylko w logach serwera: `Błąd parsowania JSON z odpowiedzi AI`.

*   **Diagnoza:** Logi pokazały, że model AI, mimo instrukcji w prompcie, zwracał odpowiedź JSON opakowaną w blok markdown z dodatkowymi znakami nowej linii, np.:
    ```
    ```json
    { "keywords": [...], "pkdCodes": [...] }
    ```
    ```
    Pierwsza próba "oczyszczenia" odpowiedzi usuwała tylko znaczniki ` 
``` `, ale zostawiała znaki nowej linii, co nadal powodowało błąd `JSON.parse()`.
*   **Rozwiązanie:** Zastosowanie bardziej niezawodnej metody, która najpierw **wycina** główny obiekt JSON z odpowiedzi za pomocą wyrażenia regularnego, a dopiero potem go parsuje.

**Ostateczny, poprawny kod parsowania:**
```typescript
// ... wewnątrz bloku try
const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text;

if (!responseText) {
  throw new Error("Otrzymano pustą odpowiedź od AI.");
}
console.log("Raw response from AI:", responseText);

// 1. Znajdź pierwszy pasujący blok JSON
const jsonMatch = responseText.match(/{[\s\S]*}/);
if (!jsonMatch || !jsonMatch[0]) {
    console.error("Could not find a JSON object in the AI response.");
    throw new Error("Could not find a JSON object in the AI response.");
}

// 2. Wyciągnij znaleziony JSON
const extractedJSON = jsonMatch[0];
console.log("Extracted JSON string:", extractedJSON);

try {
  // 3. Sparsuj wyciągnięty, czysty JSON
  const parsedResult = JSON.parse(extractedJSON);
  console.log("Successfully parsed JSON:", parsedResult);
  return parsedResult;
} catch (e) {
    console.error("Failed to parse the extracted JSON string.", e);
    throw new Error("Failed to parse the extracted JSON string.");
}
```

## 4. Kluczowe Wnioski i Instrukcje na Przyszłość

1.  **Logi Serwera są Najważniejsze:** Błędy po stronie klienta (szczególnie 500) są prawie zawsze zbyt ogólne. **Zawsze** zaczynaj diagnozę od sprawdzenia szczegółowych logów funkcji w konsoli Google Cloud (lub Firebase). To najszybsza droga do znalezienia prawdziwej przyczyny.

2.  **Weryfikuj Dostępność Usług w Regionach:** Nigdy nie zakładaj, że usługa (a zwłaszcza konkretny model AI) jest dostępna w tym samym regionie co Twoja funkcja. Zawsze sprawdzaj oficjalną dokumentację Google Cloud pod kątem dostępności regionalnej.

3.  **Nie ufaj Odpowiedziom od AI:** Modele językowe nie zawsze idealnie trzymają się instrukcji formatowania. Zawsze traktuj ich odpowiedź jako "niezaufaną". Zamiast prostego parsowania, stosuj techniki "defensywne": czyść odpowiedź, usuwaj niechciane znaki, a najlepiej wycinaj interesujący Cię fragment (np. obiekt JSON) za pomocą wyrażeń regularnych.

4.  **Dodawaj Logi:** Gdybyśmy od razu dodali logowanie surowej odpowiedzi od AI (`console.log(responseText)`), problem z parsowaniem rozwiązalibyśmy o wiele szybciej. W przypadku problemów, dodawanie logów na każdym etapie przetwarzania danych jest bezcenne.
