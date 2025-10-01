import React, { useState } from 'react';
import { Form, Button, Spinner } from 'react-bootstrap';
import { useAgentStore } from '../../stores/agentStore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { toast } from 'react-toastify';

const Step1Specialization = () => {
  const { nextStep, formData, setFormData, setSuggestions } = useAgentStore();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    toast.info('Analizuję Twoje zapytanie przy pomocy AI...');

    try {
      const functions = getFunctions(undefined, 'europe-west1');
      const expandKeywords = httpsCallable(functions, 'agent1_expandKeywords');
      const result: any = await expandKeywords({ specialization: formData.specialization });
      
      // Zapisz sugestie w magazynie
      setSuggestions(result.data);
      // Od razu ustaw te sugestie jako domyślnie wybrane w formularzu
      setFormData({ 
        keywords: result.data.keywords || [], 
        pkdCodes: result.data.pkdCodes || [] 
      });

      toast.dismiss();
      nextStep();
    } catch (error: any) {
      console.error("Błąd podczas pobierania sugestii AI:", error);
      toast.error(`Błąd AI: ${error.message}`);
      // Nawet jeśli AI zawiedzie, przechodzimy dalej z podstawowym słowem kluczowym
      setFormData({ keywords: [formData.specialization] });
      nextStep();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form onSubmit={handleSubmit}>
      <fieldset>
        <legend>Krok 1 z 4: Opisz, kogo potrzebujesz</legend>
        <Form.Group controlId="specialization">
          <Form.Label>Specjalizacja lub prace do wykonania</Form.Label>
          <Form.Control 
            type="text" 
            placeholder="np. 'firma do układania kostki brukowej'" 
            value={formData.specialization} 
            onChange={e => setFormData({ specialization: e.target.value })} 
            required 
          />
          <Form.Text className="text-muted">
            Opisz w kilku słowach, jakiego wykonawcy szukasz. Nasza AI przeanalizuje Twoje zapytanie.
          </Form.Text>
        </Form.Group>
        <div className="d-flex justify-content-end mt-4">
          <Button variant="primary" type="submit" disabled={!formData.specialization || isLoading}>
            {isLoading ? <Spinner as="span" animation="border" size="sm" /> : 'Analizuj i przejdź dalej'}
          </Button>
        </div>
      </fieldset>
    </Form>
  );
};

export default Step1Specialization;