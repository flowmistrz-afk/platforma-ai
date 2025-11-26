import React, { useState } from 'react';
import { Container, Form, Button, Card, Spinner, Alert, Row, Col, Badge, Tabs, Tab } from 'react-bootstrap';
import { toast } from 'react-toastify';

// BAZOWY ADRES TWOJEGO SERWISU
const BASE_SERVICE_URL = 'https://agent-zniwiarz-service-567539916654.europe-west1.run.app';

async function readStream(response: Response, onChunk: (chunk: any) => void) {
    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error("Failed to get reader from response body");
    }
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.trim() === '') continue;
            try {
                const chunk = JSON.parse(line);
                onChunk(chunk);
            } catch (error) {
                console.error("Failed to parse stream chunk:", line, error);
            }
        }
    }
}

const HarvesterAgentPage = () => {
    // --- STAN TRYBU MANUALNEGO ---
    const [keywordsInput, setKeywordsInput] = useState('');
    const [citiesInput, setCitiesInput] = useState('');
    const [pkdInput, setPkdInput] = useState('');

    // --- STAN TRYBU INTELIGENTNEGO (NOWOŚĆ) ---
    const [smartPrompt, setSmartPrompt] = useState('');
    const [strategyInfo, setStrategyInfo] = useState<any>(null); // Tu zapiszemy co wymyśliło AI

    // --- STAN WSPÓLNY ---
    const [activeTab, setActiveTab] = useState('smart'); // Domyślnie włączamy tryb AI
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<any[] | null>(null);
    const [logs, setLogs] = useState<any>(null);

    // --- LOGIKA 1: TRYB MANUALNY (Twój stary kod) ---
    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const keywords = keywordsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
        const cities = citiesInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
        const pkdCodes = pkdInput.split(',').map(s => s.trim()).filter(s => s.length > 0);

        if (keywords.length === 0 || cities.length === 0) {
            toast.error("W trybie ręcznym musisz podać słowa kluczowe i miasta.");
            return;
        }

        setIsLoading(true);
        setResults([]);
        setStrategyInfo(null);
        setLogs(null);

        const payload = {
            cities: cities,
            keywords: keywords,
            pkd_codes: pkdCodes.length > 0 ? pkdCodes : null
        };

        try {
            const response = await fetch(`${BASE_SERVICE_URL}/harvest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error("Błąd połączenia");

            await readStream(response, (chunk) => {
                if (chunk.type === 'log') {
                    toast.info(chunk.message);
                } else if (chunk.type === 'leads_chunk') {
                    setResults(prev => [...(prev || []), ...chunk.data]);
                } else if (chunk.type === 'done') {
                    toast.success(`Zakończono!`);
                }
            });

        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // --- LOGIKA 2: TRYB INTELIGENTNY (Gemini) ---
    const handleSmartSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!smartPrompt.trim()) {
            toast.error("Opisz zlecenie, aby AI mogło zadziałać.");
            return;
        }

        setIsLoading(true);
        setResults([]);
        setStrategyInfo(null);
        setLogs(null);

        try {
            const response = await fetch(`${BASE_SERVICE_URL}/smart-harvest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: smartPrompt })
            });

            if (!response.ok) throw new Error("Błąd połączenia");

            await readStream(response, (chunk) => {
                if (chunk.type === 'log') {
                    toast.info(chunk.message);
                } else if (chunk.type === 'strategy') {
                    setStrategyInfo(chunk.data);
                } else if (chunk.type === 'leads_chunk') {
                    setResults(prev => [...(prev || []), ...chunk.data]);
                } else if (chunk.type === 'done') {
                    toast.success(`Zakończono!`);
                }
            });

        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // --- LOGIKA 3: WZBOGACANIE (STREAMING DETEKTYWA) ---
    const handleEnrich = async () => {
        if (!results || results.length === 0) return;

        const urls = results
            .map(r => r.url)
            .filter(u => u && u.length > 5);
        const uniqueUrls = [...new Set(urls)];

        if (uniqueUrls.length === 0) {
            toast.warn("Brak stron WWW do sprawdzenia.");
            return;
        }

        toast.info(`Rozpoczynam skanowanie ${uniqueUrls.length} stron...`);
        setIsLoading(true);

        try {
            // UWAGA: Nowy endpoint -stream
            const response = await fetch(`${BASE_SERVICE_URL}/enrich`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urls: uniqueUrls })
            });

            if (!response.ok) throw new Error("Błąd połączenia");

            let foundCount = 0;

            // CZYTAMY NA ŻYWO!
            await readStream(response, (chunk) => {
                if (chunk.type === 'enrich_result') {
                    const enrichedData = chunk.data;
                    
                    if (enrichedData.email) foundCount++;

                    // AKTUALIZACJA STANU (Update pojedynczego wiersza)
                    setResults(prevResults => {
                        if (!prevResults) return prevResults;
                        return prevResults.map(lead => {
                            if (lead.url === enrichedData.url) {
                                // Scalamy dane:
                                return {
                                    ...lead,
                                    email: enrichedData.email,
                                    phone: enrichedData.phone,
                                    address: enrichedData.address,
                                    description: enrichedData.description,
                                    projects: enrichedData.projects,
                                    enrichment_status: enrichedData.email ? 'FOUND_AI' : 'SCANNED'
                                };
                            }
                            return lead;
                        });
                    });
                } 
                else if (chunk.type === 'done') {
                    toast.success(`Zakończono! Znaleziono ${foundCount} maili.`);
                }
            });

        } catch (err) {
            console.error(err);
            toast.error("Błąd strumienia detektywa");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Container className="py-5">
            <h1 className="mb-4">🚜 Agent Żniwiarz (The Harvester)</h1>
            <p className="text-muted">Centrum dowodzenia: Wybierz tryb automatyczny (AI) lub sterowanie ręczne.</p>

            <Row>
                {/* KOLUMNA LEWA: Konfiguracja */}
                <Col md={5}>
                    <Card className="shadow-sm mb-4 border-0">
                        <Card.Header className="bg-white border-bottom-0 pt-3">
                            <Tabs activeKey={activeTab} onSelect={(k) => setActiveTab(k || 'smart')} className="mb-3">
                                <Tab eventKey="smart" title="🧠 Tryb AI (Mózg)">
                                    <div className="mt-3">
                                        <Form onSubmit={handleSmartSubmit}>
                                            <Form.Group className="mb-3">
                                                <Form.Label className="fw-bold">Opisz swoje zlecenie</Form.Label>
                                                <Form.Control 
                                                    as="textarea" rows={4}
                                                    placeholder="np. Szukam podwykonawcy na 2000m2 posadzki żywicznej w Dębicy. To hala przemysłowa, więc potrzebuję dużych firm." 
                                                    value={smartPrompt}
                                                    onChange={e => setSmartPrompt(e.target.value)}
                                                    className="bg-light"
                                                />
                                                <Form.Text className="text-muted">
                                                    AI automatycznie dobierze miasta (promień 50km), słowa kluczowe i kody PKD.
                                                </Form.Text>
                                            </Form.Group>
                                            <div className="d-grid">
                                                <Button variant="primary" size="lg" type="submit" disabled={isLoading}>
                                                    {isLoading ? <><Spinner size="sm" animation="border"/> Analizuję...</> : '✨ Uruchom Inteligencję'}
                                                </Button>
                                            </div>
                                        </Form>
                                    </div>
                                </Tab>
                                <Tab eventKey="manual" title="🛠️ Tryb Ręczny">
                                    <div className="mt-3">
                                        <Form onSubmit={handleManualSubmit}>
                                            <Form.Group className="mb-3">
                                                <Form.Label>Słowa kluczowe</Form.Label>
                                                <Form.Control 
                                                    as="textarea" rows={2}
                                                    placeholder="posadzki, wylewki" 
                                                    value={keywordsInput}
                                                    onChange={e => setKeywordsInput(e.target.value)}
                                                />
                                            </Form.Group>

                                            <Form.Group className="mb-3">
                                                <Form.Label>Miasta</Form.Label>
                                                <Form.Control 
                                                    as="textarea" rows={2}
                                                    placeholder="Dębica, Rzeszów" 
                                                    value={citiesInput}
                                                    onChange={e => setCitiesInput(e.target.value)}
                                                />
                                            </Form.Group>

                                            <Form.Group className="mb-3">
                                                <Form.Label>PKD (opcjonalne)</Form.Label>
                                                <Form.Control 
                                                    type="text" 
                                                    placeholder="43.33.Z" 
                                                    value={pkdInput}
                                                    onChange={e => setPkdInput(e.target.value)}
                                                />
                                            </Form.Group>

                                            <div className="d-grid">
                                                <Button variant="success" size="lg" type="submit" disabled={isLoading}>
                                                    {isLoading ? <><Spinner size="sm" animation="border"/> Szukam...</> : '🚀 Uruchom Ręcznie'}
                                                </Button>
                                            </div>
                                        </Form>
                                    </div>
                                </Tab>
                            </Tabs>
                        </Card.Header>
                    </Card>
                </Col>

                {/* KOLUMNA PRAWA: Wyniki */}
                <Col md={7}>
                    {/* Sekcja: Wyjaśnienie Strategii AI (Tylko w trybie Smart) */}
                    {strategyInfo && (
                        <Alert variant="info" className="mb-3 border-0 shadow-sm">
                            <h5 className="alert-heading">🧠 Strategia AI:</h5>
                            <p className="mb-2">{strategyInfo.reasoning}</p>
                            <hr />
                            <div className="d-flex flex-wrap gap-2">
                                <Badge bg="secondary">Miasta:</Badge> {strategyInfo.target_cities.join(', ')}
                            </div>
                            <div className="d-flex flex-wrap gap-2 mt-1">
                                <Badge bg="dark">Słowa:</Badge> {strategyInfo.keywords.join(', ')}
                            </div>
                        </Alert>
                    )}

                    {results && (
                        <>
                            <div className="d-flex justify-content-between align-items-center mb-3">
                                <h4 className="mb-0">Wyniki ({results.length})</h4>
                                <div>
                                     {/* NOWY PRZYCISK */}
                                    <Button 
                                        variant="outline-primary" 
                                        onClick={handleEnrich} 
                                        disabled={isLoading}
                                        className="me-2"
                                    >
                                        {isLoading ? <Spinner size="sm" animation="border"/> : '🕵️ Pobierz E-maile'}
                                    </Button>
                                    <Badge bg="success">Status: Gotowe</Badge>
                                </div>
                            </div>
                            
                            <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                                {results.map((lead, idx) => (
                                    <Card key={idx} className="mb-3 border-0 shadow-sm hover-shadow">
                                        <Card.Body className="p-3">
                                            <div className="d-flex justify-content-between align-items-start">
                                                <div style={{ width: '100%' }}>
                                                    {/* NAGŁÓWEK: Nazwa i Link */}
                                                    <div className="d-flex justify-content-between">
                                                        <h5 className="mb-1 text-primary fw-bold text-truncate">
                                                            {lead.name}
                                                        </h5>
                                                        <Badge bg={lead.enrichment_status?.includes('FOUND') ? 'success' : 'light'} text="dark">
                                                            {lead.enrichment_status === 'FOUND_AI' ? '🤖 AI Data' : (lead.source || 'RAW')}
                                                        </Badge>
                                                    </div>

                                                    {/* DANE KONTAKTOWE (Wiersz) */}
                                                    <div className="small text-muted mb-2 mt-1">
                                                        <span className="me-3">📍 {lead.address || lead.city}</span>
                                                        {lead.url && (
                                                            <a href={lead.url} target="_blank" rel="noreferrer" className="me-3 text-decoration-none">
                                                                🌐 WWW ↗
                                                            </a>
                                                        )}
                                                        {lead.phone && <span className="me-3">📞 {lead.phone}</span>}
                                                        {lead.email && (
                                                            <span className="fw-bold text-success">📧 {lead.email}</span>
                                                        )}
                                                    </div>

                                                    {/* OPIS FIRMY (Z AI) */}
                                                    {lead.description && (
                                                        <div className="bg-light p-2 rounded mb-2 small border-start border-4 border-info">
                                                            <strong>O firmie:</strong> {lead.description}
                                                        </div>
                                                    )}

                                                    {/* REALIZACJE (Z AI) */}
                                                    {lead.projects && lead.projects.length > 0 && (
                                                        <div className="small">
                                                            <strong className="text-secondary">🏆 Wybrane realizacje:</strong>
                                                            <ul className="mb-0 ps-3 mt-1">
                                                                {lead.projects.map((p: string, i: number) => (
                                                                    <li key={i} className="text-muted">{p}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                    
                                                    {/* STARY SNIPPET (Jeśli brak AI) */}
                                                    {!lead.description && lead.metadata?.desc && (
                                                        <p className="small mb-0 text-secondary fst-italic mt-2">
                                                            "{lead.metadata.desc}"
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </Card.Body>
                                    </Card>
                                ))}
                            </div>
                            
                            <hr />
                            <details>
                                <summary className="text-muted small btn btn-link text-decoration-none">🛠️ Pokaż surowy JSON</summary>
                                <pre className="bg-light p-3 small border mt-2 rounded">{JSON.stringify(logs, null, 2)}</pre>
                            </details>
                        </>
                    )}
                    
                    {!results && !isLoading && (
                        <div className="text-center py-5 text-muted bg-light rounded border border-dashed">
                            <i className="bi bi-robot display-4 d-block mb-3"></i>
                            <h4>Oczekiwanie na rozkazy</h4>
                            <p>Wybierz tryb po lewej stronie i rozpocznij zbieranie danych.</p>
                        </div>
                    )}
                </Col>
            </Row>
        </Container>
    );
};

export default HarvesterAgentPage;
