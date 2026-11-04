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
  // Commission du site (réglée par le propriétaire dans « Mon espace »)
  let config = { taux: 0.1, lien: "" };
  let recus = {};             // vendeur → { <versement>: montant confirmé }
  let rendreEnAttente = false;
  const formsOuverts = new Set();

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
    db.doc("config/site").onSnapshot(
      (s) => {
        config = { taux: 0.1, lien: "", ...(s.exists ? s.data() : {}) };
        majTextesCommission();
        remplirAdmin();
        afficher();
      },
      () => {}
    );
    db.doc("config/recus").onSnapshot(
      (s) => { recus = s.exists ? s.data() : {}; afficher(); },
      () => {}
    );
  }

  /* ---------- Commission ---------- */
  const arrondi = (n) => Math.round(n * 100) / 100;
  const taux = () => Math.min(0.9, Math.max(0, Number(config.taux) || 0));
  const pourcent = (t) => `${Math.round(t * 1000) / 10} %`.replace(".", ",");

  /** Bilan d'un vendeur : ventes, commission due, versements déclarés / confirmés. */
  function bilan(id) {
    const m = membres.get(id) || {};
    const ventes = Object.values(m.ventes || {}).filter((v) => v.statut === "valide");
    const brut = arrondi(ventes.reduce((s, v) => s + Number(v.prix || 0), 0));
    const commission = arrondi(ventes.reduce((s, v) => s + Number(v.commission ?? arrondi(v.prix * taux())), 0));
    const confirmes = recus[id] || {};
    const versements = Object.entries(m.versements || {}).map(([vid, v]) => ({ ...v, id: vid, confirme: vid in confirmes }));
    const verse = arrondi(versements.filter((v) => v.confirme).reduce((s, v) => s + Number(v.montant || 0), 0));
    const enAttente = arrondi(versements.filter((v) => !v.confirme).reduce((s, v) => s + Number(v.montant || 0), 0));
    return {
      pseudo: m.pseudo || "Sans pseudo", ventes: ventes.length, brut, commission,
      net: arrondi(brut - commission), verse, enAttente, versements,
      reste: Math.max(0, arrondi(commission - verse - enAttente)),
    };
  }

  async function declarerVersement(montant) {
    if (!peutEcrire()) return;
    try {
      await ecrireMembre((m) => {
        m.versements = m.versements || {};
        m.versements["v" + Date.now().toString(36)] = { montant: arrondi(montant), le: Date.now() };
      });
      afficher();
      toast("Versement déclaré. Le propriétaire du site le confirmera dès qu'il l'aura reçu.");
    } catch (e) { toast("Déclaration non enregistrée, réessaie."); }
  }

  async function confirmerVersement(vendeurId, versement) {
    const copieRecus = copie(recus);
    copieRecus[vendeurId] = { ...(copieRecus[vendeurId] || {}), [versement.id]: versement.montant };
    try {
      recus = copieRecus;
      await db.doc("config/recus").set(copieRecus);
      afficher();
      toast(`Versement de ${euros(versement.montant)} confirmé`);
    } catch (e) { toast("Confirmation non enregistrée, réessaie."); }
  }

  /** Textes « Le site prend X % » dans les cartes de création. */
  function majTextesCommission() {
    $$("[data-commission]").forEach((e) => {
      e.textContent = taux() > 0
        ? `Le site prend ${pourcent(taux())} de commission sur chaque vente, que tu lui verses ensuite depuis « Mon espace ».`
        : "Le site ne prend pas de commission sur les ventes.";
    });
  }

  /** Panneau du propriétaire : réglages de la commission. */
  function remplirAdmin() {
    const admin = $("#commuAdmin");
    if (!admin) return;
    const tauxEl = $("#adminTaux"), lienEl = $("#adminLien");
    if (document.activeElement !== tauxEl) tauxEl.value = Math.round(taux() * 1000) / 10;
    if (document.activeElement !== lienEl) lienEl.value = config.lien || "";
  }

  async function enregistrerConfig(e) {
    e.preventDefault();
    const t = parseFloat(String($("#adminTaux").value).replace(",", "."));
    if (!(t >= 0 && t <= 90)) { toast("Choisis un taux entre 0 et 90 %."); return; }
    let lien = $("#adminLien").value.trim();
    if (lien) {
      try {
        const u = new URL(lien);
        if (u.protocol !== "https:") throw new Error();
        lien = u.href;
      } catch (err) { toast("Le lien doit commencer par https:// (par exemple https://paypal.me/tonpseudo)."); return; }
    }
    try {
      await db.doc("config/site").set({ taux: t / 100, lien, maj: Date.now() });
      toast("Commission enregistrée");
    } catch (err) { toast("Enregistrement impossible, réessaie."); }
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

  /** Publie un pack. pack.prix / pack.lien viennent de lireVente(). modBase64 = mod .rpf éventuel. */
  async function publier(pack, sonBase64, modBase64) {
    if (partage) {
      if (!peutEcrire()) return false;
      if (Object.keys(monMembre().packs).length >= MAX_PACKS) {
        toast(`Tu as atteint ${MAX_PACKS} packs : supprime-en dans « Mon espace » pour en publier d'autres.`);
        return false;
      }
      try {
        const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        if (sonBase64) await db.doc(`fichiers/${uid}/sons/${id}`).set({ wav: sonBase64 });
        if (modBase64) await db.doc(`fichiers/${uid}/mods/${id}`).set({ rpf: modBase64 });
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
    packsLocaux.unshift({ ...copie(pack), id: "l" + Date.now().toString(36), creeLe: Date.now(), telechargements: 0, sonBase64: sonBase64 || undefined, modBase64: modBase64 || undefined });
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

  /* ---------- Mods du jeu publiés avec les packs réalistes ---------- */
  /** Mods que ce visiteur peut utiliser : packs gratuits, achetés ou à lui. */
  function modsDisponibles() {
    return tousLesPacks()
      .filter((p) => p.mod && ["libre", "achete"].includes(etatAchat(p)))
      .map((p) => ({ id: p.id, vendeurId: p.vendeurId, nom: p.nom, auteur: p.auteur || "Anonyme", resume: p.mod.resume || [] }));
  }

  /** Récupère le .rpf d'un mod publié. */
  async function chargerMod(m) {
    let b64 = null;
    if (partage) {
      const s = await db.doc(`fichiers/${m.vendeurId}/mods/${m.id}`).get();
      b64 = s.exists ? s.data().rpf : null;
    } else {
      const p = packsLocaux.find((x) => x.id === m.id);
      b64 = p && p.modBase64;
    }
    if (!b64) throw new Error("mod introuvable");
    return SonPack.depuisBase64(b64);
  }

  let signatureMods = "";
  function signalerMods() {
    const sig = modsDisponibles().map((m) => m.id).join(",");
    if (sig === signatureMods) return;
    signatureMods = sig;
    document.dispatchEvent(new Event("mods-maj"));
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
          // commission figée au taux du moment (aucune pour les packs du propriétaire)
          commission: valide && !proprio ? arrondi(d.prix * taux()) : 0,
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
        if (p.mod) await db.doc(`fichiers/${p.vendeurId}/mods/${p.id}`).delete().catch(() => {});
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
        const meta = { nom: p.nom, auteur: p.auteur, scene: p.scene, mode: p.mode };
        if (p.mod) meta.mod = { rpf: await chargerMod({ id: p.id, vendeurId: p.vendeurId }), resume: p.mod.resume || [] };
        await Exporteur.telecharger(p.reglages, meta);
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
      const paye = bouton("J'ai payé", "btn--ghost", () => {
        form.hidden = !form.hidden;
        form.hidden ? formsOuverts.delete(p.id) : formsOuverts.add(p.id);
        paye.setAttribute("aria-expanded", String(!form.hidden));
        if (!form.hidden) champ.focus();
      });
      paye.setAttribute("aria-expanded", String(formsOuverts.has(p.id)));
      let domaine = "";
      try { domaine = new URL(p.lien).hostname.replace(/^www\./, ""); } catch (e) { /* lien invalide */ }
      statut.textContent = `Paiement sur ${domaine || "le lien du vendeur"}, puis clique « J'ai payé ».`;
      // formulaire « J'ai payé »
      var form = el("form", "achat-form");
      form.hidden = !formsOuverts.has(p.id);
      const id = `paiement-${p.vendeurId || "x"}-${p.id}`;
      const label = el("label", "", "Nom ou pseudo utilisé pour payer");
      label.htmlFor = id;
      var champ = el("input", "champ-texte champ-texte--normal");
      champ.id = id;
      champ.maxLength = 60;
      champ.required = true;
      const envoyer = el("button", "btn btn--petit", "Prévenir le vendeur");
      envoyer.type = "submit";
      form.append(label, champ, envoyer);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (champ.value.trim()) {
          formsOuverts.delete(p.id);
          champ.blur();
          signalerPaiement(p, champ.value.trim());
        }
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

  /** Vrai si quelqu'un tape dans un champ de la communauté (on ne redessine pas sous ses doigts). */
  function saisieEnCours() {
    const a = document.activeElement;
    return Boolean(a && (a.tagName === "INPUT" || a.tagName === "SELECT") && a.closest("#communaute") && !a.closest("#commuAdmin form"));
  }

  function afficherCommission() {
    const bloc = $("#commuCommission");
    bloc.textContent = "";
    bloc.hidden = true;
    if (!partage || !uid || proprio || onglet !== "mes") return;
    const b = bilan(uid);
    if (!b.ventes && !b.versements.length) return;
    bloc.hidden = false;
    bloc.appendChild(el("h3", "", `Commission du site (${pourcent(taux())})`));
    const recap = el("p", "commission__recap");
    recap.textContent = `Commission sur tes ventes : ${euros(b.commission)} · déjà versé et confirmé : ${euros(b.verse)}` +
      (b.enAttente ? ` · déclaré, en attente de confirmation : ${euros(b.enAttente)}` : "");
    bloc.appendChild(recap);
    if (b.reste <= 0) {
      bloc.appendChild(el("p", "commission__ok", b.enAttente ? "Tout est déclaré. Merci !" : "Tu es à jour. Merci !"));
      return;
    }
    const du = el("p", "commission__du");
    du.append(document.createTextNode("Reste à verser : "), el("strong", "", euros(b.reste)));
    bloc.appendChild(du);
    const actions = el("div", "commission__actions");
    if (config.lien) {
      const lien = el("a", "btn btn--petit", `Payer ${euros(b.reste)}`);
      lien.href = config.lien;
      lien.target = "_blank";
      lien.rel = "noopener";
      actions.appendChild(lien);
    } else {
      actions.appendChild(el("p", "astuce", "Le propriétaire n'a pas encore indiqué où verser la commission."));
    }
    const form = el("form", "commission__form");
    const label = el("label", "", "Montant versé (€)");
    label.htmlFor = "montantVerse";
    const champ = el("input", "champ-texte champ-texte--normal");
    champ.id = "montantVerse";
    champ.type = "number";
    champ.min = "0.01";
    champ.step = "0.01";
    champ.value = b.reste.toFixed(2);
    const ok = el("button", "btn btn--petit btn--ghost", "J'ai versé");
    ok.type = "submit";
    form.append(label, champ, ok);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = parseFloat(String(champ.value).replace(",", "."));
      if (!(v > 0)) { toast("Indique le montant versé."); return; }
      champ.blur();
      declarerVersement(v);
    });
    actions.appendChild(form);
    bloc.appendChild(actions);
  }

  function afficherAdmin() {
    const admin = $("#commuAdmin");
    admin.hidden = !(partage && proprio && onglet === "mes");
    if (admin.hidden) return;
    const zone = $("#adminVendeurs");
    zone.textContent = "";
    const vendeurs = [...membres.keys()].filter((id) => id !== uid).map((id) => ({ id, ...bilan(id) }))
      .filter((b) => b.ventes || b.versements.length)
      .sort((a, b) => b.reste + b.enAttente - (a.reste + a.enAttente));
    const total = vendeurs.reduce((s, b) => ({ du: s.du + b.commission, recu: s.recu + b.verse }), { du: 0, recu: 0 });
    $("#adminTotal").textContent = `Commissions dues au total : ${euros(total.du)} · reçues et confirmées : ${euros(total.recu)} · reste à recevoir : ${euros(Math.max(0, total.du - total.recu))}`;
    if (!vendeurs.length) {
      zone.appendChild(el("p", "astuce", "Aucune vente validée pour l'instant chez les autres membres."));
      return;
    }
    const enveloppe = el("div", "tableau");
    const table = el("table");
    const tete = el("tr");
    ["Vendeur", "Ventes", "Chiffre d'affaires", "Commission", "Reçu", "Reste", ""].forEach((t) => tete.appendChild(el("th", "", t)));
    table.appendChild(el("thead")).appendChild(tete);
    const corps = el("tbody");
    vendeurs.forEach((b) => {
      const tr = el("tr");
      [b.pseudo, String(b.ventes), euros(b.brut), euros(b.commission), euros(b.verse), euros(Math.max(0, arrondi(b.commission - b.verse)))]
        .forEach((t) => tr.appendChild(el("td", "", t)));
      const cell = el("td", "tableau__actions");
      b.versements.filter((v) => !v.confirme).forEach((v) => {
        const btn = el("button", "btn btn--petit", `Confirmer ${euros(v.montant)} reçu`);
        btn.type = "button";
        btn.title = `Déclaré ${quand(v.le)}`;
        btn.addEventListener("click", () => confirmerVersement(b.id, v));
        cell.appendChild(btn);
      });
      tr.appendChild(cell);
      corps.appendChild(tr);
    });
    table.appendChild(corps);
    enveloppe.appendChild(table);
    zone.appendChild(enveloppe);
  }

  function afficher() {
    const grille = $("#commuGrille");
    if (!grille) return;
    signalerMods();
    if (saisieEnCours()) { rendreEnAttente = true; return; }
    rendreEnAttente = false;
    afficherCommission();
    afficherAdmin();
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
      if (partage && uid && !proprio && ventes) {
        const b = bilan(uid);
        stats.append(tuile(`Commission du site`, euros(b.commission)), tuile("Ce qui te reste", euros(b.net)));
      }

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
    // on redessine dès que la personne a fini de taper
    $("#communaute").addEventListener("focusout", () => setTimeout(() => { if (rendreEnAttente) afficher(); }, 0));
    const formAdmin = $("#commuAdmin form");
    if (formAdmin) formAdmin.addEventListener("submit", enregistrerConfig);
    majTextesCommission();
    afficher();
    init();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer);
  else demarrer();

  return { publier, lireVente, modsDisponibles, chargerMod };
})();
