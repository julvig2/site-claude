/* ==========================================================================
   MODS DU JEU (pack réaliste) : fichiers .rpf pour le dossier FiveM.app/mods
   - Mods du site : envoyés par les membres (hébergés) ou publiés avec un pack.
     On peut en ajouter plusieurs à un pack.
   - Mod d'eau perso : fabriqué à partir du water.xml du joueur
     (data/levels/gta5/water.xml dans common.rpf)
       · clarté : valeurs a1 … a4 de chaque zone d'eau (plus bas = plus clair)
       · vagues : valeur Amplitude de chaque zone de vagues
   ========================================================================== */

const Atelier = (() => {
  const $ = (s) => document.querySelector(s);
  const toast = (m) => window.ForgeUI && window.ForgeUI.toast(m);
  const echapper = (t) => String(t).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));
  const commu = () => (typeof Communaute !== "undefined" ? Communaute : null);
  const nomCategorie = (id) => (CATEGORIES_MODS.find((c) => c.id === id) || CATEGORIES_MODS[CATEGORIES_MODS.length - 1]).nom;
  const CIBLE_EAU = "common.rpf:data/levels/gta5/water.xml";

  let source = null;      // texte du water.xml du joueur
  let infos = null;       // statistiques lues dans ce fichier
  let choisis = [];       // mods du site ajoutés au pack
  let modEnvoi = null;    // { fichier, lecture } du mod en cours d'envoi

  /* ==================== Mod d'eau perso ==================== */
  function section(texte, balise) {
    const debut = texte.indexOf(`<${balise}>`);
    const fin = texte.indexOf(`</${balise}>`);
    return debut >= 0 && fin > debut ? { debut, fin } : null;
  }

  function analyser(texte) {
    if (!/<WaterData[\s>]/.test(texte)) throw new Error("ce n'est pas un water.xml de GTA V (balise WaterData absente)");
    const eau = section(texte, "WaterQuads");
    const vagues = section(texte, "WaveQuads");
    if (!eau) throw new Error("zones d'eau (WaterQuads) introuvables");
    const valeurs = (morceau, nom) => [...morceau.matchAll(new RegExp(`<${nom} value="(-?[\\d.]+)"`, "g"))].map((m) => parseFloat(m[1]));
    const zoneEau = texte.slice(eau.debut, eau.fin);
    const clarte = ["a1", "a2", "a3", "a4"].flatMap((n) => valeurs(zoneEau, n));
    const amplitudes = vagues ? valeurs(texte.slice(vagues.debut, vagues.fin), "Amplitude") : [];
    const stats = (l) => (l.length ? { min: Math.min(...l), max: Math.max(...l), moy: l.reduce((a, b) => a + b, 0) / l.length } : null);
    return { zonesEau: (zoneEau.match(/<Item>/g) || []).length, zonesVagues: amplitudes.length, clarte: stats(clarte), vagues: stats(amplitudes) };
  }

  const formater = (v) => {
    const r = Math.round(v * 100) / 100;
    return Number.isInteger(r) ? r.toFixed(1) : String(r);
  };

  /** Change uniquement les nombres réglés ; le reste du texte est conservé à l'identique. */
  function modifier(texte, r) {
    let sortie = texte;
    if (r.clarteActive) {
      const s = section(sortie, "WaterQuads");
      const morceau = sortie.slice(s.debut, s.fin).replace(/<(a[1-4]) value="-?[\d.]+"/g, (_, n) => `<${n} value="${Math.round(r.clarte)}"`);
      sortie = sortie.slice(0, s.debut) + morceau + sortie.slice(s.fin);
    }
    if (r.vaguesActives) {
      const s = section(sortie, "WaveQuads");
      if (s) {
        const morceau = sortie.slice(s.debut, s.fin).replace(/<Amplitude value="(-?[\d.]+)"/g, (_, v) => `<Amplitude value="${formater(parseFloat(v) * r.vagues)}"`);
        sortie = sortie.slice(0, s.debut) + morceau + sortie.slice(s.fin);
      }
    }
    return sortie;
  }

  function guid() {
    const h = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `{${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}}`;
  }

  /** Fiche assembly.xml lue par FiveM dans le dossier mods. */
  function assembly(m) {
    const desc = m.description.replace(/]]>/g, "]] >");
    return `<?xml version="1.0" encoding="UTF-8"?>
<package version="2.2" id="${guid()}" target="Five">
  <metadata>
    <name>${echapper(m.nom)}</name>
    <version>
      <major>1</major>
      <minor>0</minor>
      <tag></tag>
    </version>
    <author>
      <displayName>${echapper(m.auteur)}</displayName>
      <actionLink></actionLink>
      <web></web>
      <facebook></facebook>
      <twitter></twitter>
    </author>
    <description footerLink="" footerLinkTitle=""><![CDATA[${desc}]]></description>
  </metadata>
  <colors>
    <headerBackground useBlackTextColor="False">$FF08482D</headerBackground>
    <iconBackground>$FF08482D</iconBackground>
  </colors>
  <content>
    <archive path="common.rpf" createIfNotExist="True" type="RPF7">
      <add source="levels\\water.xml">data\\levels\\gta5\\water.xml</add>
    </archive>
  </content>
</package>
`;
  }

  function lireReglages() {
    return {
      clarteActive: $("#atClarteActive").checked,
      clarte: parseFloat($("#atClarte").value),
      vaguesActives: $("#atVaguesActives").checked,
      vagues: parseFloat($("#atVagues").value),
    };
  }

  function resumeEau(r) {
    const lignes = [];
    if (r.clarteActive) lignes.push(`Clarté de l'eau : ${Math.round(r.clarte)} (plus c'est bas, plus l'eau est claire)`);
    if (r.vaguesActives) lignes.push(`Vagues : ${Math.round(r.vagues * 100)} % de la hauteur d'origine`);
    return lignes;
  }

  const persoActif = () => {
    const r = lireReglages();
    return Boolean(source) && (r.clarteActive || r.vaguesActives);
  };

  /* ==================== Ce que le pack va contenir ==================== */
  /** Vrai si au moins un mod sera ajouté au pack. */
  const actif = () => persoActif() || choisis.length > 0;

  /**
   * Prépare tous les mods du pack.
   * @returns {Promise<{ perso: object|null, tous: Array<{ fichier, rpf, resume }>, refsSite: Array }>}
   */
  async function construireMods(nom, auteur) {
    const tous = [];
    let perso = null;
    if (persoActif()) {
      const r = lireReglages();
      const rpf = await Rpf.creer({
        "assembly.xml": assembly({ nom, auteur, description: `Généré avec ${SITE.nom}` }),
        content: { levels: { "water.xml": modifier(source, r) } },
      });
      perso = { fichier: `${Exporteur.slug(nom)}_eau.rpf`, rpf, resume: [`Mod d'eau « ${nom} »`, ...resumeEau(r)] };
      tous.push(perso);
    }
    const dejaPris = new Set(tous.map((m) => m.fichier));
    for (const m of choisis) {
      let fichier = `${Exporteur.slug(m.nom)}.rpf`;
      for (let i = 2; dejaPris.has(fichier); i++) fichier = `${Exporteur.slug(m.nom)}_${i}.rpf`;
      dejaPris.add(fichier);
      tous.push({
        fichier,
        rpf: await commu().chargerMod(m),
        resume: [`« ${m.nom} » par ${m.auteur}${m.lien ? ` (${m.lien})` : ""}`, ...(m.resume || [])],
      });
    }
    return {
      perso,
      tous,
      // seuls les mods hébergés sont référencés dans le pack publié (pas le mod d'eau d'un autre pack)
      refsSite: choisis.filter((m) => m.source === "site").map((m) => ({ id: m.id, vendeurId: m.vendeurId })),
    };
  }

  /* ==================== Interface : choix des mods ==================== */
  function conflits() {
    const cibles = new Map();
    const noter = (cible, nom) => cibles.set(cible, [...(cibles.get(cible) || []), nom]);
    if (persoActif()) noter(CIBLE_EAU, "ton mod d'eau");
    choisis.forEach((m) => (m.cibles || []).forEach((c) => noter(c, `« ${m.nom} »`)));
    return [...cibles.entries()].filter(([, noms]) => noms.length > 1);
  }

  function majChoix() {
    const ul = $("#atChoisis");
    ul.textContent = "";
    choisis.forEach((m, i) => {
      const li = document.createElement("li");
      li.className = "mods__chip";
      const t = document.createElement("span");
      t.textContent = `${m.nom} · ${nomCategorie(m.categorie)}`;
      const x = document.createElement("button");
      x.type = "button";
      x.setAttribute("aria-label", `Retirer ${m.nom}`);
      x.textContent = "×";
      x.addEventListener("click", () => { choisis.splice(i, 1); remplirListe(); });
      li.append(t, x);
      ul.appendChild(li);
    });
    const c = conflits();
    const alerte = $("#atConflits");
    alerte.hidden = !c.length;
    alerte.textContent = c.length
      ? "Attention : " + c.map(([cible, noms]) => `${noms.join(" et ")} remplacent le même fichier (${cible.split("/").pop()}) : un seul sera pris en compte par le jeu.`).join(" ")
      : "";
    majSorties();
  }

  function remplirListe() {
    const liste = $("#atSource");
    if (!liste) return;
    const tous = commu() ? commu().modsDisponibles() : [];
    // retire des choix les mods qui ne sont plus disponibles
    choisis = choisis.filter((c) => tous.some((m) => m.id === c.id));
    const restants = tous.filter((m) => !choisis.some((c) => c.id === m.id));
    liste.textContent = "";
    if (!restants.length) {
      const o = new Option(tous.length ? "Tous les mods du site sont déjà ajoutés" : "Aucun mod sur le site pour l'instant", "");
      liste.add(o);
      liste.disabled = true;
    } else {
      liste.disabled = false;
      liste.add(new Option(`Choisis un mod (${restants.length} disponibles)`, ""));
      CATEGORIES_MODS.forEach((cat) => {
        const dedans = restants.filter((m) => (m.categorie || "autre") === cat.id);
        if (!dedans.length) return;
        const g = document.createElement("optgroup");
        g.label = cat.nom;
        dedans.forEach((m) => g.appendChild(new Option(`${m.nom} — par ${m.auteur}${m.resume && m.resume[0] ? " · " + m.resume[0].replace(/ \(.*\)$/, "") : ""}`, m.id)));
        liste.appendChild(g);
      });
    }
    $("#atAjouter").disabled = liste.disabled;
    majChoix();
    majEnvoi();
  }

  function ajouter() {
    const id = $("#atSource").value;
    const m = commu() && commu().modsDisponibles().find((x) => x.id === id);
    if (!m) { toast("Choisis d'abord un mod dans la liste."); return; }
    choisis.push(m);
    remplirListe();
    toast(`« ${m.nom} » ajouté au pack`);
  }

  function majSorties() {
    const r = lireReglages();
    $("#atClarteOut").textContent = String(Math.round(r.clarte));
    $("#atVaguesOut").textContent = Math.round(r.vagues * 100) + " %";
    [["#atClarte", r.clarteActive], ["#atVagues", r.vaguesActives]].forEach(([s, on]) => {
      const i = $(s);
      i.disabled = !on || !source;
      i.closest(".reglage").classList.toggle("desactive", !on || !source);
      i.style.setProperty("--p", ((i.value - i.min) / (i.max - i.min)) * 100 + "%");
    });
    const n = choisis.length + (persoActif() ? 1 : 0);
    const etat = $("#atEtat");
    etat.textContent = n === 0
      ? "Aucun mod : le pack sera créé sans dossier mods."
      : n === 1 ? "1 mod sera ajouté au pack (dossier mods)." : `${n} mods seront ajoutés au pack (dossier mods).`;
    etat.classList.toggle("mods__etat--actif", n > 0);
    const transparence = 1 - Math.min(1, Math.max(0, (r.clarteActive ? r.clarte : infos && infos.clarte ? infos.clarte.moy : 20) / 30));
    $("#atEau").style.setProperty("--fond", transparence.toFixed(2));
    $("#atEau").style.setProperty("--vagues", r.vaguesActives ? r.vagues : 1);
  }

  function afficherInfos() {
    const el = $("#atInfos");
    if (!infos) { el.textContent = ""; return; }
    const c = infos.clarte, v = infos.vagues;
    const arr = (n) => (Math.round(n * 10) / 10).toString().replace(".", ",");
    el.textContent =
      `Fichier lu : ${infos.zonesEau} zones d'eau, ${infos.zonesVagues} zones de vagues. ` +
      (c ? `Clarté actuelle : ${arr(c.min)} à ${arr(c.max)} (moyenne ${arr(c.moy)}). ` : "") +
      (v ? `Hauteur des vagues : ${arr(v.min)} à ${arr(v.max)}.` : "");
  }

  async function chargerWater(f) {
    if (!f) return;
    try {
      const texte = await f.text();
      infos = analyser(texte);
      source = texte;
      if (infos.clarte) $("#atClarte").value = Math.round(infos.clarte.moy);
      $("#atFichier").textContent = `${f.name} · ${(f.size / 1024).toFixed(0)} Ko`;
      $("#atDepot").classList.add("charge");
      afficherInfos();
      majChoix();
      toast("water.xml chargé");
    } catch (e) {
      source = null;
      infos = null;
      afficherInfos();
      majChoix();
      toast("Fichier refusé : " + e.message + ".");
    }
  }

  /* ==================== Interface : envoyer un mod au site ==================== */
  function detecterCategorie(l) {
    const t = [...l.fichiers, ...l.cibles].join(" ").toLowerCase();
    if (/water\.xml/.test(t)) return "eau";
    if (/timecycle|visualsettings/.test(t)) return "ciel";
    if (/\.ypt\b|ptfx|particle/.test(t)) return "effets";
    if (/peds\.ymt|\.ycd\b|anim|ragdoll|pedpersonality|combattasks/.test(t)) return "personnages";
    if (/\.awc\b|audio|\.rel\b/.test(t)) return "sons";
    if (/\.ytd\b/.test(t)) return "textures";
    if (/\.yft\b|\.ydr\b|\.ydd\b/.test(t)) return "modeles";
    return "autre";
  }

  /** Noms des fichiers remplacés, sans doublons, limités à 5. */
  function listeCibles(cibles) {
    const noms = [...new Set(cibles.map((c) => c.split("/").pop()))];
    return noms.slice(0, 5).join(", ") + (noms.length > 5 ? ` et ${noms.length - 5} autres` : "");
  }
  const taille = (o) => (o < 1024 * 1024 ? `${Math.max(1, Math.round(o / 1024))} Ko` : `${(o / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`);

  async function choisirFichierMod(f) {
    modEnvoi = null;
    const det = $("#modDetection");
    if (!f) return;
    $("#modFichierNom").textContent = `${f.name} · ${taille(f.size)}`;
    try {
      if (!/\.rpf$/i.test(f.name)) throw new Error("choisis un fichier .rpf");
      if (f.size > commu().TAILLE_MAX_MOD) throw new Error("ce mod dépasse 15 Mo, la limite du site");
      const lecture = await Rpf.lire(new Uint8Array(await f.arrayBuffer()));
      modEnvoi = { fichier: f, lecture };
      const cat = detecterCategorie(lecture);
      $("#modCategorie").value = cat;
      if (!$("#modNom").value) $("#modNom").value = (lecture.nomAssembly || f.name.replace(/\.rpf$/i, "")).slice(0, 60);
      det.textContent = lecture.chiffre
        ? "Mod protégé (chiffré) : son contenu ne peut pas être lu. Choisis sa catégorie toi-même."
        : `Mod lisible : ${lecture.fichiers.length} fichiers.` +
          (lecture.cibles.length ? ` Il remplace : ${listeCibles(lecture.cibles)}.` : "") +
          ` Catégorie détectée : ${nomCategorie(cat)}.`;
      $("#modDepot").classList.add("charge");
    } catch (e) {
      det.textContent = "Fichier refusé : " + e.message + ".";
      $("#modDepot").classList.remove("charge");
    }
  }

  async function envoyer(e) {
    e.preventDefault();
    if (!modEnvoi) { toast("Choisis d'abord le fichier .rpf du mod."); return; }
    const nom = $("#modNom").value.trim();
    const createur = $("#modCreateur").value.trim();
    let lien = $("#modLien").value.trim();
    if (!nom || !createur) { toast("Indique le nom du mod et son créateur."); return; }
    if (lien) {
      try { const u = new URL(lien); if (u.protocol !== "https:") throw new Error(); lien = u.href; }
      catch (err) { toast("Le lien de la page officielle doit commencer par https://"); return; }
    }
    if (!$("#modAccord").checked) { toast("Coche la case pour confirmer que tu as le droit de partager ce mod."); return; }
    const btn = $("#modEnvoyer");
    btn.disabled = true;
    btn.textContent = "Envoi en cours…";
    try {
      await commu().envoyerMod(modEnvoi.fichier, {
        nom, createur, lien, categorie: $("#modCategorie").value,
        chiffre: modEnvoi.lecture.chiffre, cibles: modEnvoi.lecture.cibles,
      });
      toast(`Mod « ${nom} » ajouté au site ✔`);
      $("#formMod").reset();
      $("#modFichierNom").textContent = "15 Mo maximum";
      $("#modDetection").textContent = "";
      $("#modDepot").classList.remove("charge");
      modEnvoi = null;
    } catch (err) {
      const code = err && err.code;
      toast("Envoi impossible : " + (code === "too_large" ? "le fichier est trop gros" : code === "quota_or_state" ? "l'espace de stockage du site est plein" : err.message || "réessaie plus tard") + ".");
    } finally {
      btn.disabled = false;
      btn.textContent = "Envoyer le mod";
    }
  }

  function majEnvoi() {
    const c = commu();
    const ok = Boolean(c && c.peutEnvoyerMod());
    $("#formMod").hidden = !ok;
    const indispo = $("#modIndispo");
    indispo.hidden = ok;
    indispo.textContent = "L'envoi de mods marche sur la version en ligne, pour les membres qui ont l'accès « Contributeur » ou plus.";
    // mes mods envoyés (ou tous, pour le propriétaire)
    const zone = $("#mesMods");
    zone.textContent = "";
    if (!c) return;
    const liste = c.modsDisponibles().filter((m) => m.source === "site" && (m.vendeurId === c.monId() || c.estProprio()));
    if (!liste.length) return;
    const titre = document.createElement("p");
    titre.className = "mes-mods__titre";
    titre.textContent = c.estProprio() ? "Mods envoyés sur le site" : "Tes mods envoyés";
    zone.appendChild(titre);
    liste.forEach((m) => {
      const ligne = document.createElement("div");
      ligne.className = "mes-mods__ligne";
      const t = document.createElement("span");
      t.textContent = `${m.nom} · ${nomCategorie(m.categorie)} · ${taille(m.taille || 0)}`;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn--petit btn--ghost";
      b.textContent = "Supprimer";
      b.addEventListener("click", async () => {
        if (!b.dataset.confirme) {
          b.dataset.confirme = "1";
          b.textContent = "Confirmer ?";
          setTimeout(() => { delete b.dataset.confirme; b.textContent = "Supprimer"; }, 3000);
          return;
        }
        b.disabled = true;
        await c.supprimerMod(m);
      });
      ligne.append(t, b);
      zone.appendChild(ligne);
    });
  }

  function init() {
    if (!$("#groupeMods")) return;
    // choix des mods
    $("#atAjouter").addEventListener("click", ajouter);
    document.addEventListener("mods-maj", remplirListe);
    // mod d'eau perso
    const depot = $("#atDepot");
    $("#atImport").addEventListener("change", (e) => { chargerWater(e.target.files[0]); e.target.value = ""; });
    ["dragenter", "dragover"].forEach((t) => depot.addEventListener(t, (e) => { e.preventDefault(); depot.classList.add("survol"); }));
    ["dragleave", "drop"].forEach((t) => depot.addEventListener(t, () => depot.classList.remove("survol")));
    depot.addEventListener("drop", (e) => { e.preventDefault(); chargerWater(e.dataTransfer.files[0]); });
    ["#atClarte", "#atVagues", "#atClarteActive", "#atVaguesActives"].forEach((s) => $(s).addEventListener("input", majChoix));
    // envoi d'un mod
    const cat = $("#modCategorie");
    CATEGORIES_MODS.forEach((c) => cat.add(new Option(c.nom, c.id)));
    $("#modFichier").addEventListener("change", (e) => { choisirFichierMod(e.target.files[0]); });
    $("#formMod").addEventListener("submit", envoyer);
    remplirListe();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { analyser, modifier, actif, construireMods };
})();
