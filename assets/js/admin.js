/* Administration du site : tableau de bord, rediffs, Info, commentaires, réglages, images, équipe, sauvegarde.
   La connexion Twitch est dans compte.js. */

// Reconnaît un lien YouTube ou Twitch et renvoie { source, video }.
function analyserLien(lien) {
  const texte = (lien || "").trim();
  let m = texte.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})/i);
  if (m) return { source: "youtube", video: m[1] };
  m = texte.match(/twitch\.tv\/videos\/(\d+)/i);
  if (m) return { source: "twitch", video: m[1] };
  if (/^[\w-]{11}$/.test(texte)) return { source: "youtube", video: texte };
  return null;
}

function lienDepuisRedif(r) {
  return r.source === "twitch" ? `https://www.twitch.tv/videos/${r.video}` : `https://www.youtube.com/watch?v=${r.video}`;
}

function seDeconnecter() {
  deconnexionSite(); // défini dans main.js
}

// Doit correspondre à VERSION_SERVEUR dans worker/worker.js
const VERSION_SERVEUR_ATTENDUE = 6;

const ONGLETS = [
  ["tableau", "📊 Tableau de bord"],
  ["rediffs", "🎬 Rediffs"],
  ["info", "ℹ️ Info"],
  ["commentaires", "💬 Commentaires"],
  ["reglages", "⚙ Réglages du site"],
  ["images", "🖼 Images"],
  ["equipe", "👥 Équipe"],
  ["sauvegarde", "💾 Sauvegarde"],
];

/* ---------- Affichage ---------- */

async function afficherAdmin(avertissement = "") {
  const zone = $("#admin");

  if (!SITE.api || !SITE.twitchClientId) {
    zone.innerHTML = message(
      "L'espace admin n'est pas encore configuré : il faut remplir « api » et « twitchClientId » dans assets/js/contenu.js (voir worker/INSTALLATION.md).",
      "erreur"
    );
    return;
  }

  const boutonConnexion = `<button class="btn btn-twitch" id="connexion">Se connecter avec Twitch</button>`;

  if (!stockage("lire", CLE_JETON)) {
    zone.innerHTML = `${avertissement ? message(avertissement, "erreur") : ""}
      <p>Connecte-toi avec ton compte Twitch pour accéder à l'administration.</p>${boutonConnexion}`;
    $("#connexion").onclick = seConnecter;
    return;
  }

  zone.innerHTML = `<p class="meta">Vérification de la connexion…</p>`;
  let moi;
  try {
    moi = await appelApi("/moi");
  } catch (e) {
    if (e.statut === 401) return afficherAdmin("Ta connexion a expiré, reconnecte-toi.");
    zone.innerHTML = message(`Impossible de joindre le serveur : ${e.message}`, "erreur");
    return;
  }

  MOI_ADMIN = moi;
  afficherEntete(moi); // l'onglet Administration apparaît dans le menu
  const role = moi.proprietaire ? "Propriétaire" : moi.admin ? "Modérateur" : "Viewer";
  const barre = `<div class="barre-admin">Connecté : <strong>${echapper(moi.login)}</strong> <span class="badge-role">${role}</span>
    <button class="btn btn-contour btn-petit" id="deconnexion">Se déconnecter</button></div>`;

  if (!moi.admin) {
    zone.innerHTML = barre + message("Ce compte Twitch n'a pas accès à l'administration.", "erreur");
    $("#deconnexion").onclick = seDeconnecter;
    return;
  }

  const serveurAncien = !moi.version || moi.version < VERSION_SERVEUR_ATTENDUE;
  zone.innerHTML = `${barre}
    ${
      serveurAncien
        ? message(
            "⚠️ Le code du serveur Cloudflare n'est pas à jour : certaines parties de l'administration ne marcheront pas. Recolle worker/worker.js dans Cloudflare (julvig-api → Edit code → Deploy).",
            "erreur"
          )
        : ""
    }
    <nav class="onglets" role="tablist">${ONGLETS.map(
      ([cle, nom]) => `<button type="button" role="tab" data-onglet="${cle}" aria-selected="false">${nom}</button>`
    ).join("")}</nav>
    <section class="panneau" data-panneau="tableau" hidden><div id="panneau-tableau"></div></section>
    <section class="panneau" data-panneau="rediffs" hidden>
    <form id="formulaire" class="formulaire" autocomplete="off">
      <h2 id="titre-formulaire">Publier une rediff</h2>
      <label>Lien de la vidéo YouTube *
        <input name="lien" required placeholder="https://www.youtube.com/watch?v=...">
        <small>Mets ta vidéo en « non répertoriée » sur YouTube, puis colle son lien ici. Un lien de VOD Twitch marche aussi.</small>
      </label>
      <div id="apercu-video"></div>
      <label>Titre *<input name="titre" required maxlength="200"></label>
      <div class="ligne">
        <label>Date du stream<input name="date" type="date"></label>
        <label>Durée<input name="duree" placeholder="3h20" maxlength="20"></label>
        <label>Catégorie<input name="categorie" list="categories" placeholder="Just Chatting" maxlength="60"></label>
      </div>
      <datalist id="categories"></datalist>
      <label>Description<textarea name="description" rows="4" maxlength="5000"></textarea></label>
      <label>Chapitres (facultatif)
        <textarea name="chapitres" rows="5" maxlength="5000" placeholder="0:00 Début du stream&#10;12:30 On lance la partie&#10;1:45:10 Le boss final"></textarea>
        <small>Un chapitre par ligne : le moment, puis le titre. Sur le site, ils s'affichent sous la vidéo : un clic fait sauter la vidéo à ce moment.</small>
        <small id="nb-chapitres"></small>
      </label>
      <div id="images-chapitres" class="images-chapitres"></div>
      <input type="file" id="fichier-image" accept="image/*" hidden>
      <div id="retour-formulaire"></div>
      <div class="boutons">
        <button class="btn" type="submit" id="envoyer">Publier</button>
        <button class="btn btn-contour" type="button" id="annuler" hidden>Annuler</button>
      </div>
    </form>
    <h2>Rediffs publiées</h2>
    <div id="liste-admin"></div>
    </section>

    <section class="panneau" data-panneau="info" hidden>
    <form id="formulaire-info" class="formulaire" autocomplete="off">
      <h2 id="titre-formulaire-info">Ajouter une carte Info</h2>
      <div class="ligne ligne-2">
        <label>Titre *<input name="titre" required maxlength="120" placeholder="Planning des streams"></label>
        <label>Étiquette<input name="type" list="types-info" maxlength="30" placeholder="Info">
          <small>Le petit mot en violet au-dessus du titre.</small></label>
      </div>
      <datalist id="types-info"><option value="Info"><option value="Clip"><option value="Planning"><option value="Setup"><option value="Projet"></datalist>
      <label>Texte<textarea name="description" rows="3" maxlength="1000"></textarea></label>
      <label>Lien (facultatif)<input name="lien" type="url" maxlength="500" placeholder="https://...">
        <small>Si tu mets un lien, la carte devient cliquable.</small></label>
      <div id="retour-info"></div>
      <div class="boutons">
        <button class="btn" type="submit" id="envoyer-info">Ajouter</button>
        <button class="btn btn-contour" type="button" id="annuler-info" hidden>Annuler</button>
      </div>
    </form>
    <h2>Cartes Info</h2>
    <p class="meta">Elles s'affichent dans cet ordre sur la page Info. Les 3 premières sont aussi sur l'accueil.</p>
    <div id="liste-infos"></div>
    </section>
    <section class="panneau" data-panneau="commentaires" hidden><div id="panneau-commentaires"></div></section>
    <section class="panneau" data-panneau="reglages" hidden><div id="panneau-reglages"></div></section>
    <section class="panneau" data-panneau="images" hidden><div id="panneau-images"></div></section>
    <section class="panneau" data-panneau="equipe" hidden><div id="panneau-equipe"></div></section>
    <section class="panneau" data-panneau="sauvegarde" hidden><div id="panneau-sauvegarde"></div></section>`;

  $("#deconnexion").onclick = seDeconnecter;
  $(".onglets").addEventListener("click", (e) => {
    const b = e.target.closest("[data-onglet]");
    if (b) ouvrirOnglet(b.dataset.onglet);
  });
  brancherFormulaire();
  const depart = location.hash.slice(1);
  ouvrirOnglet(ONGLETS.some(([cle]) => cle === depart) ? depart : "tableau");
  await rafraichirListe();
  await brancherInfos();
}

