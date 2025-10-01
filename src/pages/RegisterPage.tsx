import React, { useState, FormEvent } from 'react';
import { Form, Button, Card, Alert, Spinner } from 'react-bootstrap';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'react-toastify';

const RegisterPage = () => {
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { registerCompany } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      return setError('Hasła nie są identyczne.');
    }

    setError('');
    setLoading(true);

    try {
      await registerCompany(companyName, email, password);
      toast.success('Firma zarejestrowana pomyślnie!');
      navigate('/dashboard');
    } catch (err: any) {
      let errorMessage = 'Nie udało się utworzyć konta. Spróbuj ponownie.';
      switch (err.code) {
        case 'auth/email-already-in-use':
          errorMessage = 'Ten adres e-mail jest już zajęty.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Wprowadzony adres e-mail jest nieprawidłowy.';
          break;
        case 'auth/weak-password':
          errorMessage = 'Hasło jest zbyt słabe. Powinno mieć co najmniej 6 znaków.';
          break;
      }
      setError(errorMessage);
      toast.error('Błąd rejestracji!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form-container">
      <Card>
        <Card.Body>
          <h2 className="text-center mb-4">Zarejestruj firmę</h2>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form onSubmit={handleSubmit}>
             <Form.Group id="companyName">
              <Form.Label>Nazwa firmy</Form.Label>
              <Form.Control
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </Form.Group>
            <Form.Group id="email" className="mt-3">
              <Form.Label>Twój adres e-mail (login)</Form.Label>
              <Form.Control
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Form.Group>
            <Form.Group id="password" className="mt-3">
              <Form.Label>Hasło</Form.Label>
              <Form.Control
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Form.Group>
            <Form.Group id="confirmPassword"  className="mt-3">
              <Form.Label>Potwierdź hasło</Form.Label>
              <Form.Control
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </Form.Group>
            <Button disabled={loading} className="w-100 mt-4" type="submit">
               {loading ? <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" /> : 'Zarejestruj się'}
            </Button>
          </Form>
        </Card.Body>
      </Card>
      <div className="w-100 text-center mt-2">
        Masz już konto? <Link to="/login">Zaloguj się</Link>
      </div>
    </div>
  );
};

export default RegisterPage;