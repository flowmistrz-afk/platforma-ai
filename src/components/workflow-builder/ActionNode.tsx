import React from 'react';
import { Handle, Position } from 'reactflow';
import './ActionNode.css';

const ActionNode = ({ data }: { data: { label: string } }) => {
  return (
    <div className="action-node">
      <div>{data.label}</div>
    </div>
  );
};

export default ActionNode;