let MOI_ADMIN = null;

const CHARGEURS = {
  tableau: () => chargerTableau(),
  commentaires: () => chargerCommentaires(),
  reglages: () => afficherReglages(),
  images: () => chargerImages(),
  equipe: () => chargerEquipe(),
  sauvegarde: () => afficherSauvegarde(),
};

function ouvrirOnglet(nom) {
  document.querySelectorAll("[data-onglet]").forEach((b) => b.setAttribute("aria-selected", b.dataset.onglet === nom));
  document.querySelectorAll("[data-panneau]").forEach((p) => (p.hidden = p.dataset.panneau !== nom));
  history.replaceState(null, "", `#${nom}`);
  CHARGEURS[nom]?.();
}

function chargement(zone) {
  zone.innerHTML = `<p class="meta">Chargement…</p>`;
}

function erreurServeur(zone, err) {
  if (err.statut === 401) return afficherAdmin("Ta connexion a expiré, reconnecte-toi.");
  const ancien = err.statut === 404 && /route inconnue/i.test(err.message);
  zone.innerHTML = message(
    ancien
      ? "Le serveur Cloudflare ne connaît pas encore cette fonction : recolle worker/worker.js dans Cloudflare (Edit code → Deploy)."
      : `Erreur : ${err.message}`,
    "erreur"
  );
}

const nombre = (n) =>
  new Intl.NumberFormat("fr-FR", n >= 10000 ? { notation: "compact", maximumFractionDigits: 1 } : {}).format(n);

/* ---------- Tableau de bord ---------- */

