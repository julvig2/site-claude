/* ==========================================================================
   INTERFACE : boutique, modale, créateur
   ========================================================================== */

(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const W = 960, H = 540;

  /* ---------- Config du site ---------- */
  $$("[data-site-nom]").forEach((el) => (el.textContent = SITE.nom));
  $$("[data-discord]").forEach((el) => (el.href = SITE.discord));
  $$("[data-nb-packs]").forEach((el) => (el.textContent = PACKS.length));

  const prixTexte = (p) => (p > 0 ? `${p.toFixed(2).replace(".", ",")} ${SITE.devise}` : "Gratuit");

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("visible"), 3200);
  }

  /* ---------- Menu mobile ---------- */
  $("#burger").addEventListener("click", (e) => {
    const ouvert = document.body.classList.toggle("menu-ouvert");
    e.currentTarget.setAttribute("aria-expanded", ouvert);
  });
  $$("#menu a").forEach((a) => a.addEventListener("click", () => document.body.classList.remove("menu-ouvert")));

  /* ---------- Comparateur avant / après ---------- */
  function initComparer(el) {
    const poser = (clientX) => {
      const r = el.getBoundingClientRect();
      const p = Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
      el.style.setProperty("--pos", p + "%");
    };
    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId);
      el.dataset.drag = "1";
      poser(e.clientX);
    });
    el.addEventListener("pointermove", (e) => el.dataset.drag && poser(e.clientX));
    el.addEventListener("pointerup", () => delete el.dataset.drag);
    el.addEventListener("pointercancel", () => delete el.dataset.drag);
    return {
      avant: $(".comparer__avant", el).getContext("2d"),
      apres: $(".comparer__apres", el).getContext("2d"),
      afficher(base, reglages) {
        this.avant.putImageData(base, 0, 0);
        this.apres.putImageData(Moteur.traiter(base, reglages), 0, 0);
      },
    };
  }

  /* ---------- Hero ---------- */
  const hero = initComparer($("#heroComparer"));
  const vedette = PACKS.find((p) => p.badge === "Populaire") || PACKS[0];
  $("#heroNom").textContent = vedette.nom;
  hero.afficher(Scene.image(vedette.scene, W, H), vedette.reglages);
  // petite animation d'intro de la poignée
  (() => {
    const el = $("#heroComparer");
    const debut = performance.now();
    const anim = (t) => {
      const k = Math.min(1, (t - debut) / 1800);
      if (el.dataset.drag) return;
      el.style.setProperty("--pos", 50 + Math.sin(k * Math.PI * 2) * 22 * (1 - k) + "%");
      if (k < 1) requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
  })();

  /* ---------- Boutique ---------- */
  const categories = ["Tous", ...new Set(PACKS.map((p) => p.categorie))];
  let filtre = "Tous";
  const filtresEl = $("#filtres");
  categories.forEach((c) => {
    const b = document.createElement("button");
    b.textContent = c;
    b.setAttribute("role", "tab");
    b.className = c === filtre ? "actif" : "";
    b.addEventListener("click", () => {
      filtre = c;
      $$("button", filtresEl).forEach((x) => x.classList.toggle("actif", x === b));
      filtrer();
    });
    filtresEl.appendChild(b);
  });

  const grille = $("#grille");
  const vignettes = [];
  function dessinerVignettes() {
    vignettes.forEach(({ ctx, p }) => ctx.putImageData(Moteur.traiter(Scene.image(p.scene, 480, 270), p.reglages), 0, 0));
  }
  PACKS.forEach((p) => {
    const carte = document.createElement("article");
    carte.className = "pack";
    carte.dataset.cat = p.categorie;
    carte.dataset.texte = `${p.nom} ${p.accroche} ${p.categorie}`.toLowerCase();
    carte.innerHTML = `
      <button class="pack__visuel" aria-label="Voir ${p.nom}">
        <canvas width="480" height="270"></canvas>
        ${p.badge ? `<span class="pack__badge ${p.prix === 0 ? "pack__badge--gratuit" : ""}">${p.badge}</span>` : ""}
      </button>
      <div class="pack__infos">
        <p class="pack__cat">${p.categorie}</p>
        <h3>${p.nom}</h3>
        <p class="pack__accroche">${p.accroche}</p>
      </div>
      <div class="pack__bas">
        <strong class="prix">${prixTexte(p.prix)}</strong>
        <div class="pack__btns">
          <button class="btn btn--ghost btn--petit" data-action="perso">Modifier</button>
          <button class="btn btn--petit" data-action="voir">Voir</button>
        </div>
      </div>`;
    const ctx = $("canvas", carte).getContext("2d");
    vignettes.push({ ctx, p });
    $(".pack__visuel", carte).addEventListener("click", () => ouvrirModale(p));
    $('[data-action="voir"]', carte).addEventListener("click", () => ouvrirModale(p));
    $('[data-action="perso"]', carte).addEventListener("click", () => personnaliser(p));
    grille.appendChild(carte);
  });

  dessinerVignettes();

  const recherche = $("#recherche");
  recherche.addEventListener("input", filtrer);
  function filtrer() {
    const q = recherche.value.trim().toLowerCase();
    let n = 0;
    $$(".pack", grille).forEach((c) => {
      const ok = (filtre === "Tous" || c.dataset.cat === filtre) && (!q || c.dataset.texte.includes(q));
      c.hidden = !ok;
      if (ok) n++;
    });
    $("#vide").hidden = n > 0;
  }

  /* ---------- Modale ---------- */
  const modale = $("#modale");
  const modaleComp = initComparer($("#modaleComparer"));
  let packModale = null;
  let sceneModale = null;

  function afficherModale(scene) {
    sceneModale = scene;
    $$("#modaleScenes button").forEach((b) => b.classList.toggle("actif", b.dataset.scene === scene));
    modaleComp.afficher(Scene.image(scene, W, H), packModale.reglages);
  }
  function ouvrirModale(p) {
    packModale = p;
    $("#modaleCat").textContent = p.categorie;
    $("#modaleNom").textContent = p.nom;
    $("#modaleDesc").textContent = p.description;
    $("#modalePrix").textContent = prixTexte(p.prix);
    $("#modaleAcheter").textContent = p.prix > 0 ? "Acheter" : "Télécharger";
    $("#modaleComparer").style.setProperty("--pos", "50%");
    afficherModale(p.scene);
    modale.showModal();
  }
  $$("#modaleScenes button").forEach((b) => b.addEventListener("click", () => afficherModale(b.dataset.scene)));
  $("#modaleFermer").addEventListener("click", () => modale.close());
  modale.addEventListener("click", (e) => e.target === modale && modale.close());
  $("#modalePerso").addEventListener("click", () => {
    modale.close();
    personnaliser(packModale);
  });
  $("#modaleAcheter").addEventListener("click", async () => {
    const p = packModale;
    if (p.prix > 0) {
      if (p.lienAchat) window.open(p.lienAchat, "_blank", "noopener");
      else toast("Paiement pas encore configuré : ajoutez un lienAchat à ce pack dans js/data.js.");
      return;
    }
    try {
      const f = await Exporteur.telecharger(p.reglages, { nom: p.nom, auteur: SITE.nom, scene: p.scene });
      toast(`${f} téléchargé ✔`);
    } catch (err) {
      toast("Erreur : " + err.message);
    }
  });

  /* ---------- Créateur ---------- */
  const CONTROLES = [
    { groupe: "Lumière", items: [
      { cle: "exposure", label: "Exposition", min: -1, max: 1, pas: 0.01 },
      { cle: "gamma", label: "Gamma (profondeur)", min: 0.6, max: 1.6, pas: 0.01 },
      { cle: "contrast", label: "Contraste", min: -1, max: 1, pas: 0.01 },
    ]},
    { groupe: "Couleurs", items: [
      { cle: "saturation", label: "Saturation", min: -1, max: 1, pas: 0.01 },
      { cle: "vibrance", label: "Vibrance", min: -1, max: 1, pas: 0.01 },
      { cle: "temperature", label: "Température", min: -1, max: 1, pas: 0.01, classe: "temp" },
      { cle: "bleach", label: "Délavé (bleach)", min: 0, max: 1, pas: 0.01 },
    ]},
    { groupe: "Étalonnage", items: [
      { cle: "shadowColor", label: "Teinte des ombres", type: "color" },
      { cle: "shadowStrength", label: "Intensité ombres", min: 0, max: 1, pas: 0.01 },
      { cle: "highlightColor", label: "Teinte des lumières", type: "color" },
      { cle: "highlightStrength", label: "Intensité lumières", min: 0, max: 1, pas: 0.01 },
    ]},
    { groupe: "Détails", items: [
      { cle: "sharpen", label: "Netteté", min: 0, max: 2, pas: 0.01 },
      { cle: "vignette", label: "Vignette", min: 0, max: 1, pas: 0.01 },
    ]},
  ];

  let reglages = Moteur.complet({});
  let scene = "coucher";
  let imagePerso = null;
  const crea = initComparer($("#creaComparer"));
  const panneau = $("#panneau");
  const champs = {};

  CONTROLES.forEach((g) => {
    const bloc = document.createElement("fieldset");
    bloc.className = "carte groupe";
    bloc.innerHTML = `<legend>${g.groupe}</legend>`;
    g.items.forEach((it) => {
      const ligne = document.createElement("div");
      ligne.className = "reglage" + (it.type === "color" ? " reglage--couleur" : "");
      const id = "r-" + it.cle;
      if (it.type === "color") {
        ligne.innerHTML = `<label for="${id}">${it.label}</label><input type="color" id="${id}" />`;
      } else {
        ligne.innerHTML = `
          <div class="reglage__tete"><label for="${id}">${it.label}</label><output></output></div>
          <input type="range" id="${id}" min="${it.min}" max="${it.max}" step="${it.pas}" class="${it.classe || ""}" />`;
      }
      const input = $("input", ligne);
      const sortie = $("output", ligne);
      input.addEventListener("input", () => {
        reglages[it.cle] = it.type === "color" ? input.value : parseFloat(input.value);
        majSortie(it, input, sortie);
        rendre();
      });
      input.addEventListener("dblclick", () => {
        reglages[it.cle] = REGLAGES_NEUTRES[it.cle];
        synchroniser();
        rendre();
      });
      champs[it.cle] = { it, input, sortie };
      bloc.appendChild(ligne);
    });
    panneau.appendChild(bloc);
  });

  // Groupe serveur
  const blocServeur = document.createElement("fieldset");
  blocServeur.className = "carte groupe";
  blocServeur.innerHTML = `
    <legend>Ressource serveur</legend>
    <label class="interrupteur"><input type="checkbox" id="tcActif" /><span></span>Inclure une ressource FiveM (filtre pour tous les joueurs)</label>
    <div class="reglage" id="tcOptions">
      <label for="tcModif">Filtre timecycle</label>
      <select id="tcModif">${TIMECYCLES.map((t) => `<option value="${t.id}">${t.nom}</option>`).join("")}</select>
      <div class="reglage__tete"><label for="tcForce">Force du filtre</label><output id="tcForceOut"></output></div>
      <input type="range" id="tcForce" min="0" max="1" step="0.01" />
      <p class="astuce">Le filtre timecycle est appliqué par le jeu lui-même : il n'apparaît pas dans l'aperçu.</p>
    </div>`;
  panneau.appendChild(blocServeur);
  $("#tcActif").addEventListener("change", (e) => {
    reglages.timecycle.actif = e.target.checked;
    synchroniser();
  });
  $("#tcModif").addEventListener("change", (e) => (reglages.timecycle.modifier = e.target.value));
  $("#tcForce").addEventListener("input", (e) => {
    reglages.timecycle.force = parseFloat(e.target.value);
    $("#tcForceOut").textContent = Math.round(reglages.timecycle.force * 100) + " %";
  });

  function majSortie(it, input, sortie) {
    if (!sortie) return;
    const v = parseFloat(input.value);
    sortie.textContent = (v > 0 && it.min < 0 ? "+" : "") + v.toFixed(2);
    // remplissage visuel de la piste
    const p = ((v - it.min) / (it.max - it.min)) * 100;
    input.style.setProperty("--p", p + "%");
  }

  function synchroniser() {
    Object.values(champs).forEach(({ it, input, sortie }) => {
      input.value = reglages[it.cle];
      majSortie(it, input, sortie);
    });
    const tc = reglages.timecycle;
    $("#tcActif").checked = tc.actif;
    $("#tcModif").value = tc.modifier;
    $("#tcForce").value = tc.force;
    $("#tcForceOut").textContent = Math.round(tc.force * 100) + " %";
    $("#tcOptions").classList.toggle("desactive", !tc.actif);
    $$("#tcOptions select, #tcOptions input").forEach((el) => (el.disabled = !tc.actif));
  }

  let rafId = 0;
  function rendre() {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const base = imagePerso || Scene.image(scene, W, H);
      crea.afficher(base, reglages);
      $("#presetTexte").textContent = Exporteur.presetReShade(reglages);
    });
  }

  function charger(r, nom) {
    const copie = JSON.parse(JSON.stringify(r));
    // On garde le choix "ressource serveur" de l'utilisateur si le pack n'en définit pas.
    if (!copie.timecycle && reglages) copie.timecycle = { ...reglages.timecycle };
    reglages = Moteur.complet(copie);
    if (nom) $("#nomPack").value = nom;
    synchroniser();
    rendre();
  }

  function personnaliser(p) {
    if (!imagePerso) choisirScene(p.scene, false);
    charger(p.reglages, `${p.nom} (perso)`);
    $("#createur").scrollIntoView({ behavior: "smooth" });
    toast(`« ${p.nom} » chargé dans le créateur`);
  }

  function choisirScene(s, rafraichir = true) {
    scene = s;
    imagePerso = null;
    $$("#scenes button").forEach((b) => b.classList.toggle("actif", b.dataset.scene === s));
    $(".scenes__import").classList.remove("actif");
    if (rafraichir) rendre();
  }
  $$("#scenes button").forEach((b) => b.addEventListener("click", () => choisirScene(b.dataset.scene)));

  // Import d'une capture d'écran (recadrée en 16:9)
  $("#importImage").addEventListener("change", (e) => {
    const fichier = e.target.files[0];
    if (!fichier) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d");
      const k = Math.max(W / img.width, H / img.height);
      const dw = img.width * k, dh = img.height * k;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      imagePerso = ctx.getImageData(0, 0, W, H);
      URL.revokeObjectURL(img.src);
      $$("#scenes button").forEach((b) => b.classList.remove("actif"));
      $(".scenes__import").classList.add("actif");
      rendre();
      toast("Capture importée");
    };
    img.onerror = () => toast("Image illisible");
    img.src = URL.createObjectURL(fichier);
    e.target.value = "";
  });

  // Import pack.json
  $("#importJson").addEventListener("change", async (e) => {
    const fichier = e.target.files[0];
    if (!fichier) return;
    try {
      const data = JSON.parse(await fichier.text());
      if (!data.reglages) throw new Error("fichier invalide");
      charger(data.reglages, data.nom);
      if (data.auteur) $("#auteurPack").value = data.auteur;
      toast(`Pack « ${data.nom || "importé"} » chargé`);
    } catch (err) {
      toast("Import impossible : " + err.message);
    }
    e.target.value = "";
  });

  $("#btnReset").addEventListener("click", () => {
    charger({}, "Mon pack");
    toast("Réglages remis à zéro");
  });

  $("#btnAleatoire").addEventListener("click", () => {
    const a = (min, max) => Math.round((min + Math.random() * (max - min)) * 100) / 100;
    const teinte = () => "#" + [0, 0, 0].map(() => Math.floor(40 + Math.random() * 215).toString(16).padStart(2, "0")).join("");
    charger({
      exposure: a(-0.15, 0.2), gamma: a(0.85, 1.2), contrast: a(-0.1, 0.55),
      saturation: a(-0.4, 0.35), vibrance: a(-0.1, 0.7), temperature: a(-0.5, 0.5), bleach: Math.random() > 0.7 ? a(0, 0.5) : 0,
      shadowColor: teinte(), shadowStrength: a(0, 0.7), highlightColor: teinte(), highlightStrength: a(0, 0.6),
      sharpen: a(0, 1), vignette: a(0, 0.6), timecycle: reglages.timecycle,
    });
  });

  $("#btnTelecharger").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const texte = btn.textContent;
    btn.textContent = "Génération…";
    try {
      const f = await Exporteur.telecharger(reglages, {
        nom: $("#nomPack").value.trim() || "Mon pack",
        auteur: $("#auteurPack").value.trim() || "Anonyme",
        scene,
      });
      toast(`${f} téléchargé ✔`);
    } catch (err) {
      toast("Erreur : " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = texte;
    }
  });

  charger(PACKS[0].reglages, "Mon pack");

  /* ---------- Captures GTA (js/data.js → CAPTURES) ---------- */
  Scene.charger(typeof CAPTURES === "undefined" ? {} : CAPTURES).then((chargees) => {
    if (!chargees.length) return;
    hero.afficher(Scene.image(vedette.scene, W, H), vedette.reglages);
    dessinerVignettes();
    if (modale.open && packModale) afficherModale(sceneModale);
    rendre();
  });
})();
