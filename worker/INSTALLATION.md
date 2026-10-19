# Installer l'espace admin (connexion Twitch + publication des rediffs)

Il y a 3 choses à faire, une seule fois, environ 15 minutes en tout. Tout est **gratuit**, et Cloudflare ne demande pas de carte bancaire.

---

## 1. Créer l'application Twitch (pour le bouton « Se connecter avec Twitch »)

> Twitch demande que la **double authentification** soit activée sur ton compte pour créer une application.
> Si ce n'est pas le cas : https://www.twitch.tv/settings/security → « Activer l'authentification à deux facteurs ».

1. Va sur https://dev.twitch.tv/console/apps/create (connecte-toi avec ton compte Twitch).
2. Remplis :
   - **Nom** : `Site Julvig` (n'importe quel nom libre)
   - **URL de redirection OAuth** : `https://julvig2.github.io/site-claude/admin.html`
   - **Catégorie** : `Website Integration`
   - **Type de client** : `Public`
3. Clique sur **Créer**, puis sur **Gérer** à côté de ton application.
4. Copie l'**ID client** : une suite de lettres et de chiffres. Tu en auras besoin à l'étape 2 et à l'étape 3.

## 2. Créer le serveur sur Cloudflare

### a) Créer le Worker
1. Crée un compte sur https://dash.cloudflare.com/sign-up et confirme ton e-mail.
2. Dans le menu de gauche, va dans **Compute (Workers) → Workers & Pages**, puis clique sur **Create** (ou **Create application**).
3. Choisis **Start with Hello World!**, donne le nom `julvig-api`, puis clique sur **Deploy**.
4. Clique sur **Edit code**. Efface tout le code affiché, puis colle **tout** le contenu du fichier [`worker/worker.js`](worker.js).
   Sur GitHub, ouvre le fichier et clique sur l'icône « Copy raw file » en haut à droite du code.
5. Clique sur **Deploy** en haut à droite.

### b) Créer l'espace de stockage
1. Dans le menu de gauche, va dans **Storage & Databases → KV** (ou « Workers KV »).
2. Clique sur **Create** (ou **Create namespace**), donne le nom `redifs`, puis valide.

### c) Relier le tout
1. Retourne sur ton Worker `julvig-api`, puis va dans l'onglet **Settings**.
2. Dans **Bindings**, clique sur **Add**, puis choisis **KV namespace** :
   - **Variable name** : `REDIFS` (en majuscules, exactement comme ça)
   - **KV namespace** : `redifs`
   - Clique sur **Save** (ou **Add binding**).
3. Dans **Variables and Secrets**, clique sur **Add** pour ajouter ces 2 variables (type « Text ») :

   | Nom | Valeur |
   |---|---|
   | `TWITCH_CLIENT_ID` | l'ID client copié à l'étape 1 |
   | `ADMIN_LOGIN` | `julvig2` |

   Clique sur **Deploy** (ou **Save**).
4. En haut de la page du Worker, copie son adresse. Elle ressemble à `https://julvig-api.TON-NOM.workers.dev`.
   Tu peux vérifier que ça marche : en ouvrant `https://julvig-api.TON-NOM.workers.dev/redifs` dans ton navigateur, tu dois voir `[]`.

## 3. Brancher le site sur le serveur

Dans `assets/js/contenu.js`, remplis ces deux lignes :

```js
  api: "https://julvig-api.TON-NOM.workers.dev",
  twitchClientId: "TON_ID_CLIENT",
```

Ces deux informations ne sont **pas secrètes** : tu peux les envoyer à Claude pour qu'il les mette à ta place.

---

## Utilisation

1. Mets ta rediff sur YouTube en **« Non répertoriée »**. Elle ne s'affiche pas sur ta chaîne, mais elle est lisible sur ton site.
2. Sur le site, clique sur **Connexion** en haut à droite et connecte-toi avec Twitch, puis ouvre l'onglet **⚙ Administration** du menu.
3. Dans l'onglet **Rediffs**, colle le lien YouTube. Le titre se remplit tout seul. Complète le reste et clique sur **Publier**.
4. La rediff apparaît tout de suite sur le site. Tu peux la **modifier** ou la **supprimer** depuis la liste en dessous.

Seul le compte Twitch indiqué dans `ADMIN_LOGIN` (le propriétaire) et ses modérateurs ont accès à l'Administration.
Les modérateurs s'ajoutent depuis l'onglet **Équipe** de l'Administration.

## Mettre à jour le serveur

Quand le site reçoit une nouvelle fonction, l'Administration affiche « Le code du serveur Cloudflare n'est pas à jour ».
Il suffit alors de recoller `worker/worker.js` dans Cloudflare : **julvig-api → Edit code**, tout effacer, coller, **Deploy**.

## Limites gratuites de Cloudflare

100 000 visites par jour et 1 000 publications ou modifications par jour. C'est très largement suffisant.
