import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

const AgentNode = ({ data }: { data: { label: string } }) => {
  // Wyciągamy typ agenta z etykiety, aby zastosować odpowiedni kolor
  const agentType = data.label.split(' ')[0].toLowerCase();

  return (
    <div className={`dndnode ${agentType}`} title="Kliknij prawym, aby usunąć/konfigurować">
      <Handle type="target" position={Position.Top} id="top-target" />
      <span>{data.label}</span>
      <Handle type="source" position={Position.Bottom} id="bottom-source" />
    </div>
  );
};

export default memo(AgentNode);