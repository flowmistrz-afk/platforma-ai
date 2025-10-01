import React, { useState } from 'react';
import { Form, Button, Card, Badge, InputGroup } from 'react-bootstrap';
import { useAgentStore } from '../../stores/agentStore';

const Step2_Refinement = () => {
  const { nextStep, prevStep, formData, setFormData, suggestions } = useAgentStore();
  const [newKeyword, setNewKeyword] = useState('');
  const [newPkd, setNewPkd] = useState('');

  // Obsługa zmiany zaznaczenia słowa kluczowego
  const handleKeywordChange = (keyword: string, isChecked: boolean) => {
    const currentKeywords = formData.keywords || [];
    const newKeywords = isChecked
      ? [...currentKeywords, keyword]
      : currentKeywords.filter(k => k !== keyword);
    setFormData({ keywords: newKeywords });
  };

  // Dodawanie nowego słowa kluczowego
  const handleAddKeyword = () => {
    if (newKeyword && !formData.keywords.includes(newKeyword)) {
      setFormData({ keywords: [...formData.keywords, newKeyword] });
      setNewKeyword('');
    }
  };
  
  // Analogiczne funkcje dla kodów PKD
  const handlePkdChange = (pkd: string, isChecked: boolean) => {
    const currentPkds = formData.pkdCodes || [];
    const newPkds = isChecked
      ? [...currentPkds, pkd]
      : currentPkds.filter(p => p !== pkd);
    setFormData({ pkdCodes: newPkds });
  };

  const handleAddPkd = () => {
    if (newPkd && !formData.pkdCodes.includes(newPkd)) {
      setFormData({ pkdCodes: [...formData.pkdCodes, newPkd] });
      setNewPkd('');
    }
  };

  return (
    <Form onSubmit={(e) => { e.preventDefault(); nextStep(); }}>
      <fieldset>
        <legend>Krok 2 z 4: Doprecyzuj zapytanie</legend>
        <p className="text-muted">AI zasugerowało poniższe frazy i kody. Wybierz te, które najlepiej pasują, lub dodaj własne.</p>

        <Card className="p-3 mb-4">
          <h5>Sugerowane słowa kluczowe</h5>
          <div className="d-flex flex-wrap gap-2">
            {suggestions?.keywords.map(keyword => (
              <Form.Check 
                type="checkbox"
                key={keyword}
                id={`keyword-${keyword}`}
                label={keyword}
                checked={formData.keywords.includes(keyword)}
                onChange={e => handleKeywordChange(keyword, e.target.checked)}
              />
            ))}
          </div>
          <InputGroup className="mt-3">
            <Form.Control 
              placeholder="Dodaj własne słowo kluczowe..."
              value={newKeyword}
              onChange={e => setNewKeyword(e.target.value)}
            />
            <Button variant="outline-secondary" onClick={handleAddKeyword}>Dodaj</Button>
          </InputGroup>
        </Card>

        <Card className="p-3">
          <h5>Sugerowane kody PKD</h5>
           <div className="d-flex flex-wrap gap-2">
            {suggestions?.pkdCodes.map(pkd => (
              <Form.Check 
                type="checkbox"
                key={pkd}
                id={`pkd-${pkd}`}
                label={pkd}
                checked={formData.pkdCodes.includes(pkd)}
                onChange={e => handlePkdChange(pkd, e.target.checked)}
              />
            ))}
          </div>
          <InputGroup className="mt-3">
            <Form.Control 
              placeholder="Dodaj własny kod PKD..."
              value={newPkd}
              onChange={e => setNewPkd(e.target.value)}
            />
            <Button variant="outline-secondary" onClick={handleAddPkd}>Dodaj</Button>
          </InputGroup>
        </Card>

        <div className="mt-4">
          <h6>Finalne parametry wyszukiwania:</h6>
          <div className="d-flex flex-wrap gap-1">
            {formData.keywords.map(k => <Badge key={k} bg="primary">{k}</Badge>)}
            {formData.pkdCodes.map(p => <Badge key={p} bg="info">{p}</Badge>)}
          </div>
        </div>

        <div className="d-flex justify-content-between mt-4">
          <Button variant="secondary" onClick={prevStep}>Wstecz</Button>
          <Button variant="primary" type="submit" disabled={formData.keywords.length === 0}>
            Dalej
          </Button>
        </div>
      </fieldset>
    </Form>
  );
};

export default Step2_Refinement;