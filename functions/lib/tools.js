"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webFetch = webFetch;
const node_fetch_1 = __importDefault(require("node-fetch"));
const cheerio = __importStar(require("cheerio"));
/**
 * Pobiera treść tekstową z podanego URL-a.
 * @param url Pełny adres URL strony internetowej do pobrania.
 * @returns Treść tekstowa strony lub komunikat o błędzie.
 */
async function webFetch(url) {
    console.log(`[webFetch Tool] Pobieram treść z URL: ${url}`);
    try {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            throw new Error(`Nieprawidłowy format URL. URL musi zaczynać się od http:// lub https://.`);
        }
        const response = await (0, node_fetch_1.default)(url);
        if (!response.ok) {
            throw new Error(`Błąd HTTP podczas pobierania ${url}: ${response.status} ${response.statusText}`);
        }
        const contentType = response.headers.get('content-type');
        let textContent;
        const links = [];
        if (contentType && contentType.includes('text/html')) {
            const html = await response.text();
            const $ = cheerio.load(html);
            $('script, style, noscript, iframe').remove();
            $('a').each((i, el) => {
                const href = $(el).attr('href');
                if (href && !href.startsWith('#')) {
                    links.push({ href, text: $(el).text().trim() });
                }
            });
            textContent = $('body').text();
            textContent = textContent.replace(/\s\s+/g, ' ').trim();
            textContent = textContent.split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n');
        }
        else if (contentType && contentType.includes('text/plain')) {
            textContent = await response.text();
        }
        else {
            throw new Error(`Nieobsługiwany typ treści (${contentType}) z URL: ${url}`);
        }
        console.log(`[webFetch Tool] Zobaczona treść (skrócona):\n${textContent.substring(0, 500)}...`);
        const MAX_CONTENT_LENGTH = 8000;
        if (textContent.length > MAX_CONTENT_LENGTH) {
            textContent = textContent.substring(0, MAX_CONTENT_LENGTH) + "\n... (treść została skrócona)";
        }
        return { textContent, links };
    }
    catch (error) {
        console.error(`[webFetch Tool] Błąd podczas pobierania URL ${url}:`, error);
        throw error;
    }
}
//# sourceMappingURL=tools.js.map