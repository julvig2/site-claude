# Forge Pack : packs graphiques FiveM

Site statique (HTML/CSS/JS, sans build) avec :

- **Une boutique de packs** : catalogue filtrable, aperçu avant/après sur 3 ambiances (jour, coucher, nuit), prix, téléchargement gratuit ou lien d'achat.
- **Pack graphique**, en deux modes :
  - **CVC** : mode *All time* (le jeu garde son cycle jour / nuit), *One time jour* ou *One time nuit* ; une ambiance toute prête (Bleu glacé, Rose, Violet, Doré, Menthe, Rouge…) ou tes couleurs (ciel, lumière) et la quantité de nuages ; luminosité, brouillard (aucun, léger, épais) et optimisation (Qualité, Équilibrée, Max FPS) ;
  - **Réaliste** : tous les réglages (exposition, gamma, contraste, points noir et blanc, saturation, vibrance, température, délavé, teintes des ombres / tons moyens / lumières, netteté, grain, vignette, monde, filtre timecycle, optimisation).
- **Pack son** : dépose un son (MP3, WAV, OGG…) ou prends-en un dans la bibliothèque (sons de tir générés par le site), sélectionne le passage sur l'onde (0,86 s par défaut), écoute, choisis l'arme, puis crée le pack.
- **Mods du jeu (dans le pack réaliste)** : le joueur dépose son propre fichier `water.xml` (extrait de son jeu avec CodeWalker : `common.rpf/data/levels/gta5/water.xml`), règle la clarté de l'eau et la hauteur des vagues, et le `.rpf` est ajouté au pack réaliste (dossier `mods/` du .zip, à copier dans `FiveM.app/mods`). Le `.rpf` suit le format des mods FiveM du dossier mods (archive RPF7 non chiffrée « OPEN » contenant un `assembly.xml` et `content/levels/water.xml`). Seuls les nombres réglés changent : le reste du fichier est conservé à l'identique. Une liste déroulante propose aussi les **mods déjà publiés sur le site** (ceux des packs réalistes gratuits, achetés ou à soi) : le mod choisi est ajouté au pack sans déposer de fichier. Quand un pack réaliste est publié avec un mod fabriqué à partir du fichier du joueur, son `.rpf` (environ 17 Ko) est enregistré avec le pack ; un mod repris d'un autre membre n'est pas republié.
- **Communauté** : *Derniers packs*, *Populaires* (classement par téléchargements et favoris), *Favoris* et *Mon espace*. Chacun peut mettre un pack en favori et **vendre ses packs** : prix + son propre lien de paiement (PayPal.me, Tebex, Stripe, Ko-fi…). L'acheteur paie sur ce lien puis clique « J'ai payé » ; le vendeur vérifie et valide la vente dans *Mon espace*, ce qui débloque le téléchargement. *Mon espace* affiche les favoris reçus, les téléchargements, les ventes et l'argent généré, au total et par pack. Tout cela est partagé entre les membres sur la version en ligne ; ailleurs, les packs et favoris restent dans le navigateur et la vente est désactivée.

- **L'export d'un vrai pack `.zip`** :
  - `plugins/<pack>.ini` : preset **ReShade** pour les couleurs, la lumière et la netteté (effets *Standard effects* : Levels, Tonemap, LiftGammaGain, Vibrance, Curves, LumaSharpen, FilmGrain, Vignette ; seuls les effets réglés sont activés) ;
  - `serveur/<pack>_graphique/` : ressource **FiveM** (`fxmanifest.lua` + `client.lua`), ajoutée quand le pack touche au monde (heure, météo, nuages, lumières de la ville) ou au filtre timecycle. ReShade ne peut que retoucher l'image : ces réglages-là sont appliqués par le jeu, sur un serveur. Les joueurs l'activent ou la coupent avec `/pack` ;
  - `pack.json` : les réglages, réimportables dans le créateur ;
  - `apercu.png` : l'avant/après ;
  - `LISEZMOI.txt` : les instructions d'installation.

