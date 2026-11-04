/* ==========================================================================
   CONFIGURATION DU SITE ET CATALOGUE DES PACKS
   Modifiez ce fichier pour changer le nom du site, les liens et les packs.
   ========================================================================== */

const SITE = {
  nom: "Forge Pack",
  slogan: "Packs graphiques FiveM",
  discord: "https://discord.gg/votre-serveur", // ← votre lien Discord
  devise: "€",
};

/*
  Captures d'écran GTA utilisées pour les aperçus (avant / après).
  Prenez 3 captures en jeu (touche Impr. écran ou F12 sur Steam), en 16:9,
  SANS pack graphique, et placez-les dans le dossier "images" avec ces noms.
  Tant qu'une image manque, le site affiche un décor dessiné à la place.
*/
const CAPTURES = {
  jour: "images/jour.jpg",
  coucher: "images/coucher.jpg",
  nuit: "images/nuit.jpg",
};

/* Réglages neutres : le jeu sans modification. */
const REGLAGES_NEUTRES = {
  exposure: 0,            // Tonemap.fx  → Exposure   (-1 … 1)
  gamma: 1,               // Tonemap.fx  → Gamma      (0.6 … 1.6)
  saturation: 0,          // Tonemap.fx  → Saturation (-1 … 1)
  bleach: 0,              // Tonemap.fx  → Bleach     (0 … 1)
  contrast: 0,            // Curves.fx   → Contrast   (-1 … 1)
  vibrance: 0,            // Vibrance.fx → Vibrance   (-1 … 1)
  temperature: 0,         // LiftGammaGain.fx → RGB_Gain (-1 … 1)
  shadowColor: "#808080", // LiftGammaGain.fx → RGB_Lift
  shadowStrength: 0,
  highlightColor: "#808080", // LiftGammaGain.fx → RGB_Gain
  highlightStrength: 0,
  midColor: "#808080",    // LiftGammaGain.fx → RGB_Gamma (tons moyens)
  midStrength: 0,
  blackPoint: 0,          // Levels.fx → BlackPoint (0 … 64)
  whitePoint: 255,        // Levels.fx → WhitePoint (191 … 255)
  sharpen: 0,             // LumaSharpen.fx → sharp_strength (0 … 2)
  sharpenClamp: 0.035,    // LumaSharpen.fx → sharp_clamp
  grain: 0,               // FilmGrain.fx → Intensity (0 … 1)
  vignette: 0,            // Vignette.fx → Amount (0 … 1)
  vignetteRadius: 1.6,    // Vignette.fx → Radius
  optimisation: "qualite", // "qualite" | "equilibre" | "fps" (effets retirés + ombres allégées)
  ambiance: "naturelle",  // ambiance CVC choisie ("perso" = couleurs choisies à la main)
  // Monde : appliqué en jeu par la ressource serveur (pas par ReShade)
  monde: {
    heure: "auto",        // "auto" = ne pas changer | "midi" | "coucher" | "nuit"
    meteo: "auto",        // "auto" = ne pas changer | type de météo GTA
    nuages: 1,            // opacité des nuages (0 = aucun nuage)
    lumieres: true,       // lumières de la ville (lampadaires, fenêtres, néons)
  },
  timecycle: { actif: false, modifier: "rply_saturation", force: 0.5 },
};

/* Choix proposés pour le monde. */
const HEURES = [
  { id: "auto", nom: "Ne pas changer", h: null, m: null },
  { id: "midi", nom: "Midi (toujours jour)", h: 12, m: 0 },
  { id: "coucher", nom: "Coucher de soleil", h: 19, m: 30 },
  { id: "nuit", nom: "Nuit", h: 23, m: 0 },
];
const METEOS = [
  { id: "auto", nom: "Ne pas changer" },
  { id: "EXTRASUNNY", nom: "Grand soleil" },
  { id: "CLEAR", nom: "Ciel clair" },
  { id: "CLOUDS", nom: "Nuageux" },
  { id: "OVERCAST", nom: "Couvert" },
  { id: "SMOG", nom: "Brume légère" },
  { id: "FOGGY", nom: "Brouillard" },
];

/* Pack CVC : choix du temps (All time = le jeu garde son cycle jour / nuit). */
const TEMPS_CVC = [
  { id: "auto", nom: "All time", detail: "jour / nuit" },
  { id: "midi", nom: "One time", detail: "jour" },
  { id: "nuit", nom: "One time", detail: "nuit" },
];

/* Pack CVC : brouillard → météo forcée par la ressource serveur. */
const BROUILLARDS = [
  { id: "EXTRASUNNY", nom: "Aucun" },
  { id: "SMOG", nom: "Léger" },
  { id: "FOGGY", nom: "Épais" },
  { id: "auto", nom: "Ne pas changer" },
];

/* Pack CVC : optimisation. */
const OPTIMISATIONS = [
  { id: "qualite", nom: "Qualité", detail: "tous les effets" },
  { id: "equilibre", nom: "Équilibrée", detail: "sans grain ni vignette" },
  { id: "fps", nom: "Max FPS", detail: "effets légers + ombres allégées" },
];

