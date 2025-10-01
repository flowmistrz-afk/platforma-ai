import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Button, Card, Spinner, Container, ListGroup } from 'react-bootstrap';
import { useAuth } from '../../hooks/useAuth';
import { toast } from 'react-toastify';

const AgentV2Runner = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { authUser } = useAuth();

  const [taskData, setTaskData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAgentRunning, setIsAgentRunning] = useState(false);

  useEffect(() => {
    const fetchTaskData = async () => {
      if (!taskId) return;
      try {
        const taskRef = doc(db, 'agent_tasks', taskId);
        const taskSnap = await getDoc(taskRef);
        if (taskSnap.exists()) {
          setTaskData(taskSnap.data().query);
        } else {
          toast.error("Nie znaleziono zadania o podanym ID.");
        }
      } catch (error) {
        toast.error("Błąd podczas pobierania danych zadania.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTaskData();
  }, [taskId]);

  const handleRunAgentV2 = async () => {
    if (!taskData || !authUser) {
      toast.error("Brak danych zadania lub użytkownik niezalogowany.");
      return;
    }
    setIsAgentRunning(true);
    toast.info("Uruchamiam Agenta v2...");

    try {
        const token = await authUser.getIdToken();
        // Nazwa nowej funkcji wdrożonej na Firebase
        const functionUrl = 'https://europe-west1-automatyzacja-pesamu.cloudfunctions.net/agent2_searchWithTools';

        const payload = {
            keywords: taskData.keywords,
            city: taskData.city,
        };

        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Błąd serwera podczas uruchamiania Agenta V2');
        }

        const result = await response.json();
        const newTaskId = result.data.taskId;

        if (newTaskId) {
            toast.success("Agent V2 pomyślnie uruchomiony! Przekierowuję na stronę wyników.");
            navigate(`/agents/results/${newTaskId}`);
        } else {
            throw new Error("Nie otrzymano ID nowego zadania od serwera.");
        }

    } catch (e: any) {
        console.error("Błąd Agenta V2:", e);
        toast.error(e.message || "Wystąpił błąd podczas uruchamiania Agenta V2!");
        setIsAgentRunning(false);
    }
  };

  if (isLoading) {
    return <Container className="text-center mt-5"><Spinner animation="border" /></Container>;
  }

  if (!taskData) {
    return <Container className="text-center mt-5"><h2>Nie znaleziono danych zadania.</h2></Container>;
  }

  return (
    <Container className="mt-4">
      <Card>
        <Card.Header as="h2">Uruchom Agenta Wersji 2</Card.Header>
        <Card.Body>
          <Card.Title>Gotowy do uruchomienia z następującymi danymi:</Card.Title>
          <ListGroup variant="flush">
            <ListGroup.Item><b>Miasto:</b> {taskData.city}</ListGroup.Item>
            <ListGroup.Item><b>Główna usługa:</b> {taskData.identifiedService || taskData.specialization}</ListGroup.Item>
            <ListGroup.Item><b>Słowa kluczowe:</b> {taskData.keywords?.join(', ')}</ListGroup.Item>
          </ListGroup>
          <div className="d-flex justify-content-end mt-3">
            <Button 
              variant="success" 
              onClick={handleRunAgentV2} 
              disabled={isAgentRunning}
            >
              {isAgentRunning ? <Spinner as="span" animation="border" size="sm" /> : 'Uruchom Agenta V2'}
            </Button>
          </div>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default AgentV2Runner;
