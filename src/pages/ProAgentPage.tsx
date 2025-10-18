import React, { useState, useCallback } from 'react';
import { Container, Row, Col, Card, Form, Button, Spinner, Alert } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../hooks/useAuth';
import pkdData from '../data/pkd-database.json';
import AgentWorkflowSelector from '../components/agent/AgentWorkflowSelector';

const ProAgentPage: React.FC = () => {
    const [query, setQuery] = useState('');
    const [city, setCity] = useState('');
    const [province, setProvince] = useState('');
    const [selectedSection, setSelectedSection] = useState('');
    const [workflowSteps, setWorkflowSteps] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const { authUser } = useAuth();
    const navigate = useNavigate();

    const handleCreateTask = useCallback(async () => {
        if (!query.trim() || !city.trim() || !province.trim()) {
            toast.error('Proszę wypełnić wszystkie pola: usługa, miasto i województwo.');
            return;
        }
        if (workflowSteps.length === 0) {
            toast.error('Musisz wybrać przynajmniej jeden krok dla agenta.');
            return;
        }
        if (!authUser) {
            toast.error('Musisz być zalogowany, aby utworzyć zadanie.');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const idToken = await authUser.getIdToken();
            const payload = {
                initialQuery: query,
                city,
                province,
                selectedPkdSection: selectedSection,
                workflowSteps: workflowSteps
            };

            const response = await fetch('https://europe-west1-automatyzacja-pesamu.cloudfunctions.net/createNewTask', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Wystąpił błąd serwera.');
            }

            const result = await response.json();
            if (result.success && result.taskId) {
                toast.success('Zadanie pomyślnie utworzone!');
                navigate(`/pro-agent/results/${result.taskId}`);
            } else {
                throw new Error('Nie udało się utworzyć zadania.');
            }
        } catch (err: any) {
            setError(err.message || 'Nie udało się uruchomić agenta.');
            toast.error(err.message || 'Nie udało się uruchomić agenta.');
        } finally {
            setIsLoading(false);
        }
    }, [query, city, province, selectedSection, workflowSteps, authUser, navigate]);

    return (
        <Container className="mt-4">
            <Row>
                <Col md={{ span: 8, offset: 2 }}>
                    <Card>
                        <Card.Body>
                            <div className="text-center mb-4">
                                <h2>AGENT wersja PRO</h2>
                                <p className="text-muted">Uruchom zaawansowany proces wyszukiwania i analizy firm.</p>
                            </div>
                            {error && <Alert variant="danger">{error}</Alert>}
                            <Form onSubmit={(e) => { e.preventDefault(); handleCreateTask(); }}>
                                <Form.Group className="mb-3">
                                    <Form.Label>Szukana usługa lub specjalizacja</Form.Label>
                                    <Form.Control 
                                        type="text" 
                                        placeholder="np. układanie kostki brukowej, ocieplenia"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                    />
                                </Form.Group>

                                <Row>
                                    <Col md={6}>
                                        <Form.Group className="mb-3">
                                            <Form.Label>Miasto</Form.Label>
                                            <Form.Control 
                                                type="text" 
                                                placeholder="np. Warszawa"
                                                value={city}
                                                onChange={(e) => setCity(e.target.value)}
                                            />
                                        </Form.Group>
                                    </Col>
                                    <Col md={6}>
                                        <Form.Group className="mb-3">
                                            <Form.Label>Województwo</Form.Label>
                                            <Form.Control 
                                                type="text" 
                                                placeholder="np. mazowieckie"
                                                value={province}
                                                onChange={(e) => setProvince(e.target.value)}
                                            />
                                        </Form.Group>
                                    </Col>
                                </Row>

                                <Form.Group className="mb-3">
                                    <Form.Label>Zawęź wyszukiwanie do sekcji PKD (opcjonalne)</Form.Label>
                                    <Form.Select 
                                        value={selectedSection}
                                        onChange={(e) => setSelectedSection(e.target.value)}
                                    >
                                        <option value="">Wszystkie sekcje</option>
                                        {pkdData.map(section => (
                                            <option key={section.kod} value={section.kod}>
                                                {`${section.kod} - ${section.nazwa}`}
                                            </option>
                                        ))}
                                    </Form.Select>
                                </Form.Group>

                                <hr />
                                <h5 className="mb-3">Konfiguracja Agenta</h5>
                                <AgentWorkflowSelector selectedSteps={workflowSteps} onChange={setWorkflowSteps} />
                                <hr />

                                <div className="d-grid mt-3">
                                    <Button variant="primary" type="submit" disabled={isLoading}>
                                        {isLoading ? <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" /> : 'Uruchom Agenta'}
                                    </Button>
                                </div>
                            </Form>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
        </Container>
    );
};

export default ProAgentPage;