async function chargerTableau() {
  const zone = $("#panneau-tableau");
  chargement(zone);
  let st, coms;
  try {
    [st, coms] = await Promise.all([appelApi("/admin/stats"), appelApi("/admin/commentaires")]);
  } catch (err) {
    return erreurServeur(zone, err);
  }
  const tuiles = [
    ["Rediffs", st.redifs],
    ["Likes", st.likes],
    ["Commentaires", st.commentaires],
    ["Viewers actifs", st.viewers, "comptes qui ont liké ou commenté"],
    ["Images envoyées", st.images],
    ["Comptes bannis", st.bannis],
  ];
  zone.innerHTML = `
    <div class="tuiles">${tuiles
      .map(
        ([label, valeur, aide]) => `
      <div class="tuile"${aide ? ` title="${aide}"` : ""}>
        <span class="tuile-label">${label}</span>
        <span class="tuile-valeur">${nombre(valeur)}</span>
      </div>`
      )
      .join("")}</div>
    <div class="deux-colonnes">
      <div>
        <h2>Rediffs les plus populaires</h2>
        ${
          st.top.length
            ? `<table class="tableau-admin">
                <thead><tr><th>Rediff</th><th>Likes</th><th>Commentaires</th></tr></thead>
                <tbody>${st.top
                  .map(
                    (r) => `<tr><td><a href="video.html?id=${encodeURIComponent(r.id)}">${echapper(r.titre)}</a></td>
                      <td>${nombre(r.likes)}</td><td>${nombre(r.commentaires)}</td></tr>`
                  )
                  .join("")}</tbody>
              </table>`
            : `<p class="vide">Aucune rediff pour l'instant.</p>`
        }
      </div>
      <div>
        <h2>Derniers commentaires</h2>
        ${listeCommentaires(coms.slice(0, 5), false) || `<p class="vide">Aucun commentaire pour l'instant.</p>`}
        ${coms.length ? `<button class="btn btn-contour btn-petit" data-aller="commentaires">Voir tous les commentaires</button>` : ""}
      </div>
    </div>`;
  zone.querySelector("[data-aller]")?.addEventListener("click", () => ouvrirOnglet("commentaires"));
}

/* ---------- Commentaires et bannissements ---------- */

function listeCommentaires(coms, actions) {
  if (!coms.length) return "";
  return `<ul class="commentaires">${coms
    .map(
      (c) => `
    <li class="commentaire">
      <div class="commentaire-tete">
        <strong>${echapper(c.login)}</strong>
        <span class="meta">${ilYA(c.date)} · sur <a href="video.html?id=${encodeURIComponent(c.redif)}">${echapper(c.redifTitre)}</a></span>
        ${
          actions
            ? `<span class="actions-com">
                <button class="lien-bouton" data-suppr-com="${echapper(c.id)}" data-redif="${echapper(c.redif)}">Supprimer</button>
                <button class="lien-bouton danger" data-bannir="${echapper(c.login)}">Bannir</button>
              </span>`
            : ""
        }
      </div>
      <p>${echapper(c.texte)}</p>
    </li>`
    )
    .join("")}</ul>`;
}

async function chargerCommentaires(retour = "") {
  const zone = $("#panneau-commentaires");
  chargement(zone);
  let coms, bannis;
  try {
    [coms, bannis] = await Promise.all([appelApi("/admin/commentaires"), appelApi("/admin/bannis")]);
  } catch (err) {
    return erreurServeur(zone, err);
  }
  zone.innerHTML = `
    ${retour}
    <h2>Tous les commentaires (${coms.length})</h2>
    <input type="search" id="filtre-com" class="champ-recherche" placeholder="Rechercher un pseudo, un mot, une rediff…">
    <div id="liste-com">${listeCommentaires(coms, true) || `<p class="vide">Aucun commentaire pour l'instant.</p>`}</div>

    <h2>Comptes bannis (${bannis.length})</h2>
    <p class="meta">Un compte banni ne peut plus liker ni commenter. Il peut toujours regarder les rediffs.</p>
    <form id="form-bannir" class="ligne-formulaire" autocomplete="off">
      <input name="login" placeholder="Pseudo Twitch" required maxlength="25">
      <label class="case"><input type="checkbox" name="purger"> Supprimer aussi tous ses commentaires</label>
      <button class="btn btn-danger btn-petit" type="submit">Bannir</button>
    </form>
    ${
      bannis.length
        ? `<ul class="liste-simple">${bannis
            .map(
              (b) => `<li><strong>${echapper(b.login)}</strong>
                <span class="meta">${b.date ? `banni ${ilYA(b.date)}` : ""}${b.par ? ` par ${echapper(b.par)}` : ""}</span>
                <button class="btn btn-contour btn-petit" data-debannir="${echapper(b.login)}">Débannir</button></li>`
            )
            .join("")}</ul>`
        : `<p class="vide">Personne n'est banni.</p>`
    }`;

  $("#filtre-com").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    const filtres = coms.filter((c) => `${c.login} ${c.texte} ${c.redifTitre}`.toLowerCase().includes(q));
    $("#liste-com").innerHTML = listeCommentaires(filtres, true) || `<p class="vide">Aucun commentaire ne correspond.</p>`;
  });

  const bannir = async (login, purger) => {
    try {
      const r = await appelApi("/admin/bannis", { method: "POST", body: JSON.stringify({ login, purger }) });
      chargerCommentaires(
        message(`${login} est banni.${r.supprimes ? ` ${r.supprimes} commentaire(s) supprimé(s).` : ""}`, "ok")
      );
    } catch (err) {
      chargerCommentaires(message(err.message, "erreur"));
    }
  };

  // onclick (et pas addEventListener) : la zone est redessinée à chaque action
  zone.onclick = async (e) => {
    const suppr = e.target.closest("[data-suppr-com]");
    const ban = e.target.closest("[data-bannir]");
    const deban = e.target.closest("[data-debannir]");
    if (suppr && confirm("Supprimer ce commentaire ?")) {
      try {
        await appelApi(`/commentaires/${encodeURIComponent(suppr.dataset.redif)}/${encodeURIComponent(suppr.dataset.supprCom)}`, { method: "DELETE" });
        chargerCommentaires(message("Commentaire supprimé.", "ok"));
      } catch (err) {
        chargerCommentaires(message(err.message, "erreur"));
      }
    }
    if (ban) {
      const login = ban.dataset.bannir;
      if (!confirm(`Bannir ${login} ? Il ne pourra plus liker ni commenter.`)) return;
      const nb = coms.filter((c) => c.login === login).length;
      bannir(login, nb > 0 && confirm(`Supprimer aussi ses ${nb} commentaire(s) ?`));
    }
    if (deban) {
      try {
        await appelApi(`/admin/bannis/${encodeURIComponent(deban.dataset.debannir)}`, { method: "DELETE" });
        chargerCommentaires(message(`${deban.dataset.debannir} n'est plus banni.`, "ok"));
      } catch (err) {
        chargerCommentaires(message(err.message, "erreur"));
      }
    }
  };

  $("#form-bannir").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    bannir(f.login.value.trim().toLowerCase(), f.purger.checked);
  });
}

/* ---------- Réglages du site ---------- */

function ligneReseau(r = { nom: "", url: "" }) {
  return `<div class="ligne-reseau">
    <input name="reseau-nom" value="${echapper(r.nom)}" placeholder="Nom (ex : TikTok)" maxlength="30">
    <input name="reseau-url" value="${echapper(r.url)}" placeholder="https://..." maxlength="500">
    <button type="button" class="btn btn-contour btn-petit" data-retirer-reseau title="Retirer">✕</button>
  </div>`;
}

