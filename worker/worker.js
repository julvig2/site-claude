/*
 * Serveur du site (Cloudflare Worker) : enregistre la liste des rediffs.
 *
 * À configurer dans Cloudflare (voir worker/INSTALLATION.md) :
 *   - REDIFS            : un espace de stockage "KV" relié au Worker
 *   - TWITCH_CLIENT_ID  : l'identifiant de l'application Twitch
 *   - ADMIN_LOGIN       : le pseudo Twitch du propriétaire du site (ex: julvig2).
 *                         Le propriétaire peut ensuite ajouter des modérateurs depuis l'Administration.
 *   - BOT_SECRET        : (Secret) mot de passe partagé avec le bot Discord (même valeur que dans son .env)
 *
 * Routes :
 *   GET    /redifs          liste publique des rediffs
 *   GET    /moi             qui est connecté, et est-ce l'admin ?
 *   GET    /apercu?url=...  titre d'une vidéo YouTube (admin)
 *   POST   /redifs          ajoute une rediff (admin)
 *   PUT    /redifs/:id      modifie une rediff (admin)
 *   DELETE /redifs/:id      supprime une rediff (admin)
 *   GET    /infos           cartes de la section Info (null si jamais modifiées)
 *   PUT    /infos           remplace toutes les cartes Info (admin)
 *   GET    /live?kick=...   est-ce que la chaîne Kick est en live ?
 *   GET    /images/:id      une image envoyée depuis l'espace admin
 *   POST   /images          envoie une image (admin) -> { url }
 *   GET    /reactions/:id   likes + commentaires d'une rediff
 *   POST   /likes/:id       ajoute / retire son like (connecté)
 *   POST   /commentaires/:id          ajoute un commentaire (connecté)
 *   DELETE /commentaires/:id/:comId   supprime un commentaire (son auteur ou l'admin)
 *   GET    /parametres      réglages du site modifiés depuis l'Administration (null sinon)
 *   PUT    /parametres      modifie les réglages du site (admin)
 *
 * Administration (admin = propriétaire ou modérateur) :
 *   GET    /admin/stats                 chiffres du site
 *   GET    /admin/commentaires          tous les commentaires, du plus récent au plus ancien
 *   GET    /admin/bannis                comptes bannis
 *   POST   /admin/bannis                bannit un compte { login, purger }
 *   DELETE /admin/bannis/:login         débannit un compte
 *   GET    /admin/images                images envoyées et où elles sont utilisées
 *   DELETE /images/:id                  supprime une image
 *   GET    /admin/moderateurs           propriétaires et modérateurs
 *   PUT    /admin/moderateurs           remplace la liste des modérateurs (propriétaire)
 *   GET    /admin/export                sauvegarde de toutes les données (sauf les fichiers image)
 *   POST   /admin/import                restaure une sauvegarde (propriétaire)
 *   GET    /admin/bot                   réglages, état et actions du bot Discord
 *   PUT    /admin/bot/config            enregistre les réglages du bot
 *   POST   /admin/bot/actions           demande une action au bot { type, params }
 *   DELETE /admin/bot/actions/:id       annule une action encore en attente
 *
 * Bot Discord (en-tête Authorization: Bot <BOT_SECRET>) :
 *   GET    /bot/sync                    réglages + actions en attente (lecture seule)
 *   POST   /bot/resultats               résultats des actions { resultats: [{ id, ok, message }] }
 *   POST   /bot/etat                    état complet du bot (1 Mo maximum)
 *
 * Clés KV du bot (un seul écrivain par clé) :
 *   bot:config (admin) · bot:actions (admin) · bot:resultats (bot) · bot:etat (bot)
 */

// Augmente à chaque nouvelle version : l'Administration prévient si Cloudflare a un ancien code.
const VERSION_SERVEUR = 7;

const CLE = "redifs";
const CHAMPS = ["titre", "date", "duree", "categorie", "source", "video", "description", "chapitres"];
const LIMITES = { titre: 200, date: 10, duree: 20, categorie: 60, source: 10, video: 40, description: 5000, chapitres: 5000 };
const MAX_IMAGES_CHAPITRES = 100;
const TYPES_IMAGE = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE = 500 * 1024; // 500 Ko (l'espace admin redimensionne avant d'envoyer)
const MAX_COMMENTAIRE = 500; // caractères
const MAX_COMMENTAIRES = 1000; // par rediff
const DELAI_COMMENTAIRE = 15; // secondes minimum entre deux commentaires d'un même compte

const MAX_MODERATEURS = 20;
const MAX_RESEAUX = 12;
const LOGIN_TWITCH = /^[a-z0-9_]{3,25}$/;
const lienWeb = (v) => typeof v === "string" && v.length <= 500 && /^https:\/\/[^\s"'<>]+$/i.test(v);
const texte = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

const LIMITES_INFO = { titre: 120, type: 30, description: 1000, lien: 500 };
const MAX_INFOS = 50;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(donnees, statut = 200, entetes = {}) {
  return new Response(JSON.stringify(donnees), {
    status: statut,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...entetes },
  });
}

