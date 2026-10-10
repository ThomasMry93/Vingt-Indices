# Vingt Indices — notes de projet

Jeu de devinettes pour smartphone, inspiré du principe d'Indix / 20 Questions, avec des cartes 100 % originales (aucune carte du jeu commercial). Interface et cartes en français.

- Jeu en ligne : https://thomasmry93.github.io/Vingt-Indices/ (GitHub Pages, branche `main`, dossier racine)
- Installé comme web app (PWA) sur l'écran d'accueil iPhone / Android.

## Façon de travailler (demandée par l'utilisateur)

- Les modifications se font et se testent d'abord **dans Claude** : mettre à jour uniquement la page du jeu dans Claude (artifact « Vingt Indices »).
- **Ne rien envoyer sur GitHub** tant que l'utilisateur n'a pas validé explicitement (« mets à jour l'app », « envoie la MAJ »…). GitHub = version installée sur les téléphones.
- À la validation : rebuild (`python3 build_app.py`), commit, push.

## Fichiers

- `source/vingt-indices.html` : **la source à modifier**. Page autonome (HTML + CSS + JS, sans librairie). Les cartes de base sont dans la constante `BUILTIN` (JSON sur une ligne).
- `build_app.py` : génère la version installable à partir de la source → `index.html`, `manifest.webmanifest`, `sw.js` (cache hors connexion, versionné à chaque build). Lancer `python3 build_app.py` depuis la racine du dépôt.
- `icon-180/192/512.png` : icône style BD (« ? » rouge façon comics, entouré de 20 pastilles rouge/bleu/blanc cerclées de noir, sur fond jaune à pois).
- Ne pas éditer `index.html` à la main : modifier la source puis relancer `build_app.py`.

## Règles du jeu (telles que demandées)

- Un lecteur par carte (rôle tournant). Les autres choisissent un numéro de 1 à 20 ; le lecteur lit l'indice ; le joueur dont c'est le tour répond.
- Points : **20 points répartis par carte**. Trouvé après n indices → devineur 20 − n, lecteur n. Personne ne trouve après 20 indices → lecteur 20.
- Fin de partie : **score à atteindre** (30/50/80/100 ou saisi), vérifié à la fin de chaque carte.
- Option **jeton de réponse** (activée par défaut) : un jeton par joueur et par partie pour répondre hors de son tour ; perdu qu'on trouve ou non.
- Passer une carte (sans points), **annuler la dernière action** (historique multiple), **ajuster les scores** à la main (±1, ±5).

## Design (« carton et papier »)

- Table en carton kraft (grain SVG inline), cartes en carton blanc imprimé, planche de 20 gommettes à la couleur de la catégorie (Personnage rouge, Lieu bleu, Chose jaune), indices sur fiches lignées tapées à la machine.
- Polices : Alfa Slab One (titres, numéros), Karla (texte), Special Elite (indices).
- Animations : carte distribuée, gommette décollée, fiche retournée en 3D puis tapée, tampon Trouvé/Raté, compteurs de points, confettis en papier, podium final. `prefers-reduced-motion` respecté.
- Sons synthétisés en WebAudio (aucun fichier), bouton pour couper, réglage mémorisé.
- **Mascotte « ? »** (comme dans Le Risque-Tout) : un gros point d'interrogation rouge en SVG (yeux, gants, baskets, sa balle = le point du « ? ») : en grand au centre de l'accueil (`.mbig`, animée en boucle, avec sa bulle « Prêt à deviner ? ») ; en petit, elle surgit à chaque changement d'écran ou d'étape de manche, à l'endroit le plus dégagé (`placeMascot()` : coins et bords testés, boutons et titres comptent double, bulle au-dessus, à côté ou en dessous), prend une humeur (`wave`, `think`, `cheer`, `sad`, `shock`, `point`) et dit une réplique dans une bulle, puis repart (`mood()` / `react()` dans le JS).
- **Styles au choix** (écran « Style » depuis l'accueil, réglage `style` mémorisé, `styleChosen` quand le joueur l'a choisi lui-même) : **BD par défaut**, Carton (décrit ci-dessus), Journal (gazette des années 40 : papier et texte en noir et gris, boutons, gommettes, bandeaux, médailles et jetons en couleurs franches ; Playfair Display, titre en gothique UnifrakturMaguntia, Old Standard TT, indices en IM Fell English), BD (bande dessinée pop : Bangers, Comic Neue). Chaque style = un bloc de variables CSS `[data-style=…]` + retouches `html[data-style=…] …` ; liste `STYLES` dans le JS (nom, description, couleur de barre). Pour en ajouter un : un bloc CSS + une entrée dans `STYLES` + sa police dans le lien Google Fonts.
- Appli installée : la nouvelle version s'installe en arrière-plan puis un bandeau « Mettre à jour » l'applique (`window.VI_showUpdate`, message `skipWaiting` au service worker).

## Cartes

- 3 catégories : **Personnage, Lieu, Chose**. 550 cartes de base (152 / 194 / 204).
- Format : `{"id","cat","theme","answer","clues":[20 chaînes]}` ; `theme` = `cat`.
- Style des indices : à la première personne (« Je suis né à… », « On me… »), y compris pour les lieux et les choses avec le possessif (« Certaines de mes falaises… », « Chez moi, on… », « l'un des miens ») : jamais d'indice impersonnel du type « Les falaises d'Étretat ont… » ou « On y… », courts (< 90 caractères), ordre de difficulté mélangé, jamais le mot de la réponse, faits vérifiables uniquement. Pour les personnes vivantes : carrière publique seulement, rien de privé ni de polémique.
- Les ids restent stables (les modifications/suppressions locales des joueurs s'y réfèrent).

## Fonctions de l'appli

- Accueil, Nouvelle partie (joueurs, catégories, score cible, jeton), Lecture libre (indices cachés ou tous affichés, filtre par catégorie), Règles.
- Écran Cartes : liste complète avec recherche (sans accents ni articles) et filtre de catégorie ; ouvrir (indices cachés par défaut), modifier (nom, catégorie, 20 indices), supprimer (cartes de base restaurables) ; cartes perso ; copier/importer un code de cartes ; **Exporter toutes les cartes** (fichier JSON `format: "vingt-indices"`, avec `source` = base / base-modifiée / perso et `removedBaseIds`).
- Pendant une manche : liste des indices dévoilés **triée par numéro**, le dernier lu mis en évidence.
- Fiche d'indice ouverte : ligne de réponse masquée par défaut avec le bouton Afficher/Masquer (même réglage que sur la carte).
- Fin de carte (trouvée ou ratée) : bouton **Afficher tous les indices** (les 20, ceux non lus en retrait), avec un second bouton « Carte suivante » sous la liste.
- Données des joueurs (cartes perso, modifications, suppressions, réglages) : `localStorage`, propre à chaque téléphone.

## Intégrer un export de l'utilisateur

Quand l'utilisateur envoie un fichier exporté : remplacer les cartes de base modifiées (même id), retirer les ids de `removedBaseIds`, ajouter les cartes `perso` comme nouvelles cartes de base (nouvel id), puis rebuild et push.
