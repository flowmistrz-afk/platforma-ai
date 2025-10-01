import React from 'react';
import { Form, Button } from 'react-bootstrap';
import { useAgentStore } from '../../stores/agentStore';

const Step3_Location = () => {
  const { nextStep, prevStep, formData, setFormData } = useAgentStore();

  return (
    <Form onSubmit={(e) => { e.preventDefault(); nextStep(); }}>
      <fieldset>
        <legend>Krok 3 z 4: Określ lokalizację</legend>
        
        <Form.Group controlId="city">
          <Form.Label>Miasto</Form.Label>
          <Form.Control 
            type="text" 
            placeholder="np. 'Warszawa'" 
            value={formData.city} 
            onChange={e => setFormData({ city: e.target.value })} 
            required 
          />
        </Form.Group>

        <Form.Group controlId="radius" className="mt-3">
          <Form.Label>Promień wyszukiwania: {formData.radius} km</Form.Label>
          <Form.Range 
            min="0" 
            max="200" 
            step="10"
            value={formData.radius}
            onChange={e => setFormData({ radius: Number(e.target.value) })}
          />
        </Form.Group>
        
      </fieldset>
      <div className="d-flex justify-content-between mt-4">
        <Button variant="secondary" onClick={prevStep}>Wstecz</Button>
        <Button variant="primary" type="submit" disabled={!formData.city}>Dalej</Button>
      </div>
    </Form>
  );
};

export default Step3_Location;