const erreur = (message, statut) => json({ erreur: message }, statut);

async function lireRedifs(env) {
  return (await env.REDIFS.get(CLE, "json")) || [];
}

async function ecrireRedifs(env, liste) {
  await env.REDIFS.put(CLE, JSON.stringify(liste));
}

// Vérifie le jeton Twitch auprès de Twitch et renvoie le compte connecté.
async function utilisateur(requete, env) {
  const m = (requete.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  const rep = await fetch("https://id.twitch.tv/oauth2/validate", {
    headers: { Authorization: `OAuth ${m[1]}` },
  });
  if (!rep.ok) return null;
  const infos = await rep.json();
  // Le jeton doit venir de NOTRE application Twitch, pas d'une autre.
  if (infos.client_id !== env.TWITCH_CLIENT_ID) return null;
  const login = String(infos.login).toLowerCase();
  const [moderateurs, bannis] = await Promise.all([lireModerateurs(env), lireBannis(env)]);
  const proprietaire = proprietaires(env).includes(login);
  return {
    login,
    proprietaire,
    admin: proprietaire || moderateurs.includes(login),
    banni: bannis.some((b) => b.login === login),
  };
}

// Les propriétaires sont dans la variable ADMIN_LOGIN de Cloudflare (impossible à retirer depuis le site)
function proprietaires(env) {
  return String(env.ADMIN_LOGIN || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function lireModerateurs(env) {
  return (await env.REDIFS.get("moderateurs", "json")) || [];
}

async function lireBannis(env) {
  return (await env.REDIFS.get("bannis", "json")) || [];
}

// Nettoie et valide une rediff envoyée par l'espace admin.
function nettoyer(entree) {
  const r = {};
  for (const champ of CHAMPS) {
    const v = entree?.[champ];
    r[champ] = typeof v === "string" ? v.trim().slice(0, LIMITES[champ]) : "";
  }
  if (!r.titre) return { erreur: "Le titre est obligatoire." };
  if (!["youtube", "twitch"].includes(r.source)) return { erreur: "Source vidéo invalide." };
  if (r.source === "youtube" && !/^[\w-]{11}$/.test(r.video)) return { erreur: "Identifiant YouTube invalide." };
  if (r.source === "twitch" && !/^\d{5,15}$/.test(r.video)) return { erreur: "Identifiant de VOD Twitch invalide." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) r.date = new Date().toISOString().slice(0, 10);

  // Images des chapitres : { "Titre du chapitre": "https://..." }
  r.imagesChapitres = {};
  const images = entree?.imagesChapitres;
  if (images && typeof images === "object" && !Array.isArray(images)) {
    for (const [titre, lien] of Object.entries(images).slice(0, MAX_IMAGES_CHAPITRES)) {
      if (typeof lien === "string" && lien.length <= 500 && /^https:\/\/[^\s"'<>]+$/i.test(lien)) {
        r.imagesChapitres[String(titre).slice(0, 200)] = lien;
      }
    }
  }
  return { redif: r };
}

// Nettoie et valide la liste des cartes Info.
function nettoyerInfos(entree) {
  if (!Array.isArray(entree)) return { erreur: "Liste invalide." };
  if (entree.length > MAX_INFOS) return { erreur: `${MAX_INFOS} cartes maximum.` };
  const infos = [];
  for (const item of entree) {
    const r = {};
    for (const champ of Object.keys(LIMITES_INFO)) {
      const v = item?.[champ];
      r[champ] = typeof v === "string" ? v.trim().slice(0, LIMITES_INFO[champ]) : "";
    }
    if (!r.titre) return { erreur: "Chaque carte doit avoir un titre." };
    // Seuls les vrais liens web sont acceptés (pas de "javascript:" etc.)
    if (r.lien && !/^https?:\/\/[^\s]+$/i.test(r.lien)) {
      return { erreur: `Lien invalide pour « ${r.titre} » : il doit commencer par https://` };
    }
    infos.push(r);
  }
  return { infos };
}

// Réglages du site modifiables depuis l'Administration
function nettoyerParametres(e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return { erreur: "Réglages invalides." };
  const p = { slogan: texte(e.slogan, 200), aPropos: texte(e.aPropos, 3000) };
  for (const cle of ["chaineTwitch", "chaineKick"]) {
    p[cle] = texte(e[cle], 40).toLowerCase();
    if (p[cle] && !/^[a-z0-9_-]{1,40}$/.test(p[cle])) return { erreur: `Nom de chaîne invalide : « ${p[cle]} »` };
  }
  for (const [cle, nom] of [["don", "dons"], ["discord", "Discord"]]) {
    p[cle] = texte(e[cle], 500);
    if (p[cle] && !lienWeb(p[cle])) return { erreur: `Lien ${nom} invalide : il doit commencer par https://` };
  }
  p.reseaux = [];
  for (const r of Array.isArray(e.reseaux) ? e.reseaux.slice(0, MAX_RESEAUX) : []) {
    const nom = texte(r?.nom, 30);
    const url = texte(r?.url, 500);
    if (!nom && !url) continue;
    if (!nom) return { erreur: "Chaque réseau doit avoir un nom." };
    if (!lienWeb(url)) return { erreur: `Lien invalide pour « ${nom} » : il doit commencer par https://` };
    p.reseaux.push({ nom, url });
  }
  return { parametres: p };
}

function nettoyerLogins(liste, max) {
  return [...new Set((Array.isArray(liste) ? liste : []).map((l) => String(l).trim().toLowerCase()))]
    .filter((l) => LOGIN_TWITCH.test(l))
    .slice(0, max);
}

function nettoyerCommentaires(liste) {
  return (Array.isArray(liste) ? liste : [])
    .filter((c) => c && LOGIN_TWITCH.test(String(c.login)) && typeof c.texte === "string" && c.texte.trim())
    .slice(0, MAX_COMMENTAIRES)
    .map((c) => ({
      id: String(c.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).slice(0, 40),
      login: String(c.login),
      texte: c.texte.trim().slice(0, MAX_COMMENTAIRE),
      date: isNaN(Date.parse(c.date)) ? new Date().toISOString() : new Date(c.date).toISOString(),
    }));
}

// Toutes les clés "img:..." du stockage (le KV renvoie 1000 clés par page)
async function listerImages(env) {
  const ids = [];
  let curseur;
  do {
    const page = await env.REDIFS.list({ prefix: "img:", cursor: curseur });
    ids.push(...page.keys.map((k) => k.name.slice(4)));
    curseur = page.list_complete ? null : page.cursor;
  } while (curseur);
  return ids;
}

// Likes et commentaires de toutes les rediffs
async function toutesReactions(env, redifs) {
  return Promise.all(
    redifs.map(async (r) => ({
      redif: r,
      likes: (await env.REDIFS.get(`likes:${r.id}`, "json")) || [],
      commentaires: (await env.REDIFS.get(`commentaires:${r.id}`, "json")) || [],
    }))
  );
}

async function administration(requete, env, url, moi, action, cible, sousCible) {
  const methode = requete.method;

  if (action === "bot") return administrationBot(requete, env, moi, cible, sousCible);

  if (methode === "GET" && action === "stats") {
    const redifs = await lireRedifs(env);
    const [reactionsParRedif, images, moderateurs, bannis] = await Promise.all([
      toutesReactions(env, redifs),
      listerImages(env),
      lireModerateurs(env),
      lireBannis(env),
    ]);
    const viewers = new Set();
    for (const r of reactionsParRedif) {
      r.likes.forEach((l) => viewers.add(l));
      r.commentaires.forEach((c) => viewers.add(c.login));
    }
    return json({
      redifs: redifs.length,
      likes: reactionsParRedif.reduce((n, r) => n + r.likes.length, 0),
      commentaires: reactionsParRedif.reduce((n, r) => n + r.commentaires.length, 0),
      viewers: viewers.size,
      images: images.length,
      moderateurs: moderateurs.length,
      bannis: bannis.length,
      top: reactionsParRedif
        .map((r) => ({ id: r.redif.id, titre: r.redif.titre, likes: r.likes.length, commentaires: r.commentaires.length }))
        .sort((a, b) => b.likes + b.commentaires - (a.likes + a.commentaires))
        .slice(0, 5),
    });
  }

  if (methode === "GET" && action === "commentaires") {
    const tous = (await toutesReactions(env, await lireRedifs(env))).flatMap((r) =>
      r.commentaires.map((c) => ({ ...c, redif: r.redif.id, redifTitre: r.redif.titre }))
    );
    return json(tous.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 500));
  }

  if (action === "bannis") {
    const bannis = await lireBannis(env);
    if (methode === "GET" && !cible) return json(bannis);

    if (methode === "POST" && !cible) {
      const corps = await requete.json().catch(() => ({}));
      const login = String(corps.login || "").trim().toLowerCase();
      if (!LOGIN_TWITCH.test(login)) return erreur("Pseudo Twitch invalide.", 400);
      const equipe = [...proprietaires(env), ...(await lireModerateurs(env))];
      if (equipe.includes(login)) return erreur("Impossible de bannir un propriétaire ou un modérateur.", 400);
      if (!bannis.some((b) => b.login === login)) {
        bannis.push({ login, date: new Date().toISOString(), par: moi.login });
        await env.REDIFS.put("bannis", JSON.stringify(bannis));
      }
      let supprimes = 0;
      if (corps.purger) {
        for (const r of await toutesReactions(env, await lireRedifs(env))) {
          const restants = r.commentaires.filter((c) => c.login !== login);
          if (restants.length !== r.commentaires.length) {
            supprimes += r.commentaires.length - restants.length;
            await env.REDIFS.put(`commentaires:${r.redif.id}`, JSON.stringify(restants));
          }
        }
      }
      return json({ ok: true, supprimes });
    }

    if (methode === "DELETE" && cible) {
      await env.REDIFS.put("bannis", JSON.stringify(bannis.filter((b) => b.login !== cible.toLowerCase())));
      return json({ ok: true });
    }
  }

  if (methode === "GET" && action === "images") {
    const redifs = await lireRedifs(env);
    const ids = await listerImages(env);
    return json(
      ids.map((id) => {
        const adresse = `${url.origin}/images/${id}`;
        const utilisations = redifs.flatMap((r) =>
          Object.entries(r.imagesChapitres || {})
            .filter(([, lien]) => lien === adresse)
            .map(([chapitre]) => ({ redif: r.id, titre: r.titre, chapitre }))
        );
        return { id, url: adresse, utilisations };
      })
    );
  }

  if (action === "moderateurs") {
    if (methode === "GET") return json({ proprietaires: proprietaires(env), moderateurs: await lireModerateurs(env) });
    if (methode === "PUT") {
      if (!moi.proprietaire) return erreur("Seul le propriétaire du site peut gérer les modérateurs.", 403);
      const corps = await requete.json().catch(() => ({}));
      const liste = nettoyerLogins(corps.moderateurs, MAX_MODERATEURS).filter((l) => !proprietaires(env).includes(l));
      await env.REDIFS.put("moderateurs", JSON.stringify(liste));
      return json({ proprietaires: proprietaires(env), moderateurs: liste });
    }
  }

  if (methode === "GET" && action === "export") {
    const redifs = await lireRedifs(env);
    const reactionsParRedif = await toutesReactions(env, redifs);
    const [infos, parametres, moderateurs, bannis, images] = await Promise.all([
      env.REDIFS.get("infos", "json"),
      env.REDIFS.get("parametres", "json"),
      lireModerateurs(env),
      lireBannis(env),
      listerImages(env),
    ]);
    return json({
      format: "sauvegarde-site-rediffs",
      version: 1,
      date: new Date().toISOString(),
      redifs,
      infos,
      parametres,
      moderateurs,
      bannis,
      likes: Object.fromEntries(reactionsParRedif.map((r) => [r.redif.id, r.likes])),
      commentaires: Object.fromEntries(reactionsParRedif.map((r) => [r.redif.id, r.commentaires])),
      images, // seulement la liste : les fichiers restent sur le serveur
    });
  }

  if (methode === "POST" && action === "import") {
    if (!moi.proprietaire) return erreur("Seul le propriétaire du site peut restaurer une sauvegarde.", 403);
    const s = await requete.json().catch(() => null);
    if (!s || s.format !== "sauvegarde-site-rediffs" || !Array.isArray(s.redifs)) {
      return erreur("Ce fichier n'est pas une sauvegarde du site.", 400);
    }
    // Tout est revérifié comme si c'était saisi à la main
    const redifs = [];
    for (const brute of s.redifs) {
      const { redif, erreur: msg } = nettoyer(brute);
      if (msg) return erreur(`Rediff « ${brute?.titre || "?"} » : ${msg}`, 400);
      redif.id = /^[\w-]{1,80}$/.test(brute.id || "") ? brute.id : nouvelId(redif.titre);
      redifs.push(redif);
    }
    let infos = null;
    if (s.infos != null) {
      const r = nettoyerInfos(s.infos);
      if (r.erreur) return erreur(`Cartes Info : ${r.erreur}`, 400);
      infos = r.infos;
    }
    let parametres = null;
    if (s.parametres != null) {
      const r = nettoyerParametres(s.parametres);
      if (r.erreur) return erreur(`Réglages : ${r.erreur}`, 400);
      parametres = r.parametres;
    }

    // On efface les likes / commentaires des rediffs qui ne sont plus là
    const ids = new Set(redifs.map((r) => r.id));
    for (const ancienne of await lireRedifs(env)) {
      if (!ids.has(ancienne.id)) {
        await Promise.all([env.REDIFS.delete(`likes:${ancienne.id}`), env.REDIFS.delete(`commentaires:${ancienne.id}`)]);
      }
    }
    await ecrireRedifs(env, redifs);
    await (infos ? env.REDIFS.put("infos", JSON.stringify(infos)) : env.REDIFS.delete("infos"));
    await (parametres ? env.REDIFS.put("parametres", JSON.stringify(parametres)) : env.REDIFS.delete("parametres"));
    await env.REDIFS.put("moderateurs", JSON.stringify(nettoyerLogins(s.moderateurs, MAX_MODERATEURS)));
    const bannis = (Array.isArray(s.bannis) ? s.bannis : [])
      .filter((b) => LOGIN_TWITCH.test(String(b?.login)))
      .map((b) => ({ login: b.login, date: String(b.date || ""), par: String(b.par || "") }));
    await env.REDIFS.put("bannis", JSON.stringify(bannis));
    for (const id of ids) {
      await env.REDIFS.put(`likes:${id}`, JSON.stringify(nettoyerLogins(s.likes?.[id], 100000)));
      await env.REDIFS.put(`commentaires:${id}`, JSON.stringify(nettoyerCommentaires(s.commentaires?.[id])));
    }
    return json({ ok: true, redifs: redifs.length });
  }

  return erreur("Route inconnue.", 404);
}

/* ================= Bot Discord ================= */

const TYPES_ACTIONS_BOT = [
  "ticket_panel", "ticket_fermer",
  "giveaway_creer", "giveaway_terminer", "giveaway_supprimer", "giveaway_reroll",
  "sondage_creer", "sondage_terminer",
  "annonce",
  "vip_ajouter", "vip_retirer",
  "blacklist_ajouter", "blacklist_retirer",
  "sanction_supprimer",
  "compteur_creer",
];
const MAX_ACTIONS_BOT = 50;
const MAX_ACTIONS_EN_ATTENTE = 20;
const MAX_RESULTATS_BOT = 100;
const MAX_PARAMS_BOT = 5000; // caractères en JSON
const MAX_ETAT_BOT = 1024 * 1024; // 1 Mo
const DUREE_VIE_ACTION = 7 * 24 * 3600 * 1000; // 7 jours
const BOT_EN_LIGNE = 15 * 60 * 1000; // 15 min sans nouvelles = hors ligne

async function empreinte(texteBrut) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texteBrut)));
}

