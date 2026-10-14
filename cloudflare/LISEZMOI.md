# Collection commune de cartes (Cloudflare Worker)

Petit serveur gratuit qui garde les cartes partagées depuis l'appli Vingt Indices. Les téléphones débloqués (clé d'accès) peuvent y envoyer leurs cartes ; tous les téléphones peuvent récupérer les cartes validées. Une page `/admin` permet de valider, refuser ou supprimer les cartes.

Offre gratuite Cloudflare largement suffisante (100 000 lectures et 1 000 envois par jour).

## Installation (une seule fois, depuis le site Cloudflare)

1. Créer un compte gratuit sur https://dash.cloudflare.com (adresse mail + mot de passe).
2. **Stockage** : menu **Storage & Databases → Workers KV** (ou « KV ») → **Create** → nom : `vingt-indices-cartes` → **Add**.
3. **Worker** : menu **Workers & Pages** → **Create** → **Create Worker** (modèle « Hello World ») → nom : `vingt-indices-cartes` → **Deploy**.
4. **Code** : sur la page du Worker, **Edit code** → tout effacer dans `worker.js` → coller le fichier `worker.js` de ce dossier → **Deploy**.
5. **Relier le stockage** : page du Worker → **Settings** (ou **Bindings**) → **Add binding** → **KV namespace** → Variable name : `CARDS` → choisir `vingt-indices-cartes` → **Add / Deploy**.
6. **Mot de passe d'administration** : **Settings → Variables and Secrets** → **Add** → type **Secret** → nom : `ADMIN_PASSWORD` → valeur : un mot de passe à vous → **Deploy**.
7. Facultatif : pour valider les cartes à la main avant qu'elles soient visibles, ajouter une variable **Text** `AUTO_VALIDATE` = `false`.
8. Copier l'adresse du Worker (en haut de sa page) : `https://vingt-indices-cartes.<votre-nom>.workers.dev` (ici : `https://vingt-indices-cartes.thomas-morey.workers.dev`). Ouvrir cette adresse dans un navigateur : elle doit afficher `{"ok":true,...}`.
9. Donner cette adresse à Claude pour la brancher dans l'appli.

## Administration

Ouvrir `https://vingt-indices-cartes.<votre-nom>.workers.dev/admin`, entrer le mot de passe `ADMIN_PASSWORD` : liste des cartes avec leurs 20 indices, boutons **Valider**, **Refuser**, **Supprimer**.

- `validée` : visible par tous les téléphones ; `en attente` / `refusée` : cachée.
- Supprimer retire la carte du partage (les téléphones qui l'ont déjà récupérée la gardent).

## Mettre à jour le code

Page du Worker → **Edit code** → coller la nouvelle version → **Deploy**. L'adresse et les cartes ne changent pas.

## Adresses du service

- `GET /cards` : cartes validées
- `POST /cards` : envoyer des cartes `{ key, cards: [{ id, cat, answer, author, clues[20] }] }` (clé d'accès obligatoire)
- `GET /admin` : page d'administration
