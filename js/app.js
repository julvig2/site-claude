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

  /* ---------- Créateur : deux modes (CVC simple / réaliste complet) ---------- */
  const R = (cle, label, min, max, pas, extra = {}) => ({ cle, label, min, max, pas, ...extra });
  const NOTE_MONDE = "Appliqué en jeu par la ressource serveur incluse dans le pack.";
  const CONTROLES = {
    cvc: [
      { groupe: "1. Choisis le mode", items: [
        { cle: "monde.heure", type: "segments", options: TEMPS_CVC },
      ]},
      { groupe: "2. Ambiance ou tes couleurs", items: [
        { cle: "ambiance", type: "ambiances" },
        { cle: "highlightColor", label: "Couleur du ciel", type: "color", visibleSi: (r) => r.ambiance === "perso" },
        R("highlightStrength", "Intensité du ciel", 0, 1, 0.01, { visibleSi: (r) => r.ambiance === "perso" }),
        { cle: "midColor", label: "Couleur de la lumière", type: "color", visibleSi: (r) => r.ambiance === "perso" },
        R("midStrength", "Intensité de la lumière", 0, 1, 0.01, { visibleSi: (r) => r.ambiance === "perso" }),
        R("monde.nuages", "Nuages", 0, 1, 0.01, { pourcent: true }),
      ]},
      { groupe: "3. Luminosité, brouillard, optimisation", items: [
        R("exposure", "Luminosité", -0.5, 0.8, 0.01),
        { cle: "monde.meteo", label: "Brouillard", type: "segments", options: BROUILLARDS },
        { cle: "optimisation", label: "Optimisation", type: "segments", options: OPTIMISATIONS },
        { cle: "monde.lumieres", label: "Lumières de la ville (lampadaires, fenêtres, néons)", type: "toggle" },
      ]},
    ],
    realiste: [
      { groupe: "Lumière", items: [
        R("exposure", "Exposition", -1, 1, 0.01),
        R("gamma", "Gamma (profondeur)", 0.6, 1.6, 0.01),
        R("contrast", "Contraste", -1, 1, 0.01),
        R("blackPoint", "Point noir", 0, 64, 1),
        R("whitePoint", "Point blanc", 191, 255, 1),
      ]},
      { groupe: "Couleurs", items: [
        R("saturation", "Saturation", -1, 1, 0.01),
        R("vibrance", "Vibrance", -1, 1, 0.01),
        R("temperature", "Température", -1, 1, 0.01, { classe: "temp" }),
        R("bleach", "Délavé (bleach)", 0, 1, 0.01),
      ]},
      { groupe: "Étalonnage", items: [
        { cle: "shadowColor", label: "Teinte des ombres", type: "color" },
        R("shadowStrength", "Intensité ombres", 0, 1, 0.01),
        { cle: "midColor", label: "Teinte des tons moyens", type: "color" },
        R("midStrength", "Intensité tons moyens", 0, 1, 0.01),
        { cle: "highlightColor", label: "Teinte des lumières", type: "color" },
        R("highlightStrength", "Intensité lumières", 0, 1, 0.01),
      ]},
      { groupe: "Détails", items: [
        R("sharpen", "Netteté", 0, 2, 0.01),
        R("sharpenClamp", "Limite de netteté", 0.01, 0.15, 0.005),
        R("grain", "Grain film", 0, 1, 0.01),
        R("vignette", "Vignette", 0, 1, 0.01),
        R("vignetteRadius", "Ouverture de la vignette", 0.8, 2.5, 0.01),
        { cle: "optimisation", label: "Optimisation", type: "segments", options: OPTIMISATIONS },
      ]},
      { groupe: "Monde", note: NOTE_MONDE, items: [
        { cle: "monde.heure", label: "Heure", type: "select", options: HEURES },
        { cle: "monde.meteo", label: "Météo", type: "select", options: METEOS },
        R("monde.nuages", "Nuages", 0, 1, 0.01, { pourcent: true }),
        { cle: "monde.lumieres", label: "Lumières de la ville (lampadaires, fenêtres, néons)", type: "toggle" },
      ]},
      { groupe: "Filtre du jeu", note: "Filtre timecycle de GTA, appliqué par la ressource serveur. Il n'apparaît pas dans l'aperçu.", items: [
        { cle: "timecycle.actif", label: "Ajouter un filtre timecycle", type: "toggle" },
        { cle: "timecycle.modifier", label: "Filtre", type: "select", options: TIMECYCLES, dependDe: "timecycle.actif" },
        R("timecycle.force", "Force du filtre", 0, 1, 0.01, { pourcent: true, dependDe: "timecycle.actif" }),
      ]},
    ],
  };

  const lire = (o, cle) => cle.split(".").reduce((a, k) => a[k], o);
  const ecrire = (o, cle, v) => {
    const ks = cle.split(".");
    const dernier = ks.pop();
    ks.reduce((a, k) => a[k], o)[dernier] = v;
  };
  const copie = (o) => JSON.parse(JSON.stringify(o));
  const DEPART = { cvc: () => Moteur.complet(copie(CVC_DEFAUT)), realiste: () => Moteur.complet(copie(PACKS[0].reglages)) };

  let mode = "cvc";
  const etats = { cvc: DEPART.cvc(), realiste: DEPART.realiste() };
  const noms = { cvc: "Mon pack CVC", realiste: "Mon pack réaliste" };
  const reglages = () => etats[mode];
  let scene = "coucher";
  let imagePerso = null;
  const crea = initComparer($("#creaComparer"));
  const panneau = $("#panneau");
  let champs = [];

  function construirePanneau() {
    panneau.textContent = "";
    champs = [];
    CONTROLES[mode].forEach((g) => {
      const bloc = document.createElement("fieldset");
      bloc.className = "carte groupe";
      const legende = document.createElement("legend");
      legende.textContent = g.groupe;
      bloc.appendChild(legende);
      if (g.note) {
        const n = document.createElement("p");
        n.className = "astuce groupe__note";
        n.textContent = g.note;
        bloc.appendChild(n);
      }
      g.items.forEach((it) => {
        const ligne = document.createElement("div");
        const id = `r-${mode}-${it.cle.replace(/\./g, "-")}`;
        let input, sortie = null;
        if (it.type === "segments") {
          ligne.className = "reglage";
          if (it.label) {
            const l = document.createElement("span");
            l.className = "reglage__label";
            l.textContent = it.label;
            ligne.appendChild(l);
          }
          input = document.createElement("div");
          input.className = "segments";
          input.setAttribute("role", "radiogroup");
          if (it.label) input.setAttribute("aria-label", it.label);
          it.options.forEach((o) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "segment";
            btn.dataset.v = o.id;
            btn.setAttribute("role", "radio");
            const b1 = document.createElement("b");
            b1.textContent = o.nom;
            btn.appendChild(b1);
            if (o.detail) {
              const sm = document.createElement("small");
              sm.textContent = o.detail;
              btn.appendChild(sm);
            }
            btn.addEventListener("click", () => {
              ecrire(reglages(), it.cle, o.id);
              synchroniser();
              rendre();
            });
            input.appendChild(btn);
          });
          ligne.appendChild(input);
          champs.push({ it, input, sortie: null, ligne });
          bloc.appendChild(ligne);
          return;
        }
        if (it.type === "ambiances") {
          ligne.className = "reglage";
          input = document.createElement("div");
          input.className = "ambiances";
          [...AMBIANCES_CVC, { id: "perso", nom: "Mes couleurs", apercu: null }].forEach((a) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "ambiance";
            btn.dataset.v = a.id;
            const pastille = document.createElement("span");
            pastille.className = "ambiance__pastille" + (a.apercu ? "" : " ambiance__pastille--perso");
            if (a.apercu) pastille.style.background = `linear-gradient(135deg, ${a.apercu[0]} 50%, ${a.apercu[1]} 50%)`;
            btn.append(pastille, document.createTextNode(a.nom));
            btn.addEventListener("click", () => {
              if (a.reglages) Object.assign(reglages(), copie(a.reglages));
              reglages().ambiance = a.id;
              synchroniser();
              rendre();
            });
            input.appendChild(btn);
          });
          ligne.appendChild(input);
          champs.push({ it, input, sortie: null, ligne });
          bloc.appendChild(ligne);
          return;
        }
        if (it.type === "toggle") {
          ligne.className = "reglage";
          ligne.innerHTML = `<label class="interrupteur"><input type="checkbox" id="${id}" /><span></span><b></b></label>`;
          ligne.querySelector("b").textContent = it.label;
          input = $("input", ligne);
        } else if (it.type === "select") {
          ligne.className = "reglage";
          ligne.innerHTML = `<label for="${id}"></label><select id="${id}"></select>`;
          $("label", ligne).textContent = it.label;
          input = $("select", ligne);
          it.options.forEach((o) => input.add(new Option(o.nom, o.id)));
        } else if (it.type === "color") {
          ligne.className = "reglage reglage--couleur";
          ligne.innerHTML = `<label for="${id}"></label><input type="color" id="${id}" />`;
          $("label", ligne).textContent = it.label;
          input = $("input", ligne);
        } else {
          ligne.className = "reglage";
          ligne.innerHTML = `
            <div class="reglage__tete"><label for="${id}"></label><output></output></div>
            <input type="range" id="${id}" min="${it.min}" max="${it.max}" step="${it.pas}" class="${it.classe || ""}" />`;
          $("label", ligne).textContent = it.label;
          input = $("input", ligne);
          sortie = $("output", ligne);
        }
        const valeur = () =>
          it.type === "toggle" ? input.checked : it.type === "range" || !it.type ? parseFloat(input.value) : input.value;
        input.addEventListener(it.type === "toggle" || it.type === "select" ? "change" : "input", () => {
          ecrire(reglages(), it.cle, valeur());
          majSortie(it, input, sortie);
          majDependances();
          rendre();
        });
        if (!it.type || it.type === "color") {
          input.addEventListener("dblclick", () => {
            ecrire(reglages(), it.cle, lire(REGLAGES_NEUTRES, it.cle));
            synchroniser();
            rendre();
          });
        }
        champs.push({ it, input, sortie, ligne });
        bloc.appendChild(ligne);
      });
      panneau.appendChild(bloc);
    });
  }

  function majSortie(it, input, sortie) {
    if (!sortie) return;
    const v = parseFloat(input.value);
    sortie.textContent = it.pourcent
      ? Math.round(v * 100) + " %"
      : it.pas >= 1
        ? String(Math.round(v))
        : (v > 0 && it.min < 0 ? "+" : "") + v.toFixed(it.pas < 0.01 ? 3 : 2);
    input.style.setProperty("--p", ((v - it.min) / (it.max - it.min)) * 100 + "%");
  }

  function majDependances() {
    champs.forEach(({ it, input, ligne }) => {
      if (it.visibleSi) ligne.hidden = !it.visibleSi(reglages());
      if (!it.dependDe) return;
      const ok = Boolean(lire(reglages(), it.dependDe));
      input.disabled = !ok;
      ligne.classList.toggle("desactive", !ok);
    });
  }

  function synchroniser() {
    champs.forEach(({ it, input, sortie }) => {
      const v = lire(reglages(), it.cle);
      if (it.type === "segments" || it.type === "ambiances") {
        [...input.children].forEach((b) => {
          const actif = b.dataset.v === String(v);
          b.classList.toggle("actif", actif);
          b.setAttribute(it.type === "segments" ? "aria-checked" : "aria-pressed", actif);
        });
      } else if (it.type === "toggle") input.checked = Boolean(v);
      else input.value = v;
      majSortie(it, input, sortie);
    });
    majDependances();
  }

  let rafId = 0;
  function rendre() {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const r = reglages();
      const ambiance = Scene.ambiance(r.monde, scene);
      // Avant : le jeu d'origine. Après : le pack (monde + couleurs).
      const avant = imagePerso || Scene.image(scene, W, H);
      const base = imagePerso || Scene.image(ambiance, W, H, r.monde);
      crea.avant.putImageData(avant, 0, 0);
      crea.apres.putImageData(Moteur.traiter(base, r), 0, 0);

      $("#presetTexte").textContent = Exporteur.presetReShade(r);
      const ressource = Exporteur.avecRessource(r);
      $("#codeLua").hidden = !ressource;
      if (ressource) $("#luaTexte").textContent = Exporteur.clientLua(r);

      const monde = Exporteur.avecRessource({ ...r, timecycle: { actif: false } });
      const note = $("#noteMonde");
      note.hidden = !monde;
      note.textContent = imagePerso || Scene.estCapture(ambiance)
        ? "Le ciel, la météo, les nuages et les lumières ne peuvent pas être montrés sur une capture : ils seront appliqués en jeu par la ressource serveur."
        : "Ciel, météo, nuages et lumières : aperçu sur le décor. En jeu, ils sont appliqués par la ressource serveur incluse dans le pack.";
    });
  }

  function changerMode(nouveau) {
    if (nouveau === mode && panneau.childElementCount) return;
    noms[mode] = $("#nomPack").value;
    mode = nouveau;
    $$("#modes .mode").forEach((b) => {
      const actif = b.dataset.mode === mode;
      b.classList.toggle("actif", actif);
      b.setAttribute("aria-selected", actif);
    });
    $("#nomPack").value = noms[mode];
    construirePanneau();
    synchroniser();
    rendre();
  }
  $$("#modes .mode").forEach((b) => b.addEventListener("click", () => changerMode(b.dataset.mode)));

  function charger(r, nom, modeCible = mode) {
    etats[modeCible] = Moteur.complet(copie(r));
    if (nom) noms[modeCible] = nom;
    if (modeCible !== mode) changerMode(modeCible);
    else {
      if (nom) $("#nomPack").value = nom;
      synchroniser();
      rendre();
    }
  }

  function personnaliser(p) {
    choisirOnglet("graphique");
    if (!imagePerso) choisirScene(p.scene, false);
    charger(p.reglages, `${p.nom} (perso)`, "realiste");
    $("#createur").scrollIntoView({ behavior: "smooth" });
    toast(`« ${p.nom} » chargé dans le mode réaliste`);
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
    img.onerror = () => toast("Image illisible : choisis un fichier .jpg ou .png");
    img.src = URL.createObjectURL(fichier);
    e.target.value = "";
  });

  // Import pack.json
  $("#importJson").addEventListener("change", async (e) => {
    const fichier = e.target.files[0];
    if (!fichier) return;
    try {
      const data = JSON.parse(await fichier.text());
      if (!data.reglages) throw new Error("ce fichier n'est pas un pack.json");
      charger(data.reglages, data.nom, data.mode === "cvc" ? "cvc" : "realiste");
      if (data.auteur) $("#auteurPack").value = data.auteur;
      toast(`Pack « ${data.nom || "importé"} » chargé`);
    } catch (err) {
      toast("Import impossible : " + err.message);
    }
    e.target.value = "";
  });

  $("#btnReset").addEventListener("click", () => {
    charger(mode === "cvc" ? CVC_DEFAUT : {}, mode === "cvc" ? "Mon pack CVC" : "Mon pack réaliste");
    toast("Réglages remis à zéro");
  });

  $("#btnAleatoire").addEventListener("click", () => {
    const a = (min, max) => Math.round((min + Math.random() * (max - min)) * 100) / 100;
    const parmi = (l) => l[Math.floor(Math.random() * l.length)];
    const teinte = () => "#" + [0, 0, 0].map(() => Math.floor(40 + Math.random() * 215).toString(16).padStart(2, "0")).join("");
    if (mode === "cvc") {
      const amb = parmi(AMBIANCES_CVC);
      charger({
        ...CVC_DEFAUT,
        ...amb.reglages,
        ambiance: amb.id,
        exposure: a(0, 0.4),
        optimisation: reglages().optimisation,
        monde: { heure: parmi(["midi", "midi", "nuit", "auto"]), meteo: parmi(["EXTRASUNNY", "EXTRASUNNY", "SMOG"]), nuages: a(0, 0.5), lumieres: true },
      });
    } else {
      charger({
        exposure: a(-0.15, 0.2), gamma: a(0.85, 1.2), contrast: a(-0.1, 0.55), blackPoint: Math.round(a(0, 18)), whitePoint: Math.round(a(235, 255)),
        saturation: a(-0.4, 0.35), vibrance: a(-0.1, 0.7), temperature: a(-0.5, 0.5), bleach: Math.random() > 0.7 ? a(0, 0.5) : 0,
        shadowColor: teinte(), shadowStrength: a(0, 0.7), midColor: teinte(), midStrength: a(0, 0.4), highlightColor: teinte(), highlightStrength: a(0, 0.6),
        sharpen: a(0, 1), grain: Math.random() > 0.6 ? a(0, 0.5) : 0, vignette: a(0, 0.6), vignetteRadius: a(1.2, 2),
        monde: reglages().monde, timecycle: reglages().timecycle,
      });
    }
  });

  $("#btnTelecharger").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const texte = btn.textContent;
    btn.textContent = "Génération…";
    try {
      const meta = {
        nom: $("#nomPack").value.trim() || noms[mode],
        auteur: $("#auteurPack").value.trim() || "Anonyme",
        scene,
        mode,
      };
      const f = await Exporteur.telecharger(reglages(), meta);
      let msg = `${f} téléchargé ✔`;
      if ($("#publierPack").checked && typeof Communaute !== "undefined") {
        const ok = await Communaute.publier({ type: "graphique", mode, nom: meta.nom, auteur: meta.auteur, scene, reglages: copie(reglages()) });
        if (ok) msg += " · publié dans les derniers packs";
      }
      toast(msg);
    } catch (err) {
      toast("Erreur : " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = texte;
    }
  });

  mode = "";
  changerMode("cvc");

  /* ---------- Onglets Pack graphique / Pack son ---------- */
  function choisirOnglet(o) {
    $$("#ongletsCrea button").forEach((b) => {
      const actif = b.dataset.onglet === o;
      b.classList.toggle("actif", actif);
      b.setAttribute("aria-selected", actif);
    });
    $("#panneauGraphique").hidden = o !== "graphique";
    $("#panneauSon").hidden = o !== "son";
    $(".createur__actions-tete").hidden = o !== "graphique";
  }
  $$("#ongletsCrea button").forEach((b) => b.addEventListener("click", () => choisirOnglet(b.dataset.onglet)));
  $$("[data-aller-onglet]").forEach((a) => a.addEventListener("click", () => choisirOnglet(a.dataset.allerOnglet)));

  // Un pack de la communauté chargé dans le créateur
  function chargerPack(p) {
    choisirOnglet("graphique");
    if (!imagePerso && p.scene) choisirScene(p.scene, false);
    charger(p.reglages || {}, `${p.nom} (perso)`, p.mode === "cvc" ? "cvc" : "realiste");
    $("#createur").scrollIntoView({ behavior: "smooth" });
    toast(`« ${p.nom} » chargé dans le créateur`);
  }

  // Utilisé par l'accueil (js/hero.js) et la communauté (js/communaute.js)
  window.ForgeUI = { ouvrirModale, toast, chargerPack };

  /* ---------- Captures GTA (js/data.js → CAPTURES) ---------- */
  Scene.charger(typeof CAPTURES === "undefined" ? {} : CAPTURES).then((chargees) => {
    if (!chargees.length) return;
    dessinerVignettes();
    document.dispatchEvent(new Event("captures-chargees"));
    if (modale.open && packModale) afficherModale(sceneModale);
    rendre();
  });
})();
