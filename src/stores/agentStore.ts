import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface AgentState {
  step: number;
  formData: {
    specialization: string;
    // Nowe pola na finalne, zatwierdzone przez użytkownika dane
    keywords: string[];
    pkdCodes: string[];
    city: string;
    radius: number;
    sources: {
      google: boolean;
      ceidg: boolean;
      krs: boolean;
    };
  };
  // Nowe pole na przechowywanie sugestii z AI
  suggestions: {
    keywords: string[];
    pkdCodes: string[];
    identifiedService?: string; // Dodane pole
  } | null;
  nextStep: () => void;
  prevStep: () => void;
  setFormData: (data: Partial<AgentState['formData']>) => void;
  // Nowa akcja do zapisywania sugestii
  setSuggestions: (suggestions: AgentState['suggestions']) => void;
  reset: () => void;
}

const initialState = {
  step: 1,
  formData: {
    specialization: '',
    keywords: [],
    pkdCodes: [],
    city: '',
    radius: 50,
    sources: { google: true, ceidg: true, krs: true },
  },
  suggestions: null,
};

export const useAgentStore = create<AgentState>()(
  devtools(
    (set) => ({
      ...initialState,
      nextStep: () => set((state) => ({ step: state.step + 1 }), false, 'nextStep'),
      prevStep: () => set((state) => ({ step: state.step - 1 }), false, 'prevStep'),
      setFormData: (data) => set((state) => ({
        formData: { ...state.formData, ...data }
      }), false, 'setFormData'),
      setSuggestions: (suggestions) => set({ suggestions }, false, 'setSuggestions'),
      reset: () => set(initialState, false, 'reset'),
    }),
    {
      name: 'Agent-Wizard-Store',
    }
  )
);