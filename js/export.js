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
    const s = Moteur.complet(reglages);
    const P = Moteur.parametres(s);
    const tech = [];
    const sections = [];

    tech.push("Tonemap@Tonemap.fx");
    sections.push(
      `[Tonemap.fx]\nBleach=${f(P.Tonemap.Bleach)}\nDefog=${f(0)}\nExposure=${f(P.Tonemap.Exposure)}\n` +
        `FogColor=${f3([0, 0, 1])}\nGamma=${f(P.Tonemap.Gamma)}\nSaturation=${f(P.Tonemap.Saturation)}\n`
    );

    const lgg = P.LiftGammaGain;
    if ([...lgg.RGB_Lift, ...lgg.RGB_Gain].some((v) => Math.abs(v - 1) > 1e-6)) {
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

  function fxmanifest(meta) {
    return `fx_version 'cerulean'
game 'gta5'

author '${meta.auteur.replace(/'/g, "")}'
description 'Pack graphique ${meta.nom.replace(/'/g, "")} - généré avec ${SITE.nom}'
version '1.0.0'

client_script 'client.lua'
`;
  }

  function clientLua(tc) {
    return `-- Filtre graphique appliqué à tous les joueurs du serveur.
-- Commande en jeu : /pack  → active / désactive le filtre pour soi.

local MODIFICATEUR = "${tc.modifier}"
local FORCE = ${Number(tc.force).toFixed(2)}
local actif = true

local function appliquer()
    if actif then
        SetTimecycleModifier(MODIFICATEUR)
        SetTimecycleModifierStrength(FORCE)
    else
        ClearTimecycleModifier()
    end
end

CreateThread(function()
    Wait(2000)
    appliquer()
end)

RegisterCommand("pack", function()
    actif = not actif
    appliquer()
end, false)

AddEventHandler("onResourceStop", function(ressource)
    if ressource == GetCurrentResourceName() then
        ClearTimecycleModifier()
    end
end)
`;
  }

  function lisezmoi(meta, s, nomFichier) {
    const serveur = s.timecycle.actif
      ? `
--------------------------------------------------------------
 2. RESSOURCE SERVEUR (propriétaires de serveur, optionnel)
--------------------------------------------------------------
 1) Copiez le dossier "serveur/${nomFichier}_graphique" dans le dossier
    "resources" de votre serveur FiveM.
 2) Ajoutez dans server.cfg :  ensure ${nomFichier}_graphique
 3) Redémarrez le serveur. Les joueurs peuvent taper /pack pour
    activer / désactiver le filtre.
 Filtre : ${s.timecycle.modifier} (force ${Number(s.timecycle.force).toFixed(2)})
`
      : "";
    return `==============================================================
 ${meta.nom.toUpperCase()}
 Pack graphique FiveM — par ${meta.auteur}
 Généré avec ${SITE.nom}
==============================================================

--------------------------------------------------------------
 1. PRESET RESHADE (joueur)
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

 Effets utilisés : Tonemap, LiftGammaGain, Vibrance, Curves,
 LumaSharpen, Vignette (tous inclus dans "Standard effects").
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
    const s = Moteur.complet(reglages);
    const nom = meta.nom || "Mon pack";
    const auteur = meta.auteur || "Anonyme";
    const id = slug(nom);
    const zip = new JSZip();
    const racine = zip.folder(id);

    racine.file("LISEZMOI.txt", lisezmoi({ nom, auteur }, s, id));
    racine.file("pack.json", JSON.stringify({ format: "forgepack", version: 1, nom, auteur, reglages: s }, null, 2));
    racine.folder("plugins").file(`${id}.ini`, presetReShade(s));

    if (s.timecycle.actif) {
      const res = racine.folder("serveur").folder(`${id}_graphique`);
      res.file("fxmanifest.lua", fxmanifest({ nom, auteur }));
      res.file("client.lua", clientLua(s.timecycle));
    }

    // Aperçu PNG (avant / après côte à côte)
    const W = 960, H = 540;
    const base = Scene.image(meta.scene || "coucher", W, H);
    const c = document.createElement("canvas");
    c.width = W * 2;
    c.height = H;
    const ctx = c.getContext("2d");
    ctx.putImageData(base, 0, 0);
    ctx.putImageData(Moteur.traiter(base, s), W, 0);
    ctx.font = "bold 22px sans-serif";
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(16, 16, 96, 36);
    ctx.fillRect(W + 16, 16, 96, 36);
    ctx.fillStyle = "#fff";
    ctx.fillText("AVANT", 28, 42);
    ctx.fillText("APRÈS", W + 28, 42);
    racine.file("apercu.png", await canvasVersBlob(c));

    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${id}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return `${id}.zip`;
  }

  return { telecharger, presetReShade, slug };
})();
