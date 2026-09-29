/* Rendu des pages à partir de SITE (défini dans contenu.js). Pas besoin de toucher ce fichier. */

const $ = (sel, root = document) => root.querySelector(sel);

function echapper(texte) {
  const div = document.createElement("div");
  div.textContent = texte == null ? "" : String(texte);
  return div.innerHTML;
}

function formaterDate(iso) {
  const d = new Date(iso + "T12:00:00");
  if (isNaN(d)) return iso || "";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function miniature(redif) {
  if (redif.miniature) return redif.miniature;
  if (redif.source === "youtube") return `https://i.ytimg.com/vi/${encodeURIComponent(redif.video)}/hqdefault.jpg`;
  return "";
}

function lecteur(redif) {
  const parent = location.hostname || "localhost";
  if (redif.source === "youtube") {
    return `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(redif.video)}"
      title="${echapper(redif.titre)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowfullscreen></iframe>`;
  }
  if (redif.source === "twitch") {
    return `<iframe src="https://player.twitch.tv/?video=${encodeURIComponent(redif.video)}&parent=${parent}&autoplay=false"
      title="${echapper(redif.titre)}" allowfullscreen></iframe>`;
  }
  if (redif.source === "fichier") {
    const poster = redif.miniature ? ` poster="${echapper(redif.miniature)}"` : "";
    return `<video src="${echapper(redif.video)}" controls preload="metadata"${poster}></video>`;
  }
  return `<div class="lecteur-vide">Source vidéo inconnue</div>`;
}

function carte(redif) {
  const img = miniature(redif);
  const secours = `<div class="miniature-vide"><span>${echapper(redif.titre)}</span></div>`;
  // Si l'image ne charge pas, on affiche le visuel de secours à la place
  const visuel = img
    ? `<img src="${echapper(img)}" alt="" loading="lazy" onerror="this.outerHTML=this.nextElementSibling.innerHTML"><template>${secours}</template>`
    : secours;
  return `
    <a class="carte" href="video.html?id=${encodeURIComponent(redif.id)}">
      <div class="carte-visuel">
        ${visuel}
        ${redif.duree ? `<span class="badge-duree">${echapper(redif.duree)}</span>` : ""}
        <span class="badge-source badge-${echapper(redif.source)}">${echapper(redif.source)}</span>
      </div>
      <div class="carte-infos">
        <h3>${echapper(redif.titre)}</h3>
        <p class="meta">${formaterDate(redif.date)}${redif.categorie ? ` · ${echapper(redif.categorie)}` : ""}</p>
      </div>
    </a>`;
}

/* ---------- Rediffs : celles de contenu.js + celles publiées depuis l'espace admin ---------- */

let REDIFS = [...SITE.redifs];

async function chargerRedifs() {
  if (!SITE.api) return;
  try {
    const rep = await fetch(`${SITE.api.replace(/\/$/, "")}/redifs`, { cache: "no-store" });
    if (!rep.ok) return;
    const enLigne = await rep.json();
    const ids = new Set(SITE.redifs.map((r) => r.id));
    REDIFS = [...SITE.redifs, ...enLigne.filter((r) => !ids.has(r.id))];
  } catch {
    // Serveur injoignable : on affiche au moins les rediffs de contenu.js.
  }
}

/* ---------- Cartes Info : celles de l'espace admin, sinon celles de contenu.js ---------- */

let INFOS = [...SITE.autres];

async function chargerInfos() {
  if (!SITE.api) return;
  try {
    const rep = await fetch(`${SITE.api.replace(/\/$/, "")}/infos`, { cache: "no-store" });
    if (!rep.ok) return;
    const enLigne = await rep.json();
    // null = jamais modifiées depuis l'espace admin : on garde celles de contenu.js
    if (Array.isArray(enLigne)) INFOS = enLigne;
  } catch {
    // Serveur injoignable : on garde celles de contenu.js.
  }
}

function redifsTriees() {
  return [...REDIFS].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

/* ---------- En-tête et pied de page communs ---------- */

function entete(page) {
  const liens = [
    ["accueil", "index.html", "Accueil"],
    ["redifs", "redifs.html", "Rediffs"],
    ["autres", "autres.html", "Info"],
    ["a-propos", "a-propos.html", "À propos"],
  ];
  const nav = liens
    .map(([cle, href, txt]) => `<a href="${href}"${cle === page ? ' aria-current="page"' : ""}>${txt}</a>`)
    .join("");
  const direct = SITE.chaineTwitch || SITE.chaineKick
    ? `<a class="btn-direct hors-ligne" href="${SITE.chaineTwitch ? PLATEFORMES.twitch.url() : PLATEFORMES.kick.url()}" target="_blank" rel="noopener"><span class="point"></span><span class="etat-live">Live OFF</span></a>`
    : "";
  const don = SITE.don
    ? `<a class="btn-don" href="soutenir.html"${page === "soutenir" ? ' aria-current="page"' : ""}>♥ Soutenir</a>`
    : "";
  return `
    <div class="conteneur entete-inner">
      <a class="logo" href="index.html">${echapper(SITE.nom)}</a>
      <button class="burger" aria-label="Menu" aria-expanded="false">☰</button>
      <nav class="nav">${nav}${don}${direct}</nav>
    </div>`;
}

function pied() {
  const reseaux = SITE.reseaux
    .map((r) => `<a href="${echapper(r.url)}" target="_blank" rel="noopener">${echapper(r.nom)}</a>`)
    .join("");
  return `
    <div class="conteneur pied-inner">
      <div class="reseaux">${reseaux}</div>
      <p>© ${new Date().getFullYear()} ${echapper(SITE.nom)}${SITE.api ? ` · <a class="lien-admin" href="admin.html">Espace admin</a>` : ""}</p>
    </div>`;
}

/* ---------- Pages ---------- */

function pageAccueil() {
  const liste = redifsTriees();
  const derniere = liste[0];
  $("#hero-titre").textContent = SITE.nom;
  $("#hero-slogan").textContent = SITE.slogan;

  if (derniere) {
    $("#derniere").innerHTML = `
      <div class="lecteur">${lecteur(derniere)}</div>
      <div class="derniere-infos">
        <span class="etiquette">Dernière rediff</span>
        <h2>${echapper(derniere.titre)}</h2>
        <p class="meta">${formaterDate(derniere.date)}${derniere.duree ? ` · ${echapper(derniere.duree)}` : ""}</p>
        <p>${echapper(derniere.description || "")}</p>
        <a class="btn" href="video.html?id=${encodeURIComponent(derniere.id)}">Ouvrir la page</a>
      </div>`;
  } else {
    $("#derniere").innerHTML = `<p class="vide">Aucune rediff pour l'instant.</p>`;
  }

  $("#recentes").innerHTML = liste.slice(1, 7).map(carte).join("") || `<p class="vide">Rien d'autre pour l'instant.</p>`;
  const infos = INFOS.slice(0, 3);
  $("#apercu-autres").innerHTML = infos.map(carteAutre).join("");
  $("#section-infos").hidden = infos.length === 0;
  $("#commu").innerHTML = blocsCommu();
}

function lienReseau(nom) {
  return SITE.reseaux.find((r) => r.nom.toLowerCase() === nom.toLowerCase())?.url;
}

function blocsCommu() {
  const blocs = [];
  const lives = ["Twitch", "Kick"].filter(lienReseau);
  if (lives.length) {
    blocs.push(`
      <div class="bloc-commu bloc-live">
        <h3>Me voir en live</h3>
        <p>Viens discuter en direct pendant les streams.</p>
        <div class="boutons">${lives
          .map((n) => `<a class="btn btn-${n.toLowerCase()}" href="${echapper(lienReseau(n))}" target="_blank" rel="noopener">${n}</a>`)
          .join("")}</div>
      </div>`);
  }
  if (SITE.discord) {
    blocs.push(`
      <div class="bloc-commu bloc-discord">
        <h3>Rejoins le Discord</h3>
        <p>La commu, les annonces de stream et les discussions entre deux lives.</p>
        <div class="boutons"><a class="btn btn-discord" href="${echapper(SITE.discord)}" target="_blank" rel="noopener">Rejoindre le serveur</a></div>
      </div>`);
  }
  if (SITE.don) {
    blocs.push(`
      <div class="bloc-commu bloc-don">
        <h3>Soutenir la chaîne</h3>
        <p>Un petit don aide à améliorer les streams. Merci, c'est pas obligé du tout !</p>
        <div class="boutons"><a class="btn btn-kofi" href="soutenir.html">Faire un don</a></div>
      </div>`);
  }
  return blocs.join("");
}

function pageRedifs() {
  const liste = redifsTriees();
  const categories = [...new Set(liste.map((r) => r.categorie).filter(Boolean))];
  const filtres = $("#filtres");
  filtres.innerHTML = ["Tout", ...categories]
    .map((c, i) => `<button class="puce${i === 0 ? " active" : ""}" data-cat="${i === 0 ? "" : echapper(c)}">${echapper(c)}</button>`)
    .join("");

  let categorie = "";
  const recherche = $("#recherche");

  function afficher() {
    const q = recherche.value.trim().toLowerCase();
    const res = liste.filter(
      (r) =>
        (!categorie || r.categorie === categorie) &&
        (!q || `${r.titre} ${r.description || ""} ${r.categorie || ""}`.toLowerCase().includes(q))
    );
    $("#grille").innerHTML = res.map(carte).join("") || `<p class="vide">Aucune rediff ne correspond.</p>`;
    $("#compteur").textContent = `${res.length} rediff${res.length > 1 ? "s" : ""}`;
  }

  filtres.addEventListener("click", (e) => {
    const b = e.target.closest(".puce");
    if (!b) return;
    filtres.querySelectorAll(".puce").forEach((x) => x.classList.toggle("active", x === b));
    categorie = b.dataset.cat;
    afficher();
  });
  recherche.addEventListener("input", afficher);
  afficher();
}

function pageVideo() {
  const id = new URLSearchParams(location.search).get("id");
  const liste = redifsTriees();
  const redif = liste.find((r) => r.id === id);
  if (!redif) {
    $("#video").innerHTML = `<p class="vide">Cette rediff n'existe pas. <a href="redifs.html">Voir toutes les rediffs</a></p>`;
    return;
  }
  document.title = `${redif.titre} — ${SITE.nom}`;
  $("#video").innerHTML = `
    <div class="lecteur">${lecteur(redif)}</div>
    <h1>${echapper(redif.titre)}</h1>
    <p class="meta">${formaterDate(redif.date)}${redif.duree ? ` · ${echapper(redif.duree)}` : ""}${redif.categorie ? ` · ${echapper(redif.categorie)}` : ""}</p>
    <p class="description">${echapper(redif.description || "")}</p>
    ${blocChapitres(redif)}`;
  $("#video").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sec]");
    if (b) allerA(redif, Number(b.dataset.sec));
  });
  const suite = liste.filter((r) => r.id !== id).slice(0, 4);
  $("#suggestions").innerHTML = suite.map(carte).join("");
  afficherReactions(redif);
}

