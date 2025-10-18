import React from 'react';

const Sidebar = () => {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside>
      <div className="description">Możesz przeciągnąć agenty na planszę po prawej stronie.</div>
      <div className="dndnode ceidg-searcher" onDragStart={(event) => onDragStart(event, 'CEIDG-Searcher')} draggable>
        CEIDG-Searcher Agent
      </div>
      <div className="dndnode enricher" onDragStart={(event) => onDragStart(event, 'Enricher')} draggable>
        Enricher Agent
      </div>
      <div className="dndnode searcher" onDragStart={(event) => onDragStart(event, 'Searcher')} draggable>
        Searcher Agent
      </div>
      <div className="dndnode classifier" onDragStart={(event) => onDragStart(event, 'Classifier')} draggable>
        Classifier Agent
      </div>
      <div className="dndnode scraper" onDragStart={(event) => onDragStart(event, 'Scraper')} draggable>
        Scraper Agent
      </div>
    </aside>
  );
};

export default Sidebar;
