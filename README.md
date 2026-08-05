<div align="center">

# EpiTime

### L'emploi du temps EPITA, mais en mieux.

Une interface moderne, responsive et pensée pour le mobile afin de consulter son emploi du temps, ses notes et ses informations académiques sans subir l'interface de Zeus ou d'Auriga.

<br />

<a href="https://epitime.epita.it">
  <img src="https://img.shields.io/badge/Ouvrir%20EpiTime-ef4444?style=for-the-badge&logo=googlecalendar&logoColor=white" alt="Ouvrir EpiTime" />
</a>
<a href="https://github.com/alexistb2904/EpiTime">
  <img src="https://img.shields.io/github/stars/alexistb2904/EpiTime?style=for-the-badge&logo=github&label=Stars&labelColor=161b22&color=ef4444" alt="GitHub stars" />
</a>
<a href="https://github.com/alexistb2904/EpiTime/blob/main/LICENSE">
  <img src="https://img.shields.io/github/license/alexistb2904/EpiTime?style=for-the-badge&labelColor=161b22&color=ef4444" alt="Licence MIT" />
</a>

<br /><br />

<img src="https://img.shields.io/badge/React-161b22?style=flat-square&logo=react&logoColor=61DAFB" alt="React" />
<img src="https://img.shields.io/badge/TypeScript-161b22?style=flat-square&logo=typescript&logoColor=3178C6" alt="TypeScript" />
<img src="https://img.shields.io/badge/React%20Native-161b22?style=flat-square&logo=react&logoColor=61DAFB" alt="React Native" />
<img src="https://img.shields.io/badge/Expo-161b22?style=flat-square&logo=expo&logoColor=white" alt="Expo" />
<img src="https://img.shields.io/badge/Express-161b22?style=flat-square&logo=express&logoColor=white" alt="Express" />
<img src="https://img.shields.io/badge/Docker-161b22?style=flat-square&logo=docker&logoColor=2496ED" alt="Docker" />
<img src="https://img.shields.io/badge/Coolify-161b22?style=flat-square&logo=coolify&logoColor=6B16ED" alt="Coolify" />

</div>

---

## Présentation

Zeus est pratique pour accéder aux données de scolarité, mais son interface n'est pas réellement pensée pour une utilisation quotidienne sur mobile.

**EpiTime** propose une expérience plus moderne pour les étudiants de l'EPITA :

* interface claire et responsive 
* consultation de l'emploi du temps 
* consultation des notes 
* authentification Microsoft 
* notifications web et mobiles 
* fonctionnement sous forme de PWA 
* application native Android
* gestion du mode hors ligne 
* statistiques d'utilisation respectueuses de la vie privée.

L'objectif est simple : conserver les données utiles de Zeus et d'Auriga, tout en proposant une interface plus rapide, agréable et adaptée aux usages actuels.

---

## Aperçus

<div align="center">

<img width="32%" alt="Vue calendrier EpiTime" src="https://github.com/user-attachments/assets/8d121cd5-324a-433e-b901-9d212a4f1b6a" />
<img width="32%" alt="Vue détaillée EpiTime" src="https://github.com/user-attachments/assets/e143b555-98d4-4688-9a6a-8f49661b6e76" />
<img width="32%" alt="Vue mobile EpiTime" src="https://github.com/user-attachments/assets/ff841497-1700-4dd9-8d7c-c5f7dc7a3063" />

</div>

---

## Fonctionnalités

### Emploi du temps

* affichage clair des cours 
* navigation par jour et par semaine 
* détails sur les horaires, salles et matières 
* interface responsive pour ordinateur, tablette et mobile 
* mise en cache pour une consultation hors ligne.

### Notes et données académiques

* consultation des notes disponibles 
* récupération des données via les services de l'EPITA 
* affichage simplifié et lisible 
* synchronisation après authentification.

### Expérience mobile

* PWA installable 
* application React Native 
* deep links d'authentification 
* prise en charge d'Android

### Confidentialité

* mesure d'audience uniquement après consentement 
* instance Rybbit auto-hébergée 
* aucune transmission du nom, de l'adresse e-mail ou du token Microsoft 

---

## Architecture

```text
EpiTime/
├── client/            # Application web React / Vite
├── clientNative/      # Application mobile React Native
├── server/            # API Express et services backend
├── docker-compose.yml
├── .env.example
└── README.md
```

### Stack technique

| Partie                | Technologies            |
| --------------------- | ----------------------- |
| Application web       | React, TypeScript, Vite |
| Application mobile    | React Native, Expo      |
| Backend               | Node.js, Express        |
| Authentification      | Microsoft OAuth         |
| Notifications web     | Web Push, VAPID         |
| Notifications mobiles | Expo Push Notifications |
| Analytics             | Rybbit auto-hébergé     |
| Conteneurisation      | Docker, Docker Compose  |
| Déploiement           | Coolify                 |

---

## Installation locale