/* ---------- Chapitres ---------- */

// Un chapitre par ligne, avec le moment n'importe où dans la ligne :
// "0:00 Début", "45:12 - Boss final", "[1:02:03] Fou rire", "Boss final (45:12)" -> [{ sec, titre }]
function analyserChapitres(texte) {
  const chapitres = [];
  for (const ligne of String(texte || "").split("\n")) {
    const m = ligne.match(/[[(]?\b(?:(\d{1,2}):)?(\d{1,3}):(\d{2})\b[\])]?/);
    if (!m) continue;
    const sec = Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    const titre = `${ligne.slice(0, m.index)} ${ligne.slice(m.index + m[0].length)}`
      .replace(/^[\s\-–—:|•·*]+|[\s\-–—:|•·*]+$/g, "")
      .trim();
    chapitres.push({ sec, titre: titre || `Chapitre ${chapitres.length + 1}` });
  }
  return chapitres.sort((a, b) => a.sec - b.sec);
}

function formaterTemps(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function blocChapitres(redif) {
  const chapitres = analyserChapitres(redif.chapitres);
  if (!chapitres.length || !["youtube", "twitch"].includes(redif.source)) return "";
  return `
    <div class="chapitres">
      <h2>Chapitres</h2>
      <ol>${chapitres
        .map((c) => `<li><button class="chapitre" data-sec="${c.sec}"><span class="temps">${formaterTemps(c.sec)}</span>${echapper(c.titre)}</button></li>`)
        .join("")}</ol>
    </div>`;
}

// Recharge le lecteur au bon moment de la vidéo
function allerA(redif, sec) {
  const iframe = $("#video .lecteur iframe");
  if (!iframe) return;
  if (redif.source === "youtube") {
    iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(redif.video)}?start=${sec}&autoplay=1`;
  } else if (redif.source === "twitch") {
    const t = `${Math.floor(sec / 3600)}h${Math.floor((sec % 3600) / 60)}m${sec % 60}s`;
    iframe.src = `https://player.twitch.tv/?video=${encodeURIComponent(redif.video)}&parent=${location.hostname || "localhost"}&time=${t}&autoplay=true`;
  }
  iframe.closest(".lecteur").scrollIntoView({ behavior: "smooth", block: "center" });
}

