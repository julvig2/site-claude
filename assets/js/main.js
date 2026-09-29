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
  const direct = SITE.chaineTwitch
    ? `<a class="btn-direct hors-ligne" href="https://twitch.tv/${encodeURIComponent(SITE.chaineTwitch)}" target="_blank" rel="noopener"><span class="point"></span><span class="etat-live">Live OFF</span></a>`
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
    <p class="description">${echapper(redif.description || "")}</p>`;
  const suite = liste.filter((r) => r.id !== id).slice(0, 4);
  $("#suggestions").innerHTML = suite.map(carte).join("");
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
async function verifierLive() {
  if (!SITE.chaineTwitch) return;
  let enLive = false;
  try {
    const rep = await fetch(`https://decapi.me/twitch/uptime/${encodeURIComponent(SITE.chaineTwitch)}`, { cache: "no-store" });
    const texte = rep.ok ? await rep.text() : "";
    enLive = /\d+\s*(second|minute|hour|day)/i.test(texte) && !/offline/i.test(texte);
  } catch {
    // Service injoignable : on laisse le bouton sur OFF.
  }
  afficherLive(enLive);
}

function afficherLive(enLive) {
  document.querySelectorAll(".btn-direct").forEach((b) => {
    b.classList.toggle("hors-ligne", !enLive);
    b.querySelector(".etat-live").textContent = enLive ? "EN LIVE" : "Live OFF";
    b.title = enLive ? "Je suis en live, viens !" : "Pas de live en ce moment";
  });
  const bandeau = $("#bandeau-live");
  if (!bandeau) return;
  if (enLive && !bandeau.dataset.affiche) {
    bandeau.dataset.affiche = "1";
    bandeau.hidden = false;
    bandeau.innerHTML = `
      <div class="conteneur">
        <div class="section-titre"><h2><span class="point point-rouge"></span> En live maintenant</h2>
          <a href="https://twitch.tv/${encodeURIComponent(SITE.chaineTwitch)}" target="_blank" rel="noopener">Ouvrir sur Twitch →</a></div>
        <div class="lecteur"><iframe src="https://player.twitch.tv/?channel=${encodeURIComponent(SITE.chaineTwitch)}&parent=${location.hostname || "localhost"}&muted=true"
          title="Live de ${echapper(SITE.nom)}" allowfullscreen></iframe></div>
      </div>`;
  } else if (!enLive && bandeau.dataset.affiche) {
    delete bandeau.dataset.affiche;
    bandeau.hidden = true;
    bandeau.innerHTML = "";
  }
}

/* ---------- Démarrage ---------- */

document.addEventListener("DOMContentLoaded", async () => {
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
