import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { Card, Spinner, Alert, ListGroup, Table, Row, Col, Button, Accordion, Modal, Form } from 'react-bootstrap';
import { Task, ScrapedData, ClassifiedLinks, SearchResult } from '../types';

const ProAgentResultsPage = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const [selectedLinks, setSelectedLinks] = useState<ClassifiedLinks>({ companyUrls: [], portalUrls: [] });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!taskId) {
      setError("Nie podano ID zadania.");
      return;
    }

    const authUnsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const taskRef = doc(db, "tasks", taskId);
        const firestoreUnsubscribe = onSnapshot(taskRef, (docSnap) => {
          if (docSnap.exists()) {
            const taskData = docSnap.data() as Task;
            setTask(taskData);
            setError(null);

            if (taskData.status === 'waiting-for-user-selection' && taskData.intermediateData?.selectableLinks) {
              setSelectedLinks(taskData.intermediateData.selectableLinks);
              setShowSelectionModal(true);
            }

          } else {
            setError("Nie znaleziono zadania o podanym ID.");
          }
        }, (err) => {
          console.error("Błąd nasłuchu zadania:", err);
          setError("Błąd połączenia z bazą danych.");
        });
        return () => firestoreUnsubscribe();
      } else {
        setError("Użytkownik nie jest zalogowany.");
      }
    });

    return () => authUnsubscribe();
  }, [taskId]);

  const handlePause = async () => {
    if (taskId && task) {
      const taskRef = doc(db, "tasks", taskId);
      await updateDoc(taskRef, {
        status: 'paused',
        previousStatus: task.status
      });
    }
  };

  const handleResume = async () => {
    if (taskId && task && task.previousStatus) {
      const taskRef = doc(db, "tasks", taskId);
      await updateDoc(taskRef, {
        status: task.previousStatus
      });
    }
  };

  const handleTerminate = async () => {
    if (taskId) {
      if (window.confirm('Czy na pewno chcesz trwale zakończyć to zadanie? Nie będzie można go wznowić.')) {
        const taskRef = doc(db, "tasks", taskId);
        await updateDoc(taskRef, { status: 'terminated' });
      }
    }
  };

  const handleLinkSelectionChange = (result: SearchResult, type: 'companyUrls' | 'portalUrls') => {
    setSelectedLinks(prev => {
      const currentLinks = prev[type];
      const isSelected = currentLinks.some(r => r.link === result.link);
      const newLinks = isSelected
        ? currentLinks.filter(r => r.link !== result.link)
        : [...currentLinks, result];
      return { ...prev, [type]: newLinks };
    });
  };

  const handleSelectAll = (type: 'companyUrls' | 'portalUrls') => {
    if (!task?.intermediateData?.selectableLinks) return;
    setSelectedLinks(prev => ({
      ...prev,
      [type]: task.intermediateData!.selectableLinks![type]
    }));
  };

  const handleDeselectAll = (type: 'companyUrls' | 'portalUrls') => {
    setSelectedLinks(prev => ({
      ...prev,
      [type]: []
    }));
  };

  const handleSubmitSelection = async () => {
    if (!taskId) return;
    setIsSubmitting(true);
    try {
      const resumeWithSelection = httpsCallable(functions, 'resumeWithSelection');
      await resumeWithSelection({ taskId, selectedLinks });
      setShowSelectionModal(false);
    } catch (err: any) {
      console.error("Błąd podczas wznawiania zadania z wybranymi linkami:", err);
      setError(`Nie udało się wznowić zadania: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (error) {
    return <Alert variant="danger">{error}</Alert>;
  }

  if (!task) {
    return <div className="text-center p-5"><Spinner animation="border" /> <p>Oczekuję na dane zadania...</p></div>;
  }

  const isTaskRunning = !['completed', 'failed', 'paused', 'terminated', 'waiting-for-user-selection'].includes(task.status);
  const canBeTerminated = !['completed', 'failed', 'terminated'].includes(task.status);

  const sourceTitles: { [key: string]: string } = {
    'ceidg-searching': 'Firmy znalezione w CEIDG',
    'scraping-firmowe': 'Firmy zebrane ze stron firmowych',
    'scraping-portale': 'Firmy zebrane z portali',
  };

  const renderCompanyResultTables = () => {
    const results = task?.results;
    const resultSources = results ? Object.entries(results).filter(([, data]) => data && data.length > 0) : [];

    if (resultSources.length === 0) return null;

    return (
      <Accordion defaultActiveKey="0" className="mb-4">
        {resultSources.map(([source, data], index) => (
          <Accordion.Item eventKey={String(index)} key={source}>
            <Accordion.Header>
              {sourceTitles[source] || source} <span className="badge bg-secondary ms-2">{data.length}</span>
            </Accordion.Header>
            <Accordion.Body>
              <Table striped bordered hover responsive size="sm">
                <thead>
                  <tr>
                    <th>Nazwa Firmy</th>
                    <th>Opis działalności</th>
                    <th>Dane Kontaktowe</th>
                    {source === 'ceidg-searching' && <th>Kody PKD</th>}
                    <th>Źródło</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item: ScrapedData, itemIndex: number) => (
                    <tr key={itemIndex}>
                      <td>{item.companyName || 'Brak nazwy'}</td>
                      <td>{item.description}</td>
                      <td>
                        {item.contactDetails.phones.map(p => <div key={p}>Telefon: {p}</div>)}
                        {item.contactDetails.emails.map(e => <div key={e}>Email: {e}</div>)}
                        {item.contactDetails.address && <div>Adres: {item.contactDetails.address}</div>}
                      </td>
                      {source === 'ceidg-searching' && (
                        <td>
                          {item.pkdGlowny && <div><strong>Główny:</strong> {item.pkdGlowny}</div>}
                          {item.pkdCodes && item.pkdCodes.length > 0 && <div><strong>Pozostałe:</strong> {item.pkdCodes.join(', ')}</div>}
                        </td>
                      )}
                      <td><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Link</a></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Accordion.Body>
          </Accordion.Item>
        ))}
      </Accordion>
    );
  }

  const renderIntermediateDataTables = () => {
    const googleResults = task?.intermediateData?.googleSearchResults;
    const classifiedLinks = task?.intermediateData?.selectableLinks || task?.intermediateData?.classifiedLinks;

    return (
      <>
        {googleResults && googleResults.length > 0 && (
           <Accordion defaultActiveKey="0" className="mb-4">
             <Accordion.Item eventKey="google-search">
                <Accordion.Header>
                  Linki znalezione w Google (Surowe) <span className="badge bg-secondary ms-2">{googleResults.length}</span>
                </Accordion.Header>
                <Accordion.Body>
                   <Table striped bordered hover responsive size="sm">
                      <thead>
                        <tr>
                          <th>Tytuł i Link</th>
                          <th>Fragment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {googleResults.map((result, index) => (
                          <tr key={index}>
                            <td><a href={result.link} target="_blank" rel="noopener noreferrer">{result.title}</a></td>
                            <td>{result.snippet}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                </Accordion.Body>
              </Accordion.Item>
           </Accordion>
        )}
        {classifiedLinks && (
          <>
            {classifiedLinks.companyUrls.length > 0 && (
              <Accordion defaultActiveKey="0" className="mb-4">
                <Accordion.Item eventKey="company-urls">
                  <Accordion.Header>
                    Sklasyfikowane Strony Firmowe <span className="badge bg-success ms-2">{classifiedLinks.companyUrls.length}</span>
                  </Accordion.Header>
                  <Accordion.Body>
                    <Table striped bordered hover responsive size="sm">
                      <thead>
                        <tr>
                          <th>Tytuł i Link</th>
                          <th>Fragment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classifiedLinks.companyUrls.map(result => (
                          <tr key={result.link}>
                            <td><a href={result.link} target="_blank" rel="noopener noreferrer">{result.title}</a></td>
                            <td>{result.snippet}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </Accordion.Body>
                </Accordion.Item>
              </Accordion>
            )}
            {classifiedLinks.portalUrls.length > 0 && (
              <Accordion defaultActiveKey="0" className="mb-4">
                <Accordion.Item eventKey="portal-urls">
                  <Accordion.Header>
                    Sklasyfikowane Portale <span className="badge bg-info ms-2">{classifiedLinks.portalUrls.length}</span>
                  </Accordion.Header>
                  <Accordion.Body>
                    <Table striped bordered hover responsive size="sm">
                       <thead>
                        <tr>
                          <th>Tytuł i Link</th>
                          <th>Fragment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classifiedLinks.portalUrls.map(result => (
                          <tr key={result.link}>
                            <td><a href={result.link} target="_blank" rel="noopener noreferrer">{result.title}</a></td>
                            <td>{result.snippet}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </Accordion.Body>
                </Accordion.Item>
              </Accordion>
            )}
          </>
        )}
      </>
    );
  }

  const renderContent = () => {
    const companyTables = renderCompanyResultTables();
    const intermediateTables = renderIntermediateDataTables();

    if (companyTables || intermediateTables) {
      return <>{companyTables}{intermediateTables}</>;
    }

    if (isTaskRunning) {
      return <div className="text-center p-4"><p className="mt-2">Agent pracuje, wyniki pojawią się tutaj...</p></div>;
    }

    if (task.status !== 'paused') {
      return <Alert variant="warning">Agent nie znalazł żadnych pasujących firm ani danych.</Alert>;
    }

    return null;
  }

  return (
    <div>
      <style type="text/css">
        {`
          .modal-90vh {
            max-width: none;
            width: 90%;
            height: 90vh;
          }
          .modal-90vh .modal-content {
            height: 100%;
            display: flex;
            flex-direction: column;
          }
          .modal-90vh .modal-body {
            flex-grow: 1;
            overflow-y: hidden;
          }
        `}
      </style>
      <Link to="/agents" className="mb-4 d-inline-block">
        &larr; Wróć do listy agentów
      </Link>
      <h1>Wyniki Pracy Agenta PRO</h1>
      <p>ID zadania: <code>{taskId}</code></p>
      
      <div className="d-flex align-items-center mb-3">
        <p className="mb-0 me-3">Status: <strong>{task.status}</strong> {isTaskRunning && <Spinner animation="border" size="sm" />}</p>
        {isTaskRunning && <Button variant="warning" size="sm" onClick={handlePause}>Pauza</Button>}
        {task.status === 'paused' && <Button variant="success" size="sm" onClick={handleResume}>Wznów</Button>}
        {canBeTerminated && <Button variant="danger" size="sm" onClick={handleTerminate} className="ms-2">Zakończ</Button>}
      </div>
      
      <Row>
        <Col md={8}>
          <Card className="mt-4">
            <Card.Header as="h5">Zebrane Dane</Card.Header>
            <Card.Body>
              {renderContent()}
              {task.status === 'failed' && <Alert variant="danger">Praca agenta zakończona błędem.</Alert>}
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="mt-4">
            <Card.Header as="h5">Konsola Agenta (Na Żywo)</Card.Header>
            <ListGroup variant="flush" style={{ maxHeight: '600px', overflowY: 'auto', fontSize: '0.85rem' }}>
              {task.logs && task.logs.slice().reverse().map((log, index) => (
                <ListGroup.Item key={index} className="py-2 px-3 border-bottom-0">
                  <small className="text-muted">{log.timestamp.toDate().toLocaleTimeString()}</small>
                  <p className="mb-0"><strong>[{log.agent}]</strong> {log.message}</p>
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Card>
        </Col>
      </Row>

      <Modal show={showSelectionModal} onHide={() => setShowSelectionModal(false)} size="lg" backdrop="static" dialogClassName="modal-90vh">
        <Modal.Header closeButton>
          <Modal.Title>Wybierz linki do dalszej analizy</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Agent znalazł poniższe strony. Zaznacz te, które mają zostać przeanalizowane w poszukiwaniu danych kontaktowych.</p>
          <Accordion defaultActiveKey="0">
            <Accordion.Item eventKey="0">
              <Accordion.Header>
                <div className="d-flex justify-content-between w-100 align-items-center pe-2">
                  <span>
                    Sklasyfikowane Strony Firmowe <span className="badge bg-success ms-2">{task?.intermediateData?.selectableLinks?.companyUrls?.length || 0}</span>
                  </span>
                  <div>
                    <Button variant="outline-primary" size="sm" className="me-2" onClick={(e) => {e.stopPropagation(); handleSelectAll('companyUrls');}}>Zaznacz wszystko</Button>
                    <Button variant="outline-secondary" size="sm" onClick={(e) => {e.stopPropagation(); handleDeselectAll('companyUrls');}}>Odznacz wszystko</Button>
                  </div>
                </div>
              </Accordion.Header>
              <Accordion.Body style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                {task?.intermediateData?.selectableLinks?.companyUrls && task.intermediateData.selectableLinks.companyUrls.length > 0 ? (
                  <Table striped bordered hover responsive size="sm">
                    <thead>
                      <tr>
                        <th>Zaznacz</th>
                        <th>Tytuł i Link</th>
                        <th>Fragment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {task.intermediateData.selectableLinks.companyUrls.map(result => (
                        <tr key={result.link}>
                          <td>
                            <Form.Check
                              type="checkbox"
                              id={`check-company-${result.link}`}
                              checked={selectedLinks.companyUrls.some(r => r.link === result.link)}
                              onChange={() => handleLinkSelectionChange(result, 'companyUrls')}
                            />
                          </td>
                          <td><a href={result.link} target="_blank" rel="noopener noreferrer">{result.title}</a></td>
                          <td>{result.snippet}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                ) : <p className="text-muted">Brak</p>}
              </Accordion.Body>
            </Accordion.Item>
            <Accordion.Item eventKey="1">
              <Accordion.Header>
                 <div className="d-flex justify-content-between w-100 align-items-center pe-2">
                  <span>
                    Sklasyfikowane Portale <span className="badge bg-info ms-2">{task?.intermediateData?.selectableLinks?.portalUrls?.length || 0}</span>
                  </span>
                  <div>
                    <Button variant="outline-primary" size="sm" className="me-2" onClick={(e) => {e.stopPropagation(); handleSelectAll('portalUrls');}}>Zaznacz wszystko</Button>
                    <Button variant="outline-secondary" size="sm" onClick={(e) => {e.stopPropagation(); handleDeselectAll('portalUrls');}}>Odznacz wszystko</Button>
                  </div>
                </div>
              </Accordion.Header>
              <Accordion.Body style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                {task?.intermediateData?.selectableLinks?.portalUrls && task.intermediateData.selectableLinks.portalUrls.length > 0 ? (
                  <Table striped bordered hover responsive size="sm">
                    <thead>
                      <tr>
                        <th>Zaznacz</th>
                        <th>Tytuł i Link</th>
                        <th>Fragment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {task.intermediateData.selectableLinks.portalUrls.map(result => (
                        <tr key={result.link}>
                          <td>
                            <Form.Check
                              type="checkbox"
                              id={`check-portal-${result.link}`}
                              checked={selectedLinks.portalUrls.some(r => r.link === result.link)}
                              onChange={() => handleLinkSelectionChange(result, 'portalUrls')}
                            />
                          </td>
                          <td><a href={result.link} target="_blank" rel="noopener noreferrer">{result.title}</a></td>
                          <td>{result.snippet}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                ) : <p className="text-muted">Brak</p>}
              </Accordion.Body>
            </Accordion.Item>
          </Accordion>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowSelectionModal(false)} disabled={isSubmitting}>
            Anuluj
          </Button>
          <Button variant="primary" onClick={handleSubmitSelection} disabled={isSubmitting}>
            {isSubmitting ? <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" /> : 'Zatwierdź i Scrapuj'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default ProAgentResultsPage;