/*
 * ==========================================================
 *  CONTENU DU SITE — c'est le SEUL fichier à modifier
 * ==========================================================
 *
 *  Les rediffs se publient depuis l'espace admin (admin.html).
 *  Tu peux aussi en ajouter à la main dans la liste "redifs" ci-dessous.
 *
 *  source :
 *    - "youtube" -> id = la partie après "v=" dans l'URL
 *                   (https://www.youtube.com/watch?v=dQw4w9WgXcQ -> "dQw4w9WgXcQ")
 *    - "twitch"  -> id = le numéro dans l'URL
 *                   (https://www.twitch.tv/videos/1234567890 -> "1234567890")
 *    - "fichier" -> id = chemin vers un .mp4 (ex: "videos/stream1.mp4")
 *
 *  miniature : facultatif. Pour YouTube elle est trouvée toute seule.
 *              Sinon mets le chemin d'une image (ex: "assets/img/stream1.jpg").
 */

const SITE = {
  nom: "Julvig",
  slogan: "Toutes mes rediffs de stream, mes clips et le reste.",
  // Chaîne Twitch pour le bouton "En direct" (laisse vide "" pour le cacher)
  chaineTwitch: "julvig2",
  // Lien pour les dons (bouton "Soutenir"). Laisse vide "" pour le cacher.
  don: "https://ko-fi.com/julvig",
  // Invitation au Discord de la commu (grand bloc sur l'accueil). Laisse vide "" pour le cacher.
  discord: "https://discord.com/invite/kV82XWFFbA",

  // Espace admin (voir worker/INSTALLATION.md) :
  // adresse du serveur Cloudflare Worker et identifiant de l'application Twitch.
  api: "",
  twitchClientId: "nz4etpbdaepomsi7hhcqxfv6ky41ha",

  reseaux: [
    { nom: "Twitch", url: "https://www.twitch.tv/julvig2" },
    { nom: "YouTube", url: "https://www.youtube.com/@julvig3" },
    { nom: "Kick", url: "https://kick.com/julvig" },
    { nom: "Discord", url: "https://discord.com/invite/kV82XWFFbA" },
    { nom: "Ko-fi", url: "https://ko-fi.com/julvig" },
  ],

  // Les rediffs se publient depuis l'espace admin du site (admin.html),
  // en se connectant avec Twitch. Tu peux aussi en ajouter ici à la main :
  // { id: "mon-stream", titre: "...", date: "2026-09-30", duree: "3h20",
  //   categorie: "Just Chatting", source: "youtube", video: "ID_YOUTUBE", description: "..." },
  redifs: [],

  // Section "Le reste" : clips, projets, montages, setup... tout ce que tu veux.
  autres: [
    {
      titre: "Meilleurs moments de septembre",
      type: "Clip",
      description: "Le best-of du mois.",
      lien: "https://www.youtube.com/@julvig3",
    },
    {
      titre: "Mon setup",
      type: "Page",
      description: "Le matos que j'utilise pour streamer.",
      lien: "#setup",
    },
    {
      titre: "Planning des streams",
      type: "Info",
      description: "Lundi, mercredi et vendredi à partir de 20h.",
      lien: "",
    },
  ],

  // Texte de la page "À propos"
  aPropos:
    "Salut ! Ici tu retrouves toutes les rediffusions de mes streams, triées et " +
    "consultables quand tu veux, plus quelques autres projets. Bon visionnage !",
};
