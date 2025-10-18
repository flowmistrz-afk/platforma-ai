import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyDODHbCiufhcewFlpfqOYMKyz61GBVs_DY",
  authDomain: "automatyzacja-pesamu.firebaseapp.com",
  projectId: "automatyzacja-pesamu",
  storageBucket: "automatyzacja-pesamu.appspot.com",
  messagingSenderId: "567539916654",
  appId: "1:567539916654:web:012575afa470e68954ab7f",
  measurementId: "G-W0M8YXD114"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "europe-west1");