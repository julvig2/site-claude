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
const VERSION_SERVEUR_ATTENDUE = 9;

const ONGLETS = [
  ["tableau", "📊 Tableau de bord"],
  ["rediffs", "🎬 Rediffs"],
  ["info", "ℹ️ Info"],
  ["commentaires", "💬 Commentaires"],
  ["reglages", "⚙ Réglages du site"],
  ["images", "🖼 Images"],
  ["equipe", "👥 Équipe"],
  ["sauvegarde", "💾 Sauvegarde"],
  ["bot", "🤖 Bot Discord"],
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
    <section class="panneau" data-panneau="sauvegarde" hidden><div id="panneau-sauvegarde"></div></section>
    <section class="panneau" data-panneau="bot" hidden><div id="panneau-bot"></div></section>`;

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
  bot: () => chargerBot(),
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

// Les annonces de rediffs du bot Discord sont-elles activées ? (réglages du site, sinon ceux en vigueur dans le bot)
async function annoncesRediffsActives() {
  try {
    const bot = BOT || (await appelApi("/admin/bot"));
    const config = bot.config || bot.etat?.config || {};
    return Boolean(config.rediffNotif?.channelId);
  } catch {
    return false; // pas de bot, ou serveur pas à jour : on n'affiche rien
  }
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
      const nouvelle = !enEdition;
      reinitialiserFormulaire();
      retour.innerHTML = message(texte, "ok");
      if (nouvelle && (await annoncesRediffsActives())) {
        retour.innerHTML += message("🎬 Le bot l'annoncera sur Discord dans moins de 5 min.", "ok");
      }
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

/* ---------- Bot Discord ----------
 * Le bot n'est pas joignable depuis Internet : c'est lui qui contacte le serveur toutes les 10 s.
 * Ici, on écrit les réglages (bot:config) et les actions (bot:actions) ; on lit l'état envoyé par le bot (bot:etat).
 * Tout texte venant de l'état du bot passe par echapper().
 */

let BOT = null; // { config, etat, actions, enLigne }

const LIBELLES_ACTIONS_BOT = {
  ticket_panel: "Envoyer le panel de tickets",
  ticket_fermer: "Fermer un ticket",
  giveaway_creer: "Créer un giveaway",
  giveaway_terminer: "Terminer un giveaway",
  giveaway_supprimer: "Supprimer un giveaway",
  giveaway_reroll: "Reroll d'un giveaway",
  sondage_creer: "Créer un sondage",
  sondage_terminer: "Terminer un sondage",
  annonce: "Annonce",
  vip_ajouter: "Ajouter un VIP",
  vip_retirer: "Retirer un VIP",
  blacklist_ajouter: "Ajouter à la blacklist",
  blacklist_retirer: "Retirer de la blacklist",
  sanction_supprimer: "Supprimer une sanction",
  compteur_creer: "Créer le salon compteur",
  roles_publier: "Publier un panneau de rôles",
  roles_supprimer: "Supprimer un panneau de rôles",
  live_test: "Tester la notification de live",
  rediff_test: "Tester l'annonce de rediff",
  sauvegarde_maintenant: "Sauvegarder maintenant",
};

const ENVOYE_AU_BOT = "Envoyé, le bot l'appliquera dans moins d'une minute.";
const DUREE_BOT = /^(\d+[jhms])+$/i; // 30m, 2h, 7j, 1j12h
const lienHttps = (v) => /^https:\/\/[^\s"'<>]+$/i.test(v || "");
const couleurSure = (c) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c : null);
const dateBot = (ms) => (ms ? new Date(ms).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");
const ilYaBot = (ms) => (ms ? ilYA(new Date(ms).toISOString()) : "—");
// Champs des actions : rattachés à un formulaire inexistant, pour que « Entrée » n'enregistre pas les réglages
const HORS_FORM = 'form="hors-formulaire"';

function salonsBot(type) {
  return BOT?.etat?.salons?.[type] || [];
}

function nomSalonBot(id) {
  const tous = [...salonsBot("texte"), ...salonsBot("vocal"), ...salonsBot("categories")];
  const s = tous.find((x) => x.id === id);
  return s ? `#${s.nom}` : id ? `salon ${id}` : "—";
}

function optionsSalonsBot(type, valeur, vide = "— Aucun —") {
  const liste = salonsBot(type);
  const inconnu = valeur && !liste.some((s) => s.id === valeur);
  return [
    vide === null ? "" : `<option value="">${vide}</option>`,
    inconnu ? `<option value="${echapper(valeur)}" selected>Salon inconnu (${echapper(valeur)})</option>` : "",
    ...liste.map(
      (s) =>
        `<option value="${echapper(s.id)}"${s.id === valeur ? " selected" : ""}>${type === "categories" ? "" : "#"}${echapper(s.nom)}${
          s.categorie ? ` — ${echapper(s.categorie)}` : ""
        }</option>`
    ),
  ].join("");
}

function optionsRolesBot(valeur, vide = "— Aucun —") {
  const roles = BOT?.etat?.roles || [];
  const inconnu = valeur && !roles.some((r) => r.id === valeur);
  return [
    vide === null ? "" : `<option value="">${vide}</option>`,
    inconnu ? `<option value="${echapper(valeur)}" selected>Rôle inconnu (${echapper(valeur)})</option>` : "",
    ...roles.map(
      (r) =>
        `<option value="${echapper(r.id)}"${r.id === valeur ? " selected" : ""}>@${echapper(r.nom)}${
          r.attribuable === false ? " (au-dessus du bot)" : ""
        }</option>`
    ),
  ].join("");
}

async function chargerBot(retour = "") {
  const zone = $("#panneau-bot");
  chargement(zone);
  try {
    BOT = await appelApi("/admin/bot");
  } catch (err) {
    return erreurServeur(zone, err);
  }
  afficherBot(retour);
}

function bloc(titre, contenu, ouvert = false) {
  return `<details class="bloc-bot"${ouvert ? " open" : ""}><summary>${titre}</summary><div class="bloc-bot-contenu">${contenu}</div></details>`;
}

/* ----- Statut ----- */

function htmlStatutBot() {
  const e = BOT.etat;
  const c = BOT.config;
  const pastille = BOT.enLigne
    ? `<span class="pastille en-ligne">● En ligne</span>`
    : `<span class="pastille hors-ligne">● Hors ligne</span>`;
  if (!e) {
    return `${pastille}${message("Lance le bot une première fois (npm start) pour qu'il envoie la liste des salons et des rôles.", "erreur")}`;
  }
  let reglages;
  if (!c) reglages = `<span class="meta">Aucun réglage enregistré depuis le site : le bot utilise ses propres réglages.</span>`;
  else if ((e.configAppliquee || 0) >= c.version) reglages = `✅ Réglages appliqués (${dateBot(c.version)})`;
  else
    reglages = `⏳ Réglages en attente : ${
      BOT.enLigne ? "le bot les appliquera dans moins d'une minute." : "le bot les appliquera dès qu'il sera en ligne."
    }`;
  const icone = lienHttps(e.serveur?.icone) ? `<img class="icone-serveur" src="${echapper(e.serveur.icone)}" alt="" onerror="this.remove()">` : "";
  const avatar = lienHttps(e.bot?.avatar) ? `<img class="icone-serveur petite" src="${echapper(e.bot.avatar)}" alt="" onerror="this.remove()">` : "";
  const avertissements = Array.isArray(e.avertissements) ? e.avertissements : [];
  const versionBot = Number(e.versionBot) || 1;
  const botAncien = versionBot < 3;
  return `
    <div class="statut-bot">
      ${icone}
      <div>
        <div>${pastille} <strong>${echapper(e.serveur?.nom || "Serveur inconnu")}</strong>
          <span class="meta">· ${nombre(Number(e.serveur?.membres) || 0)} membres · vu ${ilYaBot(e.recuLe)}</span></div>
        <div class="meta">${avatar}${echapper(e.bot?.nom || "Bot")}</div>
        <div>${reglages}</div>
      </div>
    </div>
    ${
      botAncien
        ? message(
            `Le bot n'est pas à jour (version ${versionBot}) : ${
              versionBot < 2 ? "les rôles-réactions, les commandes personnalisées, les notifications de live, " : ""
            }l'automod, les vocaux temporaires, les annonces de rediffs et les sauvegardes demandent la version 3 du bot.`,
            "erreur"
          )
        : ""
    }
    ${
      avertissements.length
        ? `<ul class="avertissements-bot">${avertissements.map((a) => `<li>⚠️ ${echapper(a)}</li>`).join("")}</ul>`
        : ""
    }`;
}

/* ----- Historique ----- */

function resumeParams(a) {
  const p = a.params || {};
  const morceaux = [];
  if (p.salonId) morceaux.push(nomSalonBot(p.salonId));
  for (const cle of ["prix", "question", "titre", "membre", "membreId", "id", "duree", "raison", "plateforme"]) {
    if (p[cle] !== undefined && p[cle] !== "") morceaux.push(`${cle} : ${String(p[cle]).slice(0, 60)}`);
  }
  return morceaux.join(" · ");
}

function afficherHistoriqueBot() {
  const zone = $("#bot-historique");
  if (!zone) return;
  const actions = [...BOT.actions].sort((a, b) => b.creeLe - a.creeLe);
  zone.innerHTML = actions.length
    ? `<ul class="liste-simple historique-bot">${actions
        .map((a) => {
          const statut =
            a.statut === "ok"
              ? `<span class="statut-action ok">✅ Fait</span>`
              : a.statut === "erreur"
                ? `<span class="statut-action erreur">❌ Erreur</span>`
                : `<span class="statut-action attente">⏳ En attente</span>`;
          return `<li>
            ${statut}
            <span class="historique-texte"><strong>${echapper(LIBELLES_ACTIONS_BOT[a.type] || a.type)}</strong>
              <span class="meta">${echapper(resumeParams(a))}</span>
              <span class="meta">par ${echapper(a.par || "?")} · ${ilYaBot(a.creeLe)}${a.message ? ` · ${echapper(a.message)}` : ""}</span></span>
            ${a.statut === "attente" ? `<button type="button" class="btn btn-contour btn-petit" data-annuler-action="${echapper(a.id)}">Annuler</button>` : ""}
          </li>`;
        })
        .join("")}</ul>`
    : `<p class="vide">Aucune action pour l'instant.</p>`;
}

