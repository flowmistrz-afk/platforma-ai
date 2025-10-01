// ścieżka: src/constants.tsx

// W przyszłości tutaj możemy dodać ikony dla każdego agenta
// import { Briefcase } from 'react-bootstrap-icons';

export const AI_AGENTS = [
  {
    id: 'agent1-find-subcontractors',
    name: 'Agent 1: Wyszukiwanie Podwykonawców',
    description: 'Znajdź, zweryfikuj i skontaktuj się z firmami budowlanymi w całej Polsce.',
    // icon: <Briefcase size={32} />,
    path: '/agents/find-subcontractors', // Adres URL, pod którym będzie działał agent
    color: 'primary', // Kolor z palety Bootstrap
  },
  // Tutaj w przyszłości dodamy kolejnych agentów...
  // { 
  //   id: 'agent2-monitor-investments', 
  //   name: 'Agent 2: Monitorowanie Inwestycji',
  //   description: 'Monitoruj nowe pozwolenia na budowę i przetargi w czasie rzeczywistym.',
  //   path: '/agents/monitor-investments',
  //   color: 'success',
  // }
];