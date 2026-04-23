/**
 * set-cors.mjs  —  run once to configure CORS on the Firebase Storage bucket
 * Usage: node set-cors.mjs
 *
 * Requires: npm install @google-cloud/storage  (run in this directory first)
 * Auth:     GOOGLE_APPLICATION_CREDENTIALS env var pointing at a service-account key JSON
 *           OR  run `gcloud auth application-default login` first
 */

import { Storage } from '@google-cloud/storage';

const BUCKET = 'powaiyear1.firebasestorage.app';

const corsConfig = [
    {
        origin: ['*'],
        method: ['GET'],
        responseHeader: ['Content-Type'],
        maxAgeSeconds: 3600
    }
];

const storage = new Storage();
await storage.bucket(BUCKET).setCorsConfiguration(corsConfig);
console.log(`CORS set on gs://${BUCKET}`);
