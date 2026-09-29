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
 */

const CLE = "redifs";
const CHAMPS = ["titre", "date", "duree", "categorie", "source", "video", "description"];
const LIMITES = { titre: 200, date: 10, duree: 20, categorie: 60, source: 10, video: 40, description: 5000 };

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
  return { redif: r };
}

function nouvelId(titre) {
  const slug = titre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  return `${slug || "rediff"}-${Date.now().toString(36)}`;
}

export default {
  async fetch(requete, env) {
    if (requete.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const url = new URL(requete.url);
    const [, ressource, id] = url.pathname.split("/");

    try {
      if (requete.method === "GET" && ressource === "redifs" && !id) {
        return json(await lireRedifs(env), 200, { "Cache-Control": "no-store" });
      }

      const moi = await utilisateur(requete, env);

      if (requete.method === "GET" && ressource === "moi") {
        return moi ? json(moi) : erreur("Non connecté.", 401);
      }

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
          return json({ ok: true });
        }
      }

      return erreur("Route inconnue.", 404);
    } catch (e) {
      return erreur("Erreur du serveur : " + e.message, 500);
    }
  },
};
