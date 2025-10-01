import React, { useState, useEffect, FormEvent } from 'react';
import { Card, Button, Form, Alert, Spinner, Table } from 'react-bootstrap';
import { useAuth } from '../hooks/useAuth';
import { db } from '../services/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import { UserProfile } from '../type';
import { toast } from 'react-toastify';

const TeamManagementPage = () => {
    const { company } = useAuth();
    const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
    const [loadingTeam, setLoadingTeam] = useState(true);
    
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserName, setNewUserName] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [isInviting, setIsInviting] = useState(false);
    
    const [inviteError, setInviteError] = useState('');
    const [listError, setListError] = useState('');

    useEffect(() => {
        if (!company?.id) {
            setLoadingTeam(false);
            return;
        }
        
        setLoadingTeam(true);
        setListError('');
        const q = query(collection(db, "users"), where("companyId", "==", company.id));
        
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const members = querySnapshot.docs.map(doc => doc.data() as UserProfile);
            setTeamMembers(members);
            setLoadingTeam(false);
        }, (err) => {
            console.error("Error fetching team members: ", err);
            setListError("Nie udało się załadować listy pracowników. Sprawdź konsolę (F12) po więcej szczegółów.");
            setLoadingTeam(false);
        });

        return () => unsubscribe();

    }, [company?.id]);

    const handleInviteSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!newUserEmail || !newUserName || !newUserPassword) {
            return setInviteError("Wszystkie pola są wymagane.");
        }
        if (newUserPassword.length < 6) {
            return setInviteError("Hasło musi mieć co najmniej 6 znaków.");
        }
        setIsInviting(true);
        setInviteError('');

        try {
            const functions = getFunctions(undefined, 'europe-west1');
            const inviteUser = httpsCallable(functions, 'inviteUser');
            await inviteUser({
                newUserEmail, 
                newUserName, 
                newUserPassword,
                companyId: company?.id 
            });
            
            toast.success(`Pracownik ${newUserName} został pomyślnie dodany!`);
            setNewUserEmail('');
            setNewUserName('');
            setNewUserPassword('');
        } catch (err: any) {
            setInviteError(err.message || "Wystąpił błąd podczas zapraszania.");
            toast.error(err.message || "Nie udało się dodać pracownika.");
        } finally {
            setIsInviting(false);
        }
    };

    return (
        <div>
          <h1>Zarządzanie Zespołem</h1>
          {company && <p>Zarządzasz pracownikami firmy: <strong>{company.name}</strong></p>}
          
          <Card className="mt-4">
            <Card.Header as="h5">Dodaj nowego pracownika</Card.Header>
            <Card.Body>
                <Form onSubmit={handleInviteSubmit}>
                    {inviteError && <Alert variant="danger">{inviteError}</Alert>}
                    <Form.Group className="mb-3" controlId="newUserName">
                        <Form.Label>Imię i nazwisko</Form.Label>
                        <Form.Control type="text" placeholder="Jan Kowalski" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} required disabled={isInviting} />
                    </Form.Group>
                    <Form.Group className="mb-3" controlId="newUserEmail">
                        <Form.Label>Adres e-mail</Form.Label>
                        <Form.Control type="email" placeholder="email@przyklad.com" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} required disabled={isInviting} />
                    </Form.Group>
                    <Form.Group className="mb-3" controlId="newUserPassword">
                        <Form.Label>Hasło początkowe</Form.Label>
                        <Form.Control type="password" placeholder="Min. 6 znaków" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} required disabled={isInviting} />
                    </Form.Group>
                    <Button variant="primary" type="submit" disabled={isInviting}>
                        {isInviting ? <><Spinner as="span" animation="border" size="sm" /> Zapraszanie...</> : 'Dodaj pracownika'}
                    </Button>
                </Form>
            </Card.Body>
          </Card>

          <Card className="mt-4">
            <Card.Header as="h5">Lista pracowników</Card.Header>
            <Card.Body>
                {loadingTeam ? <div className="text-center p-5"><Spinner animation="border" /></div> : 
                 listError ? <Alert variant="danger">{listError}</Alert> : (
                    <Table striped bordered hover responsive>
                        <thead><tr><th>Imię i nazwisko</th><th>Email</th><th>Rola</th></tr></thead>
                        <tbody>
                            {teamMembers.map(member => (
                                <tr key={member.uid}>
                                    <td>{member.name || '-'}</td>
                                    <td>{member.email}</td>
                                    <td>{member.role}</td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                )}
            </Card.Body>
          </Card>
        </div>
    );
};

export default TeamManagementPage;