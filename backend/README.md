# Apex Bet Backend — Render

Backend séparé de l'application web Netlify.

## Ce backend fait quoi ?

- Interroge The Odds API côté serveur.
- Gère les DEUX clés API avec rotation/fallback.
- Expose une liste de sports.
- Récupère les événements et les cotes.
- Permet de filtrer football, tennis, hockey sur glace, basket, baseball, etc. selon les sports disponibles dans le compte The Odds API.
- Cache les réponses pendant quelques secondes pour limiter les appels.
- Prépare un endpoint d'analyse IA.
- CORS configuré pour Netlify.
- Endpoint `/api/health` pour le contrôle Render.
- Firebase Admin est prévu mais optionnel.

## Installation Render

1. Créer un Web Service Render depuis ce dossier/repo.
2. Build command : `npm install`
3. Start command : `npm start`
4. Ajouter les variables d'environnement :
   - `ODDS_API_KEY_1` = première clé The Odds API
   - `ODDS_API_KEY_2` = deuxième clé The Odds API
   - `FRONTEND_URL` = URL exacte du site Netlify
   - `AI_API_KEY` = clé IA si tu veux activer l'analyse IA
   - `FIREBASE_SERVICE_ACCOUNT_JSON` = seulement si Firebase Admin est nécessaire
5. Déployer.
6. Tester : `https://TON-SERVICE.onrender.com/api/health`
7. Tester : `https://TON-SERVICE.onrender.com/api/sports`

## Important

Les deux clés envoyées précédemment ne sont volontairement PAS inscrites dans le code.
Elles doivent être saisies dans Render > Environment.
C'est plus sûr et cela évite de publier les clés dans GitHub ou dans le fichier frontend.

## Endpoints principaux

GET `/api/health`

GET `/api/sports`

GET `/api/odds?regions=eu&markets=h2h,totals&sport=...`

GET `/api/events?sport=...`

POST `/api/ai/analyze`

GET `/api/config`

Le frontend Netlify devra ensuite utiliser l'URL Render comme `BACKEND_URL`.
