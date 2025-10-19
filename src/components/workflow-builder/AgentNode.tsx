import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import './AgentNode.css';

const AgentNode = ({ data, type }: { data: { label: string, actions?: string[] }, type: string }) => {
  // Map node type to the correct CSS class for styling
  const getClassName = (nodeType: string) => {
    if (nodeType === 'source-ceidg') {
      return 'ceidg-searcher';
    }
    if (nodeType === 'source-google') {
      return 'searcher';
    }
    return 'default'; // Fallback style
  };

  const nodeClass = getClassName(type);
  const actionCount = data.actions?.length || 0;

  return (
    <div className={`dndnode ${nodeClass}`} title="Kliknij prawym, aby usunąć/konfigurować">
      <Handle type="target" position={Position.Top} id="top-target" />
      <div className="agent-node-label">{data.label}</div>
      {actionCount > 0 && (
        <div className="action-badge">
          ({actionCount}) {actionCount === 1 ? 'akcja' : 'akcje'}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} id="bottom-source" />
    </div>
  );
};

export default memo(AgentNode);