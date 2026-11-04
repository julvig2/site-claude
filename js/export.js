/* ==========================================================================
   EXPORT DU PACK (.zip)
   Contenu généré :
     <pack>/LISEZMOI.txt
     <pack>/pack.json                    → réimportable dans le créateur
     <pack>/apercu.png
     <pack>/plugins/<pack>.ini           → preset ReShade (joueur)
     <pack>/serveur/<pack>_graphique/    → ressource FiveM (optionnelle)
   ========================================================================== */

const Exporteur = (() => {
  const f = (v) => Number(v).toFixed(6);
  const f3 = (a) => a.map(f).join(",");

  function slug(texte) {
    return (
      (texte || "mon-pack")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40) || "mon_pack"
    );
  }

  /** Preset ReShade (format ReShade 5/6). */
  function presetReShade(reglages) {
    const s = Moteur.effectif(reglages);
    const P = Moteur.parametres(s);
    const tech = [];
    const sections = [];

    if (P.Levels.BlackPoint !== 0 || P.Levels.WhitePoint !== 255) {
      tech.push("Levels@Levels.fx");
      sections.push(`[Levels.fx]\nBlackPoint=${P.Levels.BlackPoint}\nHighlightClipping=0\nWhitePoint=${P.Levels.WhitePoint}\n`);
    }

    tech.push("Tonemap@Tonemap.fx");
    sections.push(
      `[Tonemap.fx]\nBleach=${f(P.Tonemap.Bleach)}\nDefog=${f(0)}\nExposure=${f(P.Tonemap.Exposure)}\n` +
        `FogColor=${f3([0, 0, 1])}\nGamma=${f(P.Tonemap.Gamma)}\nSaturation=${f(P.Tonemap.Saturation)}\n`
    );

    const lgg = P.LiftGammaGain;
    if ([...lgg.RGB_Lift, ...lgg.RGB_Gamma, ...lgg.RGB_Gain].some((v) => Math.abs(v - 1) > 1e-6)) {
      tech.push("LiftGammaGain@LiftGammaGain.fx");
      sections.push(`[LiftGammaGain.fx]\nRGB_Gain=${f3(lgg.RGB_Gain)}\nRGB_Gamma=${f3(lgg.RGB_Gamma)}\nRGB_Lift=${f3(lgg.RGB_Lift)}\n`);
    }
    if (s.vibrance !== 0) {
      tech.push("Vibrance@Vibrance.fx");
      sections.push(`[Vibrance.fx]\nVibrance=${f(s.vibrance)}\nVibranceRGBBalance=${f3([1, 1, 1])}\n`);
    }
    if (s.contrast !== 0) {
      tech.push("Curves@Curves.fx");
      sections.push(`[Curves.fx]\nContrast=${f(s.contrast)}\nFormula=2\nMode=0\n`);
    }
    if (s.sharpen > 0) {
      tech.push("LumaSharpen@LumaSharpen.fx");
      sections.push(
        `[LumaSharpen.fx]\noffset_bias=${f(1)}\npattern=1\nsharp_clamp=${f(P.LumaSharpen.sharp_clamp)}\n` +
          `sharp_strength=${f(s.sharpen)}\nshow_sharpen=0\n`
      );
    }
    if (s.grain > 0) {
      const g = P.FilmGrain;
      tech.push("FilmGrain@FilmGrain.fx");
      sections.push(`[FilmGrain.fx]\nIntensity=${f(g.Intensity)}\nMean=${f(g.Mean)}\nSignalToNoiseRatio=${g.SignalToNoiseRatio}\nVariance=${f(g.Variance)}\n`);
    }
    if (s.vignette > 0) {
      tech.push("Vignette@Vignette.fx");
      sections.push(
        `[Vignette.fx]\nAmount=${f(P.Vignette.Amount)}\nCenter=${f(0.5)},${f(0.5)}\nRadius=${f(P.Vignette.Radius)}\n` +
          `Ratio=${f(1)}\nSlope=${P.Vignette.Slope}\nType=0\n`
      );
    }

    return (
      `PreprocessorDefinitions=\nTechniques=${tech.join(",")}\nTechniqueSorting=${tech.join(",")}\n\n` +
      sections.join("\n")
    );
  }

  /** Vrai si le pack modifie le monde (ciel, météo, nuages, lumières). */
  function mondeModifie(s) {
    const m = s.monde, n = REGLAGES_NEUTRES.monde;
    return m.heure !== n.heure || m.meteo !== n.meteo || m.nuages !== n.nuages || m.lumieres !== n.lumieres;
  }
  const avecRessource = (s) => mondeModifie(s) || s.timecycle.actif || s.optimisation === "fps";

  function fxmanifest(meta) {
    return `fx_version 'cerulean'
game 'gta5'

author '${meta.auteur.replace(/'/g, "")}'
description 'Pack graphique ${meta.nom.replace(/'/g, "")} - généré avec ${SITE.nom}'
version '1.0.0'

client_script 'client.lua'
`;
  }

  function clientLua(s) {
    const m = s.monde, tc = s.timecycle;
    const heure = HEURES.find((x) => x.id === m.heure) || HEURES[0];
    const lua = (v) => (v === null || v === undefined ? "nil" : typeof v === "string" ? `"${v}"` : String(v));
    const nuages = m.nuages === REGLAGES_NEUTRES.monde.nuages ? null : Math.round(Number(m.nuages) * 100) / 100;
    return `-- Pack graphique appliqué à tous les joueurs du serveur.
-- Commande en jeu : /pack  → active / désactive le pack pour soi.
-- Si vous utilisez un script qui synchronise la météo ou l'heure
-- (vSync, qb-weathersync…), il peut annuler ces réglages : désactivez-le
-- ou laissez "nil" pour ne pas toucher à la météo / l'heure.

local CONFIG = {
    heure = ${lua(heure.h)},            -- heure forcée (nil = ne pas changer)
    minute = ${lua(heure.m)},
    meteo = ${lua(m.meteo === "auto" ? null : m.meteo)},   -- météo forcée (nil = ne pas changer)
    nuages = ${lua(nuages)},          -- opacité des nuages, 0.0 = aucun (nil = ne pas changer)
    lumieresVille = ${m.lumieres ? "true" : "false"},   -- false = lampadaires, fenêtres et néons éteints
    filtre = ${lua(tc.actif ? tc.modifier : null)},  -- filtre timecycle (nil = aucun)
    forceFiltre = ${Number(tc.force).toFixed(2)},
    allegerOmbres = ${s.optimisation === "fps" ? "true" : "false"},   -- true = ombres et lumières lointaines allégées (gain de FPS)
}

local actif = true

-- SET_CLOUD_HAT_OPACITY (appel par hash, valable sur toutes les versions)
local function opaciteNuages(valeur)
    Citizen.InvokeNative(0xF36199225D6D8C86, valeur + 0.0)
end

local function appliquerFiltre()
    if CONFIG.filtre then
        SetTimecycleModifier(CONFIG.filtre)
        SetTimecycleModifierStrength(CONFIG.forceFiltre)
    end
end

-- Optimisation : chaque appel est protégé (pcall), une fonction absente
-- de la version du jeu est simplement ignorée.
local function alleger()
    pcall(RopeDrawShadowEnabled, false)
    pcall(CascadeShadowsClearShadowSampleType)
    pcall(CascadeShadowsSetAircraftMode, false)
    pcall(CascadeShadowsEnableEntityTracker, true)
    pcall(CascadeShadowsSetDynamicDepthMode, false)
    pcall(CascadeShadowsSetEntityTrackerScale, 0.0)
    pcall(CascadeShadowsSetDynamicDepthValue, 0.0)
    pcall(CascadeShadowsSetCascadeBoundsScale, 0.0)
    pcall(SetFlashLightFadeDistance, 10.0)
    pcall(SetLightsCutoffDistanceTweak, 10.0)
end

local function appliquerMonde()
    if CONFIG.meteo then
        SetWeatherTypePersist(CONFIG.meteo)
        SetWeatherTypeNowPersist(CONFIG.meteo)
        SetOverrideWeather(CONFIG.meteo)
    end
    if CONFIG.heure then
        NetworkOverrideClockTime(CONFIG.heure, CONFIG.minute or 0, 0)
    end
    if CONFIG.nuages then
        opaciteNuages(CONFIG.nuages)
    end
    if not CONFIG.lumieresVille then
        SetArtificialLightsState(true)
    end
    if CONFIG.allegerOmbres then
        alleger()
    end
end

local function retablir()
    if CONFIG.meteo then
        ClearOverrideWeather()
        ClearWeatherTypePersist()
    end
    if CONFIG.nuages then opaciteNuages(1.0) end
    if not CONFIG.lumieresVille then SetArtificialLightsState(false) end
    if CONFIG.filtre then ClearTimecycleModifier() end
    if CONFIG.allegerOmbres then
        pcall(RopeDrawShadowEnabled, true)
        pcall(CascadeShadowsInitSession)
    end
end

CreateThread(function()
    Wait(2000)
    appliquerFiltre()
    while true do
        if actif then appliquerMonde() end
        Wait(1000)
    end
end)

RegisterCommand("pack", function()
    actif = not actif
    if actif then
        appliquerFiltre()
        appliquerMonde()
    else
        retablir()
    end
end, false)

AddEventHandler("onResourceStop", function(ressource)
    if ressource == GetCurrentResourceName() then
        retablir()
    end
end)
`;
  }

  function lisezmoi(meta, s, nomFichier) {
    const m = s.monde;
    const details = [];
    if (m.heure !== "auto") details.push(`Heure : ${(HEURES.find((x) => x.id === m.heure) || {}).nom}`);
    if (m.meteo !== "auto") details.push(`Météo : ${(METEOS.find((x) => x.id === m.meteo) || {}).nom}`);
    if (m.nuages !== REGLAGES_NEUTRES.monde.nuages) details.push(`Nuages : ${Math.round(m.nuages * 100)} %`);
    if (!m.lumieres) details.push("Lumières de la ville : éteintes");
    if (s.optimisation === "fps") details.push("Optimisation : ombres et lumières lointaines allégées");
    if (s.timecycle.actif) details.push(`Filtre : ${s.timecycle.modifier} (force ${Number(s.timecycle.force).toFixed(2)})`);
    const serveur = avecRessource(s)
      ? `
--------------------------------------------------------------
 2. RESSOURCE SERVEUR : ciel, météo, nuages, lumières
--------------------------------------------------------------
 Ces réglages ne passent pas par ReShade : ils sont appliqués par
 le jeu grâce à une ressource FiveM, à installer sur un serveur.
 1) Copiez le dossier "serveur/${nomFichier}_graphique" dans le dossier
    "resources" de votre serveur FiveM.
 2) Ajoutez dans server.cfg :  ensure ${nomFichier}_graphique
 3) Redémarrez le serveur. Les joueurs peuvent taper /pack pour
    activer / désactiver le pack.
 Si un script synchronise déjà la météo ou l'heure (vSync…),
 désactivez-le, sinon il annulera ces réglages.

 ${details.join("\n ")}
`
      : "";
    return `==============================================================
 ${meta.nom.toUpperCase()}
 Pack graphique FiveM — par ${meta.auteur}
 Généré avec ${SITE.nom}
==============================================================

--------------------------------------------------------------
 1. PRESET RESHADE : couleurs, lumière, netteté (joueur)
--------------------------------------------------------------
 1) Installez ReShade (https://reshade.me) :
    - Lancez l'installateur et sélectionnez le fichier
      "FiveM_GTAProcess.exe" (ou "FiveM.exe") dans votre dossier FiveM.
    - API de rendu : DirectX 10/11/12.
    - Cochez le pack d'effets "Standard effects".
    - Si ReShade a été installé à côté de l'exécutable, déplacez
      dxgi.dll, ReShade.ini et le dossier reshade-shaders dans
      "FiveM.app/plugins".
 2) Copiez "plugins/${nomFichier}.ini" dans "FiveM.app/plugins".
 3) En jeu, appuyez sur la touche Début (Home) pour ouvrir ReShade,
    puis choisissez le preset "${nomFichier}" en haut du menu.

 Effets utilisés (tous dans "Standard effects") : Levels, Tonemap,
 LiftGammaGain, Vibrance, Curves, LumaSharpen, FilmGrain, Vignette.
 Seuls les effets réglés sont activés dans le preset.
${serveur}
--------------------------------------------------------------
 MODIFIER LE PACK
--------------------------------------------------------------
 Importez "pack.json" dans le créateur ${SITE.nom} pour retrouver
 tous vos réglages et les ajuster.
`;
  }

  function canvasVersBlob(canvas) {
    return new Promise((ok) => canvas.toBlob(ok, "image/png"));
  }

  /** Génère et télécharge le pack. */
  async function telecharger(reglages, meta) {
    if (typeof JSZip === "undefined") throw new Error("JSZip n'a pas pu être chargé (connexion internet ?)");
    const s = Moteur.effectif(reglages);
    const nom = meta.nom || "Mon pack";
    const auteur = meta.auteur || "Anonyme";
    const id = slug(nom);
    const zip = new JSZip();
    const racine = zip.folder(id);

    let texte = lisezmoi({ nom, auteur }, s, id);
    // Mods du jeu (.rpf pour le dossier mods de FiveM)
    const mods = meta.mods || (meta.mod ? [{ fichier: `${id}.rpf`, rpf: meta.mod.rpf, resume: meta.mod.resume }] : []);
    if (mods.length) {
      const dossier = racine.folder("mods");
      mods.forEach((m) => dossier.file(m.fichier, m.rpf));
      texte += `
--------------------------------------------------------------
 MODS DU JEU : dossier mods (${mods.length})
--------------------------------------------------------------
${mods.map((m) => ` - mods/${m.fichier}\n   ${m.resume.join("\n   ")}`).join("\n")}

 1) Copiez les fichiers .rpf du dossier "mods" dans "FiveM.app/mods"
    (créez le dossier "mods" s'il n'existe pas).
 2) Relancez FiveM.
 Pour retirer un mod : supprimez son .rpf du dossier mods.

 Les serveurs en « pure mode » refusent les mods du dossier mods,
 et certains règlements les interdisent : vérifiez avant de jouer.
 Les mods restent la propriété de leurs créateurs.
`;
    }
    racine.file("LISEZMOI.txt", texte);
    racine.file("pack.json", JSON.stringify({ format: "forgepack", version: 2, mode: meta.mode || "realiste", nom, auteur, reglages: s }, null, 2));
    racine.folder("plugins").file(`${id}.ini`, presetReShade(s));

    if (avecRessource(s)) {
      const res = racine.folder("serveur").folder(`${id}_graphique`);
      res.file("fxmanifest.lua", fxmanifest({ nom, auteur }));
      res.file("client.lua", clientLua(s));
    }

    // Aperçu PNG : le jeu d'origine à gauche, le pack (monde + couleurs) à droite
    const W = 960, H = 540;
    const sceneChoisie = meta.scene || "coucher";
    const avant = Scene.image(sceneChoisie, W, H);
    const apres = Moteur.traiter(Scene.image(Scene.ambiance(s.monde, sceneChoisie), W, H, s.monde), s);
    const c = document.createElement("canvas");
    c.width = W * 2;
    c.height = H;
    const ctx = c.getContext("2d");
    ctx.putImageData(avant, 0, 0);
    ctx.putImageData(apres, W, 0);
    ctx.font = "bold 22px sans-serif";
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(16, 16, 96, 36);
    ctx.fillRect(W + 16, 16, 96, 36);
    ctx.fillStyle = "#fff";
    ctx.fillText("AVANT", 28, 42);
    ctx.fillText("APRÈS", W + 28, 42);
    racine.file("apercu.png", await canvasVersBlob(c));

    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    await sauvegarder(blob, `${id}.zip`);
    return `${id}.zip`;
  }

  /** Lance le téléchargement (fenêtre de confirmation si le site est ouvert dans Claude). */
  async function sauvegarder(blob, nomFichier) {
    const claude = window.claude;
    if (claude && typeof claude.use === "function") {
      const downloads = await claude.use("downloads");
      if (downloads) {
        try {
          await downloads.save({ filename: nomFichier, data: blob });
          return;
        } catch (err) {
          if (err && err.code === "declined") throw new Error("téléchargement annulé");
          if (err && err.code === "rate_limited") throw new Error("une fenêtre de téléchargement est déjà ouverte, réessaie dans un instant");
          throw new Error("le téléchargement n'est pas disponible ici");
        }
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nomFichier;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  return { telecharger, sauvegarder, presetReShade, clientLua, avecRessource, slug };
})();