function afficherReglages(retour = "") {
  const zone = $("#panneau-reglages");
  zone.innerHTML = `
    <form id="form-reglages" class="formulaire" autocomplete="off">
      <h2>Réglages du site</h2>
      <label>Slogan de l'accueil<input name="slogan" maxlength="200" value="${echapper(SITE.slogan || "")}"></label>
      <label>Texte de la page « À propos »<textarea name="aPropos" rows="5" maxlength="3000">${echapper(SITE.aPropos || "")}</textarea></label>
      <div class="ligne ligne-2">
        <label>Chaîne Twitch<input name="chaineTwitch" maxlength="40" value="${echapper(SITE.chaineTwitch || "")}">
          <small>Pour le bouton Live. Vide = pas de détection Twitch.</small></label>
        <label>Chaîne Kick<input name="chaineKick" maxlength="40" value="${echapper(SITE.chaineKick || "")}">
          <small>Vide = pas de détection Kick.</small></label>
      </div>
      <div class="ligne ligne-2">
        <label>Lien des dons (Ko-fi)<input name="don" type="url" maxlength="500" value="${echapper(SITE.don || "")}">
          <small>Vide = bouton Soutenir caché.</small></label>
        <label>Invitation Discord<input name="discord" type="url" maxlength="500" value="${echapper(SITE.discord || "")}">
          <small>Vide = bloc Discord caché.</small></label>
      </div>
      <div>
        <strong>Réseaux sociaux</strong>
        <small class="meta"> (bas de page et page À propos)</small>
        <div id="reseaux">${(SITE.reseaux || []).map(ligneReseau).join("")}</div>
        <button type="button" class="btn btn-contour btn-petit" id="ajouter-reseau">+ Ajouter un réseau</button>
      </div>
      ${retour}
      <div class="boutons"><button class="btn" type="submit">Enregistrer les réglages</button></div>
    </form>`;

  const f = $("#form-reglages");
  $("#ajouter-reseau").onclick = () => $("#reseaux").insertAdjacentHTML("beforeend", ligneReseau());
  $("#reseaux").addEventListener("click", (e) => e.target.closest("[data-retirer-reseau]")?.parentElement.remove());
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const reseaux = [...document.querySelectorAll(".ligne-reseau")].map((l) => ({
      nom: l.querySelector("[name=reseau-nom]").value,
      url: l.querySelector("[name=reseau-url]").value,
    }));
    const donnees = {
      slogan: f.slogan.value,
      aPropos: f.aPropos.value,
      chaineTwitch: f.chaineTwitch.value,
      chaineKick: f.chaineKick.value,
      don: f.don.value,
      discord: f.discord.value,
      reseaux,
    };
    try {
      const p = await appelApi("/parametres", { method: "PUT", body: JSON.stringify(donnees) });
      appliquerParametres(p);
      stockage("ecrire", CLE_PARAMETRES, JSON.stringify(p));
      afficherEntete();
      $("#pied").innerHTML = pied();
      afficherReglages(message("Réglages enregistrés : ils sont déjà visibles sur le site.", "ok"));
    } catch (err) {
      if (err.statut === 401) return afficherAdmin("Ta connexion a expiré, reconnecte-toi.");
      afficherReglages(message(err.message, "erreur"));
    }
  });
}

/* ---------- Images envoyées ---------- */

async function chargerImages(retour = "") {
  const zone = $("#panneau-images");
  chargement(zone);
  let images;
  try {
    images = await appelApi("/admin/images");
  } catch (err) {
    return erreurServeur(zone, err);
  }
  const inutilisees = images.filter((i) => !i.utilisations.length);
  zone.innerHTML = `
    ${retour}
    <h2>Images envoyées (${images.length})</h2>
    <p class="meta">Les images que tu as envoyées avec « 📁 Mon image ». Les jaquettes Twitch ne sont pas stockées ici.</p>
    ${
      inutilisees.length
        ? `<button class="btn btn-contour btn-petit" id="nettoyer-images">🧹 Supprimer les ${inutilisees.length} image(s) inutilisée(s)</button>`
        : ""
    }
    <div class="grille-images">${
      images
        .map(
          (i) => `
      <div class="carte-image">
        <img src="${echapper(i.url)}" alt="" loading="lazy">
        <p class="meta">${
          i.utilisations.length
            ? `Utilisée dans : ${i.utilisations.map((u) => `${echapper(u.titre)} (${echapper(u.chapitre)})`).join(", ")}`
            : "Pas utilisée"
        }</p>
        <button class="btn btn-danger btn-petit" data-suppr-image="${echapper(i.id)}" data-utilisee="${i.utilisations.length}">Supprimer</button>
      </div>`
        )
        .join("") || `<p class="vide">Aucune image envoyée.</p>`
    }</div>`;

  const supprimer = (id) => appelApi(`/images/${encodeURIComponent(id)}`, { method: "DELETE" });
  zone.querySelectorAll("[data-suppr-image]").forEach((b) => {
    b.onclick = async () => {
      const utilisee = Number(b.dataset.utilisee);
      if (!confirm(utilisee ? "Cette image est utilisée dans une rediff : elle disparaîtra de la frise. Supprimer quand même ?" : "Supprimer cette image ?")) return;
      try {
        await supprimer(b.dataset.supprImage);
        chargerImages(message("Image supprimée.", "ok"));
      } catch (err) {
        chargerImages(message(err.message, "erreur"));
      }
    };
  });
  $("#nettoyer-images")?.addEventListener("click", async () => {
    if (!confirm(`Supprimer les ${inutilisees.length} image(s) qui ne servent à rien ?`)) return;
    try {
      for (const i of inutilisees) await supprimer(i.id);
      chargerImages(message(`${inutilisees.length} image(s) supprimée(s).`, "ok"));
    } catch (err) {
      chargerImages(message(err.message, "erreur"));
    }
  });
}

