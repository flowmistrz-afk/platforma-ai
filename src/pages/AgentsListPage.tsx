import React from 'react';
import { Card, Col, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';

const AgentsListPage = () => {
  // In the future, this list would be dynamic
  const agents = [
    {
      id: 'find-subcontractors',
      name: 'Agent 1: Wyszukiwanie Podwykonawców',
      description: 'Znajdź i przeanalizuj potencjalnych podwykonawców na podstawie specjalizacji i lokalizacji.',
      path: '/agents/run/find-subcontractors'
    }
  ];

  return (
    <div>
      <h1 className="mb-4">Dostępni Agenci AI</h1>
      <Row>
        {agents.map(agent => (
          <Col md={6} lg={4} key={agent.id} className="mb-4">
            <Card as={Link} to={agent.path} className="h-100 text-decoration-none text-dark">
              <Card.Body>
                <Card.Title>{agent.name}</Card.Title>
                <Card.Text>{agent.description}</Card.Text>
              </Card.Body>
              <Card.Footer>
                Uruchom Agenta &rarr;
              </Card.Footer>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
};

export default AgentsListPage;