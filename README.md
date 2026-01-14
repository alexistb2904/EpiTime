# EpiTime – l’EDT joli pour remplacer zeus.ionis-it.com

Zeus (https://zeus.ionis-it.com/) est pratique mais… pas franchement beau ni pensé pour le mobile. EpiTime apporte une version propre. Il existait bien EpiLife mais bon l'application n'est plus maintenue

## Stack et structure

-   Front : React + Vite + vite-plugin-pwa.
-   Back : Node/Express (proxy Zeus).

## Installer en local

1. Cloner le repo.
2. Installer les dépendances :
    ```bash
    cd client && npm install
    cd ../server && npm install
    ```

## Variables d’environnement

Créer un fichier `.env` à la racine (ou utiliser `.env.example`). Principales clés :

| Nom               | Valeur par défaut         | Description                      |
| ----------------- | ------------------------- | -------------------------------- |
| NODE_ENV          | production                | `development` en local si besoin |
| PORT              | 3001                      | Port interne du serveur Express  |
| ZEUS_BASE         | https://zeus.ionis-it.com | Base de l’API Zeus               |
| ALLOWED_ORIGIN    | http://localhost:3001     | Origine autorisée CORS           |
| VAPID_PUBLIC_KEY  | (vide)                    | Clé publique VAPID pour push     |
| VAPID_PRIVATE_KEY | (vide)                    | Clé privée VAPID pour push       |

Notes :

-   En dev, Vite tourne sur 5000, Express sur 3001 (proxy /api).
-   En prod Docker, un reverse proxy doit pointer vers le port interne 3001.

## Lancer en dev

Deux terminaux :

1. Front (Vite + HMR) :

    ```bash
    cd client
    npm run dev
    ```

2. Back (Express) :
    ```bash
    cd server
    npm start
    ```

## Build & Docker

Build front :

```bash
cd client
npm run build
```

Lancer en Docker (un seul conteneur) :

```bash
docker-compose up --build
```

Le conteneur expose en interne 3001. Avec un reverse proxy, aucun port à préciser dans l’URL publique.

## Déploiement

L'application est déployée via CI/CD sur Coolify.

## Pourquoi ce projet ?

Parce que l’interface originale de Zeus pique un peu les yeux. Ici, même données, mais UI propre, responsive, PWA, notifications et un déploiement simplifié. « Tada », c’est tout beau maintenant.

## Précision

Le projet est en aucun cas affilié avec IONIS GROUP, Zeus ou Epita il s'agit simplement d'un projet passe temps.

## License

Libre usage dans le cadre du projet.
