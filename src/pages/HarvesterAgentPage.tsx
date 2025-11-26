import React, { useState, useEffect, useRef } from 'react';
import { Container, Form, Button, Card, Spinner, Row, Col, Badge, InputGroup, ProgressBar } from 'react-bootstrap';
import { toast } from 'react-toastify';

const BASE_SERVICE_URL = 'https://agent-zniwiarz-service-567539916654.europe-west1.run.app';

// --- TYPY I HELPERY ---
interface Message {
    id: number;
    sender: 'user' | 'agent';
    text?: string;
    type: 'text' | 'strategy' | 'progress';
    data?: any;
}

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
                try { onChunk(JSON.parse(line)); } catch (e) { console.error(e); }
            }
        }
    }
}

const HarvesterAgentPage = () => {
    const [messages, setMessages] = useState<Message[]>([
        { id: 1, sender: 'agent', type: 'text', text: 'Cześć! Jestem Twoim Żniwiarzem. Opisz zlecenie (np. "2000m2 posadzki w Dębicy"), a ja przeszukam Internet.' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<any[]>([]);
    const [flowState, setFlowState] = useState<'idle' | 'harvesting' | 'asking' | 'enriching'>('idle');
    
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll czatu (tylko gdy przychodzi nowa wiadomość)
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length]); 

    // --- LOGIKA CZATU ---
    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim()) return;
        const userText = input;
        setInput('');
        addMessage('user', userText);

        if (flowState === 'idle') await runSmartHarvest(userText);
        else if (flowState === 'asking') handleDecision(userText);
    };

    const handleDecision = (text: string) => {
        const lower = text.toLowerCase();
        if (lower.includes('tak') || lower.includes('ok') || lower.includes('dawaj') || lower.includes('jasne')) {
            runEnrichment();
        } else if (lower.includes('nie') || lower.includes('stop')) {
            addMessage('agent', 'Zrozumiałem. Kończymy. Wpisz nowe zlecenie, aby zacząć od nowa.');
            setFlowState('idle');
        } else {
            addMessage('agent', 'Nie zrozumiałem. Odpisz "Tak" lub "Nie".');
        }
    };

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

    // --- KOMUNIKACJA Z API ---
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

            await readStream(response, (chunk) => {
                if (chunk.type === 'strategy') {
                    setMessages(prev => [
                        ...prev.slice(0, -1),
                        { id: Date.now(), sender: 'agent', type: 'strategy', data: chunk.data },
                        { id: Date.now() + 1, sender: 'agent', type: 'progress', text: 'Skanuję Google...', data: { value: 5 } }
                    ]);
                } else if (chunk.type === 'leads_chunk') {
                    setResults(prev => [...prev, ...chunk.data]);
                    updateLastProgress(chunk.progress, `Pobieram firmy... (${chunk.progress}%)`);
                } else if (chunk.type === 'done') {
                    setFlowState('asking');
                    setIsLoading(false);
                    setMessages(prev => {
                        const clean = prev.filter(m => m.type !== 'progress');
                        return [...clean, { id: Date.now(), sender: 'agent', type: 'text', text: `Znalazłem ${results.length + (chunk.data?.length || 0)} firm. Pobrać dane kontaktowe? (Tak/Nie)` }];
                    });
                }
            });
        } catch (e) {
            addMessage('agent', 'Błąd połączenia.');
            setFlowState('idle');
            setIsLoading(false);
        }
    };

    const runEnrichment = async () => {
        setFlowState('enriching');
        setIsLoading(true);
        const urls = [...new Set(results.map(r => r.url).filter(u => u && u.length > 5))];
        
        addMessage('agent', `Skanuję ${urls.length} stron...`, 'progress', { value: 0 });

        try {
            const response = await fetch(`${BASE_SERVICE_URL}/enrich`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urls })
            });

            let foundCount = 0;
            await readStream(response, (chunk) => {
                if (chunk.type === 'enrich_result') {
                    const enriched = chunk.data;
                    if (enriched.email) foundCount++;
                    setResults(prev => prev.map(r => r.url === enriched.url ? { ...r, ...enriched, enrichment_status: enriched.email ? 'FOUND' : 'SCANNED' } : r));
                    updateLastProgress(chunk.progress, `Skanuję... (Maile: ${foundCount})`);
                } else if (chunk.type === 'done') {
                    setIsLoading(false);
                    setFlowState('idle');
                    setMessages(prev => [
                        ...prev.filter(m => m.type !== 'progress'),
                        { id: Date.now(), sender: 'agent', type: 'text', text: `Gotowe! Znaleziono ${foundCount} maili.` }
                    ]);
                }
            });
        } catch (e) {
            addMessage('agent', 'Błąd detektywa.');
            setIsLoading(false);
            setFlowState('idle');
        }
    };

    return (
        // FIX: Używamy flex-column i h-100, aby zablokować przewijanie całej strony (body)
        <Container fluid className="d-flex flex-column p-0" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
            <Row className="flex-grow-1 m-0 h-100">
                
                {/* LEWY PANEL (CZAT) */}
                <Col md={4} lg={3} className="d-flex flex-column border-end p-0 bg-white h-100 shadow-sm" style={{ zIndex: 10 }}>
                    <div className="p-3 bg-primary text-white flex-shrink-0">
                        <h5 className="m-0"><i className="bi bi-robot"></i> Asystent AI</h5>
                    </div>

                    {/* FIX: flex-grow-1 i overflow-y-auto pozwala na scrollowanie TYLKO wiadomości */}
                    <div className="flex-grow-1 p-3 bg-light" style={{ overflowY: 'auto', minHeight: 0 }}>
                        {messages.map((msg) => (
                            <div key={msg.id} className={`d-flex mb-3 ${msg.sender === 'user' ? 'justify-content-end' : 'justify-content-start'}`}>
                                <div className={`p-3 shadow-sm ${msg.sender === 'user' ? 'bg-primary text-white rounded-start rounded-top' : 'bg-white text-dark rounded-end rounded-top'}`} 
                                     style={{ maxWidth: '90%', borderRadius: '15px' }}>
                                    {msg.text && <div>{msg.text}</div>}
                                    {msg.type === 'strategy' && (
                                        <div className="mt-2 p-2 bg-info-subtle text-dark rounded border border-info small">
                                            <strong className="d-block mb-1">Strategia:</strong>
                                            <p className="mb-1 fst-italic">{msg.data.reasoning}</p>
                                            <div className="mb-1">📍 {msg.data.target_cities.join(', ')}</div>
                                            <div>🔑 {msg.data.keywords.join(', ')}</div>
                                        </div>
                                    )}
                                    {msg.type === 'progress' && (
                                        <div className="mt-2" style={{ minWidth: '100%' }}>
                                            <small>{msg.text}</small>
                                            <ProgressBar animated variant="success" now={msg.data.value} style={{ height: '6px' }} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>

                    <div className="p-3 bg-white border-top flex-shrink-0">
                        <Form onSubmit={handleSendMessage}>
                            <InputGroup>
                                <Form.Control
                                    placeholder={flowState === 'asking' ? 'Tak / Nie...' : 'Wpisz zlecenie...'}
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

                {/* PRAWY PANEL (WYNIKI) */}
                {/* FIX: h-100 i overflow-y-auto pozwala na scrollowanie TYLKO wyników */}
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
                                        <Card className={`h-100 border-0 shadow-sm ${lead.email ? 'border-start border-5 border-success' : ''}`}>
                                            <Card.Body>
                                                <div className="d-flex justify-content-between">
                                                    <h6 className="fw-bold text-truncate text-primary" title={lead.name} style={{maxWidth: '85%'}}>{lead.name}</h6>
                                                    {lead.email && <i className="bi bi-check-circle-fill text-success"></i>}
                                                </div>
                                                <div className="small text-muted mb-2">📍 {lead.city}</div>
                                                <div className="small mb-2">
                                                    {lead.url ? <a href={lead.url} target="_blank" rel="noreferrer" className="text-decoration-none">WWW ↗</a> : <span className="text-muted">Brak WWW</span>}
                                                </div>
                                                {(lead.email || lead.phone) && (
                                                    <div className="bg-light p-2 rounded small mb-2">
                                                        {lead.email && <div className="text-break text-success fw-bold">📧 {lead.email}</div>}
                                                        {lead.phone && <div>📞 {lead.phone}</div>}
                                                    </div>
                                                )}
                                                {lead.description && (
                                                    <p className="small text-secondary fst-italic mb-0 border-top pt-2 mt-1">
                                                        "{lead.description}"
                                                    </p>
                                                )}
                                            </Card.Body>
                                            {lead.projects && lead.projects.length > 0 && (
                                                <Card.Footer className="bg-white border-0 pt-0 pb-3">
                                                    {lead.projects.slice(0, 2).map((p:string, i:number) => (
                                                        <Badge key={i} bg="light" text="dark" className="border me-1 mb-1 fw-normal text-truncate" style={{maxWidth: '100%'}}>
                                                            🏆 {p}
                                                        </Badge>
                                                    ))}
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