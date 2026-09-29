/*
 * Connexion avec Twitch (pour l'admin et pour les viewers) et appels au serveur.
 *
 * Twitch renvoie toujours vers admin.html (la seule adresse enregistrée dans
 * l'application Twitch). On note donc la page de départ avant de partir,
 * puis on y retourne une fois connecté.
 */

const CLE_JETON = "julvig_jeton_twitch";
const CLE_ETAT = "julvig_etat_oauth";
const CLE_RETOUR = "julvig_page_retour";

function stockage(action, cle, valeur) {
  try {
    if (action === "lire") return localStorage.getItem(cle);
    if (action === "ecrire") localStorage.setItem(cle, valeur);
    if (action === "effacer") localStorage.removeItem(cle);
  } catch {
    return null;
  }
}

const connecte = () => Boolean(stockage("lire", CLE_JETON));
const connexionPossible = () => Boolean(SITE.api && SITE.twitchClientId);

function urlApi(chemin) {
  return `${SITE.api.replace(/\/$/, "")}${chemin}`;
}

async function appelApi(chemin, options = {}) {
  const jeton = stockage("lire", CLE_JETON);
  const rep = await fetch(urlApi(chemin), {
    ...options,
    headers: {
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const donnees = await rep.json().catch(() => ({}));
  if (rep.status === 401) stockage("effacer", CLE_JETON);
  if (!rep.ok) throw Object.assign(new Error(donnees.erreur || `Erreur ${rep.status}`), { statut: rep.status });
  return donnees;
}

function message(texte, type = "info") {
  return `<p class="message message-${type}">${echapper(texte)}</p>`;
}

// Adresse de admin.html, dans le même dossier que la page actuelle
function adresseCallback() {
  return new URL("admin.html", location.href).href.split("#")[0].split("?")[0];
}

function seConnecter() {
  const etat = crypto.getRandomValues(new Uint32Array(4)).join("-");
  stockage("ecrire", CLE_ETAT, etat);
  stockage("ecrire", CLE_RETOUR, location.href.split("#")[0]);
  const params = new URLSearchParams({
    response_type: "token",
    client_id: SITE.twitchClientId,
    redirect_uri: adresseCallback(),
    scope: "",
    state: etat,
  });
  location.href = `https://id.twitch.tv/oauth2/authorize?${params}`;
}

function deconnexion() {
  stockage("effacer", CLE_JETON);
}

/*
 * Au retour de Twitch, le jeton arrive dans l'URL (#access_token=...).
 * Renvoie { erreur, redirige } : redirige = true si on repart vers la page de départ.
 */
function traiterRetourTwitch() {
  const params = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
  const jeton = params.get("access_token");
  const erreurTwitch = params.get("error_description") || params.get("error");
  if (!jeton && !erreurTwitch) return { erreur: "", redirige: false };

  const etatAttendu = stockage("lire", CLE_ETAT);
  const retour = stockage("lire", CLE_RETOUR);
  stockage("effacer", CLE_ETAT);
  stockage("effacer", CLE_RETOUR);
  history.replaceState(null, "", location.pathname);

  let erreur = "";
  if (erreurTwitch) erreur = `Connexion annulée : ${erreurTwitch}`;
  else if (!etatAttendu || params.get("state") !== etatAttendu) erreur = "La connexion a échoué, réessaie.";
  else stockage("ecrire", CLE_JETON, jeton);

  // Retour vers la page de départ (seulement une page de ce site)
  if (retour) {
    const cible = new URL(retour, location.href);
    if (cible.origin === location.origin && cible.pathname !== location.pathname) {
      location.replace(cible.href);
      return { erreur, redirige: true };
    }
  }
  return { erreur, redirige: false };
}

let ERREUR_CONNEXION = "";