Un **pack son** contient le passage en WAV (44,1 kHz, 16 bits, mono) et une ressource FiveM (`client.lua`, `server.lua`, page NUI) qui joue ce son à chaque tir avec l'arme choisie, pour le tireur et les joueurs proches (`/packson` pour le couper). Le son s'ajoute au bruit d'origine de l'arme : le remplacer complètement demande des fichiers audio au format du jeu (`.awc`), que le site ne fabrique pas.

L'aperçu applique en JavaScript les mêmes formules que les shaders ReShade exportés.

## Lancer le site

Ouvrez `index.html` dans un navigateur, ou servez le dossier :

```bash
python3 -m http.server 8000
```

Le site peut être hébergé tel quel sur GitHub Pages, Netlify, Vercel ou n'importe quel hébergeur statique.

## Personnaliser

### Mettre des captures de GTA

Prenez 3 captures d'écran en jeu, **sans pack graphique**, en 16:9, et placez-les dans le dossier `images/` :
`jour.jpg`, `coucher.jpg` et `nuit.jpg`. Elles remplacent automatiquement le décor dessiné dans tous les aperçus.
Le navigateur bloque la lecture des images quand on ouvre `index.html` en double-clic : les captures s'affichent une fois le site hébergé ou lancé avec `python3 -m http.server`.

### Le reste

Tout se règle dans `js/data.js` :

- `SITE` : nom du site, lien Discord, devise ;
- `PACKS` : le catalogue. `prix: 0` donne un téléchargement direct. Pour un pack payant, renseignez `lienAchat` (Tebex, Stripe Payment Link, PayPal…) ;
- `CAPTURES` : les chemins des captures d'écran ;
- `TIMECYCLES` : les filtres proposés pour la ressource serveur.

Les couleurs et polices se trouvent en haut de `css/style.css` (variables `:root`).

## Fichiers

```
index.html
css/style.css
js/data.js           configuration + catalogue
js/engine.js         scène procédurale + moteur d'aperçu (formules ReShade)
js/export.js         génération du preset ReShade, de la ressource FiveM et du .zip
js/app.js            interface (boutique, modale, créateur graphique)
js/son.js            pack son (onde, sélection, bibliothèque, WAV, ressource FiveM)
js/communaute.js     derniers packs, populaires, mes packs
js/hero.js           accueil (carrousel courbé, animation d'entrée)
js/rpf.js            générateur d'archives RPF7 (format OPEN) pour le dossier mods de FiveM
js/atelier.js        mods du jeu du pack réaliste (eau : clarté et vagues)
js/vendor/jszip.min.js   JSZip 3.10.1 (MIT)
```

## Ventes : comment c'est protégé

### Commission du site

Le propriétaire du site règle dans *Mon espace* (panneau visible par lui seul) le taux de commission (10 % par défaut) et le lien où il reçoit les commissions. À chaque vente validée, la commission est calculée au taux du moment et figée. Chaque vendeur voit dans *Mon espace* son argent généré, la commission du site et ce qui lui reste, avec un bouton pour payer et déclarer son versement. Le propriétaire voit ce que chaque vendeur lui doit et confirme chaque versement reçu. Ce système repose sur la confiance : rien n'oblige un vendeur à payer. Pour un prélèvement automatique, il faut une vraie place de marché (par exemple Stripe Connect) avec un serveur.

Le site n'encaisse rien et n'a pas de serveur de paiement : il ne peut donc pas vérifier tout seul qu'un paiement a eu lieu. C'est le vendeur qui valide chaque vente.

Dans la base de la version en ligne, chaque membre n'écrit que ses propres documents (`membres/<id>`, `activite/<id>`, `fichiers/<id>/…`), et seul le propriétaire écrit les réglages de commission et les versements confirmés (`config/…`). Personne ne peut donc modifier le lien de paiement d'un autre, ni valider ses propres achats.

En revanche, les réglages d'un pack payant restent lisibles par un membre qui fouille le code de la page. Une vraie protection (et des paiements validés automatiquement) demande un serveur avec un service de paiement (par exemple Stripe et ses webhooks).
