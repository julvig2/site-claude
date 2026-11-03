# Forge Pack : packs graphiques FiveM

Site statique (HTML/CSS/JS, sans build) avec :

- **Une boutique de packs** : catalogue filtrable, aperçu avant/après sur 3 ambiances (jour, coucher, nuit), prix, téléchargement gratuit ou lien d'achat.
- **Un créateur de pack** : 13 réglages (exposition, gamma, contraste, saturation, vibrance, température, délavé, teintes ombres/lumières, netteté, vignette) avec aperçu en direct. On peut aussi importer sa propre capture d'écran.
- **L'export d'un vrai pack `.zip`** :
  - `plugins/<pack>.ini` : preset **ReShade** (effets *Standard effects* : Tonemap, LiftGammaGain, Vibrance, Curves, LumaSharpen, Vignette) ;
  - `serveur/<pack>_graphique/` : ressource **FiveM** optionnelle (`fxmanifest.lua` + `client.lua`) qui applique un filtre timecycle à tous les joueurs, avec la commande `/pack` pour l'activer ou le couper ;
  - `pack.json` : les réglages, réimportables dans le créateur ;
  - `apercu.png` : l'avant/après ;
  - `LISEZMOI.txt` : les instructions d'installation.

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
js/app.js            interface (boutique, modale, créateur)
js/vendor/jszip.min.js   JSZip 3.10.1 (MIT)
```
