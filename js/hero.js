/* ==========================================================================
   ACCUEIL : carrousel courbé + animation d'entrée
   Toutes les mesures sont en "unités cadre" (cadre de 1440×1080).
   ========================================================================== */

(() => {
  const frame = document.getElementById("frame");
  const rail = document.getElementById("rail");
  if (!frame || !rail) return;

  const N = 10;          // nombre de cartes
  const PAS = 196;       // espacement des cartes
  const L = N * PAS;     // longueur de la boucle
  const AUTO = 50;       // défilement automatique (unités / seconde)
  const telephone = matchMedia("(max-width: 820px)");
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Images des packs (scène + réglages du pack) ---------- */
  const images = new Map();
  function imagePack(p) {
    const W = 960, H = 540;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    c.getContext("2d").putImageData(Moteur.traiter(Scene.image(p.scene, W, H), p.reglages), 0, 0);
    return c.toDataURL("image/jpeg", 0.86);
  }

  /* ---------- Cartes ---------- */
  const cartes = [];
  for (let i = 0; i < N; i++) {
    const pack = PACKS[i % PACKS.length];
    const el = document.createElement("div");
    el.className = "carte-reel";
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `Voir le pack ${pack.nom}`);
    el.innerHTML = `
      <img class="carte-reel__media" alt="" draggable="false" />
      <span class="carte-reel__lecture" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg></span>
      <span class="carte-reel__nom"></span>`;
    el.querySelector(".carte-reel__nom").textContent = pack.nom;
    el.querySelector(".carte-reel__media").style.animationDelay = `${-i * 1.7}s`;
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        ouvrir(pack);
      }
    });
    rail.appendChild(el);
    cartes.push({ el, pack, img: el.querySelector("img") });
  }

  function remplirImages() {
    // Une image par pack, générée en plusieurs passes pour ne pas figer la page.
    images.clear();
    const packs = [...new Set(cartes.map((c) => c.pack))];
    let i = 0;
    const suivant = () => {
      if (i >= packs.length) return;
      const p = packs[i++];
      const url = imagePack(p);
      images.set(p.id, url);
      cartes.filter((c) => c.pack === p).forEach((c) => {
        c.img.onload = () => c.el.classList.add("prete");
        c.img.src = url;
      });
      setTimeout(suivant, 16);
    };
    suivant();
  }
  remplirImages();
  document.addEventListener("captures-chargees", remplirImages);

  function ouvrir(pack) {
    if (window.ForgeUI) window.ForgeUI.ouvrirModale(pack);
  }

  /* ---------- Géométrie "intérieur de cylindre" ---------- */
  function quadArrondi(pts, r) {
    // pts : 4 sommets dans l'ordre ; coins arrondis par courbes quadratiques
    let d = "";
    for (let i = 0; i < 4; i++) {
      const p0 = pts[(i + 3) % 4], p1 = pts[i], p2 = pts[(i + 1) % 4];
      const a = versPoint(p1, p0, r), b = versPoint(p1, p2, r);
      d += (i === 0 ? `M${a[0]},${a[1]}` : `L${a[0]},${a[1]}`) + `Q${p1[0]},${p1[1]} ${b[0]},${b[1]}`;
    }
    return d + "Z";
  }
  function versPoint(de, vers, r) {
    const dx = vers[0] - de[0], dy = vers[1] - de[1];
    const l = Math.hypot(dx, dy) || 1;
    const k = Math.min(r, l / 2) / l;
    return [+(de[0] + dx * k).toFixed(2), +(de[1] + dy * k).toFixed(2)];
  }

  let defilement = 0;   // position de la boucle (unités)
  let elan = 0;         // vitesse ajoutée par un lancer (unités / seconde)
  let glisse = null;    // état du glisser en cours

  function disposer() {
    const r = rail.getBoundingClientRect();
    if (!r.width) return;
    const tel = telephone.matches;
    const k = tel ? r.width / 640 : r.width / 1440; // px par unité
    const cx = tel ? 320 : 720;
    const cy0 = tel ? r.height / k / 2 + 6 : 207;    // le rail commence à y = 480 dans le cadre
    const largeurU = r.width / k;

    for (let i = 0; i < N; i++) {
      const { el } = cartes[i];
      const t = (((i * PAS - defilement) % L) + L) % L - L / 2;
      const x = cx + t * (1 + 0.083 * (t / 706) ** 2);
      const d = Math.abs(x - cx) / 706;
      const w = 170 + 48 * d * d;
      const xl = x - w / 2, xr = x + w / 2;
      if (xr < -20 || xl > largeurU + 20) {
        el.style.visibility = "hidden";
        continue;
      }
      const hl = 280 + 92 * (Math.abs(xl - cx) / 706) ** 2.6;
      const hr = 280 + 92 * (Math.abs(xr - cx) / 706) ** 2.6;
      const cy = cy0 - 12 * d * d;
      const H = Math.max(hl, hr);
      const pts = [
        [0, (H - hl) / 2], [w, (H - hr) / 2],
        [w, (H + hr) / 2], [0, (H + hl) / 2],
      ].map(([a, b]) => [a * k, b * k]);
      el.style.visibility = "visible";
      el.style.width = `${w * k}px`;
      el.style.height = `${H * k}px`;
      el.style.transform = `translate3d(${xl * k}px, ${(cy - H / 2) * k}px, 0)`;
      el.style.clipPath = `path('${quadArrondi(pts, 15 * k)}')`;
      // l'icône et le nom suivent le bord bas, qui penche sur les côtés
      el.style.setProperty("--bas", `${((H - hl) / 2) * k}px`);
    }
  }

  /* ---------- Horloge (Web Animations) ---------- */
  const horloge = document.documentElement.animate([], { duration: 1e9 });
  let avant = horloge.currentTime || 0;
  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(rail);

  function boucle() {
    const maintenant = horloge.currentTime || 0;
    const dt = Math.min(0.1, (maintenant - avant) / 1000);
    avant = maintenant;
    if (!glisse) {
      defilement += ((reduit ? 0 : AUTO) + elan) * dt;
      elan *= Math.pow(0.05, dt); // perd ~95 % par seconde
      if (Math.abs(elan) < 0.5) elan = 0;
    }
    if (visible) disposer();
    requestAnimationFrame(boucle);
  }
  disposer();
  requestAnimationFrame(boucle);

  /* ---------- Glisser / lancer ---------- */
  const echelle = () => {
    const r = rail.getBoundingClientRect();
    return telephone.matches ? r.width / 640 : r.width / 1440;
  };
  rail.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    rail.setPointerCapture(e.pointerId);
    const carte = e.target.closest(".carte-reel");
    glisse = { x: e.clientX, t: performance.now(), total: 0, vitesse: 0, carte };
    elan = 0;
    rail.classList.add("saisi");
  });
  rail.addEventListener("pointermove", (e) => {
    if (!glisse) return;
    const dx = e.clientX - glisse.x;
    const maintenant = performance.now();
    const dt = Math.max(1, maintenant - glisse.t) / 1000;
    const du = dx / echelle();
    defilement -= du;
    glisse.vitesse = glisse.vitesse * 0.6 + (-du / dt) * 0.4;
    glisse.total += Math.abs(dx);
    glisse.x = e.clientX;
    glisse.t = maintenant;
  });
  const lacher = (e) => {
    if (!glisse) return;
    const g = glisse;
    glisse = null;
    rail.classList.remove("saisi");
    if (e.type === "pointerup" && g.total < 6 && g.carte) {
      const c = cartes.find((x) => x.el === g.carte);
      if (c) ouvrir(c.pack);
      return;
    }
    // pas de lancer si le pointeur s'est arrêté avant de lâcher
    elan = performance.now() - g.t > 80 ? 0 : Math.max(-3000, Math.min(3000, g.vitesse));
  };
  rail.addEventListener("pointerup", lacher);
  rail.addEventListener("pointercancel", lacher);

  /* ---------- Animation d'entrée ---------- */
  if (reduit) return;
  const anime = (sel, images, opts) =>
    document.querySelectorAll(sel).forEach((el, i) =>
      el.animate(images, { duration: 700, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards", ...opts, delay: (opts.delay || 0) + i * (opts.pas || 0) })
    );

  anime(".barre", [{ opacity: 0, transform: "translateY(-24px)" }, { opacity: 1, transform: "none" }], { delay: 0 });
  anime(".badge", [{ opacity: 0, transform: "translateX(-50%) scale(.8)" }, { opacity: 1, transform: "translateX(-50%) scale(1)" }], { delay: 180, easing: "cubic-bezier(.3,1.5,.5,1)" });
  anime(".titre span", [{ opacity: 0, transform: "translateY(40px)", filter: "blur(14px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }], { delay: 300, pas: 130, duration: 900 });
  anime(".sous", [{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none" }], { delay: 620 });
  anime(".rail", [{ opacity: 0, transform: "translateY(80px)" }, { opacity: 1, transform: "none" }], { delay: 760, duration: 1100 });
  anime(".cta", [{ opacity: 0, transform: "translateX(-50%) scale(.85)" }, { opacity: 1, transform: "translateX(-50%) scale(1)" }], { delay: 1000, easing: "cubic-bezier(.3,1.5,.5,1)" });
  document.querySelectorAll(".trait").forEach((p, i) => {
    const l = p.getTotalLength();
    p.style.strokeDasharray = l;
    p.animate([{ strokeDashoffset: l }, { strokeDashoffset: 0 }], { duration: 800, delay: 1200 + i * 140, easing: "ease-in-out", fill: "backwards" });
  });
  anime(".note", [{ opacity: 0 }, { opacity: 1 }], { delay: 1350, pas: 200, duration: 600 });
})();