/* Pack CVC : ambiances toutes prêtes (couleur du ciel = tons clairs, lumière = tons moyens). */
const AMBIANCES_CVC = [
  { id: "naturelle", nom: "Naturelle", apercu: ["#8cc4ee", "#f4e7c3"], reglages: { highlightColor: "#808080", highlightStrength: 0, midColor: "#808080", midStrength: 0, shadowColor: "#808080", shadowStrength: 0, temperature: 0 } },
  { id: "glace", nom: "Bleu glacé", apercu: ["#9fd6ff", "#1f4d8a"], reglages: { highlightColor: "#9fd6ff", highlightStrength: 0.5, midColor: "#bfe3ff", midStrength: 0.25, shadowColor: "#1f4d8a", shadowStrength: 0.35, temperature: -0.3 } },
  { id: "rose", nom: "Rose", apercu: ["#ff9fd0", "#5a2d7a"], reglages: { highlightColor: "#ff9fd0", highlightStrength: 0.5, midColor: "#ffc2e0", midStrength: 0.2, shadowColor: "#5a2d7a", shadowStrength: 0.3, temperature: 0.05 } },
  { id: "violet", nom: "Violet", apercu: ["#b99cff", "#2a1f6b"], reglages: { highlightColor: "#b99cff", highlightStrength: 0.45, midColor: "#9c8cff", midStrength: 0.2, shadowColor: "#2a1f6b", shadowStrength: 0.5, temperature: -0.1 } },
  { id: "dore", nom: "Doré", apercu: ["#ffcf7a", "#5a3a2a"], reglages: { highlightColor: "#ffcf7a", highlightStrength: 0.5, midColor: "#ffe2a8", midStrength: 0.15, shadowColor: "#5a3a2a", shadowStrength: 0.25, temperature: 0.35 } },
  { id: "menthe", nom: "Menthe", apercu: ["#a8ffd8", "#0d4d4d"], reglages: { highlightColor: "#a8ffd8", highlightStrength: 0.4, midColor: "#c8ffe8", midStrength: 0.15, shadowColor: "#0d4d4d", shadowStrength: 0.35, temperature: -0.1 } },
  { id: "rouge", nom: "Rouge", apercu: ["#ff8a7a", "#4a0d14"], reglages: { highlightColor: "#ff8a7a", highlightStrength: 0.45, midColor: "#ffb3a8", midStrength: 0.15, shadowColor: "#4a0d14", shadowStrength: 0.4, temperature: 0.15 } },
];

/* Catégories des mods du jeu (dossier mods de FiveM). */
const CATEGORIES_MODS = [
  { id: "eau", nom: "Eau" },
  { id: "ciel", nom: "Ciel et lumière" },
  { id: "effets", nom: "Effets (fumée, particules)" },
  { id: "personnages", nom: "Personnages et animations" },
  { id: "sons", nom: "Sons" },
  { id: "textures", nom: "Textures" },
  { id: "modeles", nom: "Modèles 3D" },
  { id: "autre", nom: "Autre" },
];

/* Pack son : armes GTA courantes (ou le nom d'une arme ajoutée par le serveur). */
const ARMES = [
  { id: "WEAPON_PISTOL", nom: "Pistolet" },
  { id: "WEAPON_COMBATPISTOL", nom: "Pistolet de combat" },
  { id: "WEAPON_APPISTOL", nom: "Pistolet automatique" },
  { id: "WEAPON_PISTOL_MK2", nom: "Pistolet Mk II" },
  { id: "WEAPON_SNSPISTOL", nom: "Pistolet SNS" },
  { id: "WEAPON_HEAVYPISTOL", nom: "Pistolet lourd" },
  { id: "WEAPON_PISTOL50", nom: "Pistolet .50" },
  { id: "autre", nom: "Autre arme (nom à saisir)" },
];

/* Point de départ du mode CVC : toujours jour, sans nuages, image claire et nette. */
const CVC_DEFAUT = {
  exposure: 0.15,
  contrast: 0.15,
  vibrance: 0.35,
  sharpen: 0.6,
  optimisation: "equilibre",
  ambiance: "naturelle",
  monde: { heure: "midi", meteo: "EXTRASUNNY", nuages: 0, lumieres: true },
};

/* Filtres "timecycle" natifs de GTA V utilisables dans la ressource serveur. */
const TIMECYCLES = [
  { id: "rply_saturation", nom: "Saturation (Rockstar Editor)" },
  { id: "rply_contrast", nom: "Contraste (Rockstar Editor)" },
  { id: "rply_vignette", nom: "Vignette (Rockstar Editor)" },
  { id: "rply_brightness", nom: "Luminosité (Rockstar Editor)" },
  { id: "NG_filmic01", nom: "Filmic 01" },
  { id: "NG_filmic02", nom: "Filmic 02" },
  { id: "cinema", nom: "Cinéma" },
];

