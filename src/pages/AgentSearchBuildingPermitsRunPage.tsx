import React, { useState } from 'react';
import { Card, Form, Button } from 'react-bootstrap';

const AgentSearchBuildingPermitsRunPage = () => {
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setFile(event.target.files[0]);
    }
  };

  const handleFileUpload = () => {
    if (file) {
      const formData = new FormData();
      formData.append('file', file);

      fetch('http://localhost:8002/uploadfile/', {
        method: 'POST',
        body: formData,
      })
        .then((response) => response.json())
        .then((data) => {
          console.log('File uploaded successfully:', data.filename);
        })
        .catch((error) => {
          console.error('Error uploading file:', error);
        });
    }
  };

  return (
    <div>
      <Card className="shadow-sm">
        <Card.Header>
          <Card.Title as="h3">Wyszukiwanie pozwoleń na budowę</Card.Title>
        </Card.Header>
        <Card.Body className="p-4">
          <Form>
            <Form.Group controlId="formFile" className="mb-3">
              <Form.Label>Wybierz plik CSV</Form.Label>
              <Form.Control type="file" onChange={handleFileChange} accept=".csv" />
            </Form.Group>
            <Button variant="primary" onClick={handleFileUpload} disabled={!file}>
              Prześlij plik
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </div>
  );
};

export default AgentSearchBuildingPermitsRunPage;
