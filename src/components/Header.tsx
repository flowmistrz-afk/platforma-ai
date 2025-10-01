import React from 'react';
import { Navbar, Nav, Container, Button, NavDropdown } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'react-toastify';

const Header = () => {
  const { userProfile, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Wylogowano pomyślnie!');
      navigate('/login');
    } catch (error) {
      toast.error('Wystąpił błąd podczas wylogowywania.');
    }
  };

  return (
    <header>
      <Navbar bg="dark" variant="dark" expand="lg" collapseOnSelect>
        <Container>
          <Navbar.Brand as={Link} to="/">
            Platforma Analityki AI
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="ms-auto">
              {userProfile ? (
                <>
                  {userProfile.role === 'super-admin' && (
                    <Nav.Link as={Link} to="/super-admin">
                      Panel Super Admina
                    </Nav.Link>
                  )}
                  {userProfile.role === 'company-admin' && (
                     <Nav.Link as={Link} to="/team">
                        Zarządzanie Zespołem
                      </Nav.Link>
                  )}
                  <NavDropdown title={userProfile.email} id="username">
                    <NavDropdown.Item onClick={handleLogout}>
                      Wyloguj
                    </NavDropdown.Item>
                  </NavDropdown>
                </>
              ) : (
                <>
                  <Nav.Link as={Link} to="/login">
                    <Button variant="outline-light" size="sm">Logowanie</Button>
                  </Nav.Link>
                  <Nav.Link as={Link} to="/register">
                    <Button variant="primary" size="sm">Zarejestruj firmę</Button>
                  </Nav.Link>
                </>
              )}
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
    </header>
  );
};

export default Header;