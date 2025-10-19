import React from 'react';

const Sidebar = () => {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside>
      <div className="description">Przeciągnij źródło danych na planszę, aby rozpocząć.</div>
      <div className="dndnode ceidg-searcher" onDragStart={(event) => onDragStart(event, 'source-ceidg')} draggable>
        Wyszukiwanie w CEIDG
      </div>
      <div className="dndnode searcher" onDragStart={(event) => onDragStart(event, 'source-google')} draggable>
        Wyszukiwanie w Google
      </div>
    </aside>
  );
};

export default Sidebar;
