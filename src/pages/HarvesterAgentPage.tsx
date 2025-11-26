import React, { useState, useEffect, useRef } from 'react';
import { Container, Form, Button, Card, Spinner, Row, Col, Badge, InputGroup, ProgressBar, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { toast } from 'react-toastify';

// ADRES TWOJEGO BACKENDU
const BASE_SERVICE_URL = 'https://agent-zniwiarz-service-567539916654.europe-west1.run.app';

// --- TYPY DANYCH ---
interface Contact {
    name?: string;
    role?: string;
    email?: string;
    phone?: string;
}

interface Lead {
    name: string;
    city: string;
    url?: string;
    source: string;
    email?: string;
    phone?: string;
    description?: string; // Opis z AI
    metadata?: { desc?: string }; // Opis z Google (Snippet)
    contacts_list?: Contact[];
    projects?: string[];
    enrichment_status?: string;
}

interface Message {
    id: number;
    sender: 'user' | 'agent';
    text?: string;
    type: 'text' | 'strategy' | 'progress';
    data?: any;
}

// --- HELPER DO ODCZYTU STREAMINGU (NDJSON) ---
async function readStream(response: Response, onChunk: (chunk: any) => void) {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Brak readera");
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        buffer = lines.pop() || '';
        
        for (const line of lines) {
            if (line.trim()) {
                try { 
                    onChunk(JSON.parse(line)); 
                } catch (e) { 
                    console.error("Błąd parsowania JSON:", e); 
                }
            }
        }
    }
}

