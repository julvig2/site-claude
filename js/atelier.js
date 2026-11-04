/* ==========================================================================
   ATELIER MODS : modifie un fichier du jeu fourni par le joueur et le range
   dans un .rpf au format FiveM (dossier FiveM.app/mods).
   Première brique : l'eau (data/levels/gta5/water.xml, dans common.rpf)
     - clarté : valeurs a1 … a4 de chaque zone d'eau (plus bas = plus clair)
     - vagues : valeur Amplitude de chaque zone de vagues
   Le fichier d'origine vient du jeu du joueur : le site ne fournit aucun
   fichier de Rockstar, il ne fait que changer des nombres.
   ========================================================================== */

const Atelier = (() => {
  const $ = (s) => document.querySelector(s);
  const toast = (m) => window.ForgeUI && window.ForgeUI.toast(m);
  const echapper = (t) => String(t).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));

  let source = null;   // texte du water.xml d'origine
  let infos = null;    // statistiques lues dans le fichier

  /* ---------- Lecture du water.xml ---------- */
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
    return {
      zonesEau: (zoneEau.match(/<Item>/g) || []).length,
      zonesVagues: amplitudes.length,
      clarte: stats(clarte),
      vagues: stats(amplitudes),
    };
  }

  /* ---------- Modification (texte conservé à l'identique hors des nombres changés) ---------- */
  const formater = (v) => {
    const r = Math.round(v * 100) / 100;
    return Number.isInteger(r) ? r.toFixed(1) : String(r);
  };

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

  /* ---------- Fiche assembly.xml (lue par FiveM dans le dossier mods) ---------- */
  function guid() {
    const h = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `{${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}}`;
  }

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

  /** Lignes décrivant les réglages du mod (pour le LISEZMOI du pack). */
  function resume(r) {
    const lignes = [];
    if (r.clarteActive) lignes.push(`Clarté de l'eau : ${Math.round(r.clarte)} (plus c'est bas, plus l'eau est claire)`);
    if (r.vaguesActives) lignes.push(`Vagues : ${Math.round(r.vagues * 100)} % de la hauteur d'origine`);
    return lignes;
  }

  /** Vrai si un water.xml est chargé et qu'au moins un réglage est actif. */
  function actif() {
    const r = lireReglages();
    return Boolean(source) && (r.clarteActive || r.vaguesActives);
  }

  /**
   * Construit le mod .rpf à joindre au pack réaliste.
   * @returns {Promise<{ rpf: Uint8Array, resume: string[] } | null>}
   */
  async function construireMod(nom, auteur) {
    if (!actif()) return null;
    const r = lireReglages();
    const rpf = await Rpf.creer({
      "assembly.xml": assembly({ nom, auteur, description: `Généré avec ${SITE.nom}` }),
      content: { levels: { "water.xml": modifier(source, r) } },
    });
    return { rpf, resume: resume(r) };
  }

  /* ---------- Interface ---------- */
  function lireReglages() {
    return {
      clarteActive: $("#atClarteActive").checked,
      clarte: parseFloat($("#atClarte").value),
      vaguesActives: $("#atVaguesActives").checked,
      vagues: parseFloat($("#atVagues").value),
    };
  }

  function majSorties() {
    const r = lireReglages();
    $("#atClarteOut").textContent = String(Math.round(r.clarte));
    $("#atVaguesOut").textContent = Math.round(r.vagues * 100) + " %";
    [["#atClarte", r.clarteActive], ["#atVagues", r.vaguesActives]].forEach(([s, actif]) => {
      const i = $(s);
      i.disabled = !actif || !source;
      i.closest(".reglage").classList.toggle("desactive", !actif || !source);
      i.style.setProperty("--p", ((i.value - i.min) / (i.max - i.min)) * 100 + "%");
    });
    const etat = $("#atEtat");
    if (etat) {
      etat.textContent = !source
        ? "Aucun fichier : le pack sera créé sans mod."
        : actif()
          ? "Le mod .rpf sera ajouté au pack (dossier mods)."
          : "Active au moins un réglage pour ajouter le mod au pack.";
      etat.classList.toggle("mods__etat--actif", actif());
    }
    // illustration : plus la valeur est basse, plus on voit le fond
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

  async function chargerFichier(f) {
    if (!f) return;
    try {
      const texte = await f.text();
      infos = analyser(texte);
      source = texte;
      if (infos.clarte) $("#atClarte").value = Math.round(infos.clarte.moy);
      $("#atFichier").textContent = `${f.name} · ${(f.size / 1024).toFixed(0)} Ko`;
      $("#atDepot").classList.add("charge");
      afficherInfos();
      majSorties();
      toast("water.xml chargé");
    } catch (e) {
      source = null;
      infos = null;
      afficherInfos();
      majSorties();
      toast("Fichier refusé : " + e.message + ".");
    }
  }

  function init() {
    if (!$("#groupeMods")) return;
    const depot = $("#atDepot");
    $("#atImport").addEventListener("change", (e) => { chargerFichier(e.target.files[0]); e.target.value = ""; });
    ["dragenter", "dragover"].forEach((t) => depot.addEventListener(t, (e) => { e.preventDefault(); depot.classList.add("survol"); }));
    ["dragleave", "drop"].forEach((t) => depot.addEventListener(t, () => depot.classList.remove("survol")));
    depot.addEventListener("drop", (e) => { e.preventDefault(); chargerFichier(e.dataTransfer.files[0]); });
    ["#atClarte", "#atVagues", "#atClarteActive", "#atVaguesActives"].forEach((s) => $(s).addEventListener("input", majSorties));
    majSorties();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { analyser, modifier, actif, construireMod };
})();
