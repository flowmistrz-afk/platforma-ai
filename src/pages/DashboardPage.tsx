import React from 'react';
import { Card, Col, Row, Button } from 'react-bootstrap';
import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';

const DashboardPage = () => {
  const { userProfile, company } = useAuth();
  return (
    <div>
      <h1>Panel Główny</h1>
      <p>Witaj, {userProfile?.email}!</p>
      {company && <p>Jesteś członkiem firmy: <strong>{company.name}</strong></p>}
      
      <Row className="mt-4">
        <Col md={6}>
            <Card>
                <Card.Body>
                    <Card.Title>Agenci AI</Card.Title>
                    <Card.Text>
                        Zarządzaj dostępnymi agentami AI i monitoruj ich wykorzystanie.
                    </Card.Text>
                    <Link to="/agents">
                        <Button variant="primary">Przejdź do agentów</Button>
                    </Link>
                </Card.Body>
            </Card>
        </Col>
        <Col md={6}>
            <Card>
                <Card.Body>
                    <Card.Title>Raporty i Analizy</Card.Title>
                    <Card.Text>
                        Przeglądaj raporty dotyczące aktywności i kosztów.
                    </Card.Text>
                </Card.Body>
            </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;