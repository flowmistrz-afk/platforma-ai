import { create } from 'zustand';

export interface StartNodeData {
  query: string;
  city: string;
  province: string;
  pkdSection: string; // Wybrany dział PKD
  pkdCodes: string[];   // Wybrane szczegółowe kody PKD
  radius: number;
}

interface WorkflowState {
  startNodeData: StartNodeData | null;
  setStartNodeData: (data: StartNodeData) => void;
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  startNodeData: null,
  setStartNodeData: (data) => set({ startNodeData: data }),
}));
