import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  User
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { UserProfile, Company } from '../type';

export interface AuthContextType {
  authUser: User | null; // Zmienione na pełny typ User
  userProfile: UserProfile | null;
  company: Company | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  registerCompany: (companyName: string, email: string, pass: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [authUser, setAuthUser] = useState<User | null>(null); // Zmienione na pełny typ User
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = useCallback(async (user: User) => {
    setLoading(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const profile = userDocSnap.data() as UserProfile;
        setUserProfile(profile);

        if (profile.companyId) {
          const companyDocRef = doc(db, 'companies', profile.companyId);
          const companyDocSnap = await getDoc(companyDocRef);
          if (companyDocSnap.exists()) {
            setCompany({ id: companyDocSnap.id, ...companyDocSnap.data() } as Company);
          }
        }
      } else {
        console.error("No user profile found in Firestore for UID:", user.uid);
        setUserProfile(null);
        setCompany(null);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      setUserProfile(null);
      setCompany(null);
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthUser(user); // Ustawiamy pełny obiekt użytkownika
        fetchUserData(user);
      } else {
        setAuthUser(null);
        setUserProfile(null);
        setCompany(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [fetchUserData]);
  
  const login = async (email: string, pass: string) => {
      await signInWithEmailAndPassword(auth, email, pass);
  };

  const logout = () => {
    return signOut(auth);
  };
  
  const registerCompany = async (companyName: string, email: string, pass: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    const user = userCredential.user;
    
    if (!user) {
        throw new Error("User creation failed.");
    }

    const newCompanyRef = doc(db, 'companies', user.uid);
    const newCompany: Omit<Company, 'id'> = {
        name: companyName,
        adminUids: [user.uid],
    };
    await setDoc(newCompanyRef, newCompany);

    const newUserProfile: UserProfile = {
      uid: user.uid,
      email: user.email!,
      role: 'company-admin',
      companyId: newCompanyRef.id,
    };
    await setDoc(doc(db, 'users', user.uid), newUserProfile);
  };


  const value = {
    authUser,
    userProfile,
    company,
    loading,
    login,
    logout,
    registerCompany,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};