/* ---------- Équipe : propriétaire et modérateurs ---------- */

async function chargerEquipe(retour = "") {
  const zone = $("#panneau-equipe");
  chargement(zone);
  let equipe;
  try {
    equipe = await appelApi("/admin/moderateurs");
  } catch (err) {
    return erreurServeur(zone, err);
  }
  const peutModifier = MOI_ADMIN?.proprietaire;
  zone.innerHTML = `
    ${retour}
    <h2>Propriétaire</h2>
    <ul class="liste-simple">${equipe.proprietaires.map((l) => `<li><strong>${echapper(l)}</strong> <span class="badge-role">Propriétaire</span></li>`).join("")}</ul>
    <p class="meta">Le propriétaire est défini dans Cloudflare (variable ADMIN_LOGIN) : il ne peut pas être retiré depuis le site.</p>

    <h2>Modérateurs (${equipe.moderateurs.length})</h2>
    <p class="meta">Les modérateurs ont accès à toute l'administration (rediffs, Info, commentaires, réglages, images, sauvegarde),
      sauf la gestion de l'équipe et la restauration d'une sauvegarde.</p>
    ${
      equipe.moderateurs.length
        ? `<ul class="liste-simple">${equipe.moderateurs
            .map(
              (l) => `<li><strong>${echapper(l)}</strong>
                ${peutModifier ? `<button class="btn btn-contour btn-petit" data-retirer-modo="${echapper(l)}">Retirer</button>` : ""}</li>`
            )
            .join("")}</ul>`
        : `<p class="vide">Aucun modérateur.</p>`
    }
    ${
      peutModifier
        ? `<form id="form-modo" class="ligne-formulaire" autocomplete="off">
            <input name="login" placeholder="Pseudo Twitch du modérateur" required maxlength="25">
            <button class="btn btn-petit" type="submit">Ajouter</button>
          </form>`
        : message("Seul le propriétaire peut ajouter ou retirer des modérateurs.")
    }`;
  if (!peutModifier) return;

  const enregistrer = async (liste, texte) => {
    try {
      await appelApi("/admin/moderateurs", { method: "PUT", body: JSON.stringify({ moderateurs: liste }) });
      chargerEquipe(message(texte, "ok"));
    } catch (err) {
      chargerEquipe(message(err.message, "erreur"));
    }
  };
  $("#form-modo").addEventListener("submit", (e) => {
    e.preventDefault();
    const login = e.target.login.value.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,25}$/.test(login)) return chargerEquipe(message("Pseudo Twitch invalide.", "erreur"));
    enregistrer([...equipe.moderateurs, login], `${login} est maintenant modérateur.`);
  });
  zone.querySelectorAll("[data-retirer-modo]").forEach((b) => {
    b.onclick = () => {
      const login = b.dataset.retirerModo;
      if (confirm(`Retirer ${login} des modérateurs ?`)) enregistrer(equipe.moderateurs.filter((l) => l !== login), `${login} n'est plus modérateur.`);
    };
  });
}

/* ---------- Sauvegarde ---------- */

function afficherSauvegarde(retour = "") {
  const zone = $("#panneau-sauvegarde");
  const proprietaire = MOI_ADMIN?.proprietaire;
  zone.innerHTML = `
    ${retour}
    <h2>Télécharger une sauvegarde</h2>
    <p class="meta">Un fichier avec toutes les données du site : rediffs, chapitres, cartes Info, réglages, likes, commentaires, équipe et bannis.
      Les fichiers des images envoyées restent sur le serveur (seule leur liste est sauvegardée).</p>
    <button class="btn" id="exporter">💾 Télécharger la sauvegarde</button>

    <h2>Restaurer une sauvegarde</h2>
    ${
      proprietaire
        ? `<p class="meta">⚠️ Remplace TOUTES les données actuelles du site par celles du fichier.</p>
          <input type="file" id="fichier-sauvegarde" accept=".json,application/json" hidden>
          <button class="btn btn-danger" id="importer">Restaurer depuis un fichier…</button>`
        : message("Seul le propriétaire peut restaurer une sauvegarde.")
    }`;

  $("#exporter").onclick = async () => {
    try {
      const donnees = await appelApi("/admin/export");
      const lien = document.createElement("a");
      lien.href = URL.createObjectURL(new Blob([JSON.stringify(donnees, null, 2)], { type: "application/json" }));
      lien.download = `sauvegarde-site-${new Date().toISOString().slice(0, 10)}.json`;
      lien.click();
      setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
      afficherSauvegarde(message(`Sauvegarde téléchargée (${donnees.redifs.length} rediff(s)).`, "ok"));
    } catch (err) {
      erreurServeur(zone, err);
    }
  };
  if (!proprietaire) return;

  const fichier = $("#fichier-sauvegarde");
  $("#importer").onclick = () => fichier.click();
  fichier.onchange = async () => {
    const f = fichier.files[0];
    fichier.value = "";
    if (!f) return;
    let donnees;
    try {
      donnees = JSON.parse(await f.text());
    } catch {
      return afficherSauvegarde(message("Ce fichier n'est pas une sauvegarde valide.", "erreur"));
    }
    const nb = Array.isArray(donnees.redifs) ? donnees.redifs.length : 0;
    const date = donnees.date ? new Date(donnees.date).toLocaleString("fr-FR") : "date inconnue";
    if (!confirm(`Restaurer la sauvegarde du ${date} (${nb} rediff(s)) ?\n\nToutes les données actuelles du site seront remplacées.`)) return;
    try {
      const r = await appelApi("/admin/import", { method: "POST", body: JSON.stringify(donnees) });
      alert(`Sauvegarde restaurée : ${r.redifs} rediff(s). La page va se recharger.`);
      location.reload();
    } catch (err) {
      if (err.statut === 401) return afficherAdmin("Ta connexion a expiré, reconnecte-toi.");
      afficherSauvegarde(message(err.message, "erreur"));
    }
  };
}