const HarvesterAgentPage = () => {
    // --- STATE ---
    const [messages, setMessages] = useState<Message[]>([
        { id: 1, sender: 'agent', type: 'text', text: 'Cześć! Jestem Twoim Żniwiarzem. Opisz zlecenie (np. "2000m2 posadzki w Dębicy"), a ja przeszukam Internet.' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<Lead[]>([]);
    
    // Maszyna stanów: 'idle' -> 'harvesting' -> 'asking' -> 'enriching'
    const [flowState, setFlowState] = useState<'idle' | 'harvesting' | 'asking' | 'enriching'>('idle');
    
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll czatu
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length, isLoading]);

    // --- LOGIKA STATUSÓW (BADGES) ---
    const renderStatusBadge = (lead: Lead) => {
        if (!lead.enrichment_status) {
            return null; 
        }
        const status = lead.enrichment_status;

        if (status.includes('FOUND')) {
            return <Badge bg="success"><i className="bi bi-check-lg"></i> Dane pobrane</Badge>;
        }
        if (status === 'SKIPPED_PORTAL') {
            return (
                <OverlayTrigger placement="top" overlay={<Tooltip id={`t-${lead.url}`}>Portal ogłoszeniowy/katalog - pominięto celowo.</Tooltip>}>
                    <Badge bg="warning" text="dark" style={{cursor: 'help'}}><i className="bi bi-slash-circle"></i> Portal</Badge>
                </OverlayTrigger>
            );
        }
        if (status === 'AI_EXTRACTED' || status === 'NO_DATA') {
            return <Badge bg="info" text="dark" title="Strona działa, ale nie znaleziono maila"><i className="bi bi-search"></i> Tylko opis</Badge>;
        }
        if (status === 'FAILED' || status === 'FAILED_CONNECTION') {
            return (
                <OverlayTrigger placement="top" overlay={<Tooltip id={`err-${lead.url}`}>Strona nie odpowiada, odrzuciła połączenie lub ma błąd SSL.</Tooltip>}>
                    <Badge bg="danger" style={{cursor: 'help'}}><i className="bi bi-wifi-off"></i> Błąd WWW</Badge>
                </OverlayTrigger>
            );
        }
        
        return <Badge bg="light" text="dark">{status}</Badge>;
    };

    // --- OBSŁUGA CZATU ---
    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim()) return;

        const userText = input;
        setInput('');
        addMessage('user', userText);

        if (flowState === 'idle') {
            await runSmartHarvest(userText);
        } else if (flowState === 'asking') {
            handleDecision(userText);
        }
    };

    const handleDecision = (text: string) => {
        const lower = text.toLowerCase();
        const isYes = lower.includes('tak') || lower.includes('ok') || lower.includes('dawaj') || lower.includes('jasne') || lower.includes('pobieraj');
        const isNo = lower.includes('nie') || lower.includes('stop') || lower.includes('anuluj');

        if (isYes) {
            runEnrichment();
        } else if (isNo) {
            addMessage('agent', 'Zrozumiałem. Kończymy na tym etapie. Wpisz nowe zlecenie, aby zacząć od nowa.');
            setFlowState('idle');
        } else {
            addMessage('agent', 'Nie zrozumiałem. Napisz "Tak" lub "Nie".');
        }
    };

    // --- HELPERS ---
    const addMessage = (sender: 'user' | 'agent', text: string = '', type: Message['type'] = 'text', data: any = null) => {
        setMessages(prev => [...prev, { id: Date.now(), sender, text, type, data }]);
    };

    const updateLastProgress = (value: number, label: string) => {
        setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && last.type === 'progress') {
                return [...prev.slice(0, -1), { ...last, text: label, data: { value } }];
            }
            return prev;
        });
    };

    // --- API CALLS ---

    // KROK 1: Szukanie (Harvest)
    const runSmartHarvest = async (prompt: string) => {
        setFlowState('harvesting');
        setIsLoading(true);
        setResults([]); 
        
        addMessage('agent', 'Analizuję...', 'progress', { value: 0 });

        try {
            const response = await fetch(`${BASE_SERVICE_URL}/smart-harvest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });

            if (!response.ok) throw new Error("Błąd połączenia z API");

            await readStream(response, (chunk) => {
                if (chunk.type === 'strategy') {
                    setMessages(prev => [
                        ...prev.slice(0, -1),
                        { id: Date.now(), sender: 'agent', type: 'strategy', data: chunk.data },
                        { id: Date.now() + 1, sender: 'agent', type: 'progress', text: 'Skanuję Google...', data: { value: 5 } }
                    ]);
                } 
                else if (chunk.type === 'leads_chunk') {
                    setResults(prev => [...prev, ...chunk.data]);
                    updateLastProgress(chunk.progress, `Pobieram firmy... (${chunk.progress}%)`);
                } 
                else if (chunk.type === 'done') {
                    setFlowState('asking');
                    setIsLoading(false);
                    setMessages(prev => {
                        const clean = prev.filter(m => m.type !== 'progress');
                        return [...clean, { 
                            id: Date.now(), 
                            sender: 'agent', 
                            type: 'text', 
                            text: `Znalazłem wstępnie ${results.length + (chunk.data?.length || 0)} firm (lista po prawej). Czy mam wejść na ich strony i pobrać dane kontaktowe? (Napisz "Tak")` 
                        }];
                    });
                }
            });
        } catch (e) {
            addMessage('agent', 'Wystąpił błąd połączenia.');
            setFlowState('idle');
            setIsLoading(false);
        }
    };

    // KROK 2: Wzbogacanie (Enrich)
    const runEnrichment = async () => {
        setFlowState('enriching');
        setIsLoading(true);
        
        const urls = [...new Set(results.map(r => r.url).filter(u => u && u.length > 5))];
        
        if (urls.length === 0) {
            addMessage('agent', 'Nie znalazłem żadnych stron WWW do sprawdzenia.');
            setFlowState('idle');
            setIsLoading(false);
            return;
        }

        addMessage('agent', `Wchodzę na ${urls.length} stron WWW...`, 'progress', { value: 0 });

        try {
            const response = await fetch(`${BASE_SERVICE_URL}/enrich`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urls })
            });

            if (!response.ok) throw new Error("Błąd API Enrich");

            let foundCount = 0;

            await readStream(response, (chunk) => {
                if (chunk.type === 'enrich_result') {
                    const enriched = chunk.data;
                    if (enriched.email || (enriched.contacts_list && enriched.contacts_list.length > 0)) foundCount++;

                    // Aktualizacja wiersza w tabeli
                    setResults(prev => prev.map(r => r.url === enriched.url ? { ...r, ...enriched, enrichment_status: enriched.status } : r));

                    updateLastProgress(chunk.progress, `Skanuję strony... (Kontakty: ${foundCount})`);
                } 
                else if (chunk.type === 'done') {
                    setIsLoading(false);
                    setFlowState('idle');
                    setMessages(prev => [
                        ...prev.filter(m => m.type !== 'progress'),
                        { id: Date.now(), sender: 'agent', type: 'text', text: `Zrobione! Przeskanowałem strony. Łącznie znalazłem ${foundCount} kontaktów.` }
                    ]);
                }
            });
        } catch (e) {
            addMessage('agent', 'Błąd podczas skanowania stron.');
            setIsLoading(false);
            setFlowState('idle');
        }
    };

    return (
        <Container fluid className="d-flex flex-column p-0" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
            <Row className="flex-grow-1 m-0 h-100">
                
                {/* --- LEWY PANEL: CZAT --- */}
                <Col md={4} lg={3} className="d-flex flex-column border-end p-0 bg-white h-100 shadow-sm" style={{ zIndex: 10 }}>
                    <div className="p-3 bg-primary text-white flex-shrink-0">
                        <h5 className="m-0"><i className="bi bi-robot"></i> Asystent AI</h5>
                    </div>

                    <div className="flex-grow-1 p-3 bg-light" style={{ overflowY: 'auto' }}>
                        {messages.map((msg) => (
                            <div key={msg.id} className={`d-flex mb-3 ${msg.sender === 'user' ? 'justify-content-end' : 'justify-content-start'}`}>
                                <div className={`p-3 shadow-sm ${msg.sender === 'user' ? 'bg-primary text-white rounded-start rounded-top' : 'bg-white text-dark rounded-end rounded-top'}`} 
                                     style={{ maxWidth: '90%', borderRadius: '15px' }}>
                                    
                                    {msg.text && <div>{msg.text}</div>}

                                    {/* Karta Strategii */}
                                    {msg.type === 'strategy' && (
                                        <div className="mt-2 p-2 bg-info-subtle text-dark rounded border border-info small">
                                            <strong className="d-block mb-1">🧠 Strategia:</strong>
                                            <p className="mb-1 fst-italic">{msg.data.reasoning}</p>
                                            <hr className="my-1"/>
                                            <div className="mb-1"><strong>📍 Miasta:</strong> {msg.data.target_cities.join(', ')}</div>
                                            <div><strong>🔑 Słowa:</strong> {msg.data.keywords.join(', ')}</div>
                                        </div>
                                    )}

                                    {/* Pasek postępu */}
                                    {msg.type === 'progress' && (
                                        <div className="mt-2" style={{ minWidth: '150px' }}>
                                            <small>{msg.text}</small>
                                            <ProgressBar animated variant={msg.sender === 'user' ? 'light' : 'success'} now={msg.data.value} style={{ height: '6px' }} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        
                        {isLoading && messages[messages.length - 1]?.type !== 'progress' && (
                            <div className="text-muted small ms-3 fst-italic mb-2">
                                Agent myśli... <Spinner size="sm" animation="grow"/>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    <div className="p-3 bg-white border-top flex-shrink-0">
                        <Form onSubmit={handleSendMessage}>
                            <InputGroup>
                                <Form.Control
                                    placeholder={flowState === 'asking' ? 'Odpisz "Tak" lub "Nie"...' : 'Wpisz zlecenie...'}
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    autoFocus
                                    disabled={isLoading && flowState !== 'asking'}
                                />
                                <Button variant="primary" type="submit" disabled={!input.trim() || (isLoading && flowState !== 'asking')}>
                                    <i className="bi bi-send-fill"></i>
                                </Button>
                            </InputGroup>
                        </Form>
                    </div>
                </Col>

                {/* --- PRAWY PANEL: WYNIKI --- */}
                <Col md={8} lg={9} className="p-0 bg-light h-100 d-flex flex-column">
                    <div className="p-3 bg-white border-bottom shadow-sm flex-shrink-0 d-flex justify-content-between align-items-center">
                        <h5 className="m-0 text-secondary">Wyniki <Badge bg="secondary">{results.length}</Badge></h5>
                        <Badge bg={flowState === 'enriching' ? 'warning' : 'success'}>
                            {flowState === 'enriching' ? 'Skanowanie...' : 'Gotowe'}
                        </Badge>
                    </div>
                    
                    <div className="p-4 flex-grow-1" style={{ overflowY: 'auto' }}>
                        {results.length === 0 ? (
                            <div className="text-center text-muted mt-5 pt-5">
                                <i className="bi bi-search display-1 opacity-25"></i>
                                <h3 className="mt-3 opacity-50">Czekam na dane...</h3>
                            </div>
                        ) : (
                            <Row xs={1} md={2} xl={3} className="g-3">
                                {results.map((lead, idx) => (
                                    <Col key={idx}>
                                        <Card className={`h-100 border-0 shadow-sm ${(lead.email || lead.contacts_list?.some(c => c.email)) ? 'border-start border-5 border-success' : 'border-start border-5 border-light'}`}>
                                            <Card.Body>
                                                {/* NAGŁÓWEK KARTY */}
                                                <div className="d-flex justify-content-between align-items-start mb-2">
                                                    <h6 className="fw-bold text-truncate text-primary mb-0" title={lead.name} style={{maxWidth: '65%'}}>
                                                        {lead.name}
                                                    </h6>
                                                    {renderStatusBadge(lead)}
                                                </div>

                                                <div className="small text-muted mb-2">📍 {lead.city}</div>
                                                
                                                <div className="small mb-2">
                                                    {lead.url ? <a href={lead.url} target="_blank" rel="noreferrer" className="text-decoration-none">WWW ↗</a> : <span className="text-muted">Brak WWW</span>}
                                                </div>

                                                {/* GŁÓWNE DANE KONTAKTOWE */}
                                                {(lead.email || lead.phone) ? (
                                                    <div className="bg-light p-2 rounded small mb-2 border border-success-subtle">
                                                        {lead.email && <div className="text-break text-success fw-bold">📧 {lead.email}</div>}
                                                        {lead.phone && <div>📞 {lead.phone}</div>}
                                                    </div>
                                                ) : (
                                                    // Info o braku danych (tylko jeśli już skanowano i nic nie ma)
                                                    lead.enrichment_status && !lead.enrichment_status.includes('FOUND') && lead.url && (
                                                        <div className="bg-light p-1 rounded small text-center text-muted fst-italic" style={{fontSize: '0.75rem'}}>
                                                            Brak kontaktu na stronie
                                                        </div>
                                                    )
                                                )}

                                                {/* LISTA OSÓB (Z AI) */}
                                                {lead.contacts_list && lead.contacts_list.length > 0 && (
                                                    <div className="mt-2 small border-top pt-2">
                                                        <strong className="text-secondary" style={{fontSize: '0.7rem'}}>OSOBY:</strong>
                                                        <ul className="list-unstyled mt-1 mb-0 ps-1">
                                                            {lead.contacts_list.slice(0, 3).map((c: Contact, i: number) => (
                                                                <li key={i} className="mb-1 text-truncate text-muted">
                                                                    👤 {c.name || c.role} 
                                                                    {c.email && <span className="text-success ms-1">✉</span>}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                {/* OPIS FIRMY */}
                                                {/* LOGIKA: Jeśli jest AI Description -> Pokaż AI. Jeśli nie -> Pokaż Google Snippet */}
                                                {lead.description ? (
                                                    <div className="mt-2 p-2 bg-info-subtle rounded small text-dark border-start border-4 border-info">
                                                        <strong>O firmie:</strong> {lead.description}
                                                    </div>
                                                ) : (
                                                    lead.metadata?.desc && (
                                                        <p className="small text-secondary fst-italic mb-0 border-top pt-2 mt-2">
                                                            "{lead.metadata.desc}"
                                                        </p>
                                                    )
                                                )}
                                            </Card.Body>

                                            {/* REALIZACJE */}
                                            {lead.projects && lead.projects.length > 0 && (
                                                <Card.Footer className="bg-white border-0 pt-0 pb-2">
                                                    <div className="d-flex flex-wrap gap-1">
                                                        {lead.projects.slice(0, 2).map((p:string, i:number) => (
                                                            <Badge key={i} bg="light" text="dark" className="border fw-normal text-truncate" style={{maxWidth: '100%'}}>
                                                                🏆 {p}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </Card.Footer>
                                            )}
                                        </Card>
                                    </Col>
                                ))}
                            </Row>
                        )}
                    </div>
                </Col>
            </Row>
        </Container>
    );
};

export default HarvesterAgentPage;