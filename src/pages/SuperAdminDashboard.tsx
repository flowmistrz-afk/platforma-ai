import React, { useState, useEffect } from 'react';
import { Card, Table, Alert, Container, Row, Col, Button } from 'react-bootstrap';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Company } from '../type';
import LoadingSpinner from '../components/LoadingSpinner';

type AdminView = 'companies' | 'agents' | 'analytics' | 'logs';

const SuperAdminDashboard = () => {
  const [activeView, setActiveView] = useState<AdminView>('companies');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  useEffect(() => {
    if (activeView !== 'companies') {
      setLoading(false);
      return;
    }
    
    if (activeView === 'companies' && companies.length === 0) {
      const fetchCompanies = async () => {
        setLoading(true);
        try {
          const companiesCollectionRef = collection(db, 'companies');
          const querySnapshot = await getDocs(companiesCollectionRef);
          const companiesList = querySnapshot.docs.map(doc => ({
            id: doc.id, ...doc.data()
          } as Company));
          setCompanies(companiesList);
        } catch (err) {
          console.error("Error fetching companies:", err);
          setError('Wystąpił błąd podczas pobierania danych o firmach.');
        } finally {
          setLoading(false);
        }
      };
      fetchCompanies();
    } else {
        setLoading(false);
    }
  }, [activeView, companies.length]);

  const handleViewChange = (view: AdminView) => {
    setActiveView(view);
    setIsFullScreen(false);
  };

  const renderCompanyList = () => {
    if (error) return <Alert variant="danger">{error}</Alert>;
    return (
      <div style={{ maxHeight: isFullScreen ? 'calc(100vh - 120px)' : '65vh', overflowY: 'auto' }}>
        <Table striped bordered hover responsive>
          <thead className="sticky-top" style={{ backgroundColor: '#f8f9fa', zIndex: 1 }}>
            <tr>
              <th style={{ width: '40%' }}>ID Firmy</th>
              <th>Nazwa Firmy</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (<tr key={company.id}><td><code>{company.id}</code></td><td>{company.name}</td></tr>))}
          </tbody>
        </Table>
      </div>
    );
  };

  const renderActiveView = () => {
    const views = {
      companies: { title: 'Zarejestrowane Firmy', content: renderCompanyList() },
      agents: { title: 'Zarządzanie Agentami', content: null },
      analytics: { title: 'Analityka i Raporty', content: null },
      logs: { title: 'Dziennik Zdarzeń', content: null },
    };
    const currentView = views[activeView];

    if (loading) {
        return (
            <Card className="shadow-sm">
                <Card.Header as="h5">{currentView.title}</Card.Header>
                <Card.Body><div className="d-flex justify-content-center py-5"><LoadingSpinner /></div></Card.Body>
            </Card>
        );
    }

    return (
      <Card className="shadow-sm">
        <Card.Header as="h5" className="d-flex justify-content-between align-items-center">
          {currentView.title}
          <Button variant="outline-secondary" size="sm" onClick={() => setIsFullScreen(!isFullScreen)} title={isFullScreen ? "Wyjdź z trybu pełnoekranowego" : "Tryb pełnoekranowy"}>
            <i className={isFullScreen ? "bi bi-fullscreen-exit" : "bi bi-fullscreen"}></i>
          </Button>
        </Card.Header>
        {currentView.content ? currentView.content : (
          <Card.Body>
            <div className="text-center p-5">
              <h4 className="text-muted">Funkcjonalność w budowie</h4>
              <p>Ta sekcja zostanie wkrótce udostępniona.</p>
            </div>
          </Card.Body>
        )}
      </Card>
    );
  };

  if (isFullScreen) {
    return (
      <Container fluid className="p-3 h-100">
        <Row className="h-100">
          <Col className="d-flex flex-column h-100">{renderActiveView()}</Col>
        </Row>
      </Container>
    );
  }

  return (
    <div style={{ height: 'calc(100vh - 72px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0 }}>
        <div className="p-3 mb-4 bg-primary text-white text-center">
          <Container>
            <h1 className="display-5 fw-bold">Panel Super Administratora</h1>
          </Container>
        </div>
        <Container>
            <div className="row mb-4 text-center">
              {Object.keys({ companies: 'a', agents: 'b', analytics: 'c', logs: 'd' }).map((view) => {
                const titles = { companies: 'Zarządzanie Firmami', agents: 'Zarządzanie Agentami', analytics: 'Analityka i Raporty', logs: 'Dziennik Zdarzeń' };
                const texts = { companies: 'Przeglądaj i edytuj zarejestrowane firmy.', agents: 'Konfiguruj dostępne modele i agenty AI.', analytics: 'Monitoruj zużycie usług i generuj raporty.', logs: 'Przeglądaj logi systemowe i aktywność.' };
                return (
                  <div className="col-md-6 col-lg-3 mb-3" key={view}>
                    <Card onClick={() => handleViewChange(view as AdminView)} className={`shadow-sm h-100 ${activeView === view ? 'border-primary border-2' : ''}`} style={{ cursor: 'pointer' }}>
                      <Card.Body><Card.Title>{titles[view as AdminView]}</Card.Title><Card.Text>{texts[view as AdminView]}</Card.Text></Card.Body>
                    </Card>
                  </div>
                );
              })}
            </div>
        </Container>
      </div>
      
      <div style={{ flexGrow: 1, overflowY: 'auto', minHeight: 0 }}>
        <Container>
            <div className="row justify-content-center">
                <div className="col-lg-10 col-xl-9">
                    {renderActiveView()}
                </div>
            </div>
        </Container>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;