let enEdition = null; // id de la rediff en cours de modification

function reinitialiserFormulaire() {
  const f = $("#formulaire");
  f.reset();
  f.date.value = new Date().toISOString().slice(0, 10);
  enEdition = null;
  $("#titre-formulaire").textContent = "Publier une rediff";
  $("#envoyer").textContent = "Publier";
  $("#annuler").hidden = true;
  $("#apercu-video").innerHTML = "";
  $("#nb-chapitres").innerHTML = "";
  imagesEdition = {};
  $("#images-chapitres").innerHTML = "";
}

function afficherApercu(lien) {
  const v = analyserLien(lien);
  const zone = $("#apercu-video");
  if (!lien.trim()) return (zone.innerHTML = "");
  if (!v) return (zone.innerHTML = message("Lien non reconnu. Colle un lien YouTube (ou de VOD Twitch).", "erreur"));
  zone.innerHTML =
    v.source === "youtube"
      ? `<img class="apercu-miniature" src="https://i.ytimg.com/vi/${v.video}/mqdefault.jpg" alt="">`
      : message("VOD Twitch reconnue.", "ok");
  return v;
}

function compterChapitres() {
  afficherImagesChapitres();
  const texte = $("#formulaire").chapitres.value;
  const n = analyserChapitres(texte).length; // défini dans main.js
  $("#nb-chapitres").innerHTML = !texte.trim()
    ? ""
    : n
      ? `<span class="ok">✔ ${n} chapitre${n > 1 ? "s" : ""} reconnu${n > 1 ? "s" : ""}</span>`
      : `<span class="ko">Aucun chapitre reconnu : mets un moment comme 12:30 sur chaque ligne.</span>`;
}

/* ---------- Images des chapitres ---------- */

let imagesEdition = {}; // { "Titre du chapitre": "https://..." }
const dejaCherches = new Set(); // titres déjà cherchés automatiquement sur Twitch
let titreImageEnCours = null; // chapitre pour lequel on choisit un fichier
let minuteurImages = null;

const normaliser = (t) => String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

function titresChapitres() {
  return [...new Set(analyserChapitres($("#formulaire").chapitres.value).map((c) => c.titre))];
}

// Cherche la jaquette d'un jeu / d'une catégorie Twitch à partir du titre du chapitre.
// exact = true : seulement si le nom correspond exactement (pour la recherche automatique).
async function jaquetteTwitch(titre, exact) {
  const jeton = stockage("lire", CLE_JETON);
  const rep = await fetch(`https://api.twitch.tv/helix/search/categories?first=10&query=${encodeURIComponent(titre)}`, {
    headers: { Authorization: `Bearer ${jeton}`, "Client-Id": SITE.twitchClientId },
  });
  if (!rep.ok) return null;
  const { data = [] } = await rep.json();
  const trouve = data.find((c) => normaliser(c.name) === normaliser(titre)) || (!exact && data[0]);
  return trouve ? trouve.box_art_url.replace(/-(\{width\}x\{height\}|\d+x\d+)\./, "-285x380.") : null;
}

function afficherImagesChapitres() {
  const zone = $("#images-chapitres");
  const titres = titresChapitres();
  if (!titres.length) return (zone.innerHTML = "");
  zone.innerHTML = `
    <strong>Images des chapitres</strong>
    <small>Si le titre est le nom d'un jeu Twitch, sa jaquette est trouvée toute seule. Sinon, clique sur 🔍 ou choisis ta propre image.</small>
    ${titres
      .map(
        (t) => `
      <div class="ligne-image" data-titre="${echapper(t)}">
        <span class="vignette" style="--c:${couleurChapitre(t)}"><span class="initiale">${echapper(t.charAt(0).toUpperCase())}</span>${
          imagesEdition[t] ? `<img src="${echapper(imagesEdition[t])}" alt="" onerror="this.remove()">` : ""
        }</span>
        <span class="ligne-image-titre">${echapper(t)}</span>
        <button type="button" class="btn btn-contour btn-petit" data-image="twitch" title="Chercher la jaquette sur Twitch">🔍 Twitch</button>
        <button type="button" class="btn btn-contour btn-petit" data-image="fichier">📁 Mon image</button>
        ${imagesEdition[t] ? `<button type="button" class="btn btn-contour btn-petit" data-image="retirer" title="Retirer l'image">✕</button>` : ""}
      </div>`
      )
      .join("")}
    <div id="retour-images"></div>`;

  // Recherche automatique des jaquettes (après une petite pause dans la saisie)
  clearTimeout(minuteurImages);
  minuteurImages = setTimeout(async () => {
    let change = false;
    for (const t of titresChapitres()) {
      if (imagesEdition[t] || dejaCherches.has(t)) continue;
      dejaCherches.add(t);
      const url = await jaquetteTwitch(t, true).catch(() => null);
      if (url && !imagesEdition[t]) {
        imagesEdition[t] = url;
        change = true;
      }
    }
    if (change) afficherImagesChapitres();
  }, 800);
}

// Redimensionne l'image (480 px max) et l'envoie au serveur
async function envoyerImage(fichier) {
  const img = await createImageBitmap(fichier);
  const echelle = Math.min(1, 480 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * echelle);
  canvas.height = Math.round(img.height * echelle);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
  const rep = await fetch(urlApi("/images"), {
    method: "POST",
    headers: { Authorization: `Bearer ${stockage("lire", CLE_JETON)}`, "Content-Type": "image/jpeg" },
    body: blob,
  });
  const donnees = await rep.json().catch(() => ({}));
  if (!rep.ok) throw new Error(donnees.erreur || `Erreur ${rep.status}`);
  return donnees.url;
}

