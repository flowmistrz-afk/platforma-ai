// ścieżka: src/pages/Agent1RunPage.tsx

import React from 'react';
import { useAgentStore } from '../stores/agentStore';
import { Card, ProgressBar } from 'react-bootstrap';

// Aktualizacja importów dla nowych kroków
import Step1Specialization from '../components/agent/Step1_Specialization';
import Step2_Refinement from '../components/agent/Step2_Refinement';
import Step3_Location from '../components/agent/Step3_Location';
import Step4_Sources from '../components/agent/Step4_Sources';

const Agent1RunPage = () => {
  const step = useAgentStore((state) => state.step);
  // Aktualizacja paska postępu dla 4 kroków
  const progress = (step / 4) * 100;

  const renderStep = () => {
    switch (step) {
      case 1:
        return <Step1Specialization />;
      case 2:
        return <Step2_Refinement />;
      case 3:
        return <Step3_Location />;
      case 4:
        return <Step4_Sources />;
      default:
        return <Step1Specialization />;
    }
  };

  return (
    <div>
      <Card className="shadow-sm">
        <Card.Header>
          <Card.Title as="h3">Agent 1: Wyszukiwanie Podwykonawców</Card.Title>
          <ProgressBar now={progress} label={`${Math.round(progress)}%`} className="mt-2" />
        </Card.Header>
        <Card.Body className="p-4">
          {renderStep()}
        </Card.Body>
      </Card>
    </div>
  );
};

export default Agent1RunPage;