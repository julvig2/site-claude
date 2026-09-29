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

function redifsTriees() {
  return [...SITE.redifs].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

/* ---------- En-tête et pied de page communs ---------- */

function entete(page) {
  const liens = [
    ["accueil", "index.html", "Accueil"],
    ["redifs", "redifs.html", "Rediffs"],
    ["autres", "autres.html", "Le reste"],
    ["a-propos", "a-propos.html", "À propos"],
  ];
  const nav = liens
    .map(([cle, href, txt]) => `<a href="${href}"${cle === page ? ' aria-current="page"' : ""}>${txt}</a>`)
    .join("");
  const direct = SITE.chaineTwitch
    ? `<a class="btn-direct" href="https://twitch.tv/${encodeURIComponent(SITE.chaineTwitch)}" target="_blank" rel="noopener"><span class="point"></span>Le live</a>`
    : "";
  return `
    <div class="conteneur entete-inner">
      <a class="logo" href="index.html">${echapper(SITE.nom)}</a>
      <button class="burger" aria-label="Menu" aria-expanded="false">☰</button>
      <nav class="nav">${nav}${direct}</nav>
    </div>`;
}

function pied() {
  const reseaux = SITE.reseaux
    .map((r) => `<a href="${echapper(r.url)}" target="_blank" rel="noopener">${echapper(r.nom)}</a>`)
    .join("");
  return `
    <div class="conteneur pied-inner">
      <div class="reseaux">${reseaux}</div>
      <p>© ${new Date().getFullYear()} ${echapper(SITE.nom)}</p>
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
  $("#apercu-autres").innerHTML = SITE.autres.slice(0, 3).map(carteAutre).join("");
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
  return item.lien
    ? `<a class="carte-autre" href="${echapper(item.lien)}"${/^https?:/.test(item.lien) ? ' target="_blank" rel="noopener"' : ""}>${contenu}</a>`
    : `<div class="carte-autre">${contenu}</div>`;
}

function pageAutres() {
  $("#liste-autres").innerHTML = SITE.autres.map(carteAutre).join("") || `<p class="vide">Bientôt…</p>`;
}

function pageAPropos() {
  $("#texte-a-propos").textContent = SITE.aPropos;
  $("#liens-a-propos").innerHTML = SITE.reseaux
    .map((r) => `<a class="btn btn-contour" href="${echapper(r.url)}" target="_blank" rel="noopener">${echapper(r.nom)}</a>`)
    .join("");
}

/* ---------- Démarrage ---------- */

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  $("#entete").innerHTML = entete(page);
  $("#pied").innerHTML = pied();
  if (!document.title.includes(SITE.nom)) document.title = `${document.title} — ${SITE.nom}`;

  const burger = $(".burger");
  burger.addEventListener("click", () => {
    const ouvert = document.body.classList.toggle("menu-ouvert");
    burger.setAttribute("aria-expanded", ouvert);
  });

  ({
    accueil: pageAccueil,
    redifs: pageRedifs,
    video: pageVideo,
    autres: pageAutres,
    "a-propos": pageAPropos,
  })[page]?.();
});