/* ----- Envoi d'une action ----- */

async function actionBot(type, params, retour, bouton) {
  if (bouton) bouton.disabled = true;
  try {
    const r = await appelApi("/admin/bot/actions", { method: "POST", body: JSON.stringify({ type, params }) });
    BOT.actions.push({ id: r.id, type, params, creeLe: Date.now(), par: MOI_ADMIN?.login, statut: "attente", message: "" });
    afficherHistoriqueBot();
    if (retour) retour.innerHTML = message(ENVOYE_AU_BOT, "ok");
    return true;
  } catch (err) {
    if (err.statut === 401) {
      afficherAdmin("Ta connexion a expiré, reconnecte-toi.");
      return false;
    }
    if (retour) retour.innerHTML = message(err.message, "erreur");
    return false;
  } finally {
    if (bouton) bouton.disabled = false;
  }
}

/* ----- Rendu de l'onglet ----- */

function ligneCategorieTicket(c = { id: "", label: "", emoji: "", description: "" }) {
  return `<div class="cat-ticket">
    <input name="cat-id" value="${echapper(c.id)}" placeholder="id (ex : achat)" maxlength="20">
    <input name="cat-label" value="${echapper(c.label)}" placeholder="Nom (ex : Achat)" maxlength="80">
    <input name="cat-emoji" value="${echapper(c.emoji || "")}" placeholder="🛒" maxlength="64">
    <input name="cat-description" value="${echapper(c.description || "")}" placeholder="Description" maxlength="100">
    <span class="boutons">
      <button type="button" class="btn btn-contour btn-petit" data-cat="monter" aria-label="Monter">↑</button>
      <button type="button" class="btn btn-contour btn-petit" data-cat="descendre" aria-label="Descendre">↓</button>
      <button type="button" class="btn btn-contour btn-petit" data-cat="retirer" aria-label="Retirer">✕</button>
    </span>
  </div>`;
}

function ligneChoixSondage(valeur = "") {
  return `<div class="choix-sondage"><input ${HORS_FORM} name="choix" value="${echapper(valeur)}" placeholder="Choix" maxlength="80">
    <button type="button" class="btn btn-contour btn-petit" data-retirer-choix aria-label="Retirer ce choix">✕</button></div>`;
}

/* ----- v2 : rôles-réactions, commandes personnalisées, notifications de live ----- */

const STYLES_BOUTON_DISCORD = { bleu: "#5865f2", gris: "#4e5058", vert: "#248046", rouge: "#da373c" };
let idPanneauManuel = false; // l'identifiant du panneau a été tapé à la main (on arrête de le générer depuis le titre)

function couleurHex(c) {
  if (typeof c === "number") return `#${c.toString(16).padStart(6, "0")}`;
  return couleurSure(c);
}

function slugPanneau(titre) {
  return String(titre || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/, "");
}

// Seuls les rôles que le bot peut donner (attribuable: true)
function optionsRolesAttribuables(valeur) {
  const roles = (BOT?.etat?.roles || []).filter((r) => r.attribuable !== false);
  const inconnu = valeur && !roles.some((r) => r.id === valeur);
  return [
    `<option value="">— Choisis un rôle —</option>`,
    inconnu ? `<option value="${echapper(valeur)}" selected>Rôle non attribuable (${echapper(valeur)})</option>` : "",
    ...roles.map((r) => `<option value="${echapper(r.id)}"${r.id === valeur ? " selected" : ""}>@${echapper(r.nom)}</option>`),
  ].join("");
}

function ligneRoleReaction(r = {}) {
  const style = r.style || "gris";
  return `<div class="ligne-role-reaction">
    <select ${HORS_FORM} data-rr="roleId" aria-label="Rôle">${optionsRolesAttribuables(r.roleId || "")}</select>
    <input ${HORS_FORM} data-rr="label" value="${echapper(r.label || "")}" placeholder="Texte du bouton" maxlength="80">
    <input ${HORS_FORM} data-rr="emoji" value="${echapper(r.emoji || "")}" placeholder="🎮 ou <:nom:id>" maxlength="64">
    <input ${HORS_FORM} data-rr="description" value="${echapper(r.description || "")}" placeholder="Description (menu)" maxlength="100">
    <select ${HORS_FORM} data-rr="style" aria-label="Couleur du bouton">${Object.keys(STYLES_BOUTON_DISCORD)
      .map((s) => `<option value="${s}"${s === style ? " selected" : ""}>${s}</option>`)
      .join("")}</select>
    <span class="boutons">
      <button type="button" class="btn btn-contour btn-petit" data-rr-action="monter" aria-label="Monter">↑</button>
      <button type="button" class="btn btn-contour btn-petit" data-rr-action="descendre" aria-label="Descendre">↓</button>
      <button type="button" class="btn btn-contour btn-petit" data-rr-action="retirer" aria-label="Retirer">✕</button>
    </span>
  </div>`;
}

function lirePanneauRoles() {
  return {
    id: $("#rr-id").value.trim().toLowerCase(),
    salonId: $("#rr-salon").value,
    titre: $("#rr-titre").value.trim(),
    texte: $("#rr-texte").value.trim(),
    couleur: $("#rr-couleur").value,
    mode: $("#rr-mode").value,
    unique: $("#rr-unique").checked,
    roles: [...document.querySelectorAll(".ligne-role-reaction")].map((l) => {
      const champ = (n) => l.querySelector(`[data-rr="${n}"]`).value.trim();
      return { roleId: champ("roleId"), label: champ("label"), emoji: champ("emoji"), description: champ("description"), style: champ("style") };
    }),
  };
}

// Emoji du serveur <:nom:id> affiché :nom: dans l'aperçu
const emojiApercu = (e) => echapper(String(e || "").replace(/^<a?:(\w+):\d+>$/, ":$1:"));

function apercuPanneauRoles() {
  const p = lirePanneauRoles();
  const roles = p.roles.filter((r) => r.roleId || r.label);
  const composants =
    p.mode === "menu"
      ? `<div class="apercu-menu">
          <div class="apercu-menu-tete">${p.unique ? "Choisis un rôle…" : "Choisis tes rôles…"} <span>▾</span></div>
          ${roles
            .map(
              (r) => `<div class="apercu-menu-option"><div>${r.emoji ? `${emojiApercu(r.emoji)} ` : ""}<strong>${echapper(r.label || "(sans texte)")}</strong></div>${
                r.description ? `<span>${echapper(r.description)}</span>` : ""
              }</div>`
            )
            .join("")}
        </div>`
      : `<div class="apercu-boutons">${roles
          .map(
            (r) => `<span class="apercu-bouton" style="background:${STYLES_BOUTON_DISCORD[r.style] || STYLES_BOUTON_DISCORD.gris}">${
              r.emoji ? `${emojiApercu(r.emoji)} ` : ""
            }${echapper(r.label || "(sans texte)")}</span>`
          )
          .join("")}</div>`;
  return `<div class="apercu-discord">
    <div class="apercu-embed" style="border-left-color:${couleurSure(p.couleur) || "#9b5cff"}">
      ${p.titre ? `<strong>${echapper(p.titre)}</strong>` : `<span class="meta">(sans titre)</span>`}
      ${p.texte ? `<p>${echapper(p.texte)}</p>` : ""}
      ${p.unique ? `<small class="meta">Un seul rôle à la fois</small>` : ""}
    </div>
    ${roles.length ? composants : `<span class="meta">Ajoute au moins un rôle.</span>`}
  </div>`;
}

function rafraichirFormulaireRoles() {
  const menu = $("#rr-mode").value === "menu";
  document.querySelectorAll('.ligne-role-reaction [data-rr="style"]').forEach((s) => (s.disabled = menu));
  document.querySelectorAll('.ligne-role-reaction [data-rr="description"]').forEach((s) => (s.disabled = !menu));
  $("#rr-apercu").innerHTML = apercuPanneauRoles();
}

function remplirPanneauRoles(p = null) {
  idPanneauManuel = Boolean(p);
  $("#rr-id").value = p?.id || "";
  $("#rr-salon").value = p?.salonId || "";
  $("#rr-titre").value = p?.titre || "";
  $("#rr-texte").value = p?.texte || "";
  $("#rr-couleur").value = couleurHex(p?.couleur) || couleurSure(BOT?.config?.color || BOT?.etat?.config?.color) || "#9b5cff";
  $("#rr-mode").value = p?.mode === "menu" ? "menu" : "boutons";
  $("#rr-unique").checked = Boolean(p?.unique);
  $("#rr-roles").innerHTML = (p?.roles?.length ? p.roles : [{}]).map(ligneRoleReaction).join("");
  $("#rr-titre-formulaire").textContent = p ? `Modifier le panneau « ${p.id} »` : "Nouveau panneau";
  $("#retour-roles").innerHTML = "";
  rafraichirFormulaireRoles();
}