// Compare le secret en temps constant (on compare les SHA-256, octet par octet, sans s'arrêter au premier écart)
async function botAutorise(requete, env) {
  const m = (requete.headers.get("Authorization") || "").match(/^Bot\s+(.+)$/);
  const [a, b] = await Promise.all([empreinte(m ? m[1].trim() : ""), empreinte(String(env.BOT_SECRET))]);
  let difference = m ? 0 : 1;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

const lireBot = async (env, cle, defaut) => (await env.REDIFS.get(`bot:${cle}`, "json")) ?? defaut;

async function routesBot(requete, env, action) {
  if (!env.BOT_SECRET) return erreur("Le bot n'est pas configuré : ajoute la variable secrète BOT_SECRET dans Cloudflare.", 503);
  if (!(await botAutorise(requete, env))) return erreur("Secret du bot invalide.", 401);
  const methode = requete.method;

  // Lecture seule : aucune écriture KV
  if (methode === "GET" && action === "sync") {
    const [config, actions, resultats] = await Promise.all([
      lireBot(env, "config", null),
      lireBot(env, "actions", []),
      lireBot(env, "resultats", {}),
    ]);
    return json({ config, actions: actions.filter((a) => !resultats[a.id]) }, 200, { "Cache-Control": "no-store" });
  }

  if (methode === "POST" && action === "resultats") {
    const corps = await requete.json().catch(() => null);
    if (!corps || !Array.isArray(corps.resultats)) return erreur("Corps attendu : { resultats: [...] }", 400);
    const resultats = await lireBot(env, "resultats", {});
    const maintenant = Date.now();
    for (const r of corps.resultats.slice(0, MAX_RESULTATS_BOT)) {
      if (!r || typeof r.id !== "string" || !r.id || r.id.length > 64) continue;
      resultats[r.id] = { ok: Boolean(r.ok), message: String(r.message ?? "").slice(0, 1000), faitLe: maintenant };
    }
    const gardes = Object.entries(resultats)
      .sort((x, y) => y[1].faitLe - x[1].faitLe)
      .slice(0, MAX_RESULTATS_BOT);
    await env.REDIFS.put("bot:resultats", JSON.stringify(Object.fromEntries(gardes)));
    return json({ ok: true });
  }

  if (methode === "POST" && action === "etat") {
    if (Number(requete.headers.get("Content-Length") || 0) > MAX_ETAT_BOT) return erreur("État trop gros (1 Mo maximum).", 413);
    const brut = await requete.text();
    if (new TextEncoder().encode(brut).length > MAX_ETAT_BOT) return erreur("État trop gros (1 Mo maximum).", 413);
    let etat;
    try {
      etat = JSON.parse(brut);
    } catch {
      return erreur("État invalide (JSON attendu).", 400);
    }
    if (!etat || typeof etat !== "object" || Array.isArray(etat)) return erreur("État invalide.", 400);
    await env.REDIFS.put("bot:etat", JSON.stringify({ ...etat, recuLe: Date.now() }));
    return json({ ok: true });
  }

  return erreur("Route inconnue.", 404);
}

/* ----- Réglages du bot (bot:config) : seules les clés autorisées sont gardées ----- */

const ID_DISCORD = /^\d{5,25}$/;

function idDiscord(v, nom) {
  if (v === null || v === undefined || v === "") return { valeur: null };
  const t = String(v).trim();
  return ID_DISCORD.test(t) ? { valeur: t } : { erreur: `${nom} : identifiant Discord invalide.` };
}

function nettoyerConfigBot(e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return { erreur: "Réglages invalides." };
  const c = {};

  const prefix = texte(e.prefix, 20);
  if (prefix && (prefix.length > 5 || /\s/.test(prefix))) return { erreur: "Préfixe : 5 caractères maximum, sans espace." };
  c.prefix = prefix || null;

  const color = texte(e.color, 7);
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) return { erreur: "Couleur invalide (format #rrggbb)." };
  c.color = color || null;

  const ids = {
    welcomeChannel: "Salon de bienvenue",
    memberRole: "Rôle automatique",
    counterChannel: "Salon compteur",
    vipRole: "Rôle VIP",
    ticketStaffRole: "Rôle staff des tickets",
    ticketCategory: "Catégorie des tickets",
    ticketTranscripts: "Salon des transcripts",
  };
  for (const [cle, nom] of Object.entries(ids)) {
    const r = idDiscord(e[cle], nom);
    if (r.erreur) return r;
    c[cle] = r.valeur;
  }

  const message = typeof e.welcomeMessage === "string" ? e.welcomeMessage.trim() : "";
  if (message.length > 1500) return { erreur: "Message de bienvenue : 1500 caractères maximum." };
  c.welcomeMessage = message || null;

  const format = texte(e.counterFormat, 100);
  if (format && !format.includes("{count}")) return { erreur: "Le format du compteur doit contenir {count}." };
  c.counterFormat = format || null;

  c.ticketCategories = null;
  if (Array.isArray(e.ticketCategories) && e.ticketCategories.length) {
    if (e.ticketCategories.length > 25) return { erreur: "Tickets : 25 catégories maximum." };
    const vus = new Set();
    c.ticketCategories = [];
    for (const cat of e.ticketCategories) {
      const id = texte(cat?.id, 40).toLowerCase();
      if (!/^[a-z0-9-]{1,20}$/.test(id)) return { erreur: `Catégorie de ticket « ${id || "?"} » : id en minuscules (a-z, 0-9, -), 20 caractères maximum.` };
      if (vus.has(id)) return { erreur: `Catégorie de ticket en double : « ${id} ».` };
      vus.add(id);
      const label = texte(cat.label, 80);
      if (!label) return { erreur: `Catégorie de ticket « ${id} » : le nom est obligatoire.` };
      c.ticketCategories.push({ id, label, emoji: texte(cat.emoji, 64), description: texte(cat.description, 100) });
    }
  }

  c.logs = {};
  if (e.logs && typeof e.logs === "object" && !Array.isArray(e.logs)) {
    for (const [type, salon] of Object.entries(e.logs).slice(0, 30)) {
      if (!/^[a-zA-Z0-9_-]{1,30}$/.test(type)) continue;
      const r = idDiscord(salon, `Logs ${type}`);
      if (r.erreur) return r;
      c.logs[type] = r.valeur;
    }
  }
  return { config: c };
}

