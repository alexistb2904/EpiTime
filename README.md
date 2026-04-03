# EpiTime - l’EDT joli pour remplacer Zeus

Zeus (https://zeus.ionis-it.com/) est pratique mais… pas franchement beau. EpiTime apporte une version propre. Il existait bien EpiLife mais bon l'application n'est plus maintenue

## Stack et structure

- Front : React + Vite.
- Back : Node/Express.

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

- En dev, Vite tourne sur 5000, Express sur 3001 (proxy /api).
- En prod Docker, un reverse proxy doit pointer vers le port interne 3001.

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

Build watch :

```bash
cd client
npm run build:watch
```

Lancer en Docker (un seul conteneur) :

```bash
docker-compose up --build
```

Le conteneur expose en interne 3001.

## Déploiement

L'application est déployée via CI/CD sur Coolify.

## Pourquoi ce projet ?

Parce que l’interface originale de Zeus pique un peu les yeux. Ici, même données, mais UI propre, responsive, PWA, notifications et Tada, c’est tout beau maintenant.

## Fonctionnement pour les curieux

Pour avoir accès aux données de Zeus, il faut d’abord se connecter à l’API de Zeus via une OAuth Microsoft pour récupérer un token d’authentification. Ensuite, ce token est utilisé pour faire des requêtes à l’API de Zeus afin d’obtenir les données de l’emploi du temps. Ces données sont ensuite traitées et affichées dans le front. Pour les encore plus curieux voici le swagger de l’API de Zeus : https://zeus.ionis-it.com/swagger/index.html

Pour les notifications, le front s’inscrit auprès du service de push, qui génère une paire de clés VAPID. Le back stocke la clé publique et privée pour pouvoir envoyer des notifications push aux clients inscrits. Lorsqu’une notification doit être envoyée (par exemple, un changement d’emploi du temps), le back utilise la clé privée pour signer la notification et l’envoie via le service de push. Le client reçoit alors la notification et peut afficher une alerte à l’utilisateur. Inconvénient à chaque redéploiement, il faut régénérer les clés VAPID et réinscrire les clients.

## Précision

Le projet est en aucun cas affilié avec IONIS GROUP, Zeus ou Epita il s'agit simplement d'un projet passe temps.

## License

MIT License
Copyright (c) 2026 alexistb2904
