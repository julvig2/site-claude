/* ==========================================================================
   PACK SON
   Dépôt d'un son (ou bibliothèque de sons de tir générés ici), sélection
   d'un passage sur l'onde, écoute, puis création du pack :
     <pack>/son/<pack>.wav                  → le passage, en WAV 44,1 kHz
     <pack>/serveur/<pack>_son/              → ressource FiveM qui joue ce son
                                               à chaque tir avec l'arme choisie
   ========================================================================== */

const SonPack = (() => {
  const $ = (s) => document.querySelector(s);
  const TAUX = 44100;
  const DUREE_HQ = 0.86;
  const DUREE_MAX = 60;

  let ctxAudio = null;
  const audio = () => (ctxAudio ||= new (window.AudioContext || window.webkitAudioContext)());

  let donnees = null;      // Float32Array mono 44,1 kHz
  let tampon = null;       // AudioBuffer pour l'écoute
  let nomSource = "";
  const sel = { debut: 0, fin: DUREE_HQ };
  let lecture = null;      // { source, t0, debut, duree }

  /* ---------- Bibliothèque : sons de tir synthétisés (libres) ---------- */
  const BIBLIO = [
    { id: "sec", nom: "Claquement sec" },
    { id: "lourd", nom: "Coup lourd" },
    { id: "echo", nom: "Écho de rue" },
    { id: "silencieux", nom: "Silencieux" },
    { id: "rafale", nom: "Rafale x3" },
  ];

  function bruitBlanc(ctx, duree) {
    const b = ctx.createBuffer(1, Math.ceil(duree * ctx.sampleRate), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function tir(ctx, sortie, t, o) {
    const n = ctx.createBufferSource();
    n.buffer = bruitBlanc(ctx, o.duree + 0.05);
    const f = ctx.createBiquadFilter();
    f.type = o.filtre || "lowpass";
    f.frequency.setValueAtTime(o.coupe, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(200, o.coupe * 0.25), t + o.duree);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.fort || 1, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.duree);
    n.connect(f).connect(g).connect(sortie);
    n.start(t);
    if (o.grave) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(o.grave * 2.2, t);
      osc.frequency.exponentialRampToValueAtTime(o.grave, t + 0.08);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(o.fortGrave || 0.8, t + 0.004);
      og.gain.exponentialRampToValueAtTime(0.0001, t + (o.dureeGrave || 0.25));
      osc.connect(og).connect(sortie);
      osc.start(t);
      osc.stop(t + 0.7);
    }
    if (o.clic) {
      // petit bruit mécanique (culasse)
      const c = ctx.createBufferSource();
      c.buffer = bruitBlanc(ctx, 0.02);
      const cf = ctx.createBiquadFilter();
      cf.type = "highpass";
      cf.frequency.value = 3500;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, t + o.clic);
      cg.gain.exponentialRampToValueAtTime(0.35, t + o.clic + 0.001);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + o.clic + 0.018);
      c.connect(cf).connect(cg).connect(sortie);
      c.start(t + o.clic);
    }
  }

  async function genererSon(id) {
    const ctx = new OfflineAudioContext(1, Math.ceil(TAUX * 1.3), TAUX);
    let sortie = ctx.destination;
    const sec = { coupe: 6500, duree: 0.18, grave: 95, fortGrave: 0.55, dureeGrave: 0.14, clic: 0.06 };
    if (id === "echo") {
      const maitre = ctx.createGain();
      const retard = ctx.createDelay(1);
      retard.delayTime.value = 0.21;
      const retour = ctx.createGain();
      retour.gain.value = 0.38;
      const filtre = ctx.createBiquadFilter();
      filtre.type = "lowpass";
      filtre.frequency.value = 2400;
      maitre.connect(ctx.destination);
      maitre.connect(retard);
      retard.connect(filtre).connect(retour).connect(retard);
      retour.connect(ctx.destination);
      sortie = maitre;
    }
    if (id === "sec" || id === "echo") tir(ctx, sortie, 0.02, sec);
    if (id === "lourd") tir(ctx, sortie, 0.02, { coupe: 1900, duree: 0.45, fort: 1, grave: 52, fortGrave: 1, dureeGrave: 0.42 });
    if (id === "silencieux") tir(ctx, sortie, 0.02, { filtre: "bandpass", coupe: 2600, duree: 0.09, fort: 0.7, grave: 150, fortGrave: 0.25, dureeGrave: 0.06, clic: 0.045 });
    if (id === "rafale") [0.02, 0.13, 0.24].forEach((t) => tir(ctx, sortie, t, { ...sec, clic: 0 }));
    const rendu = await ctx.startRendering();
    return rendu.getChannelData(0).slice();
  }

  /* ---------- Chargement ---------- */
  async function versMono(ab) {
    const duree = Math.min(ab.duration, DUREE_MAX);
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(duree * TAUX)), TAUX);
    const src = off.createBufferSource();
    src.buffer = ab;
    src.connect(off.destination);
    src.start();
    const r = await off.startRendering();
    return r.getChannelData(0).slice();
  }

  function decoder(buf) {
    return new Promise((ok, ko) => {
      const p = audio().decodeAudioData(buf, ok, ko);
      if (p && p.then) p.then(ok, ko);
    });
  }

  function utiliser(mono, nom) {
    arreter();
    donnees = mono;
    nomSource = nom;
    tampon = audio().createBuffer(1, donnees.length, TAUX);
    tampon.getChannelData(0).set(donnees);
    // sélection automatique : on part de l'attaque du son
    let max = 0;
    for (let i = 0; i < donnees.length; i++) max = Math.max(max, Math.abs(donnees[i]));
    let attaque = 0;
    for (let i = 0; i < donnees.length; i++) {
      if (Math.abs(donnees[i]) > max * 0.3) { attaque = i; break; }
    }
    const total = duree();
    sel.debut = Math.max(0, attaque / TAUX - 0.01);
    sel.fin = Math.min(total, sel.debut + DUREE_HQ);
    if (sel.fin - sel.debut < DUREE_HQ) sel.debut = Math.max(0, sel.fin - DUREE_HQ);
    const nomPack = $("#nomSon");
    if (nomPack && (!nomPack.value || nomPack.dataset.auto)) {
      nomPack.value = nom.replace(/\.[a-z0-9]+$/i, "").slice(0, 40);
      nomPack.dataset.auto = "1";
    }
    majInterface();
  }

  const duree = () => (donnees ? donnees.length / TAUX : 0);

  /* ---------- Onde ---------- */
  let pics = null;
  function calculerPics(largeur) {
    pics = new Float32Array(largeur * 2);
    const pas = donnees.length / largeur;
    for (let x = 0; x < largeur; x++) {
      let mn = 0, mx = 0;
      const a = Math.floor(x * pas), b = Math.min(donnees.length, Math.floor((x + 1) * pas));
      for (let i = a; i < b; i++) {
        const v = donnees[i];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      pics[x * 2] = mn;
      pics[x * 2 + 1] = mx;
    }
  }

  function couleur(nom) {
    return getComputedStyle(document.documentElement).getPropertyValue(nom).trim() || "#08482d";
  }

  function dessiner(tete) {
    const c = $("#onde");
    if (!c) return;
    const ctx = c.getContext("2d");
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    if (!donnees) {
      ctx.fillStyle = couleur("--texte-2");
      ctx.font = "500 28px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Dépose un son ou choisis-en un dans la bibliothèque", W / 2, H / 2 + 10);
      return;
    }
    if (!pics || pics.length !== W * 2) calculerPics(W);
    const total = duree();
    const x0 = (sel.debut / total) * W, x1 = (sel.fin / total) * W;
    ctx.fillStyle = couleur("--menthe");
    ctx.fillRect(x0, 0, x1 - x0, H);
    const milieu = H / 2;
    for (let x = 0; x < W; x++) {
      const dans = x >= x0 && x <= x1;
      ctx.fillStyle = dans ? couleur("--vert") : "#b9c2b0";
      const mn = pics[x * 2], mx = pics[x * 2 + 1];
      const y0 = milieu - mx * milieu * 0.92, y1 = milieu - mn * milieu * 0.92;
      ctx.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }
    // poignées
    ctx.fillStyle = couleur("--vert");
    for (const x of [x0, x1]) {
      ctx.fillRect(x - 2, 0, 4, H);
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x - 9, H / 2 - 22, 18, 44, 9) : ctx.rect(x - 9, H / 2 - 22, 18, 44);
      ctx.fill();
    }
    if (tete !== undefined) {
      const xt = (tete / total) * W;
      ctx.fillStyle = couleur("--texte");
      ctx.fillRect(xt - 1, 0, 2, H);
    }
  }

  function majInterface() {
    const d = sel.fin - sel.debut;
    $("#sonSel").textContent = donnees ? `Passage : ${d.toFixed(2).replace(".", ",")} s (de ${sel.debut.toFixed(2).replace(".", ",")} à ${sel.fin.toFixed(2).replace(".", ",")} s)` : "Aucun son";
    $("#sonInfos").textContent = donnees ? `${nomSource} · ${duree().toFixed(2).replace(".", ",")} s` : "";
    $("#btn086").classList.toggle("actif", Math.abs(d - DUREE_HQ) < 0.005);
    ["#btnEcouter", "#btn086", "#btnCreerSon"].forEach((s) => ($(s).disabled = !donnees));
    pics = null;
    dessiner();
  }

  /* ---------- Sélection à la souris / au doigt ---------- */
  function initOnde() {
    const c = $("#onde");
    let action = null;
    const temps = (e) => {
      const r = c.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duree();
    };
    const pxEnTemps = (px) => (px / c.getBoundingClientRect().width) * duree();
    c.addEventListener("pointerdown", (e) => {
      if (!donnees) return;
      c.setPointerCapture(e.pointerId);
      const t = temps(e), marge = pxEnTemps(10);
      if (Math.abs(t - sel.debut) < marge) action = { type: "debut" };
      else if (Math.abs(t - sel.fin) < marge) action = { type: "fin" };
      else if (t > sel.debut && t < sel.fin) action = { type: "deplacer", ecart: t - sel.debut };
      else {
        const d = sel.fin - sel.debut;
        sel.debut = Math.max(0, Math.min(duree() - d, t - d / 2));
        sel.fin = sel.debut + d;
        action = { type: "deplacer", ecart: t - sel.debut };
        majInterface();
      }
    });
    c.addEventListener("pointermove", (e) => {
      if (!donnees) return;
      const t = temps(e), marge = pxEnTemps(10);
      if (!action) {
        c.style.cursor = Math.abs(t - sel.debut) < marge || Math.abs(t - sel.fin) < marge ? "ew-resize" : t > sel.debut && t < sel.fin ? "grab" : "pointer";
        return;
      }
      const d = sel.fin - sel.debut;
      if (action.type === "debut") sel.debut = Math.max(0, Math.min(sel.fin - 0.05, t, sel.fin - 0.05));
      if (action.type === "debut") sel.debut = Math.max(sel.debut, sel.fin - 3);
      if (action.type === "fin") sel.fin = Math.min(duree(), Math.max(sel.debut + 0.05, Math.min(t, sel.debut + 3)));
      if (action.type === "deplacer") {
        sel.debut = Math.max(0, Math.min(duree() - d, t - action.ecart));
        sel.fin = sel.debut + d;
      }
      majInterface();
    });
    const fin = () => {
      if (action) {
        action = null;
        ecouter();
      }
    };
    c.addEventListener("pointerup", fin);
    c.addEventListener("pointercancel", () => (action = null));
  }

  /* ---------- Écoute ---------- */
  function arreter() {
    if (lecture) {
      try { lecture.source.stop(); } catch (e) { /* déjà arrêtée */ }
      lecture = null;
    }
    $("#btnEcouter") && ($("#btnEcouter").textContent = "Écouter le passage");
    dessiner();
  }

  function ecouter() {
    if (!tampon) return;
    arreter();
    const ctx = audio();
    ctx.resume();
    const source = ctx.createBufferSource();
    source.buffer = tampon;
    const g = ctx.createGain();
    g.gain.value = parseFloat($("#sonVolume").value);
    source.connect(g).connect(ctx.destination);
    const d = sel.fin - sel.debut;
    source.start(0, sel.debut, d);
    lecture = { source, t0: ctx.currentTime, debut: sel.debut, duree: d };
    $("#btnEcouter").textContent = "Arrêter";
    source.onended = () => {
      if (lecture && lecture.source === source) arreter();
    };
    const anim = () => {
      if (!lecture || lecture.source !== source) return;
      const t = lecture.debut + (ctx.currentTime - lecture.t0);
      dessiner(Math.min(t, sel.fin));
      requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
  }

  /* ---------- WAV ---------- */
  function wavSelection() {
    const i0 = Math.floor(sel.debut * TAUX), i1 = Math.floor(sel.fin * TAUX);
    const seg = donnees.slice(i0, i1);
    let max = 0;
    for (let i = 0; i < seg.length; i++) max = Math.max(max, Math.abs(seg[i]));
    const k = max > 0 ? 0.891 / max : 1; // normalisé à -1 dB
    const fadeIn = Math.floor(0.004 * TAUX), fadeOut = Math.floor(0.025 * TAUX);
    for (let i = 0; i < seg.length; i++) {
      let v = seg[i] * k;
      if (i < fadeIn) v *= i / fadeIn;
      if (i > seg.length - fadeOut) v *= (seg.length - i) / fadeOut;
      seg[i] = v;
    }
    return encoderWav(seg);
  }

  function encoderWav(seg) {
    const buf = new ArrayBuffer(44 + seg.length * 2);
    const v = new DataView(buf);
    const ecrire = (o, t) => [...t].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
    ecrire(0, "RIFF");
    v.setUint32(4, 36 + seg.length * 2, true);
    ecrire(8, "WAVE");
    ecrire(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);          // PCM
    v.setUint16(22, 1, true);          // mono
    v.setUint32(24, TAUX, true);
    v.setUint32(28, TAUX * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    ecrire(36, "data");
    v.setUint32(40, seg.length * 2, true);
    for (let i = 0; i < seg.length; i++) {
      const s = Math.max(-1, Math.min(1, seg[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Uint8Array(buf);
  }

  function versBase64(octets) {
    let s = "";
    for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function depuisBase64(b64) {
    const s = atob(b64);
    const o = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i);
    return o;
  }

  /** 48 pics (0 … 1) pour dessiner une mini-onde dans la communauté. */
  function picsSelection() {
    const i0 = Math.floor(sel.debut * TAUX), i1 = Math.floor(sel.fin * TAUX);
    const n = 48, pas = (i1 - i0) / n;
    let max = 0;
    const res = [];
    for (let k = 0; k < n; k++) {
      let m = 0;
      for (let i = Math.floor(i0 + k * pas); i < Math.floor(i0 + (k + 1) * pas); i++) m = Math.max(m, Math.abs(donnees[i] || 0));
      res.push(m);
      max = Math.max(max, m);
    }
    return res.map((m) => Math.round((max ? m / max : 0) * 100) / 100);
  }

  /* ---------- Ressource FiveM ---------- */
  function luaClient(m) {
    return `-- Son de tir personnalisé : joué à chaque tir avec l'arme choisie,
-- pour le tireur et les joueurs proches.
-- Commande en jeu : /packson  → coupe / remet le son pour soi.

local ARME = GetHashKey("${m.arme}")
local VOLUME = ${Number(m.volume).toFixed(2)}
local PORTEE = ${Number(m.portee).toFixed(1)}   -- distance (mètres) à laquelle les autres joueurs l'entendent
local EVENEMENT = GetCurrentResourceName() .. ":tir"
local actif = true

local function jouer(volume)
    if actif and volume > 0.01 then
        SendNUIMessage({ action = "jouer", volume = volume })
    end
end

CreateThread(function()
    while true do
        local ped = PlayerPedId()
        if GetSelectedPedWeapon(ped) == ARME then
            if IsPedShooting(ped) then
                jouer(VOLUME)
                TriggerServerEvent(EVENEMENT, GetEntityCoords(ped))
            end
            Wait(0)
        else
            Wait(250)
        end
    end
end)

RegisterNetEvent(EVENEMENT, function(tireur, coords)
    if tireur == GetPlayerServerId(PlayerId()) then return end
    local distance = #(GetEntityCoords(PlayerPedId()) - coords)
    if distance < PORTEE then
        jouer(VOLUME * (1.0 - distance / PORTEE))
    end
end)

RegisterCommand("packson", function()
    actif = not actif
end, false)
`;
  }

  const luaServeur = () => `-- Relaie chaque tir aux autres joueurs (limité pour éviter les abus).

local EVENEMENT = GetCurrentResourceName() .. ":tir"
local dernierTir = {}

RegisterNetEvent(EVENEMENT, function(coords)
    local tireur = source
    local maintenant = GetGameTimer()
    if dernierTir[tireur] and maintenant - dernierTir[tireur] < 60 then return end
    dernierTir[tireur] = maintenant
    if type(coords) ~= "vector3" then return end
    TriggerClientEvent(EVENEMENT, -1, tireur, coords)
end)

AddEventHandler("playerDropped", function()
    dernierTir[source] = nil
end)
`;

  const manifeste = (m) => `fx_version 'cerulean'
game 'gta5'

author '${m.auteur.replace(/'/g, "")}'
description 'Pack son ${m.nom.replace(/'/g, "")} - généré avec ${SITE.nom}'
version '1.0.0'

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/son.wav',
}

client_script 'client.lua'
server_script 'server.lua'
`;

  const pageNui = () => `<!doctype html>
<html>
<body>
<script>
  // Plusieurs lecteurs pour que les tirs rapides se superposent.
  const lecteurs = [];
  for (let i = 0; i < 8; i++) {
    const a = new Audio("son.wav");
    a.preload = "auto";
    lecteurs.push(a);
  }
  let suivant = 0;
  window.addEventListener("message", (e) => {
    const d = e.data || {};
    if (d.action !== "jouer") return;
    const a = lecteurs[suivant++ % lecteurs.length];
    a.volume = Math.max(0, Math.min(1, d.volume));
    a.currentTime = 0;
    a.play().catch(() => {});
  });
</script>
</body>
</html>
`;

  function lisezmoi(m, id) {
    return `==============================================================
 ${m.nom.toUpperCase()}
 Pack son FiveM — par ${m.auteur}
 Généré avec ${SITE.nom}
==============================================================

 Arme : ${m.armeNom} (${m.arme})
 Durée du son : ${m.duree.toFixed(2).replace(".", ",")} s
 Volume : ${Math.round(m.volume * 100)} %   Portée : ${Math.round(m.portee)} m

--------------------------------------------------------------
 INSTALLATION (serveur FiveM)
--------------------------------------------------------------
 1) Copiez le dossier "serveur/${id}_son" dans le dossier
    "resources" de votre serveur.
 2) Ajoutez dans server.cfg :  ensure ${id}_son
 3) Redémarrez le serveur.

 À chaque tir avec cette arme, le son est joué pour le tireur et
 pour les joueurs à moins de ${Math.round(m.portee)} m (plus faible avec la distance).
 Les joueurs peuvent taper /packson pour le couper chez eux.

 Le son s'ajoute au bruit d'origine de l'arme. Le remplacer
 complètement demande des fichiers audio au format du jeu (.awc),
 que le site ne fabrique pas.

 Le fichier "son/${id}.wav" contient le son seul (WAV 44,1 kHz,
 16 bits, mono) si vous voulez l'utiliser ailleurs.
`;
  }

  /** Construit et télécharge le pack son. m = { nom, auteur, arme, armeNom, volume, portee, wav (Uint8Array) } */
  async function telecharger(m) {
    if (typeof JSZip === "undefined") throw new Error("JSZip n'a pas pu être chargé");
    const id = Exporteur.slug(m.nom || "mon son");
    const meta = { ...m, nom: m.nom || "Mon son", auteur: m.auteur || "Anonyme", duree: m.duree ?? (m.wav.length - 44) / 2 / TAUX };
    const zip = new JSZip();
    const racine = zip.folder(id);
    racine.file("LISEZMOI.txt", lisezmoi(meta, id));
    racine.folder("son").file(`${id}.wav`, m.wav);
    const res = racine.folder("serveur").folder(`${id}_son`);
    res.file("fxmanifest.lua", manifeste(meta));
    res.file("client.lua", luaClient(meta));
    res.file("server.lua", luaServeur());
    res.folder("html").file("index.html", pageNui());
    res.folder("html").file("son.wav", m.wav);
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    await Exporteur.sauvegarder(blob, `${id}_son.zip`);
    return `${id}_son.zip`;
  }

  /** Joue un son WAV donné en base64 (cartes de la communauté). */
  async function jouerBase64(b64, volume = 0.8) {
    const ctx = audio();
    await ctx.resume();
    const octets = depuisBase64(b64);
    const ab = await decoder(octets.buffer.slice(0));
    const src = ctx.createBufferSource();
    src.buffer = ab;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(ctx.destination);
    src.start();
  }

  /* ---------- Interface ---------- */
  function armeChoisie() {
    const v = $("#sonArme").value;
    if (v !== "autre") return { arme: v, armeNom: (ARMES.find((a) => a.id === v) || {}).nom || v };
    const saisie = $("#sonArmeAutre").value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "");
    return { arme: saisie || "WEAPON_PISTOL", armeNom: saisie || "Pistolet" };
  }

  function etat() {
    if (!donnees) return null;
    const wav = wavSelection();
    return {
      nom: $("#nomSon").value.trim() || "Mon son",
      auteur: $("#auteurSon").value.trim() || "Anonyme",
      ...armeChoisie(),
      volume: parseFloat($("#sonVolume").value),
      portee: parseFloat($("#sonPortee").value),
      duree: sel.fin - sel.debut,
      wav,
      pics: picsSelection(),
    };
  }

  function init() {
    if (!$("#onde")) return;
    const toast = (m) => window.ForgeUI && window.ForgeUI.toast(m);

    // armes
    const choix = $("#sonArme");
    ARMES.forEach((a) => choix.add(new Option(a.id === "autre" ? a.nom : `${a.nom} — ${a.id}`, a.id)));
    choix.addEventListener("change", () => ($("#ligneArmeAutre").hidden = choix.value !== "autre"));

    // curseurs
    [["#sonVolume", (v) => Math.round(v * 100) + " %"], ["#sonPortee", (v) => Math.round(v) + " m"]].forEach(([s, f]) => {
      const i = $(s);
      const maj = () => {
        $(s + "Out").textContent = f(parseFloat(i.value));
        i.style.setProperty("--p", ((i.value - i.min) / (i.max - i.min)) * 100 + "%");
      };
      i.addEventListener("input", maj);
      maj();
    });
    $("#nomSon").addEventListener("input", (e) => delete e.target.dataset.auto);

    // bibliothèque
    const biblio = $("#biblio");
    BIBLIO.forEach((b) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "biblio__son";
      btn.textContent = b.nom;
      btn.addEventListener("click", async () => {
        $$(".biblio__son").forEach((x) => x.classList.toggle("actif", x === btn));
        utiliser(await genererSon(b.id), b.nom);
        ecouter();
      });
      biblio.appendChild(btn);
    });

    // dépôt de fichier
    const depot = $("#depot");
    const charger = async (f) => {
      if (!f) return;
      try {
        const mono = await versMono(await decoder(await f.arrayBuffer()));
        $$(".biblio__son").forEach((x) => x.classList.remove("actif"));
        utiliser(mono, f.name);
        toast(`« ${f.name} » chargé`);
      } catch (e) {
        toast("Ce fichier n'est pas un son lisible : essaie un MP3 ou un WAV.");
      }
    };
    $("#importSon").addEventListener("change", (e) => {
      charger(e.target.files[0]);
      e.target.value = "";
    });
    ["dragenter", "dragover"].forEach((t) => depot.addEventListener(t, (e) => {
      e.preventDefault();
      depot.classList.add("survol");
    }));
    ["dragleave", "drop"].forEach((t) => depot.addEventListener(t, () => depot.classList.remove("survol")));
    depot.addEventListener("drop", (e) => {
      e.preventDefault();
      charger(e.dataTransfer.files[0]);
    });

    $("#btnEcouter").addEventListener("click", () => (lecture ? arreter() : ecouter()));
    $("#btn086").addEventListener("click", () => {
      if (!donnees) return;
      sel.fin = Math.min(duree(), sel.debut + DUREE_HQ);
      sel.debut = Math.max(0, sel.fin - DUREE_HQ);
      majInterface();
      ecouter();
    });

    $("#btnCreerSon").addEventListener("click", async (e) => {
      const m = etat();
      if (!m) return;
      const vente = typeof Communaute !== "undefined" ? Communaute.lireVente("Son") : { prix: 0, lien: "" };
      if (vente.erreur) {
        toast(vente.erreur);
        return;
      }
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const f = await telecharger(m);
        let msg = `${f} téléchargé ✔`;
        if ($("#publierSon").checked && typeof Communaute !== "undefined") {
          const ok = await Communaute.publier(
            { type: "son", nom: m.nom, auteur: m.auteur, prix: vente.prix, lien: vente.lien, son: { arme: m.arme, armeNom: m.armeNom, volume: m.volume, portee: m.portee, duree: m.duree, pics: m.pics } },
            versBase64(m.wav)
          );
          if (ok) msg += vente.prix ? ` · en vente à ${vente.prix.toFixed(2).replace(".", ",")} €` : " · publié dans les derniers packs";
        }
        toast(msg);
      } catch (err) {
        toast("Erreur : " + err.message);
      } finally {
        btn.disabled = false;
      }
    });

    initOnde();
    majInterface();
  }

  const $$ = (s) => [...document.querySelectorAll(s)];
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { telecharger, jouerBase64, depuisBase64, versBase64 };
})();