### Prérequis

Avant de commencer, assure-toi d'avoir installé :

* Node.js 
* npm 
* Git 
* Docker et Docker Compose pour le lancement conteneurisé 
* Android Studio ou Xcode pour le développement mobile natif.

### Cloner le projet

```bash
git clone https://github.com/alexistb2904/EpiTime.git
cd EpiTime
```

### Installer les dépendances

```bash
cd client
npm install

cd ../server
npm install

cd ../clientNative
npm install
```

---

## Configuration

Crée un fichier `.env` à la racine du projet.

Tu peux également utiliser le fichier `.env.example` comme point de départ.

```bash
cp .env.example .env
```

<details>
<summary><strong>Afficher les variables d'environnement</strong></summary>

<br />

| Variable                                 | Valeur par défaut                              | Description                                                        |
| ---------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| `NODE_ENV`                               | `production`                                   | Environnement d'exécution. Utiliser `development` en local.        |
| `PORT`                                   | `3001`                                         | Port interne du serveur Express.                                   |
| `ZEUS_BASE`                              | `https://zeus.ionis-it.com`                    | URL de base de l'API Zeus.                                         |
| `ALLOWED_ORIGINS`                        | vide                                           | Origines CORS autorisées, séparées par des virgules.               |
| `VAPID_PUBLIC_KEY`                       | vide                                           | Clé publique VAPID pour les notifications Web Push.                |
| `VAPID_PRIVATE_KEY`                      | vide                                           | Clé privée VAPID pour les notifications Web Push.                  |
| `EXPO_PUSH_API_URL`                      | `https://exp.host/--/api/v2/push/send`         | URL de l'API Expo Push.                                            |
| `DATA_DIR`                               | `./server/data`                                | Répertoire de persistance du backend.                              |
| `WEB_PUSH_STORE`                         | `./server/data/web-push-subscriptions.json`    | Fichier contenant les abonnements Web Push.                        |
| `MOBILE_PUSH_STORE`                      | `./server/data/mobile-push-subscriptions.json` | Fichier contenant les tokens Expo Push.                            |
| `RYBBIT_API_BASE`                        | `https://app.rybbit.io/api`                    | URL de l'API Rybbit.                                               |
| `RYBBIT_SITE_ID`                         | vide                                           | Identifiant du site Rybbit web.                                    |
| `RYBBIT_PHONE_SITE_ID`                   | vide                                           | Identifiant du site Rybbit de l'application native.                |
| `RYBBIT_API_KEY`                         | vide                                           | Clé API Rybbit.                                                    |
| `RYBBIT_TIME_ZONE`                       | `Europe/Paris`                                 | Fuseau horaire utilisé par Rybbit.                                 |
| `EXPO_PUBLIC_API_BASE`                   | `https://epitime.epita.it`                     | URL publique du backend utilisée par le web et l'application Expo. |
| `EXPO_PUBLIC_MICROSOFT_CLIENT_ID`        | `votre_client_id`                              | Client ID Microsoft OAuth.                                         |
| `EXPO_PUBLIC_MICROSOFT_TENANT`           | `epita.fr`                                     | Tenant Microsoft utilisé par défaut.                               |
| `EXPO_PUBLIC_MICROSOFT_REDIRECT_URI`     | `epitime://auth`                               | URI de redirection pour l'application mobile.                      |
| `EXPO_PUBLIC_MICROSOFT_WEB_REDIRECT_URI` | vide                                           | URI de redirection pour la version web.                            |
| `EXPO_PUBLIC_EXPO_PROJECT_ID`            | `REPLACE_WITH_EAS_PROJECT_ID`                  | Identifiant du projet Expo EAS.                                    |

</details>

### Ports utilisés en développement

| Service         |   Port |
| --------------- | -----: |
| Frontend Vite   | `5000` |
| Backend Express | `3001` |

En production Docker, le reverse proxy doit rediriger les requêtes vers le port interne `3001`.

---

## Lancer le projet en développement

### Application web

Dans un premier terminal :

```bash
cd client
npm run dev
```

### Backend

Dans un second terminal :

```bash
cd server
npm start
```

L'application web utilise un proxy pour transmettre les requêtes `/api` au backend Express.

---

## Application mobile

Depuis le dossier `clientNative` :

### Android

```bash
cd clientNative
npm run android
```

### iOS (Pas testé)

```bash
cd clientNative
npm run ios
```

### Vérifications utiles

```bash
npm run typecheck
npm run doctor
```

### Configuration Firebase Android

Pour activer les services Google et Firebase sur Android, ajoute le fichier suivant :

```text
clientNative/android/app/google-services.json
```

Ce fichier étant privé, il ne doit pas être versionné.

S'il est absent, le plugin Google Services est ignoré afin de permettre les builds locaux sans identifiants Firebase.

---

## Build

### Build de l'application web

```bash
cd client
npm run build
```

### Build en mode surveillance

```bash
cd client
npm run build:watch
```

