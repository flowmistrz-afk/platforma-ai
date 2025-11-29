import React, { useState, useLayoutEffect, useRef, useEffect } from 'react';
import { Card, ListGroup, Form } from 'react-bootstrap';
import './ConversationalSearchPage.css';

const ConversationalSearchPage = () => {
  const [visiblePanel, setVisiblePanel] = useState<string | null>(null);
  const [rawData, setRawData] = useState<any[]>([]);
  const pageWrapperRef = useRef<HTMLDivElement>(null);

  // This hook dynamically calculates and sets the container's height.
  useLayoutEffect(() => {
    const calculateHeight = () => {
      const header = document.querySelector('header');
      if (pageWrapperRef.current && header) {
        const headerHeight = header.offsetHeight;
        const windowHeight = window.innerHeight;
        const mainElement = document.querySelector('main');
        const mainPadding = mainElement ? (parseFloat(getComputedStyle(mainElement).paddingTop) + parseFloat(getComputedStyle(mainElement).paddingBottom)) : 0;
        const availableHeight = windowHeight - headerHeight - mainPadding;
        pageWrapperRef.current.style.height = `${availableHeight}px`;
      }
    };
    calculateHeight();
    window.addEventListener('resize', calculateHeight);
    return () => window.removeEventListener('resize', calculateHeight);
  }, []);

  // This hook listens for messages from the iframe.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // For security, you should check the origin of the message.
      if (event.origin !== 'https://google-service-v2-agent-567539916654.europe-west1.run.app') {
        return;
      }

      // Check if the data has the expected format.
      if (event.data && event.data.source && event.data.data && event.data.data.raw_data) {
        // Add the new data to the rawData array.
        setRawData(prevData => [...prevData, event.data.data.raw_data]);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const tools = [
    { name: 'Wyszukiwanie w internecie', description: 'Agent przeszukuje internet w poszukiwaniu trafnych stron.' },
    { name: 'Analiza linków', description: 'Agent analizuje i klasyfikuje znalezione linki pod kątem ich przydatności.' },
    { name: 'Pozyskiwanie kontaktów', description: 'Agent wchodzi na strony i pobiera z nich dane kontaktowe.' },
    { name: 'Wyszukiwanie w CEIDG', description: 'Agent przeszukuje rządową bazę danych firm CEIDG.' },
    { name: 'Wzbogacanie zapytania', description: 'Agent analizuje zapytanie i rozszerza je o kody PKD i synonimy.' }
  ];

  return (
    <div className="page-wrapper" ref={pageWrapperRef}>
      {/* --- Permanent Sidebar Dock --- */}
      <div 
        className="sidebar"
        onMouseLeave={() => setVisiblePanel(null)}
      >
        <div 
          className="sidebar-handle tools-handle"
          onMouseEnter={() => setVisiblePanel('tools')}
        >
          Lista narzędzi
        </div>
        <div 
          className="sidebar-handle notepad-handle"
          onMouseEnter={() => setVisiblePanel('notepad')}
        >
          Notatnik
        </div>
        <div 
          className="sidebar-handle raw-data-handle"
          onMouseEnter={() => setVisiblePanel('rawData')}
        >
          Surowe dane
        </div>

        {/* --- Panels (now controlled by JS state) --- */}
        <div className={`slide-out-panel tools ${visiblePanel === 'tools' ? 'visible' : ''}`}>
            <Card>
              <Card.Header as="h5">Lista narzędzi</Card.Header>
              <Card.Body>
                <ListGroup variant="flush">
                  {tools.map(tool => (
                    <ListGroup.Item key={tool.name}>
                      <strong>{tool.name}</strong>: {tool.description}
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              </Card.Body>
            </Card>
        </div>
        <div className={`slide-out-panel notepad ${visiblePanel === 'notepad' ? 'visible' : ''}`}>
            <Card>
              <Card.Header as="h5">Notatnik</Card.Header>
              <Card.Body>
                <Form.Control
                  as="textarea"
                  rows={15}
                  placeholder="Twoje notatki..."
                />
              </Card.Body>
            </Card>
        </div>
        <div className={`slide-out-panel raw-data ${visiblePanel === 'rawData' ? 'visible' : ''}`}>
            <Card>
              <Card.Header as="h5">Surowe dane</Card.Header>
              <Card.Body>
                <pre>{JSON.stringify(rawData, null, 2)}</pre>
              </Card.Body>
            </Card>
        </div>
      </div>

      {/* --- Main Content Column --- */}
      <div className="content-column">
        <iframe
          src="https://google-service-v2-agent-567539916654.europe-west1.run.app"
          title="Agent konwersacyjny"
          className="agent-iframe"
        />
      </div>
    </div>
  );
};

export default ConversationalSearchPage;
