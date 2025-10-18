import React from 'react';
import WorkflowBuilder from '../components/workflow-builder/WorkflowBuilder';
import { Container } from 'react-bootstrap';

const AgentProMaxPage = () => {
  return (
    <Container fluid style={{ height: 'calc(100vh - 80px)', padding: 0 }}>
      <WorkflowBuilder />
    </Container>
  );
};

export default AgentProMaxPage;
