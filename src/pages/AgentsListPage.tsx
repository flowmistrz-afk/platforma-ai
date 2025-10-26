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
    },
    {
      id: 'pro-agent',
      name: 'AGENT wersja PRO',
      description: 'Uruchamia zaawansowany, wieloetapowy proces wyszukiwania i analizy firm z użyciem uczenia maszynowego.',
      path: '/agents/run/pro-agent'
    },
    {
      id: 'agent-pro-max',
      name: 'AgentProMax: Konstruktor Workflow',
      description: 'Twórz i uruchamiaj własne, niestandardowe przepływy pracy agentów AI za pomocą wizualnego edytora.',
      path: '/agent-pro-max'
    },
    {
      id: 'search-building-permits',
      name: 'Wyszukiwanie pozwoleń na budowę',
      description: 'Znajdź i przeanalizuj pozwolenia na budowę na podstawie lokalizacji i typu projektu.',
      path: '/agents/run/search-building-permits'
    },
    {
      id: 'bigquery-agent',
      name: 'BigQuery Agent',
      description: 'Porozmawiaj z agentem, aby znaleźć i przeanalizować pozwolenia na budowę w Polsce.',
      path: '/agents/run/bigquery-agent'
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