# Vingt Indices

Jeu de devinettes pour smartphone, de 2 à 8 joueurs. Une carte, 20 indices numérotés : à vous de trouver le **personnage**, le **lieu** ou la **chose** avec le moins d'indices possible.

**Jouer :** https://thomasmry93.github.io/Vingt-Indices/

## Principe

À chaque carte, un joueur devient **lecteur** et tient le téléphone. Il peut consulter la réponse discrètement. Le joueur dont c'est le tour annonce un numéro de 1 à 20 ; le lecteur touche la gommette et lit l'indice à voix haute. Le joueur propose une réponse, le lecteur tape **Trouvé** ou **Raté**. En cas d'échec, on passe au joueur suivant. Le rôle de lecteur tourne à chaque carte.

**20 points sont répartis à chaque carte :**

| Situation | Devineur | Lecteur |
|---|---|---|
| Trouvé après *n* indices | 20 − *n* points | *n* points |
| Personne ne trouve après les 20 indices | — | 20 points |

La partie s'arrête à la fin de la carte où un joueur atteint le score fixé au départ (30, 50, 80, 100 ou au choix) ; le plus haut score gagne.

**Jeton de réponse** (option) : chaque joueur reçoit un jeton par partie pour répondre hors de son tour. Bonne ou mauvaise réponse, le jeton est perdu.

## Fonctionnalités

- 550 cartes originales en 3 catégories : Personnage, Lieu, Chose, avec des indices écrits à la première personne (« Je suis né en Corse », « Chez moi, on… »)
- Catégories au choix, score à atteindre réglable, jeton de réponse activable
- Annuler la dernière action, ajuster les scores à la main, passer une carte
- Pendant la carte : réponse cachée affichable par le lecteur, indices dévoilés triés par numéro ; à la fin, tous les indices peuvent être affichés
- Cartes déjà jouées signalées (trouvées ou ratées), tirées en dernier ; indicateur masquable, historique effaçable, filtre dans la liste des cartes
- Lecture libre des cartes, liste complète avec recherche et filtres
- Cartes perso : créer, modifier ou supprimer des cartes (gardées sur le téléphone), partager un code de cartes, exporter toutes les cartes
- 3 styles : BD (par défaut), Carton, Journal
- Mascotte « ? » : en grand sur l'accueil, puis surgit à chaque écran à l'endroit le plus dégagé pour commenter la partie
- Animations, sons et confettis, podium de fin de partie
- Web app installable (« Sur l'écran d'accueil ») qui fonctionne hors connexion

## Installer sur un téléphone

- **iPhone** : ouvrir le lien dans Safari, bouton Partager, puis « Sur l'écran d'accueil ».
- **Android** : ouvrir le lien dans Chrome, menu ⋮, puis « Installer l'application » ou « Ajouter à l'écran d'accueil ».

Les mises à jour s'installent en arrière-plan ; un bandeau « Mettre à jour » propose de les appliquer.

## Fichiers

- `source/vingt-indices.html` : la source du jeu (HTML, CSS, JavaScript et cartes)
- `build_app.py` : génère la version installable à partir de la source
- `index.html`, `manifest.webmanifest`, `sw.js`, `icon-*.png` : la version installable et le mode hors connexion (générés, ne pas modifier à la main)
