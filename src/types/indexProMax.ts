import { Node, Edge, Connection } from 'reactflow';

// Definicje typów specyficzne dla AgentProMax i WorkflowBuilder

export enum TaskStatusProMax {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  WAITING_FOR_USER_SELECTION = 'waiting-for-user-selection',
}

// Możemy tutaj w przyszłości rozszerzać typy dla AgentProMax
// np. o specyficzne dla niego interfejsy zadań czy wyników.

// Eksportujemy typy z React Flow, aby inne komponenty mogły z nich korzystać
export type { Node, Edge, Connection };