function ligneCommandePerso(c = {}) {
  const prefixe = echapper(BOT?.config?.prefix || BOT?.etat?.config?.prefix || "+");
  return `<div class="ligne-commande">
    <div class="commande-tete">
      <span class="commande-nom"><span class="prefixe-cmd">${prefixe}</span><input data-cmd="name" value="${echapper(c.name || "")}" placeholder="planning" maxlength="32" aria-label="Nom de la commande"></span>
      <label class="case"><input type="checkbox" data-cmd="embed"${c.embed ? " checked" : ""}> encadré</label>
      <label class="case"><input type="checkbox" data-cmd="deleteTrigger"${c.deleteTrigger ? " checked" : ""}> supprimer le message de la personne</label>
      <button type="button" class="btn btn-contour btn-petit" data-retirer-commande aria-label="Retirer la commande">✕</button>
    </div>
    <textarea data-cmd="response" rows="2" maxlength="2000" placeholder="📅 Lundi, mercredi et vendredi à 20h !">${echapper(c.response || "")}</textarea>
    <small class="meta">Aperçu : on tape <code class="apercu-cmd">${prefixe}${echapper(c.name || "nom")}</code> sur Discord.</small>
  </div>`;
}

function htmlEtatLive(plateforme, suivi) {
  const l = BOT?.etat?.live?.[plateforme];
  if (!suivi) return `<span class="meta">Pas suivi</span>`;
  if (!l) return `<span class="meta">Inconnu</span>`;
  return l.enLive ? `<span class="live-en-cours">🔴 En live depuis ${l.depuis ? dateBot(l.depuis) : "?"}${l.depuis ? ` (${ilYaBot(l.depuis)})` : ""}</span>` : "⚫ Hors ligne";
}

function tableau(entetes, lignes) {
  return `<div class="tableau-defilant"><table class="tableau-admin tableau-bot">
    <thead><tr>${entetes.map((e) => `<th>${e}</th>`).join("")}</tr></thead>
    <tbody>${lignes.join("")}</tbody></table></div>`;
}

