/* ==========================================================================
   COMMUNAUTÉ : derniers packs, populaires, mes packs
   - Version en ligne (Claude) : packs partagés entre les membres (base "db").
   - Ailleurs : packs gardés dans ce navigateur (localStorage).
   Documents :
     packs/<id>                       { type, mode, nom, auteur, auteurId, creeLe, reglages | son }
     sons/<id>                        { wav (base64) }
     telechargements/<pack>__<membre> { packId, uid, le }   (un par membre et par pack)
   ========================================================================== */

const Communaute = (() => {
  const $ = (s, el = document) => el.querySelector(s);
  const CLE_LOCALE = "forgepack:mes-packs";

  let db = null;
  let uid = null;
  let proprio = false;
  let partage = false;
  let etat = "chargement"; // chargement | ok | lent | erreur | local
  let packs = [];
  let telechargements = [];
  let onglet = "derniers";
  let lectureSeule = false;

  /* ---------- Stockage ---------- */
  const lireLocal = () => {
    try { return JSON.parse(localStorage.getItem(CLE_LOCALE) || "[]"); } catch (e) { return []; }
  };
  const ecrireLocal = (liste) => {
    try { localStorage.setItem(CLE_LOCALE, JSON.stringify(liste)); return true; } catch (e) { return false; }
  };
  const segment = (v) => String(v).replace(/[^A-Za-z0-9_\-.~:@+]/g, "_");

  async function init() {
    const c = window.claude;
    if (c && typeof c.use === "function") {
      try {
        const [d, u] = await Promise.all([c.use("db"), c.use("user")]);
        db = d;
        if (u) {
          uid = await u.id();
          proprio = await u.isOwner();
          const peutEcrire = await u.can("data.write");
          lectureSeule = peutEcrire === false;
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
      packs = lireLocal();
      afficher();
    }
  }

  function abonner() {
    const minuterie = setTimeout(() => {
      if (etat === "chargement") { etat = "lent"; afficher(); }
    }, 10000);
    db.collection("packs").orderBy("creeLe", "desc").limit(300).onSnapshot(
      (snap) => {
        packs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (!snap.metadata.fromCache) { etat = "ok"; clearTimeout(minuterie); }
        afficher();
      },
      () => { etat = "erreur"; clearTimeout(minuterie); afficher(); }
    );
    db.collection("telechargements").limit(1000).onSnapshot(
      (snap) => { telechargements = snap.docs.map((d) => d.data()); afficher(); },
      () => {}
    );
  }

  /** Publie un pack. Renvoie true si c'est fait. */
  async function publier(pack, sonBase64) {
    const toast = (m) => window.ForgeUI && window.ForgeUI.toast(m);
    const doc = JSON.parse(JSON.stringify({ ...pack, auteurId: uid || "local", creeLe: Date.now() }));
    if (partage) {
      if (lectureSeule) {
        toast("Ton accès permet de télécharger les packs, pas d'en publier : demande l'accès « Contributeur » au propriétaire du site.");
        return false;
      }
      try {
        const ref = db.collection("packs").doc();
        if (sonBase64) await db.doc("sons/" + ref.id).set({ wav: sonBase64 });
        await ref.set(doc);
        return true;
      } catch (e) {
        toast(e && e.code === "quota_exceeded"
          ? "La communauté est pleine : supprime d'anciens packs dans « Mes packs »."
          : "Publication impossible pour le moment. Ton pack est quand même téléchargé.");
        return false;
      }
    }
    const liste = lireLocal();
    liste.unshift({ ...doc, id: "l" + Date.now().toString(36), telechargements: 0, sonBase64: sonBase64 || undefined });
    if (!ecrireLocal(liste)) {
      toast("Le navigateur n'a plus de place pour garder ce pack.");
      return false;
    }
    packs = liste;
    afficher();
    return true;
  }

  async function sonDe(pack) {
    if (!partage) return pack.sonBase64;
    const s = await db.doc("sons/" + pack.id).get();
    return s.exists ? s.data().wav : null;
  }

  async function compter(pack) {
    if (partage) {
      if (!uid || lectureSeule) return;
      if (telechargements.some((t) => t.packId === pack.id && t.uid === uid)) return;
      try {
        await db.doc(`telechargements/${segment(pack.id)}__${segment(uid)}`).set({ packId: pack.id, uid, le: Date.now() });
      } catch (e) { /* le téléchargement a eu lieu, le compteur attendra */ }
      return;
    }
    const liste = lireLocal();
    const p = liste.find((x) => x.id === pack.id);
    if (p) { p.telechargements = (p.telechargements || 0) + 1; ecrireLocal(liste); packs = liste; afficher(); }
  }

  async function supprimer(pack) {
    if (partage) {
      try {
        await db.doc("packs/" + pack.id).delete();
        if (pack.type === "son") await db.doc("sons/" + pack.id).delete();
      } catch (e) {
        window.ForgeUI && window.ForgeUI.toast("Suppression impossible pour le moment.");
      }
      return;
    }
    packs = lireLocal().filter((x) => x.id !== pack.id);
    ecrireLocal(packs);
    afficher();
  }

  /* ---------- Calculs ---------- */
  function nbTelechargements(pack) {
    if (!partage) return pack.telechargements || 0;
    return telechargements.filter((t) => t.packId === pack.id).length;
  }
  const estAMoi = (p) => (partage ? Boolean(uid) && p.auteurId === uid : true);

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

  function etiquette(p) {
    if (p.type === "son") return `Son · ${p.son && p.son.armeNom ? p.son.armeNom : "arme"}`;
    return p.mode === "cvc" ? "Graphique · CVC" : "Graphique · Réaliste";
  }

  function carte(p, rang) {
    const el = document.createElement("article");
    el.className = "pack pack--commu";
    const visuel = document.createElement("div");
    visuel.className = "pack__visuel pack__visuel--commu" + (p.type === "son" ? " pack__visuel--son" : "");
    if (p.type === "son") {
      const onde = document.createElement("div");
      onde.className = "mini-onde";
      ((p.son && p.son.pics) || []).forEach((v) => {
        const b = document.createElement("span");
        b.style.height = Math.max(4, v * 100) + "%";
        onde.appendChild(b);
      });
      const jouer = document.createElement("button");
      jouer.className = "mini-onde__jouer";
      jouer.type = "button";
      jouer.setAttribute("aria-label", `Écouter ${p.nom}`);
      jouer.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
      jouer.addEventListener("click", async () => {
        try {
          const b64 = await sonDe(p);
          if (b64) await SonPack.jouerBase64(b64, p.son ? p.son.volume : 0.8);
        } catch (e) {
          window.ForgeUI.toast("Lecture impossible.");
        }
      });
      visuel.append(onde, jouer);
    } else {
      const img = document.createElement("img");
      img.alt = "";
      img.src = vignette(p);
      visuel.appendChild(img);
    }
    if (rang) {
      const r = document.createElement("span");
      r.className = "pack__rang";
      r.textContent = `#${rang}`;
      visuel.appendChild(r);
    }

    const infos = document.createElement("div");
    infos.className = "pack__infos";
    const cat = document.createElement("p");
    cat.className = "pack__cat";
    cat.textContent = etiquette(p);
    const h = document.createElement("h3");
    h.textContent = p.nom;
    const meta = document.createElement("p");
    meta.className = "pack__accroche";
    meta.textContent = `par ${p.auteur || "Anonyme"} · ${quand(p.creeLe)}`;
    infos.append(cat, h, meta);

    const bas = document.createElement("div");
    bas.className = "pack__bas";
    const n = nbTelechargements(p);
    const compteur = document.createElement("strong");
    compteur.className = "pack__compteur";
    compteur.textContent = `${n} téléchargement${n > 1 ? "s" : ""}`;
    const btns = document.createElement("div");
    btns.className = "pack__btns";
    const bouton = (texte, classe, action) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn--petit " + classe;
      b.textContent = texte;
      b.addEventListener("click", action);
      btns.appendChild(b);
      return b;
    };
    if (estAMoi(p) || proprio) {
      const sup = bouton("Supprimer", "btn--ghost", async () => {
        if (sup.dataset.confirme) { sup.disabled = true; await supprimer(p); return; }
        sup.dataset.confirme = "1";
        sup.textContent = "Confirmer ?";
        setTimeout(() => { delete sup.dataset.confirme; sup.textContent = "Supprimer"; }, 3000);
      });
    }
    if (p.type !== "son") bouton("Modifier", "btn--ghost", () => window.ForgeUI.chargerPack(p));
    bouton("Télécharger", "", async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        if (p.type === "son") {
          const b64 = await sonDe(p);
          if (!b64) throw new Error("son introuvable");
          await SonPack.telecharger({ ...p.son, nom: p.nom, auteur: p.auteur, wav: SonPack.depuisBase64(b64) });
        } else {
          await Exporteur.telecharger(p.reglages, { nom: p.nom, auteur: p.auteur, scene: p.scene, mode: p.mode });
        }
        await compter(p);
        window.ForgeUI.toast(`« ${p.nom} » téléchargé ✔`);
      } catch (err) {
        window.ForgeUI.toast("Erreur : " + err.message);
      } finally {
        b.disabled = false;
      }
    });
    bas.append(compteur, btns);
    el.append(visuel, infos, bas);
    return el;
  }

  function afficher() {
    const grille = $("#commuGrille");
    if (!grille) return;
    $$("#ongletsCommu button").forEach((b) => {
      const actif = b.dataset.onglet === onglet;
      b.classList.toggle("actif", actif);
      b.setAttribute("aria-selected", actif);
    });

    // message d'état
    const msg = {
      chargement: "Chargement des packs…",
      lent: "Les packs mettent du temps à arriver. Ils s'afficheront dès que possible.",
      erreur: "Les packs ne peuvent pas être chargés pour le moment.",
      ok: lectureSeule ? "Tu peux télécharger les packs des membres. Pour publier les tiens, demande l'accès « Contributeur » au propriétaire du site." : "",
      local: "Hors ligne : tes packs sont gardés dans ce navigateur. Le partage entre membres marche sur la version en ligne du site.",
    }[etat];
    const etatEl = $("#commuEtat");
    etatEl.textContent = msg || "";
    etatEl.hidden = !msg;

    let liste = [...packs];
    const stats = $("#commuStats");
    stats.hidden = onglet !== "mes";
    if (onglet === "populaires") {
      liste = liste.map((p) => [p, nbTelechargements(p)]).sort((a, b) => b[1] - a[1] || b[0].creeLe - a[0].creeLe).map(([p]) => p);
    }
    if (onglet === "mes") {
      liste = liste.filter(estAMoi);
      const total = liste.reduce((s, p) => s + nbTelechargements(p), 0);
      const top = [...liste].sort((a, b) => nbTelechargements(b) - nbTelechargements(a))[0];
      stats.textContent = "";
      [
        ["Packs créés", String(liste.length)],
        ["Téléchargements reçus", String(total)],
        ["Ton pack le plus téléchargé", top && nbTelechargements(top) > 0 ? top.nom : "—"],
      ].forEach(([l, v]) => {
        const d = document.createElement("div");
        d.className = "stat";
        const s1 = document.createElement("span");
        s1.textContent = l;
        const s2 = document.createElement("strong");
        s2.textContent = v;
        d.append(s1, s2);
        stats.appendChild(d);
      });
    }

    grille.textContent = "";
    liste.slice(0, 60).forEach((p, i) => grille.appendChild(carte(p, onglet === "populaires" ? i + 1 : 0)));
    const vide = $("#commuVide");
    vide.hidden = liste.length > 0 || etat === "chargement";
    vide.textContent = onglet === "mes"
      ? "Tu n'as encore rien publié. Crée un pack graphique ou un pack son, coche « Publier dans les derniers packs » puis clique sur Créer."
      : "Aucun pack publié pour l'instant. Crée le premier dans le créateur !";
  }

  const $$ = (s) => [...document.querySelectorAll(s)];

  function demarrer() {
    $$("#ongletsCommu button").forEach((b) => b.addEventListener("click", () => { onglet = b.dataset.onglet; afficher(); }));
    document.addEventListener("captures-chargees", () => { vignettes.clear(); afficher(); });
    afficher();
    init();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer);
  else demarrer();

  return { publier, compter };
})();
