/* ==========================================================================
   SCÈNE PROCÉDURALE + MOTEUR D'APERÇU
   Le moteur reproduit en JavaScript les formules des shaders ReShade exportés
   (Tonemap, LiftGammaGain, Vibrance, Curves, LumaSharpen, Vignette), pour que
   l'aperçu corresponde au rendu en jeu.
   ========================================================================== */

const Scene = (() => {
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  const AMBIANCES = {
    jour: {
      ciel: ["#3f8fd8", "#8cc4ee", "#dcecf3"],
      astre: "#fffbe6", astreY: 0.17, astreX: 0.72, astreR: 0.05, halo: "rgba(255,250,220,0.55)",
      loin: "#8aa3b8", proche: "#566575", fenetres: 0, sol: "#5f6a5a", route: "#4a4d52",
      trottoir: "#8c8f93", ligne: "#e8e2c8", silhouette: "#2b3326", brume: "rgba(230,240,245,0.55)",
      lampes: false, neons: false, etoiles: false, voiture: "#b8202a",
    },
    coucher: {
      ciel: ["#241a4a", "#7d2f6e", "#e2565e", "#ff9a4a", "#ffd27a"],
      astre: "#fff0b0", astreY: 0.5, astreX: 0.5, astreR: 0.075, halo: "rgba(255,170,90,0.7)",
      loin: "#5e3a63", proche: "#3a2342", fenetres: 0.25, sol: "#3a2630", route: "#2c2129",
      trottoir: "#6a4b52", ligne: "#ffcf8a", silhouette: "#1a0f1c", brume: "rgba(255,140,100,0.45)",
      lampes: true, neons: false, etoiles: false, voiture: "#1d1d24",
    },
    nuit: {
      ciel: ["#03040b", "#0a1030", "#1b2452"],
      astre: "#e8eeff", astreY: 0.14, astreX: 0.2, astreR: 0.035, halo: "rgba(160,180,255,0.35)",
      loin: "#151b38", proche: "#0d1126", fenetres: 0.45, sol: "#0d0f17", route: "#15171f",
      trottoir: "#262833", ligne: "#c9c08a", silhouette: "#05060b", brume: "rgba(70,60,140,0.35)",
      lampes: true, neons: true, etoiles: true, voiture: "#121218",
    },
  };

  function degrade(ctx, y0, y1, couleurs) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    couleurs.forEach((c, i) => g.addColorStop(i / (couleurs.length - 1), c));
    return g;
  }

  function lueur(ctx, x, y, r, couleur) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, couleur);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function palmier(ctx, x, yBase, haut, couleur, penche) {
    const s = haut / 100;
    ctx.save();
    ctx.strokeStyle = couleur;
    ctx.fillStyle = couleur;
    ctx.lineCap = "round";
    // tronc
    ctx.lineWidth = Math.max(1, 3.2 * s);
    ctx.beginPath();
    ctx.moveTo(x, yBase);
    const tx = x + penche * 14 * s, ty = yBase - haut;
    ctx.quadraticCurveTo(x + penche * 2 * s, yBase - haut * 0.55, tx, ty);
    ctx.stroke();
    // palmes
    ctx.lineWidth = Math.max(1, 2.2 * s);
    const angles = [-2.9, -2.4, -1.9, -1.2, -0.7, -0.25, 0.25];
    for (const a of angles) {
      const lx = tx + Math.cos(a) * 34 * s;
      const ly = ty + Math.sin(a) * 18 * s + 16 * s;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(tx + Math.cos(a) * 22 * s, ty + Math.sin(a) * 22 * s - 6 * s, lx, ly);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(tx, ty + 1.5 * s, 3 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function melange(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const c = [16, 8, 0].map((d) => Math.round(((pa >> d) & 255) * (1 - t) + ((pb >> d) & 255) * t));
    return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  // Quantité de nuages selon la météo (multipliée par l'opacité choisie)
  const NUAGES_METEO = { auto: 0.35, EXTRASUNNY: 0.15, CLEAR: 0.3, CLOUDS: 0.8, OVERCAST: 1, FOGGY: 0.5 };
  const COULEUR_NUAGES = { jour: "255,255,255", coucher: "255,178,150", nuit: "70,80,130" };

  function nuages(ctx, w, h, hz, mode, quantite) {
    if (quantite <= 0.01) return;
    const r = rng(77);
    const c = COULEUR_NUAGES[mode] || COULEUR_NUAGES.jour;
    const nb = Math.round(6 + quantite * 14);
    for (let i = 0; i < nb; i++) {
      const x = r() * w * 1.2 - w * 0.1, y = hz * (0.08 + r() * 0.62);
      const taille = w * (0.05 + r() * 0.09) * (0.6 + y / hz);
      const alpha = Math.min(0.9, 0.35 + quantite * 0.5) * (0.6 + r() * 0.4);
      for (let k = 0; k < 6; k++) {
        const ox = (r() - 0.5) * taille * 2.2, oy = (r() - 0.5) * taille * 0.35;
        const rr = taille * (0.45 + r() * 0.5);
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rr);
        g.addColorStop(0, `rgba(${c},${alpha})`);
        g.addColorStop(0.55, `rgba(${c},${alpha * 0.55})`);
        g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, rr, rr * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function dessiner(ctx, w, h, mode, opts) {
    const o = { meteo: "auto", nuages: 1, lumieres: true, ...(opts || {}) };
    const A = { ...(AMBIANCES[mode] || AMBIANCES.coucher) };
    if (!o.lumieres) { A.lampes = false; A.neons = false; A.fenetres = 0; }
    if (o.meteo === "OVERCAST" || o.meteo === "FOGGY") {
      const gris = mode === "nuit" ? "#1a1d26" : mode === "coucher" ? "#8a7d86" : "#aab3ba";
      A.ciel = A.ciel.map((col) => melange(col, gris, 0.65));
      A.halo = "rgba(255,255,255,0.12)";
      A.astre = melange(A.astre, gris, 0.7);
    }
    const r = rng(1337);
    const hz = h * 0.58; // ligne d'horizon
    const cx = w * 0.5;

    // Ciel
    ctx.fillStyle = degrade(ctx, 0, hz, A.ciel);
    ctx.fillRect(0, 0, w, hz + 2);

    if (A.etoiles) {
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 160; i++) {
        const sx = r() * w, sy = r() * hz * 0.85, sz = r() * 1.3 + 0.3;
        ctx.globalAlpha = 0.3 + r() * 0.7;
        ctx.fillRect(sx, sy, sz * (w / 960), sz * (w / 960));
      }
      ctx.globalAlpha = 1;
    }

    // Soleil / lune
    const ax = w * A.astreX, ay = h * A.astreY, ar = h * A.astreR;
    lueur(ctx, ax, ay, ar * 7, A.halo);
    ctx.fillStyle = A.astre;
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.fill();

    nuages(ctx, w, h, hz, mode, (NUAGES_METEO[o.meteo] ?? 0.35) * o.nuages);

    // Skyline lointaine
    const rr = rng(42);
    let x = -10;
    while (x < w) {
      const bw = w * (0.018 + rr() * 0.045);
      const bh = h * (0.04 + Math.pow(rr(), 1.6) * 0.24) * (1 - Math.abs(x / w - 0.5) * 0.6);
      ctx.fillStyle = A.loin;
      ctx.fillRect(x, hz - bh, bw, bh + 1);
      if (rr() > 0.75) ctx.fillRect(x + bw * 0.45, hz - bh - h * 0.03, Math.max(1, bw * 0.06), h * 0.03);
      if (A.fenetres > 0) {
        const fw = Math.max(1, w / 640), fh = Math.max(1, h / 300);
        for (let fy = hz - bh + 4 * fh; fy < hz - 3 * fh; fy += 4 * fh) {
          for (let fx = x + 2 * fw; fx < x + bw - 2 * fw; fx += 3.5 * fw) {
            if (rr() < A.fenetres) {
              ctx.fillStyle = rr() > 0.8 ? "#9fd8ff" : "#ffd58a";
              ctx.fillRect(fx, fy, fw, fh);
            }
          }
        }
      }
      x += bw + rr() * w * 0.004;
    }

    // Néons sur la skyline
    if (A.neons) {
      const neons = [[0.18, 0.47, "#ff2bd6"], [0.31, 0.5, "#00e5ff"], [0.66, 0.46, "#ff3355"], [0.83, 0.49, "#00e5ff"], [0.42, 0.52, "#ffe14d"]];
      for (const [nx, ny, nc] of neons) {
        ctx.save();
        ctx.shadowColor = nc;
        ctx.shadowBlur = 14 * (w / 960);
        ctx.strokeStyle = nc;
        ctx.lineWidth = Math.max(1, 2 * (w / 960));
        ctx.strokeRect(w * nx, h * ny, w * 0.045, h * 0.022);
        ctx.restore();
      }
    }

    // Brume d'horizon
    ctx.fillStyle = degrade(ctx, hz - h * 0.12, hz + h * 0.02, ["rgba(0,0,0,0)", A.brume]);
    ctx.fillRect(0, hz - h * 0.12, w, h * 0.14);

    if (o.meteo === "FOGGY") {
      ctx.fillStyle = degrade(ctx, hz * 0.35, hz + h * 0.08, ["rgba(0,0,0,0)", A.brume.replace(/[\d.]+\)$/, "0.95)")]);
      ctx.fillRect(0, hz * 0.35, w, hz * 0.65 + h * 0.08);
    }

    // Sol
    ctx.fillStyle = A.sol;
    ctx.fillRect(0, hz, w, h - hz);

    // Route en perspective
    const demiHaut = w * 0.012, demiBas = w * 0.46;
    const tr = w * 0.07;
    ctx.fillStyle = A.trottoir;
    ctx.beginPath();
    ctx.moveTo(cx - demiHaut * 1.6, hz);
    ctx.lineTo(cx + demiHaut * 1.6, hz);
    ctx.lineTo(cx + demiBas + tr, h);
    ctx.lineTo(cx - demiBas - tr, h);
    ctx.fill();
    ctx.fillStyle = degrade(ctx, hz, h, [A.route, A.route, shade(A.route, -0.25)]);
    ctx.beginPath();
    ctx.moveTo(cx - demiHaut, hz);
    ctx.lineTo(cx + demiHaut, hz);
    ctx.lineTo(cx + demiBas, h);
    ctx.lineTo(cx - demiBas, h);
    ctx.fill();

    // Marquage central en pointillés
    ctx.fillStyle = A.ligne;
    for (let i = 0; i < 14; i++) {
      const t0 = Math.pow(i / 14, 2), t1 = Math.pow((i + 0.45) / 14, 2);
      const y0 = hz + (h - hz) * t0, y1 = hz + (h - hz) * t1;
      const l0 = 0.5 + w * 0.006 * t0, l1 = 0.5 + w * 0.006 * t1;
      ctx.beginPath();
      ctx.moveTo(cx - l0, y0);
      ctx.lineTo(cx + l0, y0);
      ctx.lineTo(cx + l1, y1);
      ctx.lineTo(cx - l1, y1);
      ctx.fill();
    }

    // Palmiers et lampadaires de chaque côté
    const profondeurs = [0.06, 0.1, 0.16, 0.25, 0.38, 0.56, 0.82, 1.15];
    for (const cote of [-1, 1]) {
      profondeurs.forEach((d, i) => {
        const yb = hz + (h - hz) * Math.min(d, 1.4);
        const largeur = demiHaut + (demiBas - demiHaut) * d;
        const xb = cx + cote * (largeur + tr * d + w * 0.03 * d);
        if (i % 2 === 0) {
          palmier(ctx, xb, yb, h * 0.62 * d, A.silhouette, cote * 0.6);
        } else {
          // lampadaire
          const hl = h * 0.42 * d;
          ctx.strokeStyle = A.silhouette;
          ctx.lineWidth = Math.max(1, 2.4 * d * (w / 960));
          ctx.beginPath();
          ctx.moveTo(xb, yb);
          ctx.lineTo(xb, yb - hl);
          ctx.lineTo(xb - cote * hl * 0.18, yb - hl);
          ctx.stroke();
          if (A.lampes) {
            const lx = xb - cote * hl * 0.18, ly = yb - hl + 2;
            lueur(ctx, lx, ly, hl * 0.35 + 4, "rgba(255,190,110,0.85)");
            ctx.fillStyle = "rgba(255,170,90,0.10)";
            ctx.beginPath();
            ctx.moveTo(lx, ly);
            ctx.lineTo(lx + hl * 0.3, yb);
            ctx.lineTo(lx - hl * 0.3, yb);
            ctx.fill();
          }
        }
      });
    }

    // Voiture vue de l'arrière
    const vw = w * 0.2, vh = vw * 0.42, vx = cx + w * 0.07 - vw / 2, vy = h * 0.8;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.ellipse(vx + vw / 2, vy + vh * 0.98, vw * 0.56, vh * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = A.voiture;
    roundRect(ctx, vx, vy + vh * 0.3, vw, vh * 0.55, vh * 0.12);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(vx + vw * 0.16, vy + vh * 0.32);
    ctx.lineTo(vx + vw * 0.27, vy);
    ctx.lineTo(vx + vw * 0.73, vy);
    ctx.lineTo(vx + vw * 0.84, vy + vh * 0.32);
    ctx.fill();
    // lunette arrière (reflète le ciel)
    ctx.fillStyle = degrade(ctx, vy, vy + vh * 0.3, [A.ciel[A.ciel.length - 1], A.ciel[0]]);
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(vx + vw * 0.22, vy + vh * 0.29);
    ctx.lineTo(vx + vw * 0.3, vy + vh * 0.05);
    ctx.lineTo(vx + vw * 0.7, vy + vh * 0.05);
    ctx.lineTo(vx + vw * 0.78, vy + vh * 0.29);
    ctx.fill();
    ctx.globalAlpha = 1;
    // pneus
    ctx.fillStyle = "#08080a";
    ctx.fillRect(vx + vw * 0.06, vy + vh * 0.82, vw * 0.14, vh * 0.17);
    ctx.fillRect(vx + vw * 0.8, vy + vh * 0.82, vw * 0.14, vh * 0.17);
    // feux arrière
    for (const fx of [vx + vw * 0.03, vx + vw * 0.79]) {
      lueur(ctx, fx + vw * 0.09, vy + vh * 0.47, vw * 0.16, "rgba(255,30,40,0.55)");
      ctx.fillStyle = "#ff2a2a";
      ctx.fillRect(fx, vy + vh * 0.42, vw * 0.18, vh * 0.1);
    }
    // plaque
    ctx.fillStyle = "#e9e7da";
    ctx.fillRect(vx + vw * 0.41, vy + vh * 0.6, vw * 0.18, vh * 0.12);

    if (o.meteo === "FOGGY") {
      ctx.fillStyle = degrade(ctx, hz - h * 0.1, h, [A.brume.replace(/[\d.]+\)$/, "0.7)"), "rgba(0,0,0,0)"]);
      ctx.fillRect(0, hz - h * 0.1, w, h - hz + h * 0.1);
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(Math.max(0, Math.min(255, v * (1 + f)))));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  const cache = new Map();
  const photos = {}; // captures d'écran GTA chargées depuis CAPTURES (js/data.js)

  /** Dessine une image en remplissant tout le cadre (recadrage centré). */
  function couvrir(ctx, img, w, h) {
    const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  /** Renvoie l'ImageData de la scène (mise en cache par mode + taille). */
  function image(mode, w, h, monde) {
    const opts = monde ? { meteo: monde.meteo, nuages: monde.nuages, lumieres: monde.lumieres } : null;
    const cle = `${mode}:${w}x${h}:${opts ? JSON.stringify(opts) : ""}`;
    if (!cache.has(cle)) {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      let data = null;
      if (photos[mode]) {
        couvrir(ctx, photos[mode], w, h);
        try {
          data = ctx.getImageData(0, 0, w, h);
        } catch (e) {
          // Le navigateur bloque la lecture des images ouvertes en file:// :
          // on repasse sur le décor dessiné.
          console.warn(`Capture "${mode}" illisible ici (ouvrez le site via un serveur web).`);
          delete photos[mode];
          ctx.clearRect(0, 0, w, h);
        }
      }
      if (!data) {
        dessiner(ctx, w, h, mode, opts);
        data = ctx.getImageData(0, 0, w, h);
      }
      cache.set(cle, data);
    }
    return cache.get(cle);
  }

  /** Charge les captures d'écran. Résout avec la liste des ambiances chargées. */
  function charger(captures) {
    const taches = Object.entries(captures || {})
      .filter(([, src]) => src)
      .map(([mode, src]) => new Promise((ok) => {
        const img = new Image();
        img.onload = () => { photos[mode] = img; ok(); };
        img.onerror = () => { console.warn(`Capture introuvable : ${src}`); ok(); };
        img.src = src;
      }));
    return Promise.all(taches).then(() => {
      cache.clear();
      return Object.keys(photos);
    });
  }

  /** Ambiance d'aperçu : l'heure forcée par le pack, sinon celle choisie. */
  function ambiance(monde, defaut) {
    return monde && monde.heure && monde.heure !== "auto" ? (monde.heure === "midi" ? "jour" : monde.heure) : defaut;
  }
  /** Vrai si une vraie capture d'écran est utilisée pour cette ambiance. */
  const estCapture = (mode) => Boolean(photos[mode]);

  // limite la mémoire : on vide le cache s'il grossit trop (réglages du monde)
  const imageAvecLimite = (...a) => {
    if (cache.size > 40) cache.clear();
    return image(...a);
  };

  return { image: imageAvecLimite, charger, ambiance, estCapture, modes: Object.keys(AMBIANCES) };
})();

const Moteur = (() => {
  const LR = 0.2126, LG = 0.7152, LB = 0.0722;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function decalages(hex) {
    const n = parseInt(hex.slice(1), 16);
    const c = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    const m = (c[0] + c[1] + c[2]) / 3;
    return c.map((v) => v - m);
  }

  /** Complète des réglages partiels avec les valeurs neutres. */
  function complet(r) {
    return {
      ...REGLAGES_NEUTRES,
      ...r,
      monde: { ...REGLAGES_NEUTRES.monde, ...(r && r.monde) },
      timecycle: { ...REGLAGES_NEUTRES.timecycle, ...(r && r.timecycle) },
    };
  }

  /** Convertit les réglages de l'interface en paramètres de shaders ReShade. */
  function parametres(reglages) {
    const s = complet(reglages);
    const ombre = decalages(s.shadowColor), lum = decalages(s.highlightColor), moy = decalages(s.midColor);
    const temp = [0.14, 0.03, -0.14];
    const round = (v) => Math.round(v * 1e6) / 1e6;
    return {
      Levels: { BlackPoint: Math.round(s.blackPoint), WhitePoint: Math.round(s.whitePoint) },
      Tonemap: { Exposure: s.exposure, Gamma: s.gamma, Saturation: s.saturation, Bleach: s.bleach, Defog: 0 },
      LiftGammaGain: {
        RGB_Lift: [0, 1, 2].map((i) => round(clamp(1 + s.shadowStrength * ombre[i] * 1.2, 0, 2))),
        RGB_Gamma: [0, 1, 2].map((i) => round(clamp(1 + s.midStrength * moy[i] * 0.9, 0.1, 2))),
        RGB_Gain: [0, 1, 2].map((i) => round(clamp(1 + s.highlightStrength * lum[i] * 0.8 + s.temperature * temp[i], 0, 2))),
      },
      Vibrance: { Vibrance: s.vibrance },
      Curves: { Contrast: s.contrast },
      LumaSharpen: { sharp_strength: s.sharpen, sharp_clamp: s.sharpenClamp },
      FilmGrain: { Intensity: s.grain, Variance: 0.4, Mean: 0.5, SignalToNoiseRatio: 6 },
      Vignette: { Amount: -s.vignette, Radius: s.vignetteRadius, Slope: 2 },
    };
  }

  /**
   * Applique les réglages à une image source.
   * @param {ImageData} src
   * @returns {ImageData}
   */
  function traiter(src, reglages) {
    const P = parametres(reglages);
    const { width: w, height: h, data: d } = src;
    const n = w * h;
    const buf = new Float32Array(n * 3);
    const luma = new Float32Array(n);

    const expo = Math.pow(2, P.Tonemap.Exposure);
    const gamma = P.Tonemap.Gamma, sat = P.Tonemap.Saturation, bleach = P.Tonemap.Bleach;
    const lift = P.LiftGammaGain.RGB_Lift, gain = P.LiftGammaGain.RGB_Gain, gam = P.LiftGammaGain.RGB_Gamma;
    const gamNeutre = gam.every((g) => g === 1);
    const noir = P.Levels.BlackPoint / 255;
    const blanc = P.Levels.WhitePoint === P.Levels.BlackPoint ? 255 / 0.00025 : 255 / (P.Levels.WhitePoint - P.Levels.BlackPoint);
    const vib = P.Vibrance.Vibrance, contraste = P.Curves.Contrast;
    const c = [0, 0, 0];
    // Exposition + gamma ne dépendent que de la valeur 0-255 du canal : table précalculée.
    const table = new Float32Array(256);
    for (let v = 0; v < 256; v++) {
      const niveau = clamp((v / 255) * blanc - noir * blanc, 0, 1); // Levels.fx
      table[v] = Math.pow(niveau * expo, gamma);
    }

    for (let i = 0; i < n; i++) {
      const o = i * 4;

      // --- Tonemap.fx ---
      c[0] = table[d[o]]; c[1] = table[d[o + 1]]; c[2] = table[d[o + 2]];
      if (bleach > 0) {
        const lum = LR * c[0] + LG * c[1] + LB * c[2];
        const L = clamp(10 * (lum - 0.45), 0, 1);
        for (let k = 0; k < 3; k++) {
          const A2 = bleach * c[k];
          const r1 = 2 * c[k] * lum, r2 = 1 - 2 * (1 - lum) * (1 - c[k]);
          const nc = r1 + (r2 - r1) * L;
          c[k] += (1 - A2) * (A2 * nc);
        }
      }
      if (sat !== 0) {
        const mg = (c[0] + c[1] + c[2]) / 3;
        for (let k = 0; k < 3; k++) {
          const diff = (c[k] - mg) * sat;
          const den = 1 + diff;
          c[k] = Math.abs(den) > 1e-4 ? (c[k] + diff) / den : c[k];
        }
      }

      // --- LiftGammaGain.fx ---
      for (let k = 0; k < 3; k++) {
        let v = c[k] * (1.5 - 0.5 * lift[k]) + 0.5 * lift[k] - 0.5;
        v = clamp(v, 0, 1) * gain[k];
        c[k] = gamNeutre ? v : Math.pow(Math.max(v, 0), 1 / gam[k]);
      }

      // --- Vibrance.fx ---
      if (vib !== 0) {
        const lum = LR * c[0] + LG * c[1] + LB * c[2];
        const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
        const f = 1 + vib * (1 - Math.sign(vib) * (mx - mn));
        for (let k = 0; k < 3; k++) c[k] = lum + (c[k] - lum) * f;
      }

      // --- Curves.fx (Mode luma, formule Smoothstep) ---
      if (contraste !== 0) {
        const lum = LR * c[0] + LG * c[1] + LB * c[2];
        const x = clamp(lum, 0, 1);
        const courbe = x * x * (3 - 2 * x);
        const nl = lum + (courbe - lum) * contraste;
        for (let k = 0; k < 3; k++) c[k] = c[k] - lum + nl;
      }

      const b = i * 3;
      buf[b] = c[0]; buf[b + 1] = c[1]; buf[b + 2] = c[2];
      luma[i] = LR * c[0] + LG * c[1] + LB * c[2];
    }

    // --- LumaSharpen.fx + Vignette.fx ---
    const out = new ImageData(w, h);
    const od = out.data;
    const force = P.LumaSharpen.sharp_strength, pince = P.LumaSharpen.sharp_clamp;
    const grain = P.FilmGrain.Intensity;
    let graine = 12345;
    const alea = () => ((graine = (Math.imul(graine, 1103515245) + 12345) >>> 0) / 4294967296);
    const amount = P.Vignette.Amount, rayon = P.Vignette.Radius, ratio = w / h;
    for (let y = 0; y < h; y++) {
      const y0 = y > 0 ? y - 1 : y, y1 = y < h - 1 ? y + 1 : y;
      const dy = (y / h - 0.5) / rayon;
      for (let x = 0; x < w; x++) {
        const i = y * w + x, b = i * 3;
        let r = buf[b], g = buf[b + 1], bl = buf[b + 2];
        if (force > 0) {
          const x0 = x > 0 ? x - 1 : x, x1 = x < w - 1 ? x + 1 : x;
          const flou =
            (luma[y0 * w + x0] + luma[y0 * w + x1] + luma[y1 * w + x0] + luma[y1 * w + x1] +
              2 * (luma[y0 * w + x] + luma[y1 * w + x] + luma[y * w + x0] + luma[y * w + x1]) +
              4 * luma[i]) / 16;
          const net = clamp((luma[i] - flou) * force, -pince, pince);
          r += net; g += net; bl += net;
        }
        if (grain > 0) {
          // FilmGrain.fx : bruit gaussien, plus visible dans les tons sombres
          const bruit = Math.sqrt(-2 * Math.log(alea() + 1e-7)) * Math.cos(6.2831853 * alea());
          const inv = Math.max(0, 1 - (r + g + bl) / 3);
          const n = bruit * 0.4 * Math.pow(inv, 3) * grain * 0.35;
          r += n; g += n; bl += n;
        }
        if (amount !== 0) {
          const dx = ((x / w - 0.5) * ratio) / rayon;
          const dist = dx * dx + dy * dy; // Slope 2 → pow(dist, 1)
          const m = 1 + dist * amount;
          r *= m; g *= m; bl *= m;
        }
        const o = i * 4;
        od[o] = clamp(r, 0, 1) * 255;
        od[o + 1] = clamp(g, 0, 1) * 255;
        od[o + 2] = clamp(bl, 0, 1) * 255;
        od[o + 3] = 255;
      }
    }
    return out;
  }

  return { traiter, parametres, complet };
})();
