// Simple Firebase connection test
// Run this with: node testFirebase.js

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc } = require('firebase/firestore');

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCJqV-VWesOnjqB2JoSnA4PKhe2c80Mj6Q",
  authDomain: "pawquest-2644a.firebaseapp.com",
  databaseURL: "https://pawquest-2644a-default-rtdb.firebaseio.com",
  projectId: "pawquest-2644a",
  storageBucket: "pawquest-2644a.firebasestorage.app",
  messagingSenderId: "633762489411",
  appId: "1:633762489411:web:8b0d85fa4ed06cc172e0f6",
  measurementId: "G-SRGJDG1EV2"
};

async function testFirebaseConnection() {
  try {
    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    
    console.log('✅ Firebase initialized successfully!');
    
    // Test adding a document
    const testChallenge = {
      name: "Test Challenge",
      location: "Test Location",
      category: "City",
      script: "This is a test challenge to verify Firebase connection",
      duration: "5 mins",
      pointsReward: 100,
      suggestedReward: "Test Reward",
      isActive: true,
      difficulty: "Easy",
      createdAt: new Date()
    };
    
    const docRef = await addDoc(collection(db, 'challenges'), testChallenge);
    console.log('✅ Test challenge added with ID:', docRef.id);
    console.log('🎉 Firebase connection is working perfectly!');
    
  } catch (error) {
    console.error('❌ Firebase connection failed:', error);
  }
}

testFirebaseConnection();