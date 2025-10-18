import React, { useState } from 'react';
import { Form, Button, Spinner } from 'react-bootstrap';
import { useAgentStore } from '../../stores/agentStore';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const Step4_Sources = () => {
  const { prevStep, formData, setFormData, reset } = useAgentStore();
  const { authUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleRunAgent = async () => {
    setIsLoading(true);
    toast.info("Uruchamiam agenta V4...");

    if (!authUser) {
      toast.error("Błąd: Użytkownik niezalogowany!");
      setIsLoading(false);
      return;
    }

    try {
      const token = await authUser.getIdToken();
      // ZMIANA: Użycie nowego endpointu V4
      const functionUrl = 'https://europe-west1-automatyzacja-pesamu.cloudfunctions.net/agentV4_orchestrator';

      const { formData } = useAgentStore.getState();

      // ZMIANA: Dostosowanie payloadu do oczekiwań agenta V4
      const payload = {
        query: formData.specialization, // Główny termin wyszukiwania
        słowa_kluczowe: formData.specialization, // Alias dla kompatybilności
        lokalizacja: formData.city,
        sources: formData.sources
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
        throw new Error(errorData.error || 'Błąd serwera');
      }

      const result = await response.json();
      const taskId = result.data.taskId;

      if (taskId) {
        toast.dismiss();
        reset();
        navigate(`/agents/results/${taskId}`);
      } else {
        throw new Error("Nie otrzymano ID zadania od serwera.");
      }

    } catch (e: any) {
      console.error("Błąd agenta:", e);
      toast.error(e.message || "Wystąpił błąd podczas uruchamiania agenta!");
      setIsLoading(false);
    }
  };

  return (
    <Form onSubmit={(e) => { e.preventDefault(); handleRunAgent(); }}>
      <fieldset>
        <legend>Krok 4 z 4: Wybierz źródła danych i uruchom</legend>
        <Form.Check type="switch" id="source-google" label="Wyszukiwarka Google" checked={formData.sources.google} onChange={e => setFormData({ sources: {...formData.sources, google: e.target.checked}})} />
        <Form.Check type="switch" id="source-ceidg" label="Baza CEIDG" checked={formData.sources.ceidg} onChange={e => setFormData({ sources: {...formData.sources, ceidg: e.target.checked}})} />
        <Form.Check type="switch" id="source-krs" label="Baza KRS" checked={formData.sources.krs} onChange={e => setFormData({ sources: {...formData.sources, krs: e.target.checked}})} />
      </fieldset>
      <div className="d-flex justify-content-between mt-4">
        <Button variant="secondary" onClick={prevStep} disabled={isLoading}>Wstecz</Button>
        <Button variant="success" type="submit" disabled={isLoading}>
          {isLoading ? <Spinner as="span" animation="border" size="sm" /> : 'Uruchom Agenta'}
        </Button>
      </div>
    </Form>
  );
};
export default Step4_Sources;