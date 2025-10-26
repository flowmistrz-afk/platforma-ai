import React, { useState, useEffect, useRef } from 'react';
import { Container, Form, Button, Card, Spinner, Alert } from 'react-bootstrap';
import { toast } from 'react-toastify';
import './AgentBigQueryPage.css';

const BIGQUERY_AGENT_SERVICE_URL = 'https://bigquery-agent-service-567539916654.europe-west1.run.app/chat';

interface ChatMessage {
    role: 'user' | 'model';
    content: string;
}

const AgentBigQueryPage = () => {
    const [history, setHistory] = useState<ChatMessage[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const chatBodyRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (chatBodyRef.current) {
            chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
        }
    }, [history, isLoading]);
    
    useEffect(() => {
        const initializeChat = async () => {
            // Uruchom tylko wtedy, gdy historia jest pusta i nie ma ładowania
            if (history.length === 0 && !isLoading) {
                setIsLoading(true);
                setError(null);
                try {
                    const response = await fetch(BIGQUERY_AGENT_SERVICE_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ history: [] })
                    });
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.detail || 'Błąd inicjalizacji agenta.');
                    }
                    const responseData = await response.json();
                    if (responseData.content) {
                        setHistory([{ role: 'model', content: responseData.content }]);
                    }
                } catch (err: any) {
                    setError(err.message || 'Nie udało się połączyć z usługą agenta.');
                    toast.error(err.message || 'Błąd inicjalizacji.');
                } finally {
                    setIsLoading(false);
                }
            }
        };
        initializeChat();
        // Poprawiona tablica zależności, aby usunąć ostrzeżenie lintera
    }, [history.length, isLoading]);

    const handleSendMessage = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!userInput.trim() || isLoading) return;

        const newUserMessage: ChatMessage = { role: 'user', content: userInput };
        const updatedHistory = [...history, newUserMessage];
        
        setHistory(updatedHistory);
        setUserInput('');
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch(BIGQUERY_AGENT_SERVICE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ history: updatedHistory })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Wystąpił błąd komunikacji z agentem.');
            }
            const responseData = await response.json();
            const agentMessage: ChatMessage = { role: 'model', content: responseData.content };
            setHistory(currentHistory => [...currentHistory, agentMessage]);
        } catch (err: any) {
            setError(err.message || 'Nie udało się połączyć z usługą agenta.');
            toast.error(err.message || 'Wystąpił błąd.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Container className="my-4">
            <h1 className="mb-4">Agent BigQuery</h1>
            <p>Porozmawiaj z agentem, aby znaleźć i przeanalizować pozwolenia na budowę w Polsce.</p>

            <Card className="chat-card">
                <Card.Body className="chat-body" ref={chatBodyRef}>
                    {history.map((msg, index) => (
                         <div key={index} className={`message-container ${msg.role}`}>
                            <div className={`message ${msg.role}`}>
                                <pre>{msg.content}</pre>
                            </div>
                        </div>
                    ))}
                     {isLoading && (
                        <div className="message-container model">
                            <div className="message model">
                                <Spinner animation="border" size="sm" />
                            </div>
                        </div>
                    )}
                     {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
                </Card.Body>
                <Card.Footer>
                    <Form onSubmit={handleSendMessage} className="chat-input-form">
                        <Form.Control
                            type="text"
                            value={userInput}
                            onChange={(e) => setUserInput(e.target.value)}
                            placeholder="Napisz wiadomość..."
                            disabled={isLoading}
                        />
                        <Button variant="primary" type="submit" disabled={isLoading}>
                            Wyślij
                        </Button>
                    </Form>
                </Card.Footer>
            </Card>
        </Container>
    );
};

export default AgentBigQueryPage;
