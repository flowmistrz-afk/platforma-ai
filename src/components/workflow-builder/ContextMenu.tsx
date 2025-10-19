import React from 'react';
import { Dropdown } from 'react-bootstrap';

interface ContextMenuProps {
  id: string;
  top: number;
  left: number;
  nodeType: string;
  onClose: () => void;
  onDelete: (id: string) => void;
  onSelectAction: (nodeId: string, actionName: string) => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ id, top, left, nodeType, onClose, onDelete, onSelectAction }) => {
  const handleSelectAction = (actionName: string) => {
    onSelectAction(id, actionName);
  };

  const renderCeidgActions = () => (
    <>
      <Dropdown.Item onClick={() => handleSelectAction('zawęź wyszukiwanie')}>zawęź wyszukiwanie</Dropdown.Item>
      <Dropdown.Item onClick={() => handleSelectAction('pobierz szczegóły firm')}>pobierz szczegóły firm</Dropdown.Item>
      <Dropdown.Item onClick={() => handleSelectAction('spróbuj pozyskać kontakty')}>spróbuj pozyskać kontakty</Dropdown.Item>
    </>
  );

  return (
    <div style={{ position: 'absolute', top, left, zIndex: 1000 }} onMouseLeave={onClose}>
      <Dropdown.Menu show>
        {nodeType === 'source-ceidg' && renderCeidgActions()}
        <Dropdown.Divider />
        <Dropdown.Item onClick={() => onDelete(id)}>Usuń</Dropdown.Item>
      </Dropdown.Menu>
    </div>
  );
};

export default ContextMenu;
