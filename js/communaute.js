/* ==========================================================================
   COMMUNAUTÉ : derniers packs, populaires, favoris, mon espace
   - Version en ligne (Claude) : partagée entre les membres (base "db").
   - Ailleurs : packs et favoris gardés dans ce navigateur (localStorage).

   Chaque membre n'écrit QUE ses propres documents (règles "{self}") :
     membres/<membre>              { pseudo, packs: { <id>: pack }, ventes: { <pack>__<acheteur>: vente } }
     activite/<membre>             { favoris: [ids], telecharges: [ids], achats: { <pack>: demande } }
     fichiers/<membre>/sons/<pack> { wav (base64) }
   Ainsi personne ne peut changer le lien de paiement d'un autre, ni valider
   ses propres achats : seule la personne qui vend écrit ses ventes.
   ========================================================================== */

const Communaute = (() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const CLE_LOCALE = "forgepack:mes-packs";
  const CLE_FAVORIS = "forgepack:favoris";
  const MAX_PACKS = 150;
  const euros = (n) => Number(n || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  const copie = (o) => JSON.parse(JSON.stringify(o));
  const toast = (m) => window.ForgeUI && window.ForgeUI.toast(m);

  let db = null;
  let uid = null;
  let proprio = false;
  let partage = false;
  let lectureSeule = false;
  let etat = "chargement"; // chargement | ok | lent | erreur | local
  let onglet = "derniers";
  let membres = new Map();    // membre → { pseudo, packs, ventes }
  let activites = new Map();  // membre → { favoris, telecharges, achats }
  let packsLocaux = [];
  let favorisLocaux = new Set();

  /* ---------- Démarrage ---------- */
  const lireLocal = (cle, defaut) => {
    try { return JSON.parse(localStorage.getItem(cle) || "null") ?? defaut; } catch (e) { return defaut; }
  };
  const ecrireLocal = (cle, v) => {
    try { localStorage.setItem(cle, JSON.stringify(v)); return true; } catch (e) { return false; }
  };

  async function init() {
    const c = window.claude;
    if (c && typeof c.use === "function") {
      try {
        const [d, u] = await Promise.all([c.use("db"), c.use("user")]);
        db = d;
        if (u) {
          uid = await u.id();
          proprio = await u.isOwner();
          lectureSeule = (await u.can("data.write")) === false || !uid;
        }
      } catch (e) {
        db = null;
      }
    }
    if (db) {
      partage = true;
      abonner();
    } else {
      etat = "local";
      packsLocaux = lireLocal(CLE_LOCALE, []);
      favorisLocaux = new Set(lireLocal(CLE_FAVORIS, []));
      afficher();
    }
  }

  function abonner() {
    const minuterie = setTimeout(() => {
      if (etat === "chargement") { etat = "lent"; afficher(); }
    }, 10000);
    db.collection("membres").limit(500).onSnapshot(
      (snap) => {
        membres = new Map(snap.docs.map((d) => [d.id, d.data()]));
        if (!snap.metadata.fromCache) { etat = "ok"; clearTimeout(minuterie); }
        afficher();
      },
      () => { etat = "erreur"; clearTimeout(minuterie); afficher(); }
    );
    db.collection("activite").limit(1000).onSnapshot(
      (snap) => { activites = new Map(snap.docs.map((d) => [d.id, d.data()])); afficher(); },
      () => {}
    );
  }

  /* ---------- Lecture ---------- */
  function tousLesPacks() {
    if (!partage) return packsLocaux;
    const liste = [];
    membres.forEach((m, id) => Object.values(m.packs || {}).forEach((p) => liste.push({ ...p, vendeurId: id })));
    return liste.sort((a, b) => b.creeLe - a.creeLe);
  }
  const vide = () => ({ favoris: [], telecharges: [], achats: {} });
  const monActivite = () => ({ ...vide(), ...(activites.get(uid) || {}) });
  const monMembre = () => ({ pseudo: "", packs: {}, ventes: {}, ...(membres.get(uid) || {}) });
  const estAMoi = (p) => (partage ? Boolean(uid) && p.vendeurId === uid : true);

  function compter(champ, packId) {
    let n = 0;
    activites.forEach((a) => { if ((a[champ] || []).includes(packId)) n++; });
    return n;
  }
  const nbFavoris = (p) => (partage ? compter("favoris", p.id) : favorisLocaux.has(p.id) ? 1 : 0);
  const nbTelechargements = (p) => (partage ? compter("telecharges", p.id) : p.telechargements || 0);
  const estFavori = (p) => (partage ? monActivite().favoris.includes(p.id) : favorisLocaux.has(p.id));
  function ventesDe(p) {
    if (!partage) return [];
    return Object.values((membres.get(p.vendeurId) || {}).ventes || {}).filter((v) => v.packId === p.id && v.statut === "valide");
  }
  const revenusDe = (p) => ventesDe(p).reduce((s, v) => s + Number(v.prix || 0), 0);

  function etatAchat(p) {
    if (!p.prix || estAMoi(p) || !partage) return "libre";
    const vente = ((membres.get(p.vendeurId) || {}).ventes || {})[`${p.id}__${uid}`];
    if (vente && vente.statut === "valide") return "achete";
    if (vente && vente.statut === "refuse") return "refuse";
    if (monActivite().achats[p.id]) return "attente";
    return "a_acheter";
  }

  /** Paiements signalés par des acheteurs et pas encore traités par moi. */
  function demandesATraiter() {
    if (!partage || !uid) return [];
    const moi = monMembre();
    const res = [];
    activites.forEach((a, acheteurId) => {
      Object.entries(a.achats || {}).forEach(([packId, d]) => {
        const pack = moi.packs[packId];
        if (!pack || moi.ventes[`${packId}__${acheteurId}`]) return;
        res.push({ ...d, packId, acheteurId, packNom: pack.nom });
      });
    });
    return res.sort((x, y) => x.le - y.le);
  }

  /* ---------- Écriture (uniquement ses propres documents) ---------- */
  async function ecrireMembre(modifier) {
    const doc = copie(monMembre());
    modifier(doc);
    doc.maj = Date.now();
    if (JSON.stringify(doc).length > 240000) throw new Error("ton espace est plein : supprime d'anciens packs");
    membres.set(uid, doc);
    await db.doc("membres/" + uid).set(doc);
  }
  async function ecrireActivite(modifier) {
    const doc = copie(monActivite());
    modifier(doc);
    doc.telecharges = doc.telecharges.slice(-500);
    activites.set(uid, doc);
    await db.doc("activite/" + uid).set(doc);
    afficher();
  }
  function peutEcrire() {
    if (partage && lectureSeule) {
      toast("Ton accès permet de voir et télécharger les packs gratuits. Pour publier, acheter ou mettre en favori, demande l'accès « Contributeur » au propriétaire du site.");
      return false;
    }
    return true;
  }

  /** Lit les champs « Vendre ce pack » d'une carte de création. */
  function lireVente(suffixe) {
    const vendre = $("#vendre" + suffixe);
    if (!vendre || !vendre.checked) return { prix: 0, lien: "" };
    if (!partage) return { erreur: "La vente marche sur la version en ligne du site. Décoche « Vendre ce pack » pour créer ton pack ici." };
    const prix = Math.round(parseFloat(String($("#prix" + suffixe).value).replace(",", ".")) * 100) / 100;
    if (!(prix >= 0.5 && prix <= 200)) return { erreur: "Choisis un prix entre 0,50 € et 200 €." };
    let lien = $("#lien" + suffixe).value.trim();
    try {
      const u = new URL(lien);
      if (u.protocol !== "https:") throw new Error();
      lien = u.href;
    } catch (e) {
      return { erreur: "Ajoute ton lien de paiement complet, qui commence par https:// (par exemple https://paypal.me/tonpseudo)." };
    }
    return { prix, lien };
  }

  /** Publie un pack. pack.prix / pack.lien viennent de lireVente(). */
  async function publier(pack, sonBase64) {
    if (partage) {
      if (!peutEcrire()) return false;
      if (Object.keys(monMembre().packs).length >= MAX_PACKS) {
        toast(`Tu as atteint ${MAX_PACKS} packs : supprime-en dans « Mon espace » pour en publier d'autres.`);
        return false;
      }
      try {
        const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        if (sonBase64) await db.doc(`fichiers/${uid}/sons/${id}`).set({ wav: sonBase64 });
        await ecrireMembre((m) => {
          if (pack.auteur) m.pseudo = pack.auteur;
          m.packs[id] = copie({ ...pack, id, creeLe: Date.now() });
        });
        afficher();
        return true;
      } catch (e) {
        toast(e && e.code === "quota_exceeded"
          ? "La communauté est pleine : supprime d'anciens packs."
          : `Publication impossible : ${(e && e.message) || "réessaie plus tard"}. Ton pack est quand même téléchargé.`);
        return false;
      }
    }
    packsLocaux.unshift({ ...copie(pack), id: "l" + Date.now().toString(36), creeLe: Date.now(), telechargements: 0, sonBase64: sonBase64 || undefined });
    if (!ecrireLocal(CLE_LOCALE, packsLocaux)) {
      packsLocaux.shift();
      toast("Le navigateur n'a plus de place pour garder ce pack.");
      return false;
    }
    afficher();
    return true;
  }

  async function sonDe(p) {
    if (!partage) return p.sonBase64;
    const s = await db.doc(`fichiers/${p.vendeurId}/sons/${p.id}`).get();
    return s.exists ? s.data().wav : null;
  }

  async function noterTelechargement(p) {
    if (partage) {
      if (lectureSeule || estAMoi(p) || monActivite().telecharges.includes(p.id)) return;
      try { await ecrireActivite((a) => a.telecharges.push(p.id)); } catch (e) { /* compteur seulement */ }
      return;
    }
    const l = packsLocaux.find((x) => x.id === p.id);
    if (l) { l.telechargements = (l.telechargements || 0) + 1; ecrireLocal(CLE_LOCALE, packsLocaux); afficher(); }
  }

  async function basculerFavori(p) {
    if (partage) {
      if (!peutEcrire()) return;
      try {
        await ecrireActivite((a) => {
          a.favoris = a.favoris.includes(p.id) ? a.favoris.filter((x) => x !== p.id) : [...a.favoris, p.id];
        });
      } catch (e) { toast("Favori non enregistré, réessaie."); }
      return;
    }
    favorisLocaux.has(p.id) ? favorisLocaux.delete(p.id) : favorisLocaux.add(p.id);
    ecrireLocal(CLE_FAVORIS, [...favorisLocaux]);
    afficher();
  }

  async function signalerPaiement(p, nomPaiement) {
    if (!peutEcrire()) return;
    try {
      await ecrireActivite((a) => {
        a.achats[p.id] = { vendeurId: p.vendeurId, nomPaiement: nomPaiement.slice(0, 60), prix: p.prix, le: Date.now() };
      });
      toast("Le vendeur est prévenu. Tu pourras télécharger dès qu'il aura validé ton paiement.");
    } catch (e) { toast("Envoi impossible, réessaie."); }
  }

  async function repondre(d, valide) {
    try {
      await ecrireMembre((m) => {
        m.ventes[`${d.packId}__${d.acheteurId}`] = {
          packId: d.packId, acheteurId: d.acheteurId, acheteurNom: d.nomPaiement, prix: d.prix,
          statut: valide ? "valide" : "refuse", le: Date.now(),
        };
      });
      afficher();
      toast(valide ? `Vente validée : +${euros(d.prix)}` : "Vente refusée");
    } catch (e) { toast("Réponse non enregistrée, réessaie."); }
  }

  async function supprimer(p) {
    if (partage) {
      try {
        if (estAMoi(p)) {
          await ecrireMembre((m) => { delete m.packs[p.id]; });
        } else if (proprio) {
          // modération par le propriétaire du site
          const autre = copie(membres.get(p.vendeurId) || {});
          if (autre.packs) delete autre.packs[p.id];
          await db.doc("membres/" + p.vendeurId).set(autre);
        }
        if (p.type === "son") await db.doc(`fichiers/${p.vendeurId}/sons/${p.id}`).delete().catch(() => {});
        afficher();
      } catch (e) { toast("Suppression impossible pour le moment."); }
      return;
    }
    packsLocaux = packsLocaux.filter((x) => x.id !== p.id);
    ecrireLocal(CLE_LOCALE, packsLocaux);
    afficher();
  }

  /* ---------- Affichage ---------- */
  const vignettes = new Map();
  function vignette(p) {
    if (vignettes.has(p.id)) return vignettes.get(p.id);
    const r = Moteur.complet(p.reglages || {});
    const scene = Scene.ambiance(r.monde, p.scene || "coucher");
    const c = document.createElement("canvas");
    c.width = 480;
    c.height = 270;
    c.getContext("2d").putImageData(Moteur.traiter(Scene.image(scene, 480, 270, r.monde), r), 0, 0);
    const url = c.toDataURL("image/jpeg", 0.82);
    vignettes.set(p.id, url);
    return url;
  }

  function quand(t) {
    const s = (Date.now() - t) / 1000;
    if (s < 60) return "à l'instant";
    if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    if (s < 86400 * 30) return `il y a ${Math.floor(s / 86400)} j`;
    return new Date(t).toLocaleDateString("fr-FR");
  }
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;
  function etiquette(p) {
    if (p.type === "son") return `Son · ${p.son && p.son.armeNom ? p.son.armeNom : "arme"}`;
    return p.mode === "cvc" ? "Graphique · CVC" : "Graphique · Réaliste";
  }
  function el(tag, classe, texte) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texte !== undefined) e.textContent = texte;
    return e;
  }

  async function telecharger(p, bouton) {
    bouton.disabled = true;
    try {
      if (p.type === "son") {
        const b64 = await sonDe(p);
        if (!b64) throw new Error("son introuvable");
        await SonPack.telecharger({ ...p.son, nom: p.nom, auteur: p.auteur, wav: SonPack.depuisBase64(b64) });
      } else {
        await Exporteur.telecharger(p.reglages, { nom: p.nom, auteur: p.auteur, scene: p.scene, mode: p.mode });
      }
      await noterTelechargement(p);
      toast(`« ${p.nom} » téléchargé ✔`);
    } catch (err) {
      toast("Erreur : " + err.message);
    } finally {
      bouton.disabled = false;
    }
  }

  function carte(p, options = {}) {
    const article = el("article", "pack pack--commu");
    const achat = etatAchat(p);

    // visuel
    const visuel = el("div", "pack__visuel pack__visuel--commu" + (p.type === "son" ? " pack__visuel--son" : ""));
    if (p.type === "son") {
      const onde = el("div", "mini-onde");
      ((p.son && p.son.pics) || []).forEach((v) => {
        const b = el("span");
        b.style.height = Math.max(4, v * 100) + "%";
        onde.appendChild(b);
      });
      const jouer = el("button", "mini-onde__jouer");
      jouer.type = "button";
      jouer.setAttribute("aria-label", `Écouter ${p.nom}`);
      jouer.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
      jouer.addEventListener("click", async () => {
        try {
          const b64 = await sonDe(p);
          if (b64) await SonPack.jouerBase64(b64, p.son ? p.son.volume : 0.8);
        } catch (e) { toast("Lecture impossible."); }
      });
      visuel.append(onde, jouer);
    } else {
      const img = el("img");
      img.alt = "";
      img.src = vignette(p);
      visuel.appendChild(img);
    }
    visuel.appendChild(el("span", "pack__prix-badge" + (p.prix ? "" : " pack__prix-badge--gratuit"), p.prix ? euros(p.prix) : "Gratuit"));
    if (options.rang) visuel.appendChild(el("span", "pack__rang", `#${options.rang}`));

    // infos
    const infos = el("div", "pack__infos");
    infos.append(
      el("p", "pack__cat", etiquette(p)),
      el("h3", "", p.nom),
      el("p", "pack__accroche", `par ${p.auteur || "Anonyme"} · ${quand(p.creeLe)}`)
    );

    // chiffres
    const chiffres = el("p", "pack__chiffres");
    const parts = [`♥ ${nbFavoris(p)}`, pluriel(nbTelechargements(p), "téléchargement")];
    if (options.vendeur && p.prix) {
      const v = ventesDe(p);
      parts.push(pluriel(v.length, "vente"), euros(revenusDe(p)));
    }
    chiffres.textContent = parts.join(" · ");
    infos.appendChild(chiffres);

    // actions
    const bas = el("div", "pack__bas");
    const btns = el("div", "pack__btns");
    const bouton = (texte, classe, action) => {
      const b = el("button", "btn btn--petit " + classe, texte);
      b.type = "button";
      b.addEventListener("click", action);
      btns.appendChild(b);
      return b;
    };

    if (!estAMoi(p)) {
      const fav = bouton(estFavori(p) ? "♥ Favori" : "♡ Favori", "btn--ghost btn--favori" + (estFavori(p) ? " actif" : ""), () => basculerFavori(p));
      fav.setAttribute("aria-pressed", estFavori(p));
    }
    if (estAMoi(p) || proprio) {
      const sup = bouton("Supprimer", "btn--ghost", async () => {
        if (sup.dataset.confirme) { sup.disabled = true; await supprimer(p); return; }
        sup.dataset.confirme = "1";
        sup.textContent = "Confirmer ?";
        setTimeout(() => { delete sup.dataset.confirme; sup.textContent = "Supprimer"; }, 3000);
      });
    }
    const libre = achat === "libre" || achat === "achete";
    if (p.type !== "son" && libre) bouton("Modifier", "btn--ghost", () => window.ForgeUI.chargerPack(p));
    if (libre) {
      bouton(achat === "achete" ? "Télécharger (acheté)" : "Télécharger", "", (e) => telecharger(p, e.currentTarget));
    }

    const statut = el("p", "pack__statut");
    if (achat === "a_acheter") {
      const lien = el("a", "btn btn--petit", `Acheter ${euros(p.prix)}`);
      lien.href = p.lien;
      lien.target = "_blank";
      lien.rel = "noopener";
      btns.appendChild(lien);
      const paye = bouton("J'ai payé", "btn--ghost", () => { form.hidden = !form.hidden; });
      paye.setAttribute("aria-expanded", "false");
      let domaine = "";
      try { domaine = new URL(p.lien).hostname.replace(/^www\./, ""); } catch (e) { /* lien invalide */ }
      statut.textContent = `Paiement sur ${domaine || "le lien du vendeur"}, puis clique « J'ai payé ».`;
      // formulaire « J'ai payé »
      var form = el("form", "achat-form");
      form.hidden = true;
      const id = `paiement-${p.vendeurId || "x"}-${p.id}`;
      const label = el("label", "", "Nom ou pseudo utilisé pour payer");
      label.htmlFor = id;
      const champ = el("input", "champ-texte champ-texte--normal");
      champ.id = id;
      champ.maxLength = 60;
      champ.required = true;
      const envoyer = el("button", "btn btn--petit", "Prévenir le vendeur");
      envoyer.type = "submit";
      form.append(label, champ, envoyer);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (champ.value.trim()) signalerPaiement(p, champ.value.trim());
      });
    } else if (achat === "attente") {
      statut.textContent = "Paiement signalé : en attente de validation par le vendeur.";
      statut.classList.add("pack__statut--attente");
    } else if (achat === "refuse") {
      statut.textContent = "Le vendeur n'a pas trouvé ton paiement. Contacte-le sur le Discord.";
      statut.classList.add("pack__statut--refuse");
    }

    bas.appendChild(btns);
    article.append(visuel, infos);
    if (statut.textContent) infos.appendChild(statut);
    article.appendChild(bas);
    if (achat === "a_acheter") article.appendChild(form);
    return article;
  }

  function tuile(libelle, valeur) {
    const d = el("div", "stat");
    d.append(el("span", "", libelle), el("strong", "", valeur));
    return d;
  }

  function afficher() {
    const grille = $("#commuGrille");
    if (!grille) return;
    $$("#ongletsCommu button").forEach((b) => {
      const actif = b.dataset.onglet === onglet;
      b.classList.toggle("actif", actif);
      b.setAttribute("aria-selected", actif);
    });

    const msg = {
      chargement: "Chargement des packs…",
      lent: "Les packs mettent du temps à arriver. Ils s'afficheront dès que possible.",
      erreur: "Les packs ne peuvent pas être chargés pour le moment.",
      ok: lectureSeule ? "Tu peux voir les packs et télécharger les gratuits. Pour publier, acheter ou mettre en favori, demande l'accès « Contributeur » au propriétaire du site." : "",
      local: "Hors ligne : tes packs et tes favoris sont gardés dans ce navigateur. Le partage, les ventes et les statistiques des membres marchent sur la version en ligne.",
    }[etat];
    const etatEl = $("#commuEtat");
    etatEl.textContent = msg || "";
    etatEl.hidden = !msg;

    const tous = tousLesPacks();
    let liste = tous;
    const stats = $("#commuStats");
    const demandesEl = $("#commuDemandes");
    stats.hidden = onglet !== "mes";
    demandesEl.hidden = true;
    demandesEl.textContent = "";

    if (onglet === "populaires") {
      liste = [...tous].sort((a, b) =>
        nbTelechargements(b) + nbFavoris(b) - (nbTelechargements(a) + nbFavoris(a)) || b.creeLe - a.creeLe);
    }
    if (onglet === "favoris") liste = tous.filter(estFavori);
    if (onglet === "mes") {
      liste = tous.filter(estAMoi);
      const favoris = liste.reduce((s, p) => s + nbFavoris(p), 0);
      const dl = liste.reduce((s, p) => s + nbTelechargements(p), 0);
      const ventes = liste.reduce((s, p) => s + ventesDe(p).length, 0);
      const revenus = liste.reduce((s, p) => s + revenusDe(p), 0);
      stats.textContent = "";
      stats.append(
        tuile("Packs publiés", String(liste.length)),
        tuile("Mis en favori", `${favoris} fois`),
        tuile("Téléchargements", String(dl)),
        tuile("Ventes", String(ventes)),
        tuile("Argent généré", euros(revenus))
      );

      const demandes = demandesATraiter();
      if (demandes.length) {
        demandesEl.hidden = false;
        demandesEl.appendChild(el("h3", "", `Paiements à vérifier (${demandes.length})`));
        demandesEl.appendChild(el("p", "astuce", "Vérifie que l'argent est bien arrivé sur ton compte avant de valider : l'acheteur pourra alors télécharger le pack."));
        demandes.forEach((d) => {
          const ligne = el("div", "demande");
          const texte = el("p", "demande__texte");
          const nom = el("strong", "", d.nomPaiement || "Quelqu'un");
          texte.append(nom, document.createTextNode(` dit avoir payé ${euros(d.prix)} pour « ${d.packNom} » · ${quand(d.le)}`));
          const ok = el("button", "btn btn--petit", "Valider");
          ok.type = "button";
          ok.addEventListener("click", () => repondre(d, true));
          const non = el("button", "btn btn--petit btn--ghost", "Refuser");
          non.type = "button";
          non.addEventListener("click", () => repondre(d, false));
          const actions = el("div", "demande__actions");
          actions.append(non, ok);
          ligne.append(texte, actions);
          demandesEl.appendChild(ligne);
        });
      }
    }

    grille.textContent = "";
    liste.slice(0, 60).forEach((p, i) =>
      grille.appendChild(carte(p, { rang: onglet === "populaires" ? i + 1 : 0, vendeur: onglet === "mes" })));
    const videEl = $("#commuVide");
    videEl.hidden = liste.length > 0 || etat === "chargement";
    videEl.textContent = {
      mes: "Tu n'as encore rien publié. Crée un pack graphique ou un pack son, coche « Publier dans les derniers packs » (et « Vendre ce pack » si tu veux le vendre), puis clique sur Créer.",
      favoris: "Aucun favori pour l'instant. Clique sur ♡ Favori sur un pack pour le retrouver ici.",
    }[onglet] || "Aucun pack publié pour l'instant. Crée le premier dans le créateur !";
  }

  /* ---------- Champs « Vendre ce pack » du créateur ---------- */
  function relierVente(suffixe) {
    const vendre = $("#vendre" + suffixe);
    if (!vendre) return;
    const bloc = $("#vente" + suffixe);
    const publier = $("#publier" + suffixe);
    const maj = () => {
      bloc.hidden = !vendre.checked;
      if (vendre.checked) publier.checked = true;
    };
    vendre.addEventListener("change", maj);
    publier.addEventListener("change", () => { if (!publier.checked) { vendre.checked = false; maj(); } });
    maj();
  }

  function demarrer() {
    $$("#ongletsCommu button").forEach((b) => b.addEventListener("click", () => { onglet = b.dataset.onglet; afficher(); }));
    document.addEventListener("captures-chargees", () => { vignettes.clear(); afficher(); });
    relierVente("Pack");
    relierVente("Son");
    afficher();
    init();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer);
  else demarrer();

  return { publier, lireVente };
})();
