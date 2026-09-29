# Mon site de rediffs

Site simple pour regarder les rediffusions de mes streams, plus d'autres contenus (clips, projets, infos).
Il n'y a rien à installer : ce sont juste des fichiers HTML, CSS et JavaScript.

## Pages

| Page | Contenu |
|---|---|
| `index.html` | Accueil : la dernière rediff, les rediffs récentes, un aperçu du reste |
| `redifs.html` | Toutes les rediffs, avec une recherche et un filtre par catégorie |
| `video.html?id=...` | Le lecteur d'une rediff, avec des suggestions en dessous |
| `autres.html` | « Le reste » : clips, projets, planning… |
| `a-propos.html` | Présentation et liens vers les réseaux |
| `soutenir.html` | Page de dons avec le panneau Ko-fi intégré (carte bancaire ou PayPal) |

## Modifier le contenu

**Tout se passe dans `assets/js/contenu.js`.** Tu peux y changer :

- ton pseudo, ton slogan et ta chaîne Twitch (pour le bouton « Le live ») ;
- ton lien de dons (bouton « Soutenir ») et ton invitation Discord (bloc « La commu » de l'accueil) ;
- tes réseaux sociaux ;
- la liste des rediffs ;
- la section « Le reste » ;
- le texte de la page « À propos ».

### Ajouter une rediff

Copie ce bloc dans la liste `redifs` :

```js
{
  id: "mon-stream-du-30-sept",   // identifiant unique, sans espaces
  titre: "Titre du stream",
  date: "2026-09-30",            // format AAAA-MM-JJ
  duree: "3h20",
  categorie: "Just Chatting",    // sert aux filtres
  source: "youtube",             // "youtube", "twitch" ou "fichier"
  video: "dQw4w9WgXcQ",
  description: "Petite description.",
},
```

- **YouTube** : `video` = ce qui suit `v=` dans le lien (`youtube.com/watch?v=`**`dQw4w9WgXcQ`**). La miniature est trouvée automatiquement.
- **Twitch** : `video` = le numéro dans le lien (`twitch.tv/videos/`**`1234567890`**). Attention, Twitch supprime les VOD au bout de 7 à 60 jours selon ton statut. Pour les garder longtemps, mieux vaut les mettre sur YouTube.
- **Fichier** : `video` = le chemin d'un `.mp4` placé dans le dépôt. GitHub limite chaque fichier à 100 Mo, donc c'est à réserver aux petits clips.

Tu peux ajouter `miniature: "assets/img/mon-image.jpg"` pour choisir l'image affichée.

### Changer les couleurs

En haut de `assets/css/style.css`, modifie `--accent` et `--accent-2`.

## Bouton « Live »

Le bouton du menu affiche **Live OFF** (gris) quand tu ne streames pas et **EN LIVE** (rouge) quand tu es en live sur Twitch. Pendant un live, ton stream s'affiche aussi en haut de l'accueil. Le statut est vérifié toutes les 2 minutes grâce au service gratuit [DecAPI](https://decapi.me), sans clé d'API.

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
