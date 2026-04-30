require('dotenv').config();

console.log("Checking Env:", process.env.FIREBASECONFIGS ? "Found it!" : "Still missing...");
const admin = require('firebase-admin');

const serviceAccountString = process.env.FIREBASECONFIGS;

if (!serviceAccountString) {
    throw new Error('FIREBASECONFIGS environment variable is not set');
}

let serviceAccount;
try {
    serviceAccount = JSON.parse(serviceAccountString);
    
    // CRITICAL: Replace escaped newlines with actual newline characters
    if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
} catch (error) {
    throw new Error('Error parsing FIREBASECONFIGS: ' + error.message);
}

if (!serviceAccount.project_id) {
    throw new Error('Service account object must contain a "project_id".');
}

// Check if already initialized to prevent errors during hot-reloads (nodemon)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const db = admin.firestore();
module.exports = { db, admin };