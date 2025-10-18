// ścieżka: src/pages/Agent1ResultsPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../services/firebase';
import { Card, Spinner, Alert, ListGroup, Button, Table, Row, Col } from 'react-bootstrap';

import { useAuth } from '../hooks/useAuth';

// Definicja typu dla dokumentu zadania
interface AgentTask {
  status: 'processing' | 'completed' | 'failed' | 'extract_skipped' | 'search_completed';
  logs: { timestamp: { toDate: () => Date }, message: string }[];
  results: any[];
  query: any; // Dodajemy pole query do typu
  ownerUid?: string; // Dodajemy pole ownerUid
  error?: string;
  summary?: string;
}

const Agent1ResultsPage = () => {

  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<AgentTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSearchingMore, setIsSearchingMore] = useState(false);
  const resultsCardRef = useRef<HTMLDivElement>(null);

  const handleFullScreen = () => {
    if (resultsCardRef.current) {
      resultsCardRef.current.requestFullscreen().catch(err => {
        console.error(`Błąd przy próbie włączenia trybu pełnoekranowego: ${err.message}`);
      });
    }
  };

  const handleSearchMore = async () => {
    if (!task || !task.query) {
      alert("Brak danych zapytania w bieżącym zadaniu.");
      return;
    }

    setIsSearchingMore(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error("Użytkownik nie jest zalogowany.");
      }
      const token = await user.getIdToken();

      const response = await fetch("https://europe-west1-automatyzacja-pesamu.cloudfunctions.net/agentV4_orchestrator", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          słowa_kluczowe: task.query.specialization,
          lokalizacja: task.query.city,
          query: task.query.specialization
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Błąd serwera przy uruchamianiu Agenta V4");
      }

      const result = await response.json();
      const newTaskId = result.data.taskId;

      if (newTaskId) {
        navigate(`/agents/results/${newTaskId}`);
      } else {
        throw new Error("Nie otrzymano ID nowego zadania.");
      }

    } catch (err: any) {
      console.error("Błąd podczas uruchamiania Agenta V4:", err);
      alert(`Błąd: ${err.message}`);
    } finally {
      setIsSearchingMore(false);
    }
  };

  useEffect(() => {
    if (!taskId) {
      setError("Nie podano ID zadania.");
      return;
    }

    // Użyj onAuthStateChanged, aby poczekać na gotowość stanu uwierzytelnienia
    const authUnsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Użytkownik jest zalogowany, TERAZ można bezpiecznie nasłuchiwać na Firestore
        console.log(`[AUTH] Użytkownik ${user.uid} jest zalogowany. Uruchamiam nasłuch dla zadania ${taskId}.`);
        
        // Wybór odpowiedniej kolekcji na podstawie ID zadania lub innego kryterium
        // Możesz dodać logikę rozróżniającą zadania v1 i v4, jeśli są w różnych kolekcjach
        const collectionName = "agent_tasks_v4"; // Załóżmy, że nowe zadania są tutaj
        const taskRef = doc(db, collectionName, taskId);

        const firestoreUnsubscribe = onSnapshot(taskRef, (docSnap) => {
          if (docSnap.exists()) {
            setTask(docSnap.data() as AgentTask);
            setError(null);
          } else {
            // Można dodać obsługę nasłuchu na starą kolekcję jako fallback
            console.warn(`Nie znaleziono zadania w kolekcji ${collectionName}.`);
            // setTask(null);
          }
        }, (err) => {
          console.error("Błąd nasłuchu zadania:", err);
          setError("Błąd połączenia z bazą danych lub brak uprawnień.");
        });

        // Zwróć funkcję czyszczącą dla listenera Firestore
        return () => {
          console.log(`[CLEANUP] Zatrzymuję nasłuch Firestore dla zadania ${taskId}.`);
          firestoreUnsubscribe();
        };
      } else {
        // Użytkownik nie jest zalogowany
        console.error("[AUTH] Użytkownik wylogowany. Nie można nasłuchiwać na zadanie.");
        setError("Użytkownik nie jest zalogowany. Odśwież stronę.");
      }
    });

    // Funkcja czyszcząca dla listenera autoryzacji
    return () => {
      console.log("[CLEANUP] Zatrzymuję nasłuch stanu autoryzacji.");
      authUnsubscribe();
    };

  }, [taskId]); // Zależność od taskId pozostaje
  
  if (error) {
    return <Alert variant="danger">{error}</Alert>;
  }

  if (!task) {
    return <div className="text-center p-5"><Spinner animation="border" /></div>;
  }

  return (
    <div>
      <Link to="/agents" className="mb-4 d-inline-block">
        <Button variant="outline-secondary" size="sm">
          &larr; Wróć do listy agentów
        </Button>
      </Link>
      <h1>Wyniki Pracy Agenta</h1>
      <p>ID zadania: <code>{taskId}</code></p>
      
      <Row>
        <Col md={8} ref={resultsCardRef} style={{ backgroundColor: 'white', padding: '1rem' }}>
          <Card className="mt-4">
            <Card.Header as="h5" className="d-flex justify-content-between align-items-center">
              <span>Znalezione Firmy</span>
              <div>
                <Button 
                  variant="primary"
                  size="sm" 
                  onClick={handleSearchMore}
                  disabled={task.status === 'processing' || isSearchingMore}
                  className="me-2"
                >
                  {isSearchingMore ? <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" /> : 'Wyszukaj więcej'}
                </Button>
                <Button variant="outline-secondary" size="sm" onClick={handleFullScreen}>
                  Pełny Ekran
                </Button>
              </div>
            </Card.Header>
            <Card.Body>
              {task.status === 'processing' && <div className="text-center p-4"><Spinner animation="border" /> <p className="mt-2">Agent wciąż pracuje...</p></div>}
              {task.status === 'completed' && (
                Array.isArray(task.results) ? (
                <Table striped bordered hover responsive size="sm">
                  <thead>
                    <tr>
                      <th>Nazwa</th>
                      <th>Adres</th>
                      <th>Telefon</th>
                      <th>Strona WWW</th>
                      <th>Ocena</th>
                      <th>Liczba opinii</th>
                    </tr>
                  </thead>
                  <tbody>
                    {task.results.map((company: any, index: number) => (
                      <tr key={index}>
                        <td>{company.nazwa || 'Brak'}</td>
                        <td>{company.adres || 'Brak'}</td>
                        <td>{company.telefon || 'Brak'}</td>
                        <td>{company.website ? <a href={company.website} target="_blank" rel="noopener noreferrer">Link</a> : 'Brak'}</td>
                        <td>{company.ocena || 'N/A'}</td>
                        <td>{company.liczba_opinii || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                ) : (
                  <Alert variant="warning">Otrzymano wyniki w nieprawidłowym formacie lub agent nie znalazł żadnych pasujących firm.</Alert>
                )
              )}
               {task.status === 'failed' && <Alert variant="danger">Praca agenta zakończona błędem: {task.error}</Alert>}
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="mt-4">
            <Card.Header as="h5">Konsola Agenta (Na Żywo)</Card.Header>
            <ListGroup variant="flush" style={{ maxHeight: '500px', overflowY: 'auto', fontSize: '0.85rem' }}>
              {task.logs && task.logs.slice().reverse().map((log, index) => (
                <ListGroup.Item key={index} className="py-2 px-3 border-bottom-0">
                  <small className="text-muted">{log.timestamp.toDate().toLocaleTimeString()}</small>
                  <p className="mb-0">{log.message}</p>
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Agent1ResultsPage; // ZMIANA NAZWY
