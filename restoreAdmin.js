const admin = require('firebase-admin');
const serviceAccount = require('./functions/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

const adminEmail = 'flowmistrz@gmail.com';
const tempPassword = `TempPass${Math.floor(1000 + Math.random() * 9000)}!`;

async function restoreAdmin() {
  let uid;
  try {
    console.log(`Attempting to create user: ${adminEmail}`);
    const userRecord = await auth.createUser({
      email: adminEmail,
      password: tempPassword,
      displayName: 'Flowmistrz (Admin)'
    });
    uid = userRecord.uid;
    console.log(`Successfully created new user in Firebase Auth with UID: ${uid}`);
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      console.log('User already exists in Auth. Fetching existing user.');
      const userRecord = await auth.getUserByEmail(adminEmail);
      uid = userRecord.uid;
      console.log(`Found existing user with UID: ${uid}`);
    } else {
      console.error('Error creating user in Auth:', error);
      return;
    }
  }

  try {
    console.log(`Attempting to set admin role in Firestore for UID: ${uid}`);
    const userDocRef = db.collection('users').doc(uid);
    await userDocRef.set({
      email: adminEmail,
      name: 'Flowmistrz (Admin)',
      role: 'super-admin',
      uid: uid
    }, { merge: true });
    console.log(`Successfully set admin role for user in Firestore.`);
    console.log(`\n!!! WAŻNE !!!`);
    console.log(`Konto administratora dla ${adminEmail} zostało odtworzone.`);
    console.log(`Twoje tymczasowe hasło to: ${tempPassword}`);
    console.log(`Zaloguj się natychmiast i zmień hasło.`);

  } catch (error) {
    console.error('Error setting role in Firestore:', error);
  }
}

restoreAdmin();
