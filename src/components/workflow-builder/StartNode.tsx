import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

const StartNode = ({ data }: { data: { label: string } }) => {
  return (
    <div className="dndnode input" title="Kliknij, aby edytować">
      <Handle type="source" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Left} id="left" />
      <span>{data.label}</span>
    </div>
  );
};

export default memo(StartNode);