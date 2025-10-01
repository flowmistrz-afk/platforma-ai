import React from 'react';
import { Spinner } from 'react-bootstrap';

const LoadingSpinner = () => {
  return (
    <Spinner animation="border" role="status">
      <span className="visually-hidden">Ładowanie...</span>
    </Spinner>
  );
};

export default LoadingSpinner;