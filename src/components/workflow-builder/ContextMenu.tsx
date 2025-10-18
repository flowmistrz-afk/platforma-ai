import React from 'react';
import { Dropdown } from 'react-bootstrap';

interface ContextMenuProps {
  id: string;
  top: number;
  left: number;
  onClose: () => void;
  onDelete: (id: string) => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ id, top, left, onClose, onDelete }) => {
  return (
    <div style={{ position: 'absolute', top, left, zIndex: 1000 }} onMouseLeave={onClose}>
      <Dropdown.Menu show>
        <Dropdown.Item onClick={() => onDelete(id)}>Usuń</Dropdown.Item>
        <Dropdown.Item disabled>Konfiguruj (wkrótce)</Dropdown.Item>
      </Dropdown.Menu>
    </div>
  );
};

export default ContextMenu;
