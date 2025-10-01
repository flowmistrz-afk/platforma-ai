import React, { useState, FormEvent } from 'react';
import { Form, Button, Card, Alert, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'react-toastify';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      toast.success('Zalogowano pomyślnie!');
    } catch (err: any) {
      setError('Nie udało się zalogować. Sprawdź e-mail i hasło.');
      toast.error('Błąd logowania!');
      setLoading(false);
    }
  };

  return (
    <div className="auth-form-container">
      <Card>
        <Card.Body>
          <h2 className="text-center mb-4">Logowanie</h2>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form onSubmit={handleSubmit}>
            <Form.Group id="email">
              <Form.Label>Adres e-mail</Form.Label>
              <Form.Control
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Form.Group>
            <Form.Group id="password"  className="mt-3">
              <Form.Label>Hasło</Form.Label>
              <Form.Control
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Form.Group>
            <Button disabled={loading} className="w-100 mt-4" type="submit">
              {loading ? <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" /> : 'Zaloguj się'}
            </Button>
          </Form>
        </Card.Body>
      </Card>
      <div className="w-100 text-center mt-2">
        Nie masz konta? <Link to="/register">Zarejestruj firmę</Link>
      </div>
    </div>
  );
};

export default LoginPage;