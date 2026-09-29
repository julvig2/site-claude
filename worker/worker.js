/*
 * Serveur du site (Cloudflare Worker) : enregistre la liste des rediffs.
 *
 * À configurer dans Cloudflare (voir worker/INSTALLATION.md) :
 *   - REDIFS            : un espace de stockage "KV" relié au Worker
 *   - TWITCH_CLIENT_ID  : l'identifiant de l'application Twitch
 *   - ADMIN_LOGIN       : le pseudo Twitch autorisé à publier (ex: julvig2)
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
 */

const CLE = "redifs";
const CHAMPS = ["titre", "date", "duree", "categorie", "source", "video", "description", "chapitres"];
const LIMITES = { titre: 200, date: 10, duree: 20, categorie: 60, source: 10, video: 40, description: 5000, chapitres: 5000 };
const MAX_IMAGES_CHAPITRES = 100;
const TYPES_IMAGE = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE = 500 * 1024; // 500 Ko (l'espace admin redimensionne avant d'envoyer)
const MAX_COMMENTAIRE = 500; // caractères
const MAX_COMMENTAIRES = 1000; // par rediff
const DELAI_COMMENTAIRE = 15; // secondes minimum entre deux commentaires d'un même compte

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
  const admins = String(env.ADMIN_LOGIN || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { login: infos.login, admin: admins.includes(String(infos.login).toLowerCase()) };
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
    const [, ressource, id, sousId] = url.pathname.split("/").map((x) => decodeURIComponent(x || ""));

    try {
      if (requete.method === "GET" && ressource === "redifs" && !id) {
        return json(await lireRedifs(env), 200, { "Cache-Control": "no-store" });
      }

      if (requete.method === "GET" && ressource === "infos" && !id) {
        return json(await env.REDIFS.get("infos", "json"), 200, { "Cache-Control": "no-store" });
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
        return moi ? json(moi) : erreur("Non connecté.", 401);
      }

      /* ----- Likes et commentaires (ouverts à tous les comptes Twitch) ----- */

      if (["reactions", "likes", "commentaires"].includes(ressource)) {
        if (!(await lireRedifs(env)).some((r) => r.id === id)) return erreur("Rediff introuvable.", 404);

        if (requete.method === "GET" && ressource === "reactions") {
          return json(await reactions(env, id, moi), 200, { "Cache-Control": "no-store" });
        }

        if (!moi) return erreur("Connecte-toi avec Twitch.", 401);

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
      if (!moi.admin) return erreur("Ce compte Twitch n'a pas le droit de publier.", 403);

      if (requete.method === "GET" && ressource === "apercu") {
        const lien = url.searchParams.get("url") || "";
        const rep = await fetch(
          `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(lien)}`
        );
        if (!rep.ok) return erreur("Vidéo introuvable ou privée.", 404);
        const infos = await rep.json();
        return json({ titre: infos.title || "" });
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
