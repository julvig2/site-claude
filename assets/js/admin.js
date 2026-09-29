/* Espace admin : publication des rediffs et des cartes Info. La connexion Twitch est dans compte.js. */

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
  deconnexion(); // défini dans compte.js
  afficherAdmin();
}

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
      <p>Connecte-toi avec ton compte Twitch pour publier des rediffs.</p>${boutonConnexion}`;
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

  const barre = `<div class="barre-admin">Connecté : <strong>${echapper(moi.login)}</strong>
    <button class="btn btn-contour btn-petit" id="deconnexion">Se déconnecter</button></div>`;

  if (!moi.admin) {
    zone.innerHTML = barre + message("Ce compte Twitch n'a pas accès à l'espace admin.", "erreur");
    $("#deconnexion").onclick = seDeconnecter;
    return;
  }

  zone.innerHTML = `${barre}
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
        <small>Un chapitre par ligne : le moment, puis le titre. Sur le site, cliquer sur un chapitre fait sauter la vidéo à ce moment.</small>
      </label>
      <div id="retour-formulaire"></div>
      <div class="boutons">
        <button class="btn" type="submit" id="envoyer">Publier</button>
        <button class="btn btn-contour" type="button" id="annuler" hidden>Annuler</button>
      </div>
    </form>
    <h2>Rediffs publiées</h2>
    <div id="liste-admin"></div>

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
    <div id="liste-infos"></div>`;

  $("#deconnexion").onclick = seDeconnecter;
  brancherFormulaire();
  await rafraichirListe();
  await brancherInfos();
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
      ...v,
    };
    const bouton = $("#envoyer");
    bouton.disabled = true;
    try {
      if (enEdition) {
        await appelApi(`/redifs/${encodeURIComponent(enEdition)}`, { method: "PUT", body: JSON.stringify(donnees) });
      } else {
        await appelApi("/redifs", { method: "POST", body: JSON.stringify(donnees) });
      }
      const texte = enEdition ? "Rediff modifiée !" : "Rediff publiée ! Elle est déjà visible sur le site.";
      reinitialiserFormulaire();
      retour.innerHTML = message(texte, "ok");
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
