import { onRequest } from "firebase-functions/v2/https";

export const testCors = onRequest(
  { cors: true },
  (request, response) => {
    console.log("Funkcja test_cors została wywołana.");
    response.status(200).send("Test CORS udany! Jeśli widzisz tę wiadomość, wbudowany CORS działa.");
  }
);
