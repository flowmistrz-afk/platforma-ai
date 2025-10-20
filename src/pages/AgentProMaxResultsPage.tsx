import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Container, Card, Spinner, Alert, ListGroup } from 'react-bootstrap';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase'; // Upewnij się, że masz poprawną ścieżkę do konfiguracji Firebase

// Definicja typów dla danych z Firestore
interface TaskData {
    status: 'processing' | 'completed' | 'failed';
    request?: any;
    response?: {
        session_id: string;
        response: string;
    };
    error?: string;
    timestamp?: any;
}

// Prosty parser do wyciągania danych z odpowiedzi agenta
const parseAgentResponse = (responseText: string) => {
    try {
        // To jest bardzo uproszczony parser. W przyszłości można go rozbudować,
        // jeśli agent będzie zwracał JSON lub bardziej złożone struktury.
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
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!taskId) {
            setError("Nie znaleziono ID zadania w adresie URL.");
            setLoading(false);
            return;
        }

        const docRef = doc(db, 'tasks', taskId);

        // Ustawienie nasłuchiwania na zmiany w dokumencie (real-time)
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as TaskData;
                setTaskData(data);
                
                // Zakończ ładowanie, jeśli status nie jest już 'processing'
                if (data.status !== 'processing') {
                    setLoading(false);
                }
            } else {
                setError("Nie znaleziono zadania o podanym ID w bazie danych.");
                setLoading(false);
            }
        }, (err) => {
            console.error("Błąd podczas nasłuchiwania na zmiany w zadaniu:", err);
            setError("Wystąpił błąd podczas pobierania danych o zadaniu.");
            setLoading(false);
        });

        // Funkcja czyszcząca - zakończ nasłuchiwanie, gdy komponent jest odmontowywany
        return () => unsubscribe();

    }, [taskId]); // Efekt będzie uruchamiany ponownie, tylko jeśli zmieni się taskId

    const renderContent = () => {
        if (loading || (taskData && taskData.status === 'processing')) {
            return (
                <div className="text-center">
                    <Spinner animation="border" role="status" variant="primary" />
                    <p className="mt-3">Agent jest w trakcie pracy... Proszę czekać.</p>
                    <p>Możesz bezpiecznie zamknąć tę stronę i wrócić tu później, wyniki zostaną zachowane.</p>
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
            <Card>
                <Card.Body>
                    {renderContent()}
                </Card.Body>
            </Card>
        </Container>
    );
};

export default AgentProMaxResultsPage;
