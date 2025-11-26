import React, { useState } from 'react';
import { Container, Form, Button, Card, Spinner, Alert, Row, Col, Badge, Tabs, Tab } from 'react-bootstrap';
import { toast } from 'react-toastify';

// BAZOWY ADRES TWOJEGO SERWISU
const BASE_SERVICE_URL = 'https://agent-zniwiarz-service-567539916654.europe-west1.run.app';

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
        setResults(null);
        setStrategyInfo(null); // Resetujemy strategię, bo to tryb ręczny

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

            if (!response.ok) throw new Error(`Błąd serwera: ${response.statusText}`);

            const data = await response.json();
            setResults(data.leads);
            setLogs(data);
            toast.success(`Znaleziono ${data.total} firm!`);
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
        setResults(null);
        setStrategyInfo(null);

        try {
            const response = await fetch(`${BASE_SERVICE_URL}/smart-harvest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: smartPrompt })
            });

            if (!response.ok) throw new Error(`Błąd Mózgu: ${response.statusText}`);

            const data = await response.json();
            
            // W trybie smart dostajemy: { strategy: {...}, harvest_result: { leads: [...] } }
            setStrategyInfo(data.strategy);
            setResults(data.harvest_result.leads);
            setLogs(data);
            
            toast.success(`AI znalazło ${data.harvest_result.total} firm!`);
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // --- LOGIKA 3: WZBOGACANIE (DETEKTYW) ---
    const handleEnrich = async () => {
        if (!results || results.length === 0) return;

        // Filtrujemy tylko te, które mają sensowny URL (nie puste, nie undefined)
        const urls = results
            .map(r => r.url)
            .filter(u => u && u.length > 5);

        // Deduplikacja (usuwamy powtórki URLi przed wysłaniem)
        const uniqueUrls = [...new Set(urls)];

        if (uniqueUrls.length === 0) {
            toast.warn("Brak stron WWW do sprawdzenia.");
            return;
        }

        // UX: Ostrzeżenie przy dużej liczbie
        if (uniqueUrls.length > 50) {
            toast.info(`Skanuję ${uniqueUrls.length} stron. To może chwilę potrwać (ok. 30-60s)...`);
        }

        setIsLoading(true);

        try {
            const response = await fetch(`${BASE_SERVICE_URL}/enrich`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urls: uniqueUrls })
            });

            if (!response.ok) throw new Error("Błąd Detektywa");

            const enrichedData = await response.json(); // Tablica [{url, email, status}]

            // MERGE DANYCH (Najtrudniejsza część - łączenie wyników)
            const updatedResults = results.map(lead => {
                // Znajdź czy dla tego URL-a mamy wynik detektywa
                const enrichment = enrichedData.find((e: any) => e.url === lead.url);
                
                if (enrichment && enrichment.email) {
                    return { ...lead, email: enrichment.email, enrichment_status: 'FOUND' };
                } else if (enrichment) {
                    return { ...lead, enrichment_status: enrichment.status };
                }
                return lead;
            });

            setResults(updatedResults);
            
            // Policz ile znaleziono
            const foundCount = enrichedData.filter((e: any) => e.email).length;
            toast.success(`Znaleziono ${foundCount} adresów e-mail!`);

        } catch (err) {
            toast.error("Wystąpił błąd podczas pobierania maili.");
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
                                    <Card key={idx} className="mb-2 border-0 shadow-sm hover-shadow">
                                        <Card.Body className="p-3">
                                            <div className="d-flex justify-content-between align-items-start">
                                                <div style={{ maxWidth: '80%' }}>
                                                    <h6 className="mb-1 text-primary fw-bold text-truncate">{lead.name}</h6>
                                                    <div className="small text-muted mb-2">
                                                        📍 {lead.city} | 
                                                        {lead.url ? (
                                                            <a href={lead.url} target="_blank" rel="noreferrer" className="ms-1">{new URL(lead.url).hostname} ↗</a>
                                                        ) : <span className="ms-1">Brak WWW</span>}
                                                        
                                                        {/* NOWE POLE EMAIL */}
                                                        {lead.email && (
                                                            <div className="mt-1 text-success fw-bold p-1 border border-success rounded d-inline-block bg-light">
                                                                📧 {lead.email}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {lead.metadata?.desc && (
                                                        <p className="small mb-0 text-secondary" style={{ fontSize: '0.85rem' }}>
                                                            {lead.metadata.desc.length > 150 ? lead.metadata.desc.substring(0, 150) + '...' : lead.metadata.desc}
                                                        </p>
                                                    )}
                                                </div>
                                                <Badge bg={lead.source === 'Google API' ? 'info' : 'warning'}>
                                                    {lead.source}
                                                </Badge>
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