async function administrationBot(requete, env, moi, cible, idAction) {
  const methode = requete.method;

  if (methode === "GET" && !cible) {
    const [config, etat, actions, resultats] = await Promise.all([
      lireBot(env, "config", null),
      lireBot(env, "etat", null),
      lireBot(env, "actions", []),
      lireBot(env, "resultats", {}),
    ]);
    const fusion = actions.slice(-MAX_ACTIONS_BOT).map((a) => {
      const r = resultats[a.id];
      return { ...a, statut: !r ? "attente" : r.ok ? "ok" : "erreur", message: r?.message ?? "", faitLe: r?.faitLe ?? null };
    });
    const enLigne = Boolean(etat && Date.now() - etat.recuLe < BOT_EN_LIGNE);
    return json({ config, etat, actions: fusion, enLigne }, 200, { "Cache-Control": "no-store" });
  }

  if (methode === "PUT" && cible === "config") {
    const { config, erreur: msg } = nettoyerConfigBot(await requete.json().catch(() => null));
    if (msg) return erreur(msg, 400);
    config.version = Date.now();
    await env.REDIFS.put("bot:config", JSON.stringify(config));
    return json({ ok: true, version: config.version });
  }

  if (cible === "actions") {
    const [actions, resultats] = await Promise.all([lireBot(env, "actions", []), lireBot(env, "resultats", {})]);

    if (methode === "POST" && !idAction) {
      const corps = await requete.json().catch(() => null);
      if (!corps || !TYPES_ACTIONS_BOT.includes(corps.type)) return erreur("Type d'action inconnu.", 400);
      const params = corps.params ?? {};
      if (typeof params !== "object" || Array.isArray(params)) return erreur("Paramètres invalides.", 400);
      if (JSON.stringify(params).length > MAX_PARAMS_BOT) return erreur("Paramètres trop longs (5 000 caractères maximum).", 400);

      const limite = Date.now() - DUREE_VIE_ACTION;
      const recentes = actions.filter((a) => a.creeLe >= limite); // on retire les actions de plus de 7 jours
      if (recentes.filter((a) => !resultats[a.id]).length >= MAX_ACTIONS_EN_ATTENTE) {
        return erreur(`Déjà ${MAX_ACTIONS_EN_ATTENTE} actions en attente : attends que le bot les traite.`, 429);
      }
      const nouvelle = { id: crypto.randomUUID(), type: corps.type, params, creeLe: Date.now(), par: moi.login };
      recentes.push(nouvelle);
      await env.REDIFS.put("bot:actions", JSON.stringify(recentes.slice(-MAX_ACTIONS_BOT)));
      return json({ ok: true, id: nouvelle.id });
    }

    if (methode === "DELETE" && idAction) {
      const action = actions.find((a) => a.id === idAction);
      if (!action) return erreur("Action introuvable.", 404);
      if (resultats[idAction]) return erreur("Cette action a déjà été exécutée par le bot.", 409);
      await env.REDIFS.put("bot:actions", JSON.stringify(actions.filter((a) => a.id !== idAction)));
      return json({ ok: true });
    }
  }

  return erreur("Route inconnue.", 404);
}

