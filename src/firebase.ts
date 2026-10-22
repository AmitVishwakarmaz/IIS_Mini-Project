import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// ──────────────────────────────────────────────
// SETUP INSTRUCTIONS:
// 1. Go to https://console.firebase.google.com
// 2. Create a new project (or use existing)
// 3. Add a Web app to your project
// 4. Copy the firebaseConfig object below
// 5. Enable Cloud Firestore in the Firebase Console
//    (Build → Firestore Database → Create database)
// 6. Start in TEST MODE for development
// ──────────────────────────────────────────────

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAfOfWPN17gkMRPSdXCoy6w8uItMgtR_jo",
  authDomain: "college-timetable-f3c7f.firebaseapp.com",
  projectId: "college-timetable-f3c7f",
  storageBucket: "college-timetable-f3c7f.firebasestorage.app",
  messagingSenderId: "222666344641",
  appId: "1:222666344641:web:f6bc160d1c524455106c40",
  measurementId: "G-T0WF2SYVH6"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
