import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Container } from 'react-bootstrap';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Header from './components/Header';
import ProtectedRoute from './components/ProtectedRoute';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import TeamManagementPage from './pages/TeamManagementPage';
import { useAuth } from './hooks/useAuth';
import LoadingSpinner from './components/LoadingSpinner';
import AgentsListPage from './pages/AgentsListPage';
import Agent1RunPage from './pages/Agent1RunPage';
import Agent1ResultsPage from './pages/Agent1ResultsPage';
import ProAgentResultsPage from './pages/ProAgentResultsPage';
import ProAgentPage from './pages/ProAgentPage';
import AgentProMaxPage from './pages/AgentProMaxPage';
import AgentProMaxResultsPage from './pages/AgentProMaxResultsPage'; // <-- NOWY IMPORT
import AgentV2Runner from './components/agent/AgentV2Runner';

function App() {
  const { userProfile, loading } = useAuth();

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <>
      <Header />
      <main className="py-4">
        <Container>
          <Routes>
            <Route path="/login" element={!userProfile ? <LoginPage /> : <Navigate to="/" replace />} />
            <Route path="/register" element={!userProfile ? <RegisterPage /> : <Navigate to="/" replace />} />

            <Route
              path="/"
              element={
                !userProfile ? (
                  <Navigate to="/login" replace />
                ) : userProfile.role === 'super-admin' ? (
                  <Navigate to="/super-admin" replace />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute roles={['company-admin', 'company-user']}>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/team"
              element={
                <ProtectedRoute roles={['company-admin']}>
                  <TeamManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/super-admin"
              element={
                <ProtectedRoute roles={['super-admin']}>
                  <SuperAdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/agents"
              element={
                <ProtectedRoute roles={['company-admin', 'company-user']}>
                  <AgentsListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/agents/run/find-subcontractors"
              element={
                <ProtectedRoute roles={['company-admin', 'company-user']}>
                  <Agent1RunPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/agents/run/pro-agent"
              element={
                <ProtectedRoute roles={['company-admin', 'company-user']}>
                  <ProAgentPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/agents/results/:taskId"
              element={
                <ProtectedRoute roles={['company-admin', 'company-user']}>
                  <Agent1ResultsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pro-agent/results/:taskId"
              element={
                <ProtectedRoute roles={['company-admin', 'company-user']}>
                  <ProAgentResultsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/uruchom-agenta-v2/:taskId"
              element={
                <ProtectedRoute roles={['company-admin', 'company-user']}>
                  <AgentV2Runner />
                </ProtectedRoute>
              }
            />
            <Route
              path="/agent-pro-max"
              element={
                <ProtectedRoute roles={['company-admin', 'company-user']}>
                  <AgentProMaxPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/agent-pro-max/results" // <-- NOWA ŚCIEŻKA
              element={
                <ProtectedRoute roles={['company-admin', 'company-user']}>
                  <AgentProMaxResultsPage />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Container>
      </main>
      <ToastContainer position="top-right" autoClose={5000} hideProgressBar={false} />
    </>
  );
}

export default App;