function afficherBot(retour = "") {
  const zone = $("#panneau-bot");
  const e = BOT.etat;
  const cfg = BOT.config || e?.config || {};

  const entete = `
    <div class="barre-bot">
      <h2>Bot Discord</h2>
      <button type="button" class="btn btn-contour btn-petit" id="bot-actualiser">↻ Actualiser</button>
    </div>
    ${retour}
    ${bloc("Statut", `<div id="bot-statut">${htmlStatutBot()}</div>`, true)}`;
  const historique = bloc("Historique des actions", `<div id="bot-historique"></div>`, true);

  if (!e) {
    zone.innerHTML = entete + historique;
    brancherBot();
    return;
  }

  const tickets = Array.isArray(e.tickets) ? e.tickets : [];
  const vips = Array.isArray(e.vips) ? e.vips : [];
  const sanctions = Array.isArray(e.sanctions) ? e.sanctions : [];
  const classement = Array.isArray(e.classement) ? e.classement : [];
  const blacklist = Array.isArray(e.blacklist) ? e.blacklist : [];
  const giveaways = Array.isArray(e.giveaways) ? e.giveaways : [];
  const sondages = Array.isArray(e.sondages) ? e.sondages : [];
  const typesLogs = e.typesLogs && typeof e.typesLogs === "object" ? Object.entries(e.typesLogs) : [];
  const logs = cfg.logs || {};

  const general = `
    <div class="ligne ligne-2">
      <label>Préfixe des commandes<input name="prefix" maxlength="5" value="${echapper(cfg.prefix || "")}" placeholder="+">
        <small>5 caractères maximum, sans espace.</small></label>
      <label>Couleur des embeds<input name="color" type="color" value="${couleurSure(cfg.color) || "#9b5cff"}"></label>
    </div>`;

  const bienvenue = `
    <div class="ligne ligne-2">
      <label>Salon de bienvenue<select name="welcomeChannel">${optionsSalonsBot("texte", cfg.welcomeChannel)}</select></label>
      <label>Rôle donné à l'arrivée<select name="memberRole">${optionsRolesBot(cfg.memberRole)}</select></label>
    </div>
    <label>Message de bienvenue
      <textarea name="welcomeMessage" rows="3" maxlength="1500" placeholder="Bienvenue {user} sur **{server}** ! Nous sommes **{count}** 🎉">${echapper(cfg.welcomeMessage || "")}</textarea>
      <small>Variables : <code>{user}</code> mentionne le membre, <code>{username}</code> son pseudo, <code>{server}</code> le nom du serveur,
        <code>{count}</code> le nombre de membres. **gras** comme sur Discord. 1500 caractères maximum.</small>
    </label>
    <div class="ligne ligne-2">
      <label>Salon compteur (vocal)<select name="counterChannel">${optionsSalonsBot("vocal", cfg.counterChannel)}</select></label>
      <label>Format du compteur<input name="counterFormat" maxlength="100" value="${echapper(cfg.counterFormat || "")}" placeholder="👥 Membres : {count}">
        <small>Doit contenir <code>{count}</code>.</small></label>
    </div>
    <div class="ligne-formulaire">
      <button type="button" class="btn btn-contour btn-petit" id="bot-compteur">➕ Créer un salon compteur</button>
      <span id="retour-compteur"></span>
    </div>`;

  const ticketsHtml = `
    <div class="ligne">
      <label>Rôle staff<select name="ticketStaffRole">${optionsRolesBot(cfg.ticketStaffRole)}</select></label>
      <label>Catégorie des tickets<select name="ticketCategory">${optionsSalonsBot("categories", cfg.ticketCategory)}</select></label>
      <label>Salon des transcripts<select name="ticketTranscripts">${optionsSalonsBot("texte", cfg.ticketTranscripts)}</select></label>
    </div>
    <div>
      <strong>Catégories de tickets</strong> <small class="meta">(1 à 25 — l'id en minuscules : a-z, 0-9, -)</small>
      <div id="cats-ticket">${(cfg.ticketCategories || []).map(ligneCategorieTicket).join("")}</div>
      <button type="button" class="btn btn-contour btn-petit" id="ajouter-cat-ticket">+ Ajouter une catégorie</button>
    </div>
    <h4>Envoyer le panel de tickets</h4>
    <div class="ligne-formulaire">
      <select ${HORS_FORM} id="panel-salon">${optionsSalonsBot("texte", "", "— Choisis un salon —")}</select>
      <button type="button" class="btn btn-petit" id="bot-panel">Envoyer le panel</button>
    </div>
    <div id="retour-panel"></div>
    <h4>Tickets ouverts (${tickets.length})</h4>
    ${
      tickets.length
        ? tableau(
            ["Ticket", "Catégorie", "Auteur", "Pris par", "Ouvert", ""],
            tickets.map(
              (t) => `<tr><td>${echapper(t.nom || nomSalonBot(t.salonId))}${t.numero ? ` <span class="meta">#${echapper(t.numero)}</span>` : ""}</td>
                <td>${echapper(t.categorie || "—")}</td><td>${echapper(t.auteur || "—")}</td><td>${echapper(t.prisPar || "—")}</td>
                <td>${ilYaBot(t.ouvertLe)}</td>
                <td><button type="button" class="btn btn-contour btn-petit" data-fermer-ticket="${echapper(t.salonId)}">Fermer</button></td></tr>`
            )
          )
        : `<p class="vide">Aucun ticket ouvert.</p>`
    }
    <div id="retour-tickets"></div>`;

  const logsHtml = typesLogs.length
    ? `<div class="grille-logs">${typesLogs
        .map(
          ([type, libelle]) => `<label>${echapper(libelle)}
            <select name="log-${echapper(type)}" data-log="${echapper(type)}">${optionsSalonsBot("texte", logs[type] || "")}</select></label>`
        )
        .join("")}</div>`
    : `<p class="vide">Le bot n'a pas envoyé de types de logs.</p>`;

  const vipHtml = `
    <label>Rôle VIP<select name="vipRole">${optionsRolesBot(cfg.vipRole)}</select></label>
    <h4>Ajouter un VIP</h4>
    <div class="ligne-formulaire">
      <input ${HORS_FORM} id="vip-membre" placeholder="Pseudo Discord ou ID" maxlength="100">
      <input ${HORS_FORM} id="vip-duree" placeholder="Durée (ex : 30j) — vide = à vie" maxlength="20">
      <button type="button" class="btn btn-petit" id="bot-vip">Ajouter</button>
    </div>
    <div id="retour-vip"></div>
    <h4>VIP (${vips.length})</h4>
    ${
      vips.length
        ? tableau(
            ["Membre", "Depuis", "Expire", ""],
            vips.map(
              (v) => `<tr><td>${echapper(v.nom || v.membreId)}</td><td>${dateBot(v.depuis)}</td>
                <td>${v.expireLe ? dateBot(v.expireLe) : "À vie"}</td>
                <td><button type="button" class="btn btn-contour btn-petit" data-retirer-vip="${echapper(v.membreId)}" data-nom="${echapper(v.nom || v.membreId)}">Retirer</button></td></tr>`
            )
          )
        : `<p class="vide">Aucun VIP.</p>`
    }`;

  const moderation = `
    <h4>Sanctions récentes (${sanctions.length})</h4>
    ${
      sanctions.length
        ? tableau(
            ["Cas", "Type", "Membre", "Modérateur", "Raison", "Durée", "Date", ""],
            sanctions.map(
              (s) => `<tr><td>#${echapper(s.id)}</td><td>${echapper(s.type || "")}</td><td>${echapper(s.membre || s.membreId || "")}</td>
                <td>${echapper(s.moderateur || "")}</td><td>${echapper(s.raison || "—")}</td><td>${echapper(s.duree || "—")}</td>
                <td>${dateBot(s.date)}</td>
                <td><button type="button" class="btn btn-contour btn-petit" data-suppr-sanction="${echapper(s.id)}">Supprimer</button></td></tr>`
            )
          )
        : `<p class="vide">Aucune sanction.</p>`
    }
    <div id="retour-sanctions"></div>
    <h4>Classement du staff</h4>
    ${
      classement.length
        ? tableau(
            ["Membre du staff", "Sanctions", "Tickets"],
            classement.map(
              (c) => `<tr><td>${echapper(c.nom)}</td><td>${nombre(Number(c.sanctions) || 0)}</td><td>${nombre(Number(c.tickets) || 0)}</td></tr>`
            )
          )
        : `<p class="vide">Pas encore de classement.</p>`
    }
    <h4>Blacklist (${blacklist.length})</h4>
    <div class="ligne-formulaire">
      <input ${HORS_FORM} id="bl-membre" placeholder="Pseudo Discord ou ID" maxlength="100">
      <input ${HORS_FORM} id="bl-raison" placeholder="Raison (facultatif)" maxlength="300">
      <button type="button" class="btn btn-danger btn-petit" id="bot-blacklist">Ajouter</button>
    </div>
    <small class="meta">L'ID est obligatoire si la personne n'est pas sur le serveur.</small>
    <div id="retour-blacklist"></div>
    ${
      blacklist.length
        ? tableau(
            ["Membre", "Raison", "Date", ""],
            blacklist.map(
              (b) => `<tr><td>${echapper(b.nom || b.membreId)} <span class="meta">${echapper(b.membreId)}</span></td>
                <td>${echapper(b.raison || "—")}</td><td>${dateBot(b.date)}</td>
                <td><button type="button" class="btn btn-contour btn-petit" data-retirer-blacklist="${echapper(b.membreId)}" data-nom="${echapper(b.nom || b.membreId)}">Retirer</button></td></tr>`
            )
          )
        : `<p class="vide">Personne dans la blacklist.</p>`
    }`;

  const giveawaysHtml = `
    <h4>Créer un giveaway</h4>
    <div class="ligne">
      <label>Salon<select ${HORS_FORM} id="ga-salon">${optionsSalonsBot("texte", "", "— Choisis un salon —")}</select></label>
      <label>Prix *<input ${HORS_FORM} id="ga-prix" maxlength="200" placeholder="Nitro 1 mois"></label>
      <label>Durée *<input ${HORS_FORM} id="ga-duree" maxlength="20" placeholder="2h, 7j, 1j12h"></label>
    </div>
    <div class="ligne ligne-2">
      <label>Nombre de gagnants<input ${HORS_FORM} id="ga-gagnants" type="number" min="1" max="50" value="1"></label>
      <label>Description<input ${HORS_FORM} id="ga-description" maxlength="1000" placeholder="Facultatif"></label>
    </div>
    <button type="button" class="btn btn-petit" id="bot-giveaway">Lancer le giveaway</button>
    <div id="retour-giveaway"></div>
    <h4>Giveaways (${giveaways.length})</h4>
    ${
      giveaways.length
        ? tableau(
            ["Prix", "Salon", "Fin", "Gagnants", "Participants", ""],
            giveaways.map(
              (g) => `<tr><td>${echapper(g.prix)}</td><td>${echapper(nomSalonBot(g.salonId))}</td>
                <td>${g.termine ? "Terminé" : dateBot(g.finLe)}</td>
                <td>${
                  g.termine && Array.isArray(g.gagnantsNoms) && g.gagnantsNoms.length
                    ? echapper(g.gagnantsNoms.join(", "))
                    : nombre(Number(g.gagnants) || 0)
                }</td>
                <td>${nombre(Number(g.participants) || 0)}</td>
                <td class="actions-tableau">
                  ${!g.termine ? `<button type="button" class="btn btn-contour btn-petit" data-ga="giveaway_terminer" data-id="${echapper(g.id)}">Terminer</button>` : ""}
                  ${g.termine ? `<button type="button" class="btn btn-contour btn-petit" data-ga="giveaway_reroll" data-id="${echapper(g.id)}">Reroll</button>` : ""}
                  <button type="button" class="btn btn-danger btn-petit" data-ga="giveaway_supprimer" data-id="${echapper(g.id)}">Supprimer</button>
                </td></tr>`
            )
          )
        : `<p class="vide">Aucun giveaway.</p>`
    }
    <div id="retour-giveaways"></div>`;

  const sondagesHtml = `
    <h4>Créer un sondage</h4>
    <div class="ligne ligne-2">
      <label>Salon<select ${HORS_FORM} id="so-salon">${optionsSalonsBot("texte", "", "— Choisis un salon —")}</select></label>
      <label>Durée<input ${HORS_FORM} id="so-duree" maxlength="20" placeholder="Facultatif (ex : 1j)"></label>
    </div>
    <label>Question *<input ${HORS_FORM} id="so-question" maxlength="300" placeholder="Quel jeu au prochain stream ?"></label>
    <div><strong>Choix</strong> <small class="meta">(2 à 10)</small>
      <div id="so-choix">${ligneChoixSondage("Oui")}${ligneChoixSondage("Non")}</div>
      <button type="button" class="btn btn-contour btn-petit" id="so-ajouter-choix">+ Ajouter un choix</button>
    </div>
    <button type="button" class="btn btn-petit" id="bot-sondage">Lancer le sondage</button>
    <div id="retour-sondage"></div>
    <h4>Sondages (${sondages.length})</h4>
    ${
      sondages.length
        ? sondages
            .map((so) => {
              const options = Array.isArray(so.options) ? so.options : [];
              const votes = options.map((o, i) => Number(Array.isArray(so.votes) ? so.votes[i] : so.votes?.[o]) || 0);
              const total = votes.reduce((a, b) => a + b, 0);
              return `<div class="sondage-bot">
                <div class="sondage-tete"><strong>${echapper(so.question)}</strong>
                  <span class="meta">${so.termine ? "Terminé" : so.finLe ? `fin ${dateBot(so.finLe)}` : "sans fin"} · ${nombre(total)} vote(s)</span>
                  ${!so.termine ? `<button type="button" class="btn btn-contour btn-petit" data-terminer-sondage="${echapper(so.id)}">Terminer</button>` : ""}
                </div>
                ${options
                  .map((o, i) => {
                    const pct = total ? Math.round((votes[i] / total) * 100) : 0;
                    return `<div class="barre-sondage">
                      <span class="barre-sondage-libelle">${echapper(o)}</span>
                      <span class="barre-sondage-piste"><span class="barre-sondage-remplie" style="width:${pct}%"></span></span>
                      <span class="barre-sondage-valeur">${nombre(votes[i])} · ${pct} %</span>
                    </div>`;
                  })
                  .join("")}
              </div>`;
            })
            .join("")
        : `<p class="vide">Aucun sondage.</p>`
    }
    <div id="retour-sondages"></div>`;

  const roles = e.roles || [];
  const annonce = `
    <button type="button" class="btn btn-contour btn-petit" id="an-modele-live">🔴 Modèle « Je suis en live »</button>
    <div class="ligne ligne-2">
      <label>Salon *<select ${HORS_FORM} id="an-salon">${optionsSalonsBot("texte", "", "— Choisis un salon —")}</select></label>
      <label>Mention<select ${HORS_FORM} id="an-mention">
        <option value="">Aucune</option><option value="everyone">@everyone</option><option value="here">@here</option>
        ${roles.map((r) => `<option value="${echapper(r.id)}">@${echapper(r.nom)}</option>`).join("")}
      </select></label>
    </div>
    <label>Titre<input ${HORS_FORM} id="an-titre" maxlength="256"></label>
    <label>Texte<textarea ${HORS_FORM} id="an-texte" rows="4" maxlength="4000"></textarea></label>
    <div class="ligne">
      <label>Couleur<input ${HORS_FORM} id="an-couleur" type="color" value="${couleurSure(cfg.color) || "#9b5cff"}"></label>
      <label>Image (https)<input ${HORS_FORM} id="an-image" type="url" maxlength="500" placeholder="https://..."></label>
    </div>
    <div class="ligne ligne-2">
      <label>Lien du bouton (https)<input ${HORS_FORM} id="an-lien" type="url" maxlength="500" placeholder="https://..."></label>
      <label>Texte du bouton<input ${HORS_FORM} id="an-texte-bouton" maxlength="80" placeholder="Regarder"></label>
    </div>
    <button type="button" class="btn btn-petit" id="bot-annonce">Envoyer l'annonce</button>
    <div id="retour-annonce"></div>`;

  const panneaux = Array.isArray(e.rolesReactions) ? e.rolesReactions : [];
  const rolesReactions = `
    <h4>Panneaux publiés (${panneaux.length})</h4>
    ${
      panneaux.length
        ? tableau(
            ["Panneau", "Salon", "Rôles", "Mode", ""],
            panneaux.map(
              (p) => `<tr><td>${echapper(p.titre || "(sans titre)")} <span class="meta">${echapper(p.id)}</span></td>
                <td>${echapper(nomSalonBot(p.salonId))}</td><td>${nombre(Array.isArray(p.roles) ? p.roles.length : 0)}</td>
                <td>${p.mode === "menu" ? "Menu" : "Boutons"}${p.unique ? " · 1 seul" : ""}</td>
                <td class="actions-tableau">
                  <button type="button" class="btn btn-contour btn-petit" data-modifier-panneau="${echapper(p.id)}">Modifier</button>
                  <button type="button" class="btn btn-danger btn-petit" data-suppr-panneau="${echapper(p.id)}">Supprimer</button>
                </td></tr>`
            )
          )
        : `<p class="vide">Aucun panneau de rôles.</p>`
    }
    <div id="retour-panneaux"></div>
    <div class="ligne-formulaire"><h4 id="rr-titre-formulaire">Nouveau panneau</h4>
      <button type="button" class="btn btn-contour btn-petit" id="rr-nouveau">+ Nouveau panneau</button></div>
    <div class="ligne ligne-2">
      <label>Titre<input ${HORS_FORM} id="rr-titre" maxlength="256" placeholder="Choisis tes rôles"></label>
      <label>Identifiant<input ${HORS_FORM} id="rr-id" maxlength="30" placeholder="choisis-tes-roles">
        <small>a-z, 0-9 et -, 30 caractères. Le même identifiant met à jour le message existant.</small></label>
    </div>
    <div class="ligne">
      <label>Salon<select ${HORS_FORM} id="rr-salon">${optionsSalonsBot("texte", "", "— Choisis un salon —")}</select></label>
      <label>Mode<select ${HORS_FORM} id="rr-mode"><option value="boutons">Boutons (un par rôle)</option><option value="menu">Menu déroulant</option></select></label>
      <label>Couleur<input ${HORS_FORM} id="rr-couleur" type="color" value="#9b5cff"></label>
    </div>
    <label>Texte<textarea ${HORS_FORM} id="rr-texte" rows="3" maxlength="4000" placeholder="Clique pour obtenir ou retirer un rôle."></textarea></label>
    <label class="case"><input ${HORS_FORM} type="checkbox" id="rr-unique"> Un seul rôle à la fois parmi ceux du panneau</label>
    <div><strong>Rôles</strong> <small class="meta">(1 à 25 — seuls les rôles que le bot peut donner sont proposés)</small>
      <div id="rr-roles"></div>
      <button type="button" class="btn btn-contour btn-petit" id="rr-ajouter-role">+ Ajouter un rôle</button>
    </div>
    <div><strong>Aperçu</strong><div id="rr-apercu"></div></div>
    <button type="button" class="btn btn-petit" id="bot-roles-publier">Publier</button>
    <div id="retour-roles"></div>`;

  const commandes = Array.isArray(cfg.customCommands) ? cfg.customCommands : [];
  const commandesHtml = `
    <small>Variables : <code>{user}</code> mentionne la personne, <code>{username}</code> son pseudo, <code>{server}</code> le nom du serveur,
      <code>{count}</code> le nombre de membres, <code>{channel}</code> le salon, <code>{args}</code> le texte tapé après la commande.
      Nom en minuscules (a-z, 0-9, - et _), 32 caractères, différent des commandes du bot. 50 commandes maximum.</small>
    <div id="commandes-perso">${commandes.map(ligneCommandePerso).join("")}</div>
    <button type="button" class="btn btn-contour btn-petit" id="ajouter-commande">+ Ajouter une commande</button>`;

  const ln = cfg.liveNotif || {};
  const liveTwitch = ln.twitch || SITE.chaineTwitch || "";
  const liveKick = ln.kick || SITE.chaineKick || "";
  const liveHtml = `
    <div class="ligne ligne-2">
      <label>Salon des notifications<select name="live-salon">${optionsSalonsBot("texte", ln.channelId || "", "— Aucun (désactivé) —")}</select></label>
      <label>Mention<select name="live-mention">
        <option value="">Aucune</option>
        <option value="everyone"${ln.mention === "everyone" ? " selected" : ""}>@everyone</option>
        <option value="here"${ln.mention === "here" ? " selected" : ""}>@here</option>
        ${(e.roles || []).map((r) => `<option value="${echapper(r.id)}"${r.id === ln.mention ? " selected" : ""}>@${echapper(r.nom)}</option>`).join("")}
      </select></label>
    </div>
    <div class="ligne ligne-2">
      <label>Chaîne Twitch<input name="live-twitch" maxlength="25" value="${echapper(liveTwitch)}"><small>Vide = pas de suivi Twitch.</small></label>
      <label>Chaîne Kick<input name="live-kick" maxlength="40" value="${echapper(liveKick)}"><small>Vide = pas de suivi Kick.</small></label>
    </div>
    <label>Message
      <textarea name="live-message" rows="2" maxlength="500" placeholder="{chaine} est en live sur {plateforme} ! Viens nous rejoindre 🎉">${echapper(ln.message || "")}</textarea>
      <small>Variables : <code>{chaine}</code>, <code>{plateforme}</code>, <code>{titre}</code> (titre du live), <code>{jeu}</code>, <code>{lien}</code>. 500 caractères maximum.
        Le bot vérifie toutes les 2 minutes ; à la fin du live, le message devient « ⚫ Live terminé ».</small>
    </label>
    <div class="ligne-formulaire">
      <button type="button" class="btn btn-contour btn-petit" data-live-test="twitch">Tester Twitch</button>
      <button type="button" class="btn btn-contour btn-petit" data-live-test="kick">Tester Kick</button>
    </div>
    <small class="meta">Le test envoie un exemple dans le salon enregistré : enregistre d'abord les réglages si tu viens de les changer.</small>
    <div id="retour-live"></div>
    <h4>En ce moment</h4>
    <ul class="liste-simple etat-live-bot">
      <li><strong>Twitch</strong> ${htmlEtatLive("twitch", liveTwitch)}</li>
      <li><strong>Kick</strong> ${htmlEtatLive("kick", liveKick)}</li>
    </ul>`;

  // 🛡️ Automod (valeurs par défaut du document si rien n'est encore réglé)
  const am = {
    enabled: false, antiInvites: true, antiLinks: false,
    allowedDomains: ["twitch.tv", "youtube.com", "youtu.be", "kick.com", "github.io"],
    antiSpam: true, maxMentions: 5, badWords: [], antiCaps: false, action: "supprimer", muteMinutes: 10,
    ignoredRoles: [], ignoredChannels: [],
    ...(cfg.automod || {}),
  };
  const caseAutomod = (nom, libelle, aide) => `<label class="case"><input type="checkbox" name="am-${nom}"${am[nom] ? " checked" : ""}> ${libelle}${
    aide ? ` <small>${aide}</small>` : ""
  }</label>`;
  const listeCases = (nom, elements, coches, prefixe) =>
    elements.length
      ? `<div class="liste-cases" data-liste="${nom}">${elements
          .map(
            (x) => `<label class="case"><input type="checkbox" value="${echapper(x.id)}"${coches.includes(x.id) ? " checked" : ""}> ${prefixe}${echapper(x.nom)}</label>`
          )
          .join("")}</div>`
      : `<p class="vide">Aucun élément envoyé par le bot.</p>`;
  const automodHtml = `
    <label class="interrupteur">
      <input type="checkbox" name="am-enabled"${am.enabled ? " checked" : ""}>
      <span class="interrupteur-piste"></span>
      <span><strong>Automod activé</strong> <small>Interrupteur général. Les membres qui peuvent « Gérer les messages » ne sont jamais filtrés.</small></span>
    </label>
    <div class="grille-cases">
      ${caseAutomod("antiInvites", "Invitations Discord", "(discord.gg, discord.com/invite)")}
      ${caseAutomod("antiLinks", "Liens", "(sauf domaines autorisés)")}
      ${caseAutomod("antiSpam", "Spam", "(plus de 5 messages en 5 s)")}
      ${caseAutomod("antiCaps", "Majuscules", "(plus de 70 %, 12 lettres min.)")}
    </div>
    <label id="am-domaines-bloc"${am.antiLinks ? "" : " hidden"}>Domaines autorisés
      <textarea name="am-allowedDomains" rows="4" placeholder="twitch.tv">${echapper((am.allowedDomains || []).join("\n"))}</textarea>
      <small>Un par ligne, sans https:// (50 maximum).</small></label>
    <div class="ligne">
      <label>Mentions maximum par message<input name="am-maxMentions" type="number" min="0" max="50" value="${Number(am.maxMentions) || 0}">
        <small>0 = pas de limite.</small></label>
      <label>Action<select name="am-action">
        ${[["supprimer", "Supprimer le message"], ["avertir", "Supprimer + avertissement"], ["mute", "Supprimer + mute"]]
          .map(([v, t]) => `<option value="${v}"${am.action === v ? " selected" : ""}>${t}</option>`)
          .join("")}
      </select></label>
      <label id="am-mute-bloc"${am.action === "mute" ? "" : " hidden"}>Durée du mute (minutes)<input name="am-muteMinutes" type="number" min="1" max="1440" value="${Number(am.muteMinutes) || 10}"></label>
    </div>
    <label>Mots interdits
      <textarea name="am-badWords" rows="4" placeholder="un mot par ligne">${echapper((am.badWords || []).join("\n"))}</textarea>
      <small>Un par ligne (200 maximum, 50 caractères chacun). Insensible aux majuscules et aux accents, mot entier.</small></label>
    <div class="ligne ligne-2">
      <div><strong>Rôles jamais filtrés</strong>${listeCases("am-ignoredRoles", e.roles || [], am.ignoredRoles || [], "@")}</div>
      <div><strong>Salons jamais filtrés</strong>${listeCases("am-ignoredChannels", salonsBot("texte"), am.ignoredChannels || [], "#")}</div>
    </div>`;

  // 🔊 Vocaux temporaires
  const tv = cfg.tempVoice || {};
  const vocauxHtml = `
    <p class="astuce">💡 Crée un salon vocal nommé <strong>➕ Créer un salon</strong> sur Discord, puis choisis-le ici.
      Quand quelqu'un le rejoint, le bot lui crée son propre salon, supprimé dès qu'il est vide.</p>
    <div class="ligne ligne-2">
      <label>Salon vocal créateur<select name="tv-creatorChannelId">${optionsSalonsBot("vocal", tv.creatorChannelId || "", "— Aucun (désactivé) —")}</select></label>
      <label>Catégorie des salons créés<select name="tv-categoryId">${optionsSalonsBot("categories", tv.categoryId || "", "— Même catégorie que le salon créateur —")}</select></label>
    </div>
    <div class="ligne ligne-2">
      <label>Format du nom<input name="tv-nameFormat" maxlength="100" value="${echapper(tv.nameFormat || "")}" placeholder="🔊 Salon de {user}">
        <small><code>{user}</code> = pseudo sur le serveur, <code>{username}</code> = nom Discord. Le créateur peut ensuite renommer et limiter son salon.</small></label>
      <label>Limite de places<input name="tv-userLimit" type="number" min="0" max="99" value="${Number(tv.userLimit) || 0}">
        <small>0 = illimité.</small></label>
    </div>
    <p>Vocaux temporaires ouverts en ce moment : <strong>${nombre(Number(e.vocauxTemporaires) || 0)}</strong></p>`;

  // 🎬 Annonces de rediffs
  const rn = cfg.rediffNotif || {};
  // Pré-remplie avec l'adresse actuelle du site (seulement si elle est en https, comme sur GitHub Pages)
  const adresseSite = location.protocol === "https:" ? new URL(".", location.href).href : "";
  const rediffsHtml = `
    <div class="ligne ligne-2">
      <label>Salon des annonces<select name="rn-channelId">${optionsSalonsBot("texte", rn.channelId || "", "— Aucun (désactivé) —")}</select></label>
      <label>Mention<select name="rn-mention">
        <option value="">Aucune</option>
        <option value="everyone"${rn.mention === "everyone" ? " selected" : ""}>@everyone</option>
        <option value="here"${rn.mention === "here" ? " selected" : ""}>@here</option>
        ${(e.roles || []).map((r) => `<option value="${echapper(r.id)}"${r.id === rn.mention ? " selected" : ""}>@${echapper(r.nom)}</option>`).join("")}
      </select></label>
    </div>
    <label>Message
      <textarea name="rn-message" rows="2" maxlength="500" placeholder="🎬 Nouvelle rediff dispo sur le site : **{titre}** !">${echapper(rn.message || "")}</textarea>
      <small>Variables : <code>{titre}</code>, <code>{lien}</code>, <code>{categorie}</code>, <code>{duree}</code>. 500 caractères maximum.
        Le bot regarde les nouvelles rediffs toutes les 5 minutes ; celles déjà publiées à son premier démarrage ne sont pas annoncées.</small>
    </label>
    <label>Adresse du site<input name="rn-siteUrl" type="url" maxlength="300" value="${echapper(rn.siteUrl || adresseSite)}" placeholder="https://julvig2.github.io/site-claude/">
      <small>Sert à faire le lien vers la rediff (video.html?id=…).</small></label>
    <div class="ligne-formulaire">
      <button type="button" class="btn btn-contour btn-petit" id="bot-rediff-test">Tester</button>
      <small class="meta">Annonce la rediff la plus récente dans le salon enregistré : enregistre d'abord les réglages si tu viens de les changer.</small>
    </div>
    <div id="retour-rediff-test"></div>`;

  // 💾 Sauvegardes
  const sv = e.sauvegardes || {};
  const listeSauvegardes = Array.isArray(sv.liste) ? sv.liste : [];
  const sauvegardesHtml = `
    <label>Salon des sauvegardes<select name="backupChannel">${optionsSalonsBot("texte", cfg.backupChannel || "", "— Aucun (copie sur le PC seulement) —")}</select></label>
    ${message("⚠️ Ce salon doit être PRIVÉ, réservé au staff : la sauvegarde contient les sanctions, les tickets, la blacklist…", "erreur")}
    <p>Dernière sauvegarde : <strong>${sv.derniere ? `${dateBot(sv.derniere)} (${ilYaBot(sv.derniere)})` : "jamais"}</strong>
      <small class="meta">— une sauvegarde est faite automatiquement chaque jour (14 gardées sur le PC).</small></p>
    ${
      listeSauvegardes.length
        ? `<details class="liste-sauvegardes"><summary>Sauvegardes sur le PC (${listeSauvegardes.length})</summary>
            <ul>${listeSauvegardes.map((d) => `<li><code>backups/${echapper(d)}</code></li>`).join("")}</ul></details>`
        : `<p class="vide">Aucune sauvegarde sur le PC pour l'instant.</p>`
    }
    <div class="ligne-formulaire">
      <button type="button" class="btn btn-contour btn-petit" id="bot-sauvegarde">💾 Sauvegarder maintenant</button>
    </div>
    <div id="retour-sauvegarde-bot"></div>
    <p class="astuce">♻️ Pour restaurer : arrête le bot, puis dans le dossier du bot :
      <code>node scripts/restaurer.js backups/&lt;date&gt;</code> (ou le fichier .json téléchargé depuis Discord).</p>`;

  zone.innerHTML = `
    ${entete}
    <form id="form-bot" autocomplete="off">
      ${bloc("Général", general, true)}
      ${bloc("Bienvenue & membres", bienvenue)}
      ${bloc("Tickets", ticketsHtml)}
      ${bloc("Logs", logsHtml)}
      ${bloc("VIP", vipHtml)}
      ${bloc("✨ Commandes personnalisées", commandesHtml)}
      ${bloc("🔴 Notifications de live", liveHtml)}
      ${bloc("🛡️ Automod", automodHtml)}
      ${bloc("🔊 Vocaux temporaires", vocauxHtml)}
      ${bloc("🎬 Annonces de rediffs", rediffsHtml)}
      ${bloc("💾 Sauvegardes", sauvegardesHtml)}
      <div class="barre-enregistrer-bot">
        <div id="retour-config-bot"></div>
        <button class="btn" type="submit">Enregistrer les réglages</button>
      </div>
    </form>
    ${bloc("🎭 Rôles-réactions", rolesReactions)}
    ${bloc("Modération", moderation)}
    ${bloc("Giveaways", giveawaysHtml)}
    ${bloc("Sondages", sondagesHtml)}
    ${bloc("Annonce", annonce)}
    ${historique}`;
  brancherBot();
}

/* ----- Réglages (sections Général à VIP) ----- */

function lireConfigBot() {
  const f = $("#form-bot");
  const valeur = (nom) => f.querySelector(`[name="${nom}"]`)?.value.trim() || null;
  const lignes = (nom) => (valeur(nom) || "").split("\n").map((x) => x.trim()).filter(Boolean);
  const coches = (nom) => [...f.querySelectorAll(`[data-liste="${nom}"] input:checked`)].map((c) => c.value);
  const logs = {};
  f.querySelectorAll("[data-log]").forEach((s) => (logs[s.dataset.log] = s.value || null));
  const categories = [...f.querySelectorAll(".cat-ticket")]
    .map((l) => ({
      id: l.querySelector("[name=cat-id]").value.trim().toLowerCase(),
      label: l.querySelector("[name=cat-label]").value.trim(),
      emoji: l.querySelector("[name=cat-emoji]").value.trim(),
      description: l.querySelector("[name=cat-description]").value.trim(),
    }))
    .filter((c) => c.id || c.label || c.emoji || c.description);
  return {
    prefix: valeur("prefix"),
    color: valeur("color"),
    welcomeChannel: valeur("welcomeChannel"),
    welcomeMessage: valeur("welcomeMessage"),
    memberRole: valeur("memberRole"),
    counterChannel: valeur("counterChannel"),
    counterFormat: valeur("counterFormat"),
    vipRole: valeur("vipRole"),
    ticketStaffRole: valeur("ticketStaffRole"),
    ticketCategory: valeur("ticketCategory"),
    ticketTranscripts: valeur("ticketTranscripts"),
    ticketCategories: categories.length ? categories : null,
    logs,
    customCommands: [...f.querySelectorAll(".ligne-commande")]
      .map((l) => ({
        name: l.querySelector('[data-cmd="name"]').value.trim().toLowerCase(),
        response: l.querySelector('[data-cmd="response"]').value.trim(),
        embed: l.querySelector('[data-cmd="embed"]').checked,
        deleteTrigger: l.querySelector('[data-cmd="deleteTrigger"]').checked,
      }))
      .filter((c) => c.name || c.response),
    automod: {
      enabled: f.querySelector('[name="am-enabled"]').checked,
      antiInvites: f.querySelector('[name="am-antiInvites"]').checked,
      antiLinks: f.querySelector('[name="am-antiLinks"]').checked,
      allowedDomains: lignes("am-allowedDomains"),
      antiSpam: f.querySelector('[name="am-antiSpam"]').checked,
      maxMentions: Number(valeur("am-maxMentions") || 0),
      badWords: lignes("am-badWords"),
      antiCaps: f.querySelector('[name="am-antiCaps"]').checked,
      action: valeur("am-action") || "supprimer",
      muteMinutes: Number(valeur("am-muteMinutes") || 10),
      ignoredRoles: coches("am-ignoredRoles"),
      ignoredChannels: coches("am-ignoredChannels"),
    },
    tempVoice: {
      creatorChannelId: valeur("tv-creatorChannelId"),
      categoryId: valeur("tv-categoryId"),
      nameFormat: valeur("tv-nameFormat") || "",
      userLimit: Number(valeur("tv-userLimit") || 0),
    },
    rediffNotif: {
      channelId: valeur("rn-channelId"),
      mention: valeur("rn-mention") || "",
      message: valeur("rn-message") || "",
      siteUrl: valeur("rn-siteUrl") || "",
    },
    backupChannel: valeur("backupChannel"),
    liveNotif: {
      channelId: valeur("live-salon"),
      mention: valeur("live-mention") || "",
      twitch: (valeur("live-twitch") || "").toLowerCase(),
      kick: (valeur("live-kick") || "").toLowerCase(),
      message: valeur("live-message") || "",
    },
  };
}

function brancherBot() {
  const zone = $("#panneau-bot");
  afficherHistoriqueBot();
  $("#bot-actualiser").onclick = () => chargerBot();

  // Un seul gestionnaire de clics pour tout l'onglet (redessiné à chaque chargement)
  zone.onclick = async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;

    if (b.dataset.annulerAction) {
      if (!confirm("Annuler cette action ?")) return;
      try {
        await appelApi(`/admin/bot/actions/${encodeURIComponent(b.dataset.annulerAction)}`, { method: "DELETE" });
        BOT.actions = BOT.actions.filter((a) => a.id !== b.dataset.annulerAction);
      } catch (err) {
        alert(err.message);
        return chargerBot();
      }
      return afficherHistoriqueBot();
    }

    // Catégories de tickets : réordonner / retirer
    if (b.dataset.cat) {
      const ligne = b.closest(".cat-ticket");
      if (b.dataset.cat === "retirer") ligne.remove();
      if (b.dataset.cat === "monter" && ligne.previousElementSibling) ligne.parentElement.insertBefore(ligne, ligne.previousElementSibling);
      if (b.dataset.cat === "descendre" && ligne.nextElementSibling) ligne.parentElement.insertBefore(ligne.nextElementSibling, ligne);
      return;
    }
    if (b.id === "ajouter-cat-ticket") {
      if ($("#cats-ticket").children.length >= 25) return alert("25 catégories maximum.");
      return $("#cats-ticket").insertAdjacentHTML("beforeend", ligneCategorieTicket());
    }

    // Sondage : choix dynamiques
    if (b.id === "so-ajouter-choix") {
      if ($("#so-choix").children.length >= 10) return alert("10 choix maximum.");
      return $("#so-choix").insertAdjacentHTML("beforeend", ligneChoixSondage());
    }
    if (b.hasAttribute("data-retirer-choix")) {
      if ($("#so-choix").children.length <= 2) return alert("Il faut au moins 2 choix.");
      return b.parentElement.remove();
    }

    if (b.id === "bot-compteur") return actionBot("compteur_creer", {}, $("#retour-compteur"), b);

    if (b.id === "bot-panel") {
      const salonId = $("#panel-salon").value;
      if (!salonId) return ($("#retour-panel").innerHTML = message("Choisis le salon où envoyer le panel.", "erreur"));
      return actionBot("ticket_panel", { salonId }, $("#retour-panel"), b);
    }
    if (b.dataset.fermerTicket) {
      const raison = prompt("Raison de la fermeture (facultatif) :", "");
      if (raison === null) return;
      return actionBot("ticket_fermer", { salonId: b.dataset.fermerTicket, ...(raison.trim() ? { raison: raison.trim() } : {}) }, $("#retour-tickets"), b);
    }

    if (b.id === "bot-vip") {
      const membre = $("#vip-membre").value.trim();
      const duree = $("#vip-duree").value.trim();
      if (!membre) return ($("#retour-vip").innerHTML = message("Indique le pseudo Discord ou l'ID du membre.", "erreur"));
      if (duree && !DUREE_BOT.test(duree)) return ($("#retour-vip").innerHTML = message("Durée invalide (ex : 30m, 2h, 7j, 1j12h).", "erreur"));
      if (await actionBot("vip_ajouter", { membre, ...(duree ? { duree } : {}) }, $("#retour-vip"), b)) {
        $("#vip-membre").value = $("#vip-duree").value = "";
      }
      return;
    }
    if (b.dataset.retirerVip) {
      if (!confirm(`Retirer le VIP de ${b.dataset.nom} ?`)) return;
      return actionBot("vip_retirer", { membreId: b.dataset.retirerVip }, $("#retour-vip"), b);
    }

    if (b.dataset.supprSanction) {
      if (!confirm(`Supprimer la sanction #${b.dataset.supprSanction} ?`)) return;
      return actionBot("sanction_supprimer", { id: b.dataset.supprSanction }, $("#retour-sanctions"), b);
    }
    if (b.id === "bot-blacklist") {
      const membre = $("#bl-membre").value.trim();
      const raison = $("#bl-raison").value.trim();
      if (!membre) return ($("#retour-blacklist").innerHTML = message("Indique le pseudo Discord ou l'ID.", "erreur"));
      if (await actionBot("blacklist_ajouter", { membre, ...(raison ? { raison } : {}) }, $("#retour-blacklist"), b)) {
        $("#bl-membre").value = $("#bl-raison").value = "";
      }
      return;
    }
    if (b.dataset.retirerBlacklist) {
      if (!confirm(`Retirer ${b.dataset.nom} de la blacklist ?`)) return;
      return actionBot("blacklist_retirer", { membreId: b.dataset.retirerBlacklist }, $("#retour-blacklist"), b);
    }

    if (b.id === "bot-giveaway") {
      const salonId = $("#ga-salon").value;
      const prix = $("#ga-prix").value.trim();
      const duree = $("#ga-duree").value.trim();
      const gagnants = Number($("#ga-gagnants").value) || 1;
      const description = $("#ga-description").value.trim();
      const retour = $("#retour-giveaway");
      if (!salonId || !prix || !duree) return (retour.innerHTML = message("Salon, prix et durée sont obligatoires.", "erreur"));
      if (!DUREE_BOT.test(duree)) return (retour.innerHTML = message("Durée invalide (ex : 30m, 2h, 7j, 1j12h).", "erreur"));
      if (await actionBot("giveaway_creer", { salonId, prix, duree, gagnants, ...(description ? { description } : {}) }, retour, b)) {
        $("#ga-prix").value = $("#ga-duree").value = $("#ga-description").value = "";
      }
      return;
    }
    if (b.dataset.ga) {
      const type = b.dataset.ga;
      const params = { id: b.dataset.id };
      if (type === "giveaway_supprimer" && !confirm("Supprimer ce giveaway ?")) return;
      if (type === "giveaway_terminer" && !confirm("Terminer ce giveaway maintenant et tirer les gagnants ?")) return;
      if (type === "giveaway_reroll") {
        const n = prompt("Nombre de nouveaux gagnants (facultatif) :", "");
        if (n === null) return;
        if (n.trim()) params.gagnants = Math.max(1, Number(n) || 1);
      }
      return actionBot(type, params, $("#retour-giveaways"), b);
    }

    if (b.id === "bot-sondage") {
      const salonId = $("#so-salon").value;
      const question = $("#so-question").value.trim();
      const duree = $("#so-duree").value.trim();
      const options = [...document.querySelectorAll("#so-choix [name=choix]")].map((i) => i.value.trim()).filter(Boolean);
      const retour = $("#retour-sondage");
      if (!salonId || !question) return (retour.innerHTML = message("Salon et question sont obligatoires.", "erreur"));
      if (options.length < 2 || options.length > 10) return (retour.innerHTML = message("Il faut entre 2 et 10 choix remplis.", "erreur"));
      if (duree && !DUREE_BOT.test(duree)) return (retour.innerHTML = message("Durée invalide (ex : 30m, 2h, 7j, 1j12h).", "erreur"));
      if (await actionBot("sondage_creer", { salonId, question, options, ...(duree ? { duree } : {}) }, retour, b)) {
        $("#so-question").value = $("#so-duree").value = "";
        $("#so-choix").innerHTML = ligneChoixSondage("Oui") + ligneChoixSondage("Non");
      }
      return;
    }
    if (b.dataset.terminerSondage) {
      if (!confirm("Terminer ce sondage maintenant ?")) return;
      return actionBot("sondage_terminer", { id: b.dataset.terminerSondage }, $("#retour-sondages"), b);
    }

    /* Rôles-réactions */
    if (b.id === "rr-nouveau") return remplirPanneauRoles(null);
    if (b.id === "rr-ajouter-role") {
      if ($("#rr-roles").children.length >= 25) return alert("25 rôles maximum par panneau.");
      $("#rr-roles").insertAdjacentHTML("beforeend", ligneRoleReaction());
      return rafraichirFormulaireRoles();
    }
    if (b.dataset.rrAction) {
      const ligne = b.closest(".ligne-role-reaction");
      if (b.dataset.rrAction === "retirer") ligne.remove();
      if (b.dataset.rrAction === "monter" && ligne.previousElementSibling) ligne.parentElement.insertBefore(ligne, ligne.previousElementSibling);
      if (b.dataset.rrAction === "descendre" && ligne.nextElementSibling) ligne.parentElement.insertBefore(ligne.nextElementSibling, ligne);
      return rafraichirFormulaireRoles();
    }
    if (b.dataset.modifierPanneau) {
      const p = (BOT.etat.rolesReactions || []).find((x) => x.id === b.dataset.modifierPanneau);
      if (p) remplirPanneauRoles(p);
      return $("#rr-titre-formulaire").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (b.dataset.supprPanneau) {
      if (!confirm(`Supprimer le panneau « ${b.dataset.supprPanneau} » ? Son message sera retiré de Discord.`)) return;
      return actionBot("roles_supprimer", { id: b.dataset.supprPanneau }, $("#retour-panneaux"), b);
    }
    if (b.id === "bot-roles-publier") {
      const retour = $("#retour-roles");
      const p = lirePanneauRoles();
      const roles = p.roles.filter((r) => r.roleId || r.label || r.emoji || r.description);
      if (!/^[a-z0-9-]{1,30}$/.test(p.id)) return (retour.innerHTML = message("Identifiant : a-z, 0-9 et -, 30 caractères maximum.", "erreur"));
      if (!p.salonId) return (retour.innerHTML = message("Choisis le salon du panneau.", "erreur"));
      if (!roles.length || roles.length > 25) return (retour.innerHTML = message("Il faut entre 1 et 25 rôles.", "erreur"));
      const vus = new Set();
      for (const r of roles) {
        if (!r.roleId) return (retour.innerHTML = message("Choisis un rôle sur chaque ligne.", "erreur"));
        if (!r.label) return (retour.innerHTML = message("Chaque rôle doit avoir un texte de bouton.", "erreur"));
        if (vus.has(r.roleId)) return (retour.innerHTML = message("Le même rôle est présent deux fois.", "erreur"));
        vus.add(r.roleId);
      }
      const existant = (BOT.etat.rolesReactions || []).find((x) => x.id === p.id);
      if (existant && existant.salonId !== p.salonId) {
        if (!confirm(`Le panneau « ${p.id} » change de salon : l'ancien message sera supprimé. Continuer ?`)) return;
      } else if (existant && !confirm(`Le panneau « ${p.id} » existe déjà : son message sera mis à jour. Continuer ?`)) return;
      const params = {
        id: p.id,
        salonId: p.salonId,
        ...(p.titre ? { titre: p.titre } : {}),
        ...(p.texte ? { texte: p.texte } : {}),
        couleur: p.couleur,
        mode: p.mode,
        unique: p.unique,
        roles: roles.map((r) => ({
          roleId: r.roleId,
          label: r.label,
          ...(r.emoji ? { emoji: r.emoji } : {}),
          ...(r.description && p.mode === "menu" ? { description: r.description } : {}),
          ...(p.mode === "boutons" ? { style: r.style || "gris" } : {}),
        })),
      };
      return actionBot("roles_publier", params, retour, b);
    }

    /* Commandes personnalisées */
    if (b.id === "ajouter-commande") {
      if ($("#commandes-perso").children.length >= 50) return alert("50 commandes maximum.");
      $("#commandes-perso").insertAdjacentHTML("beforeend", ligneCommandePerso());
      return $("#commandes-perso").lastElementChild.querySelector('[data-cmd="name"]').focus();
    }
    if (b.hasAttribute("data-retirer-commande")) return b.closest(".ligne-commande").remove();

    /* Annonces de rediffs et sauvegardes */
    if (b.id === "bot-rediff-test") return actionBot("rediff_test", {}, $("#retour-rediff-test"), b);
    if (b.id === "bot-sauvegarde") return actionBot("sauvegarde_maintenant", {}, $("#retour-sauvegarde-bot"), b);

    /* Notifications de live */
    if (b.dataset.liveTest) return actionBot("live_test", { plateforme: b.dataset.liveTest }, $("#retour-live"), b);

    if (b.id === "an-modele-live") {
      const chaine = SITE.chaineTwitch || "";
      $("#an-titre").value = "🔴 Je suis en live !";
      $("#an-texte").value = chaine
        ? `Le stream vient de commencer, viens me rejoindre sur Twitch ! 🎮\nhttps://www.twitch.tv/${chaine}`
        : "Le stream vient de commencer, viens me rejoindre ! 🎮";
      if (chaine) {
        $("#an-lien").value = `https://www.twitch.tv/${chaine}`;
        $("#an-image").value = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${chaine}-1280x720.jpg`;
      }
      $("#an-texte-bouton").value = "Regarder le live";
      $("#an-couleur").value = "#9146ff";
      return;
    }
    if (b.id === "bot-annonce") {
      const retour = $("#retour-annonce");
      const salonId = $("#an-salon").value;
      const params = {
        salonId,
        titre: $("#an-titre").value.trim(),
        texte: $("#an-texte").value.trim(),
        couleur: $("#an-couleur").value,
        image: $("#an-image").value.trim(),
        lien: $("#an-lien").value.trim(),
        texteBouton: $("#an-texte-bouton").value.trim(),
        mention: $("#an-mention").value,
      };
      if (!salonId) return (retour.innerHTML = message("Choisis le salon de l'annonce.", "erreur"));
      if (!params.titre && !params.texte) return (retour.innerHTML = message("Mets au moins un titre ou un texte.", "erreur"));
      if (params.image && !lienHttps(params.image)) return (retour.innerHTML = message("L'image doit être un lien https://", "erreur"));
      if (params.lien && !lienHttps(params.lien)) return (retour.innerHTML = message("Le lien doit commencer par https://", "erreur"));
      for (const cle of Object.keys(params)) if (params[cle] === "") delete params[cle];
      const mention = params.mention ? ` avec une mention ${params.mention === "everyone" || params.mention === "here" ? "@" + params.mention : "de rôle"}` : "";
      if (!confirm(`Envoyer cette annonce dans ${nomSalonBot(salonId)}${mention} ?`)) return;
      return actionBot("annonce", params, retour, b);
    }
  };

  // Aperçus en direct (rôles-réactions, nom des commandes)
  zone.oninput = (ev) => {
    const t = ev.target;
    if (t.id === "rr-id") idPanneauManuel = Boolean(t.value.trim());
    if (t.id === "rr-titre" && !idPanneauManuel) $("#rr-id").value = slugPanneau(t.value);
    if (t.closest?.("#rr-apercu") || t.id?.startsWith("rr-") || t.closest?.(".ligne-role-reaction")) rafraichirFormulaireRoles();
    if (t.dataset?.cmd === "name") {
      t.closest(".ligne-commande").querySelector(".apercu-cmd").textContent =
        (BOT?.config?.prefix || BOT?.etat?.config?.prefix || "+") + (t.value.trim().toLowerCase() || "nom");
    }
  };
  zone.onchange = (ev) => {
    const t = ev.target;
    if (t.name === "am-antiLinks") $("#am-domaines-bloc").hidden = !t.checked;
    if (t.name === "am-action") $("#am-mute-bloc").hidden = t.value !== "mute";
    // Choisir un rôle remplit le texte du bouton s'il est vide
    if (t.dataset?.rr === "roleId") {
      const label = t.closest(".ligne-role-reaction").querySelector('[data-rr="label"]');
      const role = (BOT.etat.roles || []).find((r) => r.id === t.value);
      if (role && !label.value.trim()) label.value = role.nom.slice(0, 80);
    }
    if (t.closest?.(".ligne-role-reaction") || t.id?.startsWith("rr-")) rafraichirFormulaireRoles();
  };
  if ($("#rr-roles")) remplirPanneauRoles(null);

  $("#form-bot")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const retour = $("#retour-config-bot");
    const bouton = ev.submitter;
    const config = lireConfigBot();
    if (config.counterFormat && !config.counterFormat.includes("{count}")) {
      return (retour.innerHTML = message("Le format du compteur doit contenir {count}.", "erreur"));
    }
    if (config.prefix && /\s/.test(config.prefix)) return (retour.innerHTML = message("Le préfixe ne doit pas contenir d'espace.", "erreur"));
    const a = config.automod;
    const erreurV3 =
      !Number.isInteger(a.maxMentions) || a.maxMentions < 0 || a.maxMentions > 50 ? "Automod : mentions maximum entre 0 et 50."
      : a.action === "mute" && (!Number.isInteger(a.muteMinutes) || a.muteMinutes < 1 || a.muteMinutes > 1440) ? "Automod : durée du mute entre 1 et 1440 minutes."
      : a.allowedDomains.length > 50 ? "Automod : 50 domaines autorisés maximum."
      : a.badWords.length > 200 ? "Automod : 200 mots interdits maximum."
      : a.badWords.some((m) => m.length > 50) ? "Automod : chaque mot interdit fait 50 caractères maximum."
      : !Number.isInteger(config.tempVoice.userLimit) || config.tempVoice.userLimit < 0 || config.tempVoice.userLimit > 99 ? "Vocaux temporaires : limite de places entre 0 et 99."
      : config.rediffNotif.siteUrl && !lienHttps(config.rediffNotif.siteUrl) ? "Annonces de rediffs : l'adresse du site doit commencer par https://"
      : "";
    if (erreurV3) return (retour.innerHTML = message(erreurV3, "erreur"));
    if (a.action !== "mute") a.muteMinutes = Number.isInteger(a.muteMinutes) && a.muteMinutes >= 1 && a.muteMinutes <= 1440 ? a.muteMinutes : 10;
    const noms = new Set();
    for (const c of config.customCommands) {
      if (!/^[a-z0-9_-]{1,32}$/.test(c.name)) return (retour.innerHTML = message(`Commande « ${c.name || "?"} » : nom en minuscules (a-z, 0-9, - et _), 32 caractères maximum.`, "erreur"));
      if (noms.has(c.name)) return (retour.innerHTML = message(`Commande en double : « ${c.name} ».`, "erreur"));
      noms.add(c.name);
      if (!c.response) return (retour.innerHTML = message(`Commande « ${c.name} » : écris une réponse.`, "erreur"));
    }
    if (bouton) bouton.disabled = true;
    try {
      const r = await appelApi("/admin/bot/config", { method: "PUT", body: JSON.stringify(config) });
      BOT.config = { ...config, version: r.version };
      $("#bot-statut").innerHTML = htmlStatutBot();
      retour.innerHTML = message(`Réglages enregistrés. ${ENVOYE_AU_BOT}`, "ok");
    } catch (err) {
      if (err.statut === 401) return afficherAdmin("Ta connexion a expiré, reconnecte-toi.");
      retour.innerHTML = message(err.message, "erreur");
    } finally {
      if (bouton) bouton.disabled = false;
    }
  });
}

window.pageAdmin = () => afficherAdmin(ERREUR_CONNEXION || "");
