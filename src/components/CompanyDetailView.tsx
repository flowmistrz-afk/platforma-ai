
import React, { useState } from 'react';
import { Card, Button, Form, Alert, Spinner } from 'react-bootstrap';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Company } from '../type';
import { AI_AGENTS } from '../constants';

interface CompanyDetailViewProps {
  company: Company;
  onBack: () => void;
}

const CompanyDetailView: React.FC<CompanyDetailViewProps> = ({ company, onBack }) => {
  // Stan przechowujący listę ID włączonych agentów dla tej firmy
  const [enabledAgents, setEnabledAgents] = useState<string[]>(company.enabledAgents || []);
  
  // Stany do obsługi procesu zapisu
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Obsługa przełączania agenta
  const handleAgentToggle = (agentId: string, isEnabled: boolean) => {
    setEnabledAgents(prev => 
      isEnabled ? [...prev, agentId] : prev.filter(id => id !== agentId)
    );
    // Ukryj komunikaty o stanie zapisu, gdy użytkownik dokonuje nowych zmian
    setSaveSuccess(false);
    setSaveError(null);
  };

  // Funkcja zapisu zmian w Firestore
  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const companyDocRef = doc(db, 'companies', company.id);
      await updateDoc(companyDocRef, {
        enabledAgents: enabledAgents
      });
      setSaveSuccess(true);
    } catch (error) {
      console.error("Error updating company:", error);
      setSaveError("Wystąpił błąd podczas zapisywania zmian. Spróbuj ponownie.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="shadow-sm">
      <Card.Header as="h5" className="d-flex justify-content-between align-items-center">
        Zarządzanie firmą: {company.name}
        <Button variant="outline-secondary" size="sm" onClick={onBack}>&larr; Wróć do listy</Button>
      </Card.Header>
      <Card.Body>
        <Card.Title as="h6">Dostępni Agenci AI</Card.Title>
        <p className="text-muted">Zaznacz, aby włączyć agenta dla tej firmy.</p>
        <Form>
          {AI_AGENTS.map(agent => (
            <Form.Check 
              key={agent.id}
              type="switch"
              id={`agent-switch-${agent.id}`}
              label={agent.name}
              checked={enabledAgents.includes(agent.id)}
              onChange={(e) => handleAgentToggle(agent.id, e.target.checked)}
              className="mb-2"
            />
          ))}
        </Form>
      </Card.Body>
      <Card.Footer className="text-end">
        {saveError && <Alert variant="danger" className="text-start">{saveError}</Alert>}
        {saveSuccess && <Alert variant="success" className="text-start">Zmiany zostały pomyślnie zapisane!</Alert>}
        <Button 
          variant="primary"
          disabled={isSaving}
          onClick={handleSave}
        >
          {isSaving ? <><Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" /> Zapisywanie...</> : 'Zapisz zmiany'}
        </Button>
      </Card.Footer>
    </Card>
  );
};

export default CompanyDetailView;