/* ---------- Likes et commentaires ---------- */

function ilYA(iso) {
  const secondes = (Date.now() - new Date(iso)) / 1000;
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (secondes < 60) return "à l'instant";
  if (secondes < 3600) return rtf.format(-Math.floor(secondes / 60), "minute");
  if (secondes < 86400) return rtf.format(-Math.floor(secondes / 3600), "hour");
  if (secondes < 7 * 86400) return rtf.format(-Math.floor(secondes / 86400), "day");
  return formaterDate(String(iso).slice(0, 10));
}

async function afficherReactions(redif, avertissement = ERREUR_CONNEXION) {
  const zone = $("#reactions");
  // Seulement pour les rediffs publiées depuis l'espace admin
  if (!zone || !connexionPossible() || SITE.redifs.some((r) => r.id === redif.id)) return;
  zone.hidden = false;
  const chemin = encodeURIComponent(redif.id);

  let d;
  try {
    d = await appelApi(`/reactions/${chemin}`);
  } catch (e) {
    // Jeton expiré : il vient d'être effacé, on recharge en mode déconnecté
    if (e.statut === 401) return afficherReactions(redif, "Ta connexion a expiré, reconnecte-toi.");
    zone.innerHTML = message("Impossible de charger les commentaires pour le moment.", "erreur");
    return;
  }
  const { moi } = d;
  const commentaires = [...d.commentaires].reverse(); // les plus récents en premier

  zone.innerHTML = `
    <div class="conteneur">
      <div class="barre-reactions">
        <button class="btn-like${d.jaime ? " actif" : ""}" id="like" aria-pressed="${d.jaime}"
          title="${moi ? (d.jaime ? "Retirer mon like" : "J'aime") : "Connecte-toi avec Twitch pour liker"}">
          <span class="coeur">♥</span> <span id="nb-likes">${d.likes}</span></button>
        ${moi ? `<span class="meta">Connecté : <strong>${echapper(moi.login)}</strong> · <button class="lien-bouton" id="deco">Se déconnecter</button></span>` : ""}
      </div>
      <h2>Commentaires (${commentaires.length})</h2>
      ${avertissement ? message(avertissement, "erreur") : ""}
      ${
        moi
          ? `<form id="form-com" class="form-com">
              <textarea name="texte" rows="3" maxlength="500" required placeholder="Écris un commentaire…"></textarea>
              <div class="boutons"><span class="meta" id="compteur-com">0 / 500</span><button class="btn" type="submit">Envoyer</button></div>
            </form>`
          : `<button class="btn btn-twitch" id="connexion-com">Se connecter avec Twitch pour commenter</button>`
      }
      <div id="retour-com"></div>
      <ul class="commentaires">${
        commentaires
          .map(
            (c) => `
        <li class="commentaire">
          <div class="commentaire-tete">
            <strong>${echapper(c.login)}</strong>
            <span class="meta">${ilYA(c.date)}</span>
            ${moi && (moi.admin || moi.login === c.login) ? `<button class="lien-bouton" data-suppr="${echapper(c.id)}">Supprimer</button>` : ""}
          </div>
          <p>${echapper(c.texte)}</p>
        </li>`
          )
          .join("") || `<li class="vide">Aucun commentaire pour l'instant. Sois le premier !</li>`
      }</ul>
    </div>`;

  const retourCom = $("#retour-com");

  $("#like").onclick = async () => {
    if (!moi) return seConnecter();
    try {
      const r = await appelApi(`/likes/${chemin}`, { method: "POST" });
      $("#nb-likes").textContent = r.likes;
      $("#like").classList.toggle("actif", r.jaime);
      $("#like").setAttribute("aria-pressed", r.jaime);
    } catch (e) {
      if (e.statut === 401) return afficherReactions(redif, "Ta connexion a expiré, reconnecte-toi.");
      retourCom.innerHTML = message(e.message, "erreur");
    }
  };

  if (!moi) {
    $("#connexion-com").onclick = seConnecter;
    return;
  }

  $("#deco").onclick = () => {
    deconnexion();
    afficherReactions(redif, "");
  };

  const form = $("#form-com");
  form.texte.addEventListener("input", () => {
    $("#compteur-com").textContent = `${form.texte.value.length} / 500`;
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const bouton = form.querySelector("button[type=submit]");
    bouton.disabled = true;
    try {
      await appelApi(`/commentaires/${chemin}`, { method: "POST", body: JSON.stringify({ texte: form.texte.value }) });
      await afficherReactions(redif, "");
    } catch (err) {
      if (err.statut === 401) return afficherReactions(redif, "Ta connexion a expiré, reconnecte-toi.");
      retourCom.innerHTML = message(err.message, "erreur");
      bouton.disabled = false;
    }
  });

  zone.querySelectorAll("[data-suppr]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm("Supprimer ce commentaire ?")) return;
      try {
        await appelApi(`/commentaires/${chemin}/${encodeURIComponent(b.dataset.suppr)}`, { method: "DELETE" });
        await afficherReactions(redif, "");
      } catch (err) {
        retourCom.innerHTML = message(err.message, "erreur");
      }
    };
  });
}

function carteAutre(item) {
  const contenu = `
    <span class="etiquette">${echapper(item.type || "")}</span>
    <h3>${echapper(item.titre)}</h3>
    <p>${echapper(item.description || "")}</p>`;
  // Seuls les liens web (https://...) sont cliquables
  return /^https?:\/\//i.test(item.lien || "")
    ? `<a class="carte-autre" href="${echapper(item.lien)}" target="_blank" rel="noopener">${contenu}</a>`
    : `<div class="carte-autre">${contenu}</div>`;
}

function pageAutres() {
  $("#liste-autres").innerHTML = INFOS.map(carteAutre).join("") || `<p class="vide">Bientôt…</p>`;
}

function pageAPropos() {
  $("#texte-a-propos").textContent = SITE.aPropos;
  $("#liens-a-propos").innerHTML = SITE.reseaux
    .map((r) => `<a class="btn btn-contour" href="${echapper(r.url)}" target="_blank" rel="noopener">${echapper(r.nom)}</a>`)
    .join("");
}

function pageSoutenir() {
  // Ko-fi fournit un panneau de don à intégrer : le paiement (carte, PayPal) se fait
  // directement sur la page, de façon sécurisée par Ko-fi.
  const pseudoKofi = (SITE.don.match(/ko-fi\.com\/([^/?#]+)/i) || [])[1];
  if (!pseudoKofi) {
    $("#panneau-don").innerHTML = `<p class="vide">Aucun lien Ko-fi configuré dans contenu.js.</p>`;
    return;
  }
  $("#panneau-don").innerHTML = `
    <iframe id="kofiframe" src="https://ko-fi.com/${encodeURIComponent(pseudoKofi)}/?hidefeed=true&widget=true&embed=true&preview=true"
      title="Faire un don à ${echapper(SITE.nom)} sur Ko-fi"></iframe>
    <p class="meta">Le panneau ne s'affiche pas ? <a href="${echapper(SITE.don)}" target="_blank" rel="noopener">Ouvrir ma page Ko-fi</a></p>`;
}

