import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Form, Button, Card, Spinner, Alert, Row, Col, ListGroup } from 'react-bootstrap';
import pkdData from '../data/pkd-database.json';
import wojewodztwaData from '../data/wojewodztwa-database.json';
import { toast } from 'react-toastify';

type DataSource = "ceidg" | "google";

interface PkdClass {
    kod: string;
    nazwa: string;
}

interface PkdSection {
    kod: string;
    nazwa: string;
    podklasy: PkdClass[];
}

const AgentProMaxPage = () => {
    // --- POPRAWKA: Puste pole query ---
    const [query, setQuery] = useState('');
    const [city, setCity] = useState('');
    const [province, setProvince] = useState('');
    const [radius, setRadius] = useState<number>(50);
    const [dataSources, setDataSources] = useState<DataSource[]>(['ceidg']);
    
    const [selectedPkdSection, setSelectedPkdSection] = useState<string>(''); 
    const [selectedPkdCodes, setSelectedPkdCodes] = useState<string[]>([]);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    const availablePkdCodes = useMemo(() => {
        if (!selectedPkdSection) return [];
        const section = (pkdData as PkdSection[]).find(s => s.kod === selectedPkdSection);
        if (!section || !section.podklasy) return [];
        return section.podklasy;
    }, [selectedPkdSection]);

    const handlePkdCodeClick = (pkdCode: string) => {
        setSelectedPkdCodes(currentSelected => {
            const isAlreadySelected = currentSelected.includes(pkdCode);
            if (isAlreadySelected) {
                return currentSelected.filter(code => code !== pkdCode);
            } else {
                if (currentSelected.length < 3) {
                    return [...currentSelected, pkdCode];
                } else {
                    toast.warn('Możesz wybrać maksymalnie 3 kody PKD.');
                    return currentSelected;
                }
            }
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // --- NOWA WALIDACJA ---
        if (!query.trim()) {
            setError('Proszę wypełnić opis szukanej usługi.');
            return;
        }
        if (!province) {
            setError('Proszę wybrać województwo.');
            return;
        }
        if (dataSources.includes('ceidg') && selectedPkdCodes.length === 0) {
            setError('Jeśli wybrano źródło CEIDG, musisz wybrać co najmniej jeden szczegółowy kod PKD.');
            return;
        }
        
        setIsLoading(true);
        setError(null);

        const fullQuery = `
            Użytkownik szuka: "${query}" w lokalizacji ${city}, ${province} (promień: ${radius} km).
            Wybrane kody PKD do przeszukania w CEIDG: ${selectedPkdCodes.join(', ')}.
            Przeszukaj następujące źródła danych: ${dataSources.join(', ')}.
        `;

        try {
            const response = await fetch('https://agent-pro-max-service-567539916654.europe-west1.run.app/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: fullQuery })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Wystąpił błąd serwera.');
            }

            const responseData = await response.json();
            navigate('/agent-pro-max/results', { state: { query: fullQuery, responseData } });

        } catch (err: any) {
            setError(err.message || 'Nie udało się połączyć z agentem.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDataSourceChange = (source: DataSource, isChecked: boolean) => {
        setDataSources(prev => isChecked ? [...prev, source] : prev.filter(s => s !== source));
    };
    
    return (
        <Container>
            <style type="text/css">
                {`
                    .list-group-item.active {
                        background-color: #d4edda;
                        border-color: #c3e6cb;
                        color: #155724;
                        font-weight: bold;
                    }
                    .list-group-item-action:hover, .list-group-item-action:focus {
                        background-color: #e2e6ea;
                    }
                `}
            </style>

            <h1 className="my-4">Uruchom Agenta Pro Max</h1>
            <p>Wprowadź zapytanie, wybierz kody PKD i źródła danych, które agent ma przeszukać.</p>
            
            <Card>
                <Card.Body>
                    <Form onSubmit={handleSubmit}>
                        <Form.Group className="mb-3"><Form.Label>Opis szukanej usługi</Form.Label><Form.Control type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="np. producenci okien PCV, firmy transportowe z licencją..." /></Form.Group>
                        <Row><Col md={4}><Form.Group className="mb-3"><Form.Label>Miasto</Form.Label><Form.Control type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="np. Warszawa" /></Form.Group></Col><Col md={4}><Form.Group className="mb-3"><Form.Label>Województwo</Form.Label><Form.Select value={province} onChange={(e) => setProvince(e.target.value)}><option value="">Wybierz województwo...</option>{wojewodztwaData.map(w => (<option key={w} value={w}>{w}</option>))}</Form.Select></Form.Group></Col><Col md={4}><Form.Group className="mb-3"><Form.Label>Promień (km)</Form.Label><Form.Control type="number" value={radius} onChange={(e) => setRadius(parseInt(e.target.value, 10) || 0)} /></Form.Group></Col></Row>

                        <Form.Group className="mb-3">
                            <Form.Label>1. Wybierz główną sekcję PKD</Form.Label>
                            <Form.Select value={selectedPkdSection} onChange={e => { setSelectedPkdSection(e.target.value); setSelectedPkdCodes([]); }}>
                                <option value="">Wybierz sekcję...</option>
                                {(pkdData as PkdSection[]).map(section => (
                                    <option key={section.kod} value={section.kod}>
                                        {section.kod} - {section.nazwa}
                                    </option>
                                ))}
                            </Form.Select>
                        </Form.Group>

                        {selectedPkdSection && (
                            <Form.Group className="mb-3">
                                <Form.Label>2. Wybierz szczegółowe kody PKD (maksymalnie 3)</Form.Label>
                                <ListGroup style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                    {availablePkdCodes.map(pkd => (
                                        <ListGroup.Item
                                            key={pkd.kod}
                                            action
                                            type="button"
                                            onClick={() => handlePkdCodeClick(pkd.kod)}
                                            active={selectedPkdCodes.includes(pkd.kod)}
                                        >
                                            {pkd.kod} - {pkd.nazwa}
                                        </ListGroup.Item>
                                    ))}
                                </ListGroup>
                            </Form.Group>
                        )}

                        <Form.Group className="mb-3">
                            <Form.Label>Wybierz źródła danych</Form.Label>
                            <div>
                                <Form.Check type="checkbox" id="source-ceidg" label="Baza CEIDG" value="ceidg" checked={dataSources.includes('ceidg')} onChange={(e) => handleDataSourceChange('ceidg', e.target.checked)} />
                                <Form.Check type="checkbox" id="source-google" label="Wyszukiwarka Google (w przygotowaniu)" value="google" checked={dataSources.includes('google')} disabled onChange={(e) => handleDataSourceChange('google', e.target.checked)} />
                            </div>
                        </Form.Group>
                        
                        {error && <Alert variant="danger">{error}</Alert>}

                        <div className="d-grid mt-4">
                            <Button variant="primary" size="lg" type="submit" disabled={isLoading}>
                                {isLoading ? <><Spinner as="span" animation="border" size="sm" /> Uruchamiam Agenta...</> : 'Uruchom Agenta'}
                            </Button>
                        </div>
                    </Form>
                </Card.Body>
            </Card>
        </Container>
    );
};

export default AgentProMaxPage;
