"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testCors = void 0;
const https_1 = require("firebase-functions/v2/https");
exports.testCors = (0, https_1.onRequest)({ cors: true }, (request, response) => {
    console.log("Funkcja test_cors została wywołana.");
    response.status(200).send("Test CORS udany! Jeśli widzisz tę wiadomość, wbudowany CORS działa.");
});
//# sourceMappingURL=test_cors.js.map