function brancherImagesChapitres() {
  const fichier = $("#fichier-image");

  $("#images-chapitres").addEventListener("click", async (e) => {
    const bouton = e.target.closest("[data-image]");
    if (!bouton) return;
    const titre = bouton.closest(".ligne-image").dataset.titre;
    const action = bouton.dataset.image;

    if (action === "retirer") {
      delete imagesEdition[titre];
      dejaCherches.add(titre); // ne pas la remettre automatiquement
      afficherImagesChapitres();
    }
    if (action === "fichier") {
      titreImageEnCours = titre;
      fichier.click();
    }
    if (action === "twitch") {
      bouton.disabled = true;
      const url = await jaquetteTwitch(titre, false).catch(() => null);
      if (url) {
        imagesEdition[titre] = url;
        afficherImagesChapitres();
      } else {
        bouton.disabled = false;
        $("#retour-images").innerHTML = message(`Aucune catégorie Twitch trouvée pour « ${titre} ».`, "erreur");
      }
    }
  });

  fichier.addEventListener("change", async () => {
    const f = fichier.files[0];
    fichier.value = "";
    if (!f || !titreImageEnCours) return;
    const titre = titreImageEnCours;
    $("#retour-images").innerHTML = message("Envoi de l'image…");
    try {
      imagesEdition[titre] = await envoyerImage(f);
      afficherImagesChapitres();
    } catch (err) {
      $("#retour-images").innerHTML = message(`Impossible d'envoyer l'image : ${err.message}`, "erreur");
    }
  });
}

function brancherFormulaire() {
  const f = $("#formulaire");
  reinitialiserFormulaire();

  f.lien.addEventListener("input", async () => {
    const v = afficherApercu(f.lien.value);
    // Remplit le titre automatiquement depuis YouTube
    if (v?.source === "youtube" && !f.titre.value.trim()) {
      try {
        const { titre } = await appelApi(`/apercu?url=${encodeURIComponent(lienDepuisRedif(v))}`);
        if (titre && !f.titre.value.trim()) f.titre.value = titre;
      } catch {
        // Pas grave, le titre se remplit à la main.
      }
    }
  });

  f.chapitres.addEventListener("input", compterChapitres);
  brancherImagesChapitres();

  $("#annuler").onclick = reinitialiserFormulaire;

  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = analyserLien(f.lien.value);
    const retour = $("#retour-formulaire");
    if (!v) return (retour.innerHTML = message("Le lien de la vidéo n'est pas reconnu.", "erreur"));

    const donnees = {
      titre: f.titre.value,
      date: f.date.value,
      duree: f.duree.value,
      categorie: f.categorie.value,
      description: f.description.value,
      chapitres: f.chapitres.value,
      // on ne garde que les images des chapitres encore présents
      imagesChapitres: Object.fromEntries(titresChapitres().filter((t) => imagesEdition[t]).map((t) => [t, imagesEdition[t]])),
      ...v,
    };
    const bouton = $("#envoyer");
    bouton.disabled = true;
    try {
      const enregistree = enEdition
        ? await appelApi(`/redifs/${encodeURIComponent(enEdition)}`, { method: "PUT", body: JSON.stringify(donnees) })
        : await appelApi("/redifs", { method: "POST", body: JSON.stringify(donnees) });
      const texte = enEdition ? "Rediff modifiée !" : "Rediff publiée ! Elle est déjà visible sur le site.";
      reinitialiserFormulaire();
      retour.innerHTML = message(texte, "ok");
      // Un ancien code du serveur ne connaît pas les chapitres et les ignore sans rien dire
      const imagesPerdues = Object.keys(donnees.imagesChapitres).length && !enregistree.imagesChapitres;
      if ((donnees.chapitres.trim() && !enregistree.chapitres) || imagesPerdues) {
        retour.innerHTML += message(
          "⚠️ Le serveur n'a pas enregistré les chapitres ou leurs images : son code n'est pas à jour. Recolle worker/worker.js dans Cloudflare (Edit code → Deploy), puis modifie à nouveau cette rediff.",
          "erreur"
        );
      }
      await rafraichirListe();
    } catch (err) {
      if (err.statut === 401) return afficherAdmin("Ta connexion a expiré, reconnecte-toi.");
      retour.innerHTML = message(err.message, "erreur");
    } finally {
      bouton.disabled = false;
    }
  });
}

async function rafraichirListe() {
  await chargerRedifs();
  const liste = redifsTriees();
  const categories = [...new Set(liste.map((r) => r.categorie).filter(Boolean))];
  $("#categories").innerHTML = categories.map((c) => `<option value="${echapper(c)}">`).join("");

  const fixes = new Set(SITE.redifs.map((r) => r.id));
  $("#liste-admin").innerHTML =
    liste
      .map(
        (r) => `
      <div class="ligne-admin">
        <img src="${echapper(miniature(r) || "")}" alt="" onerror="this.style.visibility='hidden'">
        <div class="ligne-admin-infos">
          <a href="video.html?id=${encodeURIComponent(r.id)}"><strong>${echapper(r.titre)}</strong></a>
          <p class="meta">${formaterDate(r.date)}${r.categorie ? ` · ${echapper(r.categorie)}` : ""}</p>
        </div>
        ${
          fixes.has(r.id)
            ? `<span class="meta">Dans contenu.js</span>`
            : `<div class="boutons">
                <button class="btn btn-contour btn-petit" data-modifier="${echapper(r.id)}">Modifier</button>
                <button class="btn btn-danger btn-petit" data-supprimer="${echapper(r.id)}">Supprimer</button>
              </div>`
        }
      </div>`
      )
      .join("") || `<p class="vide">Aucune rediff publiée pour l'instant.</p>`;

  $("#liste-admin").onclick = async (e) => {
    const idModif = e.target.dataset.modifier;
    const idSuppr = e.target.dataset.supprimer;
    const r = REDIFS.find((x) => x.id === (idModif || idSuppr));
    if (!r) return;

    if (idModif) {
      const f = $("#formulaire");
      enEdition = r.id;
      f.lien.value = lienDepuisRedif(r);
      f.titre.value = r.titre || "";
      f.date.value = r.date || "";
      f.duree.value = r.duree || "";
      f.categorie.value = r.categorie || "";
      f.description.value = r.description || "";
      f.chapitres.value = r.chapitres || "";
      imagesEdition = { ...(r.imagesChapitres || {}) };
      compterChapitres();
      afficherApercu(f.lien.value);
      $("#titre-formulaire").textContent = "Modifier la rediff";
      $("#envoyer").textContent = "Enregistrer";
      $("#annuler").hidden = false;
      $("#retour-formulaire").innerHTML = "";
      f.scrollIntoView({ behavior: "smooth" });
    }

    if (idSuppr && confirm(`Supprimer « ${r.titre} » du site ?\n(La vidéo reste sur YouTube.)`)) {
      try {
        await appelApi(`/redifs/${encodeURIComponent(r.id)}`, { method: "DELETE" });
        if (enEdition === r.id) reinitialiserFormulaire();
        await rafraichirListe();
      } catch (err) {
        alert(err.message);
      }
    }
  };
}