---

## Docker

Pour lancer l'ensemble de l'application dans un seul conteneur :

```bash
docker-compose up --build
```

Le conteneur expose le port interne `3001`.

Le dossier `/app/data` est monté sur un volume Docker nommé `epitime_data`.

Cela permet de conserver les données suivantes après un redémarrage ou un rebuild :

* abonnements Web Push 
* tokens Expo Push 
* données persistantes du serveur.

---

## Déploiement

EpiTime est déployé automatiquement via une chaîne CI/CD utilisant [Coolify](https://coolify.io/).

```text
GitHub
   ↓
CI/CD
   ↓
Coolify
   ↓
Docker
   ↓
VPS
```

---

## Authentification et récupération des données

Pour accéder aux données Zeus, l'utilisateur doit d'abord s'authentifier avec son compte Microsoft EPITA.

Le fonctionnement général est le suivant :

1. l'utilisateur lance l'authentification Microsoft 
2. Microsoft retourne un token OAuth 
3. ce token est utilisé pour interroger l'API Zeus 
4. le backend récupère les informations nécessaires 
5. les données sont normalisées puis envoyées au frontend 
6. l'interface affiche l'emploi du temps et les notes.

La documentation Swagger de Zeus est disponible ici :

https://zeus.ionis-it.com/swagger/index.html

---

## Fonctionnement des notifications

### Notifications web

Le frontend utilise Web Push et VAPID.

Lorsqu'un utilisateur autorise les notifications :

1. le navigateur génère une souscription Push 
2. le frontend transmet cette souscription au backend 
3. le backend l'enregistre dans `WEB_PUSH_STORE` 
4. le serveur peut ensuite envoyer une notification au navigateur.

### Notifications mobiles

L'application Expo récupère un token Expo Push puis l'envoie à :

```http
POST /api/mobile/subscribe
```

Le token est ensuite enregistré dans `MOBILE_PUSH_STORE`.

---

## Statistiques d'utilisation et confidentialité

EpiTime utilise [Rybbit](https://rybbit.com/) pour mesurer l'utilisation de l'application.

La collecte est activée uniquement après le consentement explicite de l'utilisateur.

L'instance Rybbit est auto-hébergée sur le même VPS qu'EpiTime.

Les données collectées peuvent inclure :

* le type de navigateur 
* le système d'exploitation 
* les pages consultées 
* une localisation géographique approximative 
* des informations techniques nécessaires au fonctionnement des statistiques.

EpiTime ne transmet pas à Rybbit :

* le nom de l'utilisateur 
* son adresse e-mail 
* son identifiant de compte 
* son token Microsoft 
* ses notes 
* son emploi du temps personnel.

Les données ne sont utilisées ni pour la publicité ciblée ni pour le suivi intersites.

Le consentement peut être retiré depuis les paramètres de l'application web.

Pour toute question liée à la confidentialité :

```text
contact@alexistb.com
```

---

## Pourquoi EpiTime ?

Parce que consulter son emploi du temps ne devrait pas ressembler à une visite dans une interface restée bloquée dix ans en arrière.

EpiTime reprend les données utiles de Zeus et d'Auriga, puis les présente dans une interface :

* moderne 
* rapide 
* responsive 
* installable 
* adaptée aux mobiles 
* compatible avec les notifications 
* pensée pour un usage quotidien.

Même données, meilleure expérience.

---

## Contribution

Les contributions sont les bienvenues.

Tu peux participer de plusieurs façons :

* signaler un bug 
* proposer une fonctionnalité 
* améliorer l'interface 
* corriger la documentation 
* proposer une optimisation 
* ouvrir une pull request.

### Signaler un problème

Utilise l'onglet Issues du dépôt :

https://github.com/alexistb2904/EpiTime/issues

### Proposer une modification

```bash
git checkout -b feature/ma-fonctionnalite
git commit -m "feat: ajout de ma fonctionnalité"
git push origin feature/ma-fonctionnalite
```

Puis ouvre une pull request depuis GitHub.

---

## Avertissement

EpiTime est un projet personnel et indépendant.

Il n'est ni développé, ni maintenu, ni approuvé par :

* EPITA 
* IONIS Education Group 
* Zeus 
* Auriga 
* Microsoft.

Les noms et marques mentionnés appartiennent à leurs propriétaires respectifs.

---

## Licence

Ce projet est distribué sous licence MIT.

```text
MIT License

Copyright (c) 2026 alexistb2904
```

Consulte le fichier [LICENSE](LICENSE) pour plus d'informations.

---

<div align="center">

Développé avec soin pour rendre l'emploi du temps EPITA un peu plus agréable.

<br /><br />

<a href="https://epitime.epita.it">
  <img src="https://img.shields.io/badge/Essayer%20EpiTime-ef4444?style=for-the-badge&logo=googlecalendar&logoColor=white" alt="Essayer EpiTime" />
</a>

</div>
