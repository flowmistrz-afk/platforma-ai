import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Container, Card, Spinner, Alert, ListGroup } from 'react-bootstrap';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';

// Rozszerzona definicja typów, zawiera teraz pole na logi
interface TaskData {
    status: 'processing' | 'completed' | 'failed';
    request?: any;
    response?: {
        session_id: string;
        response: string;
    };
    error?: string;
    timestamp?: any;
    progressLog?: string[]; // <- Nowe pole na logi
}

// Prosty parser do wyciągania danych z odpowiedzi agenta
const parseAgentResponse = (responseText: string) => {
    try {
        const sections = responseText.split('###').filter(s => s.trim() !== '');
        return sections.map((section, index) => {
            const lines = section.trim().split('\n');
            const name = lines[0].replace('Nazwa Firmy:', '').trim();
            const details = lines.slice(1).map(line => line.trim());
            return { id: index, name, details };
        });
    } catch (error) {
        console.error("Błąd parsowania odpowiedzi agenta:", error);
        return [{ id: 'raw', name: "Odpowiedź agenta", details: [responseText] }];
    }
};

const AgentProMaxResultsPage = () => {
    const { taskId } = useParams<{ taskId: string }>();
    const [taskData, setTaskData] = useState<TaskData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const logContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!taskId) {
            setError("Nie znaleziono ID zadania w adresie URL.");
            setIsLoading(false);
            return;
        }

        const docRef = doc(db, 'tasks', taskId);

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as TaskData;
                setTaskData(data);
                
                if (data.status !== 'processing') {
                    setIsLoading(false);
                }
            } else {
                 // Nie ustawiamy błędu od razu, czekamy na pojawienie się dokumentu
            }
        }, (err) => {
            console.error("Błąd podczas nasłuchiwania na zmiany w zadaniu:", err);
            setError("Wystąpił błąd podczas pobierania danych o zadaniu.");
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [taskId]);

    // Efekt do automatycznego scrollowania logów
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [taskData?.progressLog]);


    const renderLogContent = () => {
        const logs = taskData?.progressLog || [];
        if (logs.length === 0 && taskData?.status === 'processing') {
            return <p>Oczekuję na pierwsze logi od agenta...</p>
        }
        return (
            <ListGroup variant="flush" ref={logContainerRef} style={{ maxHeight: '300px', overflowY: 'auto', background: '#f8f9fa', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                {logs.map((log, index) => (
                    <ListGroup.Item key={index} className="py-1 px-2 border-0">
                        {log}
                    </ListGroup.Item>
                ))}
            </ListGroup>
        );
    }

    const renderMainContent = () => {
        if (isLoading && !taskData) {
             return (
                <div className="text-center">
                    <Spinner animation="border" role="status" variant="primary" />
                    <p className="mt-3">Nawiązuję połączenie i oczekuję na rozpoczęcie zadania...</p>
                </div>
            );
        }

        if (error) {
            return <Alert variant="danger">{error}</Alert>;
        }

        if (taskData) {
            switch (taskData.status) {
                case 'completed':
                    const parsedResponse = parseAgentResponse(taskData.response?.response || "Brak odpowiedzi.");
                    return (
                        <>
                            <Alert variant="success">Agent zakończył pracę!</Alert>
                            <ListGroup>
                                {parsedResponse.map(item => (
                                    <ListGroup.Item key={item.id}>
                                        <h5>{item.name}</h5>
                                        {item.details.map((detail, index) => (
                                            <p key={index} className="mb-1">{detail}</p>
                                        ))}
                                    </ListGroup.Item>
                                ))}
                            </ListGroup>
                        </>
                    );
                case 'failed':
                    return (
                        <Alert variant="danger">
                            <h4>Wystąpił błąd podczas przetwarzania</h4>
                            <p>Niestety, agent nie mógł ukończyć zadania. Szczegóły błędu:</p>
                            <pre>{taskData.error || "Brak szczegółów błędu."}</pre>
                        </Alert>
                    );
                case 'processing':
                     return (
                        <div className="text-center">
                            <Spinner animation="border" role="status" variant="primary" />
                            <p className="mt-3">Agent jest w trakcie pracy...</p>
                        </div>
                    );
                default:
                    return <Alert variant="warning">Nieznany status zadania.</Alert>;
            }
        }

        return <Alert variant="info">Brak danych do wyświetlenia.</Alert>;
    };

    return (
        <Container>
            <h1 className="my-4">Wyniki Agenta Pro Max</h1>
            <p>ID Zadania: <strong>{taskId}</strong></p>
            
            {/* Nowa sekcja Dziennika Zdarzeń */}
            <Card className="mb-4">
                <Card.Header as="h5">Dziennik Zdarzeń Agenta</Card.Header>
                <Card.Body className="p-0">
                    {renderLogContent()}
                </Card.Body>
            </Card>

            <Card>
                <Card.Header as="h5">Finalny Wynik</Card.Header>
                <Card.Body>
                    {renderMainContent()}
                </Card.Body>
            </Card>
        </Container>
    );
};

export default AgentProMaxResultsPage;