/* ---------- Cartes Info ---------- */

let infosAdmin = [];
let infoEnEdition = null; // position de la carte en cours de modification

async function brancherInfos() {
  await chargerInfos(); // défini dans main.js
  // Les liens qui ne sont pas des adresses web (ex: "#setup") sont ignorés, sinon le serveur refuserait la liste.
  infosAdmin = INFOS.map((i) => ({
    titre: i.titre || "",
    type: i.type || "",
    description: i.description || "",
    lien: /^https?:\/\//i.test(i.lien || "") ? i.lien : "",
  }));
  const f = $("#formulaire-info");
  reinitialiserInfo();
  afficherInfos();

  $("#annuler-info").onclick = reinitialiserInfo;

  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const carte = { titre: f.titre.value.trim(), type: f.type.value.trim(), description: f.description.value.trim(), lien: f.lien.value.trim() };
    const nouvelles = [...infosAdmin];
    if (infoEnEdition === null) nouvelles.push(carte);
    else nouvelles[infoEnEdition] = carte;
    const texte = infoEnEdition === null ? "Carte ajoutée !" : "Carte modifiée !";
    if (await enregistrerInfos(nouvelles, $("#envoyer-info"))) {
      reinitialiserInfo();
      $("#retour-info").innerHTML = message(texte, "ok");
    }
  });

  $("#liste-infos").onclick = async (e) => {
    const bouton = e.target.closest("button[data-action]");
    if (!bouton) return;
    const i = Number(bouton.dataset.index);
    const nouvelles = [...infosAdmin];
    const action = bouton.dataset.action;

    if (action === "modifier") {
      const carte = infosAdmin[i];
      infoEnEdition = i;
      f.titre.value = carte.titre;
      f.type.value = carte.type;
      f.description.value = carte.description;
      f.lien.value = carte.lien;
      $("#titre-formulaire-info").textContent = "Modifier la carte";
      $("#envoyer-info").textContent = "Enregistrer";
      $("#annuler-info").hidden = false;
      $("#retour-info").innerHTML = "";
      f.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (action === "monter" && i > 0) [nouvelles[i - 1], nouvelles[i]] = [nouvelles[i], nouvelles[i - 1]];
    else if (action === "descendre" && i < nouvelles.length - 1) [nouvelles[i + 1], nouvelles[i]] = [nouvelles[i], nouvelles[i + 1]];
    else if (action === "supprimer") {
      if (!confirm(`Supprimer la carte « ${infosAdmin[i].titre} » ?`)) return;
      nouvelles.splice(i, 1);
    } else return;
    if (infoEnEdition !== null) reinitialiserInfo();
    await enregistrerInfos(nouvelles, bouton);
  };
}

function reinitialiserInfo() {
  $("#formulaire-info").reset();
  infoEnEdition = null;
  $("#titre-formulaire-info").textContent = "Ajouter une carte Info";
  $("#envoyer-info").textContent = "Ajouter";
  $("#annuler-info").hidden = true;
  $("#retour-info").innerHTML = "";
}

async function enregistrerInfos(nouvelles, bouton) {
  bouton.disabled = true;
  try {
    infosAdmin = await appelApi("/infos", { method: "PUT", body: JSON.stringify(nouvelles) });
    afficherInfos();
    return true;
  } catch (err) {
    if (err.statut === 401) {
      afficherAdmin("Ta connexion a expiré, reconnecte-toi.");
      return false;
    }
    $("#retour-info").innerHTML = message(err.message, "erreur");
    return false;
  } finally {
    bouton.disabled = false;
  }
}

function afficherInfos() {
  const dernier = infosAdmin.length - 1;
  $("#liste-infos").innerHTML =
    infosAdmin
      .map(
        (c, i) => `
      <div class="ligne-admin">
        <div class="ligne-admin-infos">
          ${c.type ? `<span class="etiquette">${echapper(c.type)}</span>` : ""}
          <strong>${echapper(c.titre)}</strong>
          <p class="meta">${echapper(c.description)}${c.lien ? `<br>🔗 ${echapper(c.lien)}` : ""}</p>
        </div>
        <div class="boutons">
          <button class="btn btn-contour btn-petit" data-action="monter" data-index="${i}" ${i === 0 ? "disabled" : ""} aria-label="Monter">↑</button>
          <button class="btn btn-contour btn-petit" data-action="descendre" data-index="${i}" ${i === dernier ? "disabled" : ""} aria-label="Descendre">↓</button>
          <button class="btn btn-contour btn-petit" data-action="modifier" data-index="${i}">Modifier</button>
          <button class="btn btn-danger btn-petit" data-action="supprimer" data-index="${i}">Supprimer</button>
        </div>
      </div>`
      )
      .join("") || `<p class="vide">Aucune carte pour l'instant.</p>`;
}

window.pageAdmin = () => afficherAdmin(ERREUR_CONNEXION || "");