/* ---------- Statut du live (Twitch) ---------- */

// DecAPI renvoie la durée du live en cours ("1 hour, 5 minutes")
// ou "<chaîne> is offline" quand il n'y a pas de live. Pas besoin de clé d'API.
async function twitchEnLive() {
  if (!SITE.chaineTwitch) return false;
  try {
    const rep = await fetch(`https://decapi.me/twitch/uptime/${encodeURIComponent(SITE.chaineTwitch)}`, { cache: "no-store" });
    const texte = rep.ok ? await rep.text() : "";
    return /\d+\s*(second|minute|hour|day)/i.test(texte) && !/offline/i.test(texte);
  } catch {
    return false; // Service injoignable : on considère que c'est OFF.
  }
}

// Kick est vérifié par notre serveur (Kick bloque les appels directs depuis un site).
async function kickEnLive() {
  if (!SITE.chaineKick || !SITE.api) return false;
  try {
    const rep = await fetch(urlApi(`/live?kick=${encodeURIComponent(SITE.chaineKick)}`));
    return rep.ok && (await rep.json()).kick === true;
  } catch {
    return false;
  }
}

async function verifierLive() {
  if (!SITE.chaineTwitch && !SITE.chaineKick) return;
  const [twitch, kick] = await Promise.all([twitchEnLive(), kickEnLive()]);
  afficherLive(twitch ? "twitch" : kick ? "kick" : null);
}

