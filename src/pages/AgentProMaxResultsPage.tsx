import React, { useState, useEffect } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { Card, Spinner, Alert, Form, Button } from 'react-bootstrap';

// Prosty interfejs dla odpowiedzi z naszego nowego API
interface AgentResponse {
    session_id: string;
    response: string;
}

const AgentProMaxResultsPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    
    // Odczytujemy przekazane dane z obiektu 'state'
    const { query, responseData } = (location.state || {}) as { query: string, responseData: AgentResponse };
    
    const [currentQuery, setCurrentQuery] = useState(query || '');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!query || !responseData) {
            // Jeśli ktoś wejdzie na tę stronę bezpośrednio, bez danych, przekieruj
            navigate('/agent-pro-max');
        }
    }, [query, responseData, navigate]);

    const handleRerun = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('https://agent-pro-max-service-567539916654.europe-west1.run.app/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: currentQuery })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Wystąpił błąd serwera.');
            }

            const newData: AgentResponse = await response.json();
            
            // Ponownie ładujemy stronę z nowymi danymi
            navigate(location.pathname, { state: { query: currentQuery, responseData: newData }, replace: true });

        } catch (err: any) {
            setError(err.message || 'Nie udało się połączyć z agentem.');
        } finally {
            setIsLoading(false);
        }
    };
    
    // Prosta funkcja do formatowania odpowiedzi z Markdown
    const formatResponse = (text: string) => {
        return text
            .split('\n\n')
            .map((paragraph, pIndex) => (
                <p key={pIndex}>
                    {paragraph.split('\n').map((line, lIndex) => {
                        // Podstawowe formatowanie Markdown
                        if (line.startsWith('**') && line.endsWith('**')) {
                            return <strong key={lIndex}>{line.substring(2, line.length - 2)}</strong>;
                        }
                        if (line.startsWith('* ')) {
                            return <li key={lIndex}>{line.substring(2)}</li>;
                        }
                        return <React.Fragment key={lIndex}>{line}<br /></React.Fragment>;
                    })}
                </p>
            ));
    };

    if (!responseData) {
        // Zabezpieczenie przed renderowaniem bez danych
        return <div className="text-center p-5"><Spinner animation="border" /></div>;
    }

    return (
        <div>
            <Link to="/agent-pro-max" className="mb-4 d-inline-block">
                &larr; Wróć i uruchom nowe zadanie
            </Link>
            <h1>Wyniki Pracy Agenta Pro Max</h1>
            
            <Card className="mt-4">
                <Card.Header as="h5">Ponów zapytanie</Card.Header>
                <Card.Body>
                    <Form onSubmit={handleRerun}>
                        <Form.Group className="mb-3">
                            <Form.Label>Zapytanie do agenta:</Form.Label>
                            <Form.Control
                                as="textarea"
                                rows={3}
                                value={currentQuery}
                                onChange={(e) => setCurrentQuery(e.target.value)}
                                disabled={isLoading}
                            />
                        </Form.Group>
                        <Button variant="primary" type="submit" disabled={isLoading}>
                            {isLoading ? <><Spinner as="span" animation="border" size="sm" /> Uruchamiam...</> : 'Uruchom ponownie'}
                        </Button>
                    </Form>
                </Card.Body>
            </Card>

            <Card className="mt-4">
                <Card.Header as="h5">Otrzymana Odpowiedź</Card.Header>
                <Card.Body>
                    {error && <Alert variant="danger">{error}</Alert>}
                    <p><strong>ID Sesji:</strong> <code>{responseData.session_id}</code></p>
                    <hr />
                    <div className="response-content">
                        {formatResponse(responseData.response)}
                    </div>
                </Card.Body>
            </Card>
        </div>
    );
};

export default AgentProMaxResultsPage;
