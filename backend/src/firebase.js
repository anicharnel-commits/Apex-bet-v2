// Module optionnel.
// Le backend peut fonctionner sans Firebase.
// Quand FIREBASE_SERVICE_ACCOUNT_JSON est défini, ce module peut être importé
// pour initialiser Firebase Admin dans les futures fonctionnalités Apex Bet.

const admin = require("firebase-admin");

let app = null;

function getFirebaseAdmin() {
  if (app) return app;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  const serviceAccount = JSON.parse(raw);

  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  return app;
}

module.exports = { getFirebaseAdmin };