function nouvelId(titre) {
  const slug = titre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  return `${slug || "rediff"}-${Date.now().toString(36)}`;
}

// Kick n'a pas d'API publique simple : on lit la page "channel" de leur API.
// Si Kick bloque la requête, on renvoie null (statut inconnu).
async function kickEnLive(chaine) {
  const rep = await fetch(`https://kick.com/api/v2/channels/${chaine}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
    },
    cf: { cacheTtl: 60, cacheEverything: true }, // Cloudflare garde la réponse 1 minute
  });
  if (!rep.ok) return null;
  const infos = await rep.json().catch(() => null);
  if (!infos) return null;
  return Boolean(infos.livestream && infos.livestream.is_live !== false);
}

async function reactions(env, id, moi) {
  const [likes, commentaires] = await Promise.all([
    env.REDIFS.get(`likes:${id}`, "json"),
    env.REDIFS.get(`commentaires:${id}`, "json"),
  ]);
  const fans = likes || [];
  return {
    likes: fans.length,
    jaime: Boolean(moi && fans.includes(moi.login)),
    commentaires: commentaires || [],
    moi,
  };
}

export default {
  async fetch(requete, env) {
    if (requete.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const url = new URL(requete.url);
    const [, ressource, id, sousId, sousSousId] = url.pathname.split("/").map((x) => decodeURIComponent(x || ""));

    try {
      if (requete.method === "GET" && ressource === "redifs" && !id) {
        return json(await lireRedifs(env), 200, { "Cache-Control": "no-store" });
      }

      if (requete.method === "GET" && ressource === "infos" && !id) {
        return json(await env.REDIFS.get("infos", "json"), 200, { "Cache-Control": "no-store" });
      }

      // Le bot Discord s'identifie avec BOT_SECRET (pas avec Twitch)
      if (ressource === "bot") return await routesBot(requete, env, id);

      if (requete.method === "GET" && ressource === "parametres" && !id) {
        return json(await env.REDIFS.get("parametres", "json"), 200, { "Cache-Control": "no-store" });
      }

      if (requete.method === "GET" && ressource === "images" && id) {
        const { value, metadata } = await env.REDIFS.getWithMetadata(`img:${id}`, "arrayBuffer");
        if (!value) return erreur("Image introuvable.", 404);
        return new Response(value, {
          headers: { "Content-Type": metadata?.type || "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable", ...CORS },
        });
      }

      if (requete.method === "GET" && ressource === "live") {
        const kick = (url.searchParams.get("kick") || "").toLowerCase();
        if (!/^[a-z0-9_-]{1,40}$/.test(kick)) return erreur("Chaîne Kick invalide.", 400);
        return json({ kick: await kickEnLive(kick) }, 200, { "Cache-Control": "public, max-age=60" });
      }

      const moi = await utilisateur(requete, env);

      if (requete.method === "GET" && ressource === "moi") {
        return moi ? json({ ...moi, version: VERSION_SERVEUR }) : erreur("Non connecté.", 401);
      }

      /* ----- Likes et commentaires (ouverts à tous les comptes Twitch) ----- */

      if (["reactions", "likes", "commentaires"].includes(ressource)) {
        if (!(await lireRedifs(env)).some((r) => r.id === id)) return erreur("Rediff introuvable.", 404);

        if (requete.method === "GET" && ressource === "reactions") {
          return json(await reactions(env, id, moi), 200, { "Cache-Control": "no-store" });
        }

        if (!moi) return erreur("Connecte-toi avec Twitch.", 401);
        if (moi.banni && requete.method !== "DELETE") return erreur("Ton compte a été banni : tu ne peux plus liker ni commenter.", 403);

        if (requete.method === "POST" && ressource === "likes") {
          const cle = `likes:${id}`;
          const fans = (await env.REDIFS.get(cle, "json")) || [];
          const i = fans.indexOf(moi.login);
          if (i === -1) fans.push(moi.login);
          else fans.splice(i, 1);
          await env.REDIFS.put(cle, JSON.stringify(fans));
          return json({ likes: fans.length, jaime: i === -1 });
        }

        const cle = `commentaires:${id}`;

        if (requete.method === "POST" && ressource === "commentaires" && !sousId) {
          const texte = String((await requete.json().catch(() => ({}))).texte || "").trim();
          if (!texte) return erreur("Le commentaire est vide.", 400);
          if (texte.length > MAX_COMMENTAIRE) return erreur(`${MAX_COMMENTAIRE} caractères maximum.`, 400);

          const cleDelai = `delai:${moi.login}`;
          const dernier = Number(await env.REDIFS.get(cleDelai)) || 0;
          if (Date.now() - dernier < DELAI_COMMENTAIRE * 1000) {
            return erreur("Doucement ! Attends quelques secondes avant de recommenter.", 429);
          }

          const liste = (await env.REDIFS.get(cle, "json")) || [];
          if (liste.length >= MAX_COMMENTAIRES) return erreur("Trop de commentaires sur cette rediff.", 400);
          const commentaire = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            login: moi.login,
            texte,
            date: new Date().toISOString(),
          };
          liste.push(commentaire);
          await env.REDIFS.put(cle, JSON.stringify(liste));
          await env.REDIFS.put(cleDelai, String(Date.now()), { expirationTtl: 60 });
          return json(commentaire, 201);
        }

        if (requete.method === "DELETE" && ressource === "commentaires" && sousId) {
          const liste = (await env.REDIFS.get(cle, "json")) || [];
          const i = liste.findIndex((c) => c.id === sousId);
          if (i === -1) return erreur("Commentaire introuvable.", 404);
          if (!moi.admin && liste[i].login !== moi.login) return erreur("Tu ne peux supprimer que tes commentaires.", 403);
          liste.splice(i, 1);
          await env.REDIFS.put(cle, JSON.stringify(liste));
          return json({ ok: true });
        }

        return erreur("Route inconnue.", 404);
      }

      /* ----- Tout le reste est réservé à l'admin ----- */

      if (!moi) return erreur("Connecte-toi avec Twitch.", 401);
      if (!moi.admin) return erreur("Ce compte Twitch n'a pas accès à l'administration.", 403);

      if (requete.method === "GET" && ressource === "apercu") {
        const lien = url.searchParams.get("url") || "";
        const rep = await fetch(
          `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(lien)}`
        );
        if (!rep.ok) return erreur("Vidéo introuvable ou privée.", 404);
        const infos = await rep.json();
        return json({ titre: infos.title || "" });
      }

      if (ressource === "admin") return await administration(requete, env, url, moi, id, sousId, sousSousId);

      if (requete.method === "PUT" && ressource === "parametres" && !id) {
        const { parametres, erreur: msg } = nettoyerParametres(await requete.json().catch(() => null));
        if (msg) return erreur(msg, 400);
        await env.REDIFS.put("parametres", JSON.stringify(parametres));
        return json(parametres);
      }

      if (requete.method === "DELETE" && ressource === "images" && id) {
        await env.REDIFS.delete(`img:${id}`);
        return json({ ok: true });
      }

      if (requete.method === "POST" && ressource === "images" && !id) {
        const type = (requete.headers.get("Content-Type") || "").split(";")[0].trim();
        if (!TYPES_IMAGE.includes(type)) return erreur("Format d'image non accepté (JPG, PNG ou WebP).", 400);
        const donnees = await requete.arrayBuffer();
        if (!donnees.byteLength || donnees.byteLength > MAX_IMAGE) return erreur("Image trop lourde (500 Ko maximum).", 400);
        const nouvelle = crypto.randomUUID().replace(/-/g, "");
        await env.REDIFS.put(`img:${nouvelle}`, donnees, { metadata: { type } });
        return json({ url: `${url.origin}/images/${nouvelle}` }, 201);
      }

      if (requete.method === "PUT" && ressource === "infos" && !id) {
        const { infos, erreur: msg } = nettoyerInfos(await requete.json());
        if (msg) return erreur(msg, 400);
        await env.REDIFS.put("infos", JSON.stringify(infos));
        return json(infos);
      }

      if (ressource === "redifs") {
        const liste = await lireRedifs(env);

        if (requete.method === "POST" && !id) {
          const { redif, erreur: msg } = nettoyer(await requete.json());
          if (msg) return erreur(msg, 400);
          redif.id = nouvelId(redif.titre);
          liste.push(redif);
          await ecrireRedifs(env, liste);
          return json(redif, 201);
        }

        const index = liste.findIndex((r) => r.id === id);
        if (id && index === -1) return erreur("Rediff introuvable.", 404);

        if (requete.method === "PUT" && id) {
          const { redif, erreur: msg } = nettoyer(await requete.json());
          if (msg) return erreur(msg, 400);
          liste[index] = { ...redif, id };
          await ecrireRedifs(env, liste);
          return json(liste[index]);
        }

        if (requete.method === "DELETE" && id) {
          liste.splice(index, 1);
          await ecrireRedifs(env, liste);
          await Promise.all([env.REDIFS.delete(`likes:${id}`), env.REDIFS.delete(`commentaires:${id}`)]);
          return json({ ok: true });
        }
      }

      return erreur("Route inconnue.", 404);
    } catch (e) {
      return erreur("Erreur du serveur : " + e.message, 500);
    }
  },
};
