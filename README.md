# Mon site de rediffs

Site simple pour regarder les rediffusions de mes streams, plus d'autres contenus (clips, projets, infos).
Il n'y a rien à installer : ce sont juste des fichiers HTML, CSS et JavaScript.

## Pages

| Page | Contenu |
|---|---|
| `index.html` | Accueil : la dernière rediff, les rediffs récentes, un aperçu du reste |
| `redifs.html` | Toutes les rediffs, avec une recherche et un filtre par catégorie |
| `video.html?id=...` | Le lecteur d'une rediff, la frise des chapitres (avec une image par chapitre), les likes et commentaires (connexion Twitch), et des suggestions |
| `autres.html` | « Info » : planning, setup, clips… (modifiable depuis l'espace admin) |
| `a-propos.html` | Présentation et liens vers les réseaux |
| `admin.html` | **Administration** (visible dans le menu seulement pour le propriétaire et les modérateurs) : tableau de bord, rediffs, Info, commentaires et bannissements, réglages du site, images, équipe, sauvegarde, bot Discord |
| `soutenir.html` | Page de dons avec le panneau Ko-fi intégré (carte bancaire ou PayPal) |

## Modifier le contenu

Le plus simple : **Connexion** (en haut à droite) avec ton compte Twitch, puis l'onglet **⚙ Administration**. Tu y gères les rediffs, les cartes Info, les commentaires, les réglages (slogan, À propos, chaînes, liens), les images, les modérateurs et les sauvegardes.

Les valeurs par défaut sont dans `assets/js/contenu.js` :

- ton pseudo, ton slogan et ta chaîne Twitch (pour le bouton « Le live ») ;
- ton lien de dons (bouton « Soutenir ») et ton invitation Discord (bloc « La commu » de l'accueil) ;
- tes réseaux sociaux ;
- la liste des rediffs ;
- les cartes « Info » par défaut (ensuite, elles se modifient depuis l'espace admin) ;
- le texte de la page « À propos ».

### Ajouter une rediff

Depuis l'onglet **Rediffs** de l'**Administration** (`admin.html`) : connecte-toi avec Twitch, colle le lien YouTube de ta rediff (mise en « non répertoriée ») et clique sur **Publier**.
Pour installer l'espace admin la première fois, suis le guide [`worker/INSTALLATION.md`](worker/INSTALLATION.md).

Tu peux aussi ajouter une rediff à la main dans la liste `redifs` de `assets/js/contenu.js` :

```js
{ id: "mon-stream", titre: "Titre", date: "2026-09-30", duree: "3h20",
  categorie: "Just Chatting", source: "youtube", video: "ID_YOUTUBE", description: "..." },
```

### Changer les couleurs

En haut de `assets/css/style.css`, modifie `--accent` et `--accent-2`.

## Bouton « Live »

Le bouton du menu affiche **Live OFF** (gris) quand tu ne streames pas et **EN LIVE** (rouge) quand tu es en live sur Twitch ou Kick. Pendant un live, ton stream s'affiche aussi en haut de l'accueil. Le statut est vérifié toutes les 2 minutes : Twitch via le service gratuit [DecAPI](https://decapi.me), Kick via le serveur Cloudflare.

## Likes et commentaires

Sur chaque rediff publiée depuis l'espace admin, les viewers peuvent se connecter avec Twitch pour liker et commenter (500 caractères max, un commentaire toutes les 15 secondes). Chacun peut supprimer ses commentaires. Dans l'Administration, l'onglet **Commentaires** liste tous les commentaires du site : tu peux les supprimer et **bannir** un compte (il ne peut plus liker ni commenter).

## Équipe

Le **propriétaire** est le pseudo Twitch de la variable `ADMIN_LOGIN` dans Cloudflare. Depuis l'onglet **Équipe**, il peut ajouter des **modérateurs** : ils ont accès à toute l'administration, sauf la gestion de l'équipe et la restauration d'une sauvegarde.

## Mettre le site en ligne (gratuit, avec GitHub Pages)

1. Sur GitHub, ouvre le dépôt, puis **Settings → Pages**.
2. Dans **Source**, choisis « Deploy from a branch », sélectionne la branche principale et le dossier `/ (root)`, puis clique sur **Save**.
3. Au bout d'une minute, le site est en ligne sur `https://<ton-pseudo>.github.io/<nom-du-depot>/`.

## Voir le site sur ton ordinateur

Dans le dossier du site, lance :

```bash
python3 -m http.server
```

Ouvre ensuite http://localhost:8000. Le lecteur Twitch a besoin d'un vrai nom de domaine : sur ton ordinateur, les vidéos Twitch ne marcheront qu'avec `localhost`, pas en ouvrant directement le fichier.