const PLATEFORMES = {
  twitch: {
    nom: "Twitch",
    url: () => `https://twitch.tv/${encodeURIComponent(SITE.chaineTwitch)}`,
    lecteur: () => `https://player.twitch.tv/?channel=${encodeURIComponent(SITE.chaineTwitch)}&parent=${location.hostname || "localhost"}&muted=true`,
  },
  kick: {
    nom: "Kick",
    url: () => `https://kick.com/${encodeURIComponent(SITE.chaineKick)}`,
    lecteur: () => `https://player.kick.com/${encodeURIComponent(SITE.chaineKick)}?muted=true&autoplay=true`,
  },
};

// plateforme = "twitch", "kick" ou null (pas en live)
function afficherLive(plateforme) {
  const p = PLATEFORMES[plateforme];
  document.querySelectorAll(".btn-direct").forEach((b) => {
    b.classList.toggle("hors-ligne", !p);
    b.querySelector(".etat-live").textContent = p ? "EN LIVE" : "Live OFF";
    b.title = p ? `Je suis en live sur ${p.nom}, viens !` : "Pas de live en ce moment";
    if (p) b.href = p.url();
  });
  const bandeau = $("#bandeau-live");
  if (!bandeau || (bandeau.dataset.affiche || "") === (plateforme || "")) return;
  if (p) {
    bandeau.dataset.affiche = plateforme;
    bandeau.hidden = false;
    bandeau.innerHTML = `
      <div class="conteneur">
        <div class="section-titre"><h2><span class="point point-rouge"></span> En live maintenant sur ${p.nom}</h2>
          <a href="${p.url()}" target="_blank" rel="noopener">Ouvrir sur ${p.nom} →</a></div>
        <div class="lecteur"><iframe src="${p.lecteur()}" title="Live de ${echapper(SITE.nom)}" allowfullscreen></iframe></div>
      </div>`;
  } else {
    delete bandeau.dataset.affiche;
    bandeau.hidden = true;
    bandeau.innerHTML = "";
  }
}

/* ---------- Démarrage ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  const retour = traiterRetourTwitch(); // défini dans compte.js
  if (retour.redirige) return; // on repart vers la page où la connexion a été demandée
  ERREUR_CONNEXION = retour.erreur;

  const page = document.body.dataset.page;
  $("#entete").innerHTML = entete(page);
  $("#pied").innerHTML = pied();
  if (!document.title.includes(SITE.nom)) document.title = `${document.title} — ${SITE.nom}`;

  const burger = $(".burger");
  burger.addEventListener("click", () => {
    const ouvert = document.body.classList.toggle("menu-ouvert");
    burger.setAttribute("aria-expanded", ouvert);
  });

  verifierLive();
  setInterval(verifierLive, 2 * 60 * 1000); // re-vérifie toutes les 2 minutes

  await Promise.all([
    ["accueil", "redifs", "video"].includes(page) && chargerRedifs(),
    ["accueil", "autres"].includes(page) && chargerInfos(),
  ]);

  ({
    accueil: pageAccueil,
    redifs: pageRedifs,
    video: pageVideo,
    autres: pageAutres,
    "a-propos": pageAPropos,
    soutenir: pageSoutenir,
    admin: window.pageAdmin, // défini dans admin.js
  })[page]?.();
});
