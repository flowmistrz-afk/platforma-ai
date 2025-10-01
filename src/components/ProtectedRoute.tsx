import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { UserRole } from '../type';
import { Spinner } from 'react-bootstrap';

interface ProtectedRouteProps {
  children: React.JSX.Element;
  roles: UserRole[];
}

const ProtectedRoute = ({ children, roles }: ProtectedRouteProps): React.JSX.Element => {
  const { userProfile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '80vh' }}>
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Ładowanie...</span>
        </Spinner>
      </div>
    );
  }

  if (!userProfile) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  if (!roles.includes(userProfile.role)) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;