/*
  Catalogue. Pour chaque pack :
   - prix : 0 = téléchargement gratuit direct
   - lienAchat : lien de paiement (Tebex, Stripe Payment Link, PayPal…).
                 Laissez vide tant que le paiement n'est pas configuré.
   - scene : "jour" | "coucher" | "nuit" (aperçu par défaut)
*/
const PACKS = [
  {
    id: "los-santos-reel",
    nom: "Los Santos Réel",
    accroche: "Le rendu naturel, en plus net.",
    description: "Couleurs fidèles, contraste propre et netteté renforcée. Idéal pour le RP sérieux sans dénaturer le jeu.",
    categorie: "Réaliste",
    prix: 0,
    badge: "Gratuit",
    scene: "jour",
    reglages: { exposure: 0.05, gamma: 1.05, saturation: 0.08, vibrance: 0.2, contrast: 0.25, sharpen: 0.7, vignette: 0.2 },
  },
  {
    id: "golden-hour",
    nom: "Golden Hour",
    accroche: "Le soleil couchant, toute la journée.",
    description: "Hautes lumières dorées, ombres prune et vignette douce. Parfait pour les clips et les screenshots.",
    categorie: "Cinématique",
    prix: 2.99,
    badge: "Populaire",
    scene: "coucher",
    reglages: { temperature: 0.45, highlightColor: "#ffb347", highlightStrength: 0.5, shadowColor: "#4b2a6a", shadowStrength: 0.35, saturation: 0.12, contrast: 0.3, vignette: 0.4 },
  },
  {
    id: "neon-district",
    nom: "Néon District",
    accroche: "Nuits cyan et magenta.",
    description: "Ombres bleu glacier, lumières roses, couleurs poussées. Fait briller chaque enseigne de la ville.",
    categorie: "Néon",
    prix: 3.99,
    badge: "Nouveau",
    scene: "nuit",
    reglages: { exposure: 0.1, shadowColor: "#00d5ff", shadowStrength: 0.6, highlightColor: "#ff2bd6", highlightStrength: 0.45, vibrance: 0.55, contrast: 0.35, vignette: 0.35 },
  },
  {
    id: "noir-total",
    nom: "Noir Total",
    accroche: "Noir et blanc, grain dur.",
    description: "Monochrome contrasté façon film noir. Pour les scènes d'enquête et les ambiances lourdes.",
    categorie: "Sombre",
    prix: 0,
    badge: "Gratuit",
    scene: "nuit",
    reglages: { saturation: -1, contrast: 0.6, gamma: 1.15, exposure: 0.15, vignette: 0.7, sharpen: 0.9, bleach: 0.25 },
  },
  {
    id: "vice-pastel",
    nom: "Vice Pastel",
    accroche: "Années 80, côte ensoleillée.",
    description: "Teintes rose et turquoise, noirs relevés et contraste adouci pour un look rétro lumineux.",
    categorie: "Rétro",
    prix: 2.49,
    badge: "",
    scene: "coucher",
    reglages: { exposure: 0.15, gamma: 0.88, saturation: -0.1, vibrance: 0.3, highlightColor: "#ff9ecf", highlightStrength: 0.45, shadowColor: "#5fd3ff", shadowStrength: 0.45, contrast: -0.2 },
  },
  {
    id: "blockbuster",
    nom: "Blockbuster",
    accroche: "Le teal & orange des films d'action.",
    description: "Peaux chaudes, ombres sarcelle, contraste appuyé et netteté cinéma. Le look des grosses productions.",
    categorie: "Cinématique",
    prix: 4.99,
    badge: "Premium",
    scene: "coucher",
    reglages: { shadowColor: "#1aa6bd", shadowStrength: 0.7, highlightColor: "#ff8a3d", highlightStrength: 0.55, contrast: 0.45, saturation: 0.05, vignette: 0.45, sharpen: 0.5 },
  },
  {
    id: "quartier-delave",
    nom: "Quartier Délavé",
    accroche: "Couleurs lessivées, ambiance rue.",
    description: "Bleach bypass, saturation retenue et vignette marquée. Rendu brut pour les serveurs gangs et street.",
    categorie: "Sombre",
    prix: 1.99,
    badge: "",
    scene: "jour",
    reglages: { bleach: 0.5, saturation: -0.35, temperature: 0.2, contrast: 0.3, gamma: 1.1, vignette: 0.5, sharpen: 0.4 },
  },
  {
    id: "ultra-vivid",
    nom: "Ultra Vivid",
    accroche: "Tout plus fort.",
    description: "Couleurs éclatantes, netteté maximale et contraste punchy. Pour ceux qui veulent que ça claque.",
    categorie: "Vivid",
    prix: 0,
    badge: "Gratuit",
    scene: "jour",
    reglages: { vibrance: 0.8, saturation: 0.3, contrast: 0.3, sharpen: 1.1, exposure: 0.05 },
  },
];
