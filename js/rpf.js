/* ==========================================================================
   GÉNÉRATEUR D'ARCHIVES RPF7 (GTA V / FiveM), format « OPEN » non chiffré
   Structure :
     en-tête 16 o : magie "RPF7", nb d'entrées, taille des noms, chiffrement "OPEN"
     entrées 16 o chacune (dossiers et fichiers), puis table des noms (multiple de 16)
     données des fichiers, chacune alignée sur un bloc de 512 o, compressées en deflate brut
   Les enfants d'un dossier sont contigus et triés par nom.
   ========================================================================== */

const Rpf = (() => {
  const BLOC = 512;
  const MAGIE = 0x52504637;      // "RPF7"
  const OPEN = 0x4e45504f;       // "OPEN" : table non chiffrée
  const DOSSIER = 0x7fffff00;

  async function deflateBrut(octets) {
    if (typeof CompressionStream === "undefined") return null;
    try {
      const flux = new Blob([octets]).stream().pipeThrough(new CompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(flux).arrayBuffer());
    } catch (e) {
      return null;
    }
  }

  /**
   * Crée une archive RPF7.
   * @param {object} arbre  { "nom.ext": Uint8Array | string, "dossier": { ... } }
   * @returns {Promise<Uint8Array>}
   */
  async function creer(arbre) {
    const enc = new TextEncoder();
    // 1. Aplatir l'arbre en largeur d'abord : les enfants de chaque dossier sont contigus.
    const entrees = [{ nom: "", dossier: true, contenu: arbre }];
    for (let i = 0; i < entrees.length; i++) {
      const e = entrees[i];
      if (!e.dossier) continue;
      const noms = Object.keys(e.contenu).sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0));
      e.debut = entrees.length;
      e.compte = noms.length;
      noms.forEach((n) => {
        const v = e.contenu[n];
        const estDossier = !(v instanceof Uint8Array) && typeof v !== "string";
        entrees.push({ nom: n, dossier: estDossier, contenu: estDossier ? v : typeof v === "string" ? enc.encode(v) : v });
      });
    }

    // 2. Table des noms (la racine a le nom vide, à l'offset 0).
    const morceaux = [];
    let tailleNoms = 0;
    const offsetNom = new Map();
    for (const e of entrees) {
      if (offsetNom.has(e.nom)) continue;
      offsetNom.set(e.nom, tailleNoms);
      const o = enc.encode(e.nom + "\0");
      morceaux.push(o);
      tailleNoms += o.length;
    }
    const tailleNomsAlignee = Math.ceil(tailleNoms / 16) * 16;
    if (tailleNomsAlignee > 0xffff) throw new Error("trop de noms de fichiers");

    // 3. Données des fichiers (compressées si possible), placées après l'en-tête.
    const tailleEntete = 16 + entrees.length * 16 + tailleNomsAlignee;
    let bloc = Math.ceil(tailleEntete / BLOC);
    for (const e of entrees) {
      if (e.dossier) continue;
      const brut = e.contenu;
      const comp = await deflateBrut(brut);
      e.taille = brut.length;
      e.donnees = comp && comp.length < brut.length ? comp : brut;
      e.compresse = e.donnees !== brut;
      e.bloc = bloc;
      bloc += Math.ceil(Math.max(1, e.donnees.length) / BLOC);
      if (e.donnees.length > 0xffffff || e.bloc > 0xffffff) throw new Error("fichier trop gros pour le format RPF");
    }

    // 4. Écriture.
    const sortie = new Uint8Array(bloc * BLOC);
    const v = new DataView(sortie.buffer);
    v.setUint32(0, MAGIE, true);
    v.setUint32(4, entrees.length, true);
    v.setUint32(8, tailleNomsAlignee, true);
    v.setUint32(12, OPEN, true);
    entrees.forEach((e, i) => {
      const o = 16 + i * 16;
      const nom = offsetNom.get(e.nom);
      if (e.dossier) {
        v.setUint32(o, nom, true);
        v.setUint32(o + 4, DOSSIER, true);
        v.setUint32(o + 8, e.debut, true);
        v.setUint32(o + 12, e.compte, true);
      } else {
        // 16 bits : nom | 24 bits : taille compressée (0 = non compressé) | 24 bits : bloc
        const tailleComp = e.compresse ? e.donnees.length : 0;
        v.setUint16(o, nom, true);
        v.setUint8(o + 2, tailleComp & 0xff);
        v.setUint8(o + 3, (tailleComp >> 8) & 0xff);
        v.setUint8(o + 4, (tailleComp >> 16) & 0xff);
        v.setUint8(o + 5, e.bloc & 0xff);
        v.setUint8(o + 6, (e.bloc >> 8) & 0xff);
        v.setUint8(o + 7, (e.bloc >> 16) & 0xff);
        v.setUint32(o + 8, e.taille, true);   // taille décompressée
        v.setUint32(o + 12, 0, true);         // pas de chiffrement
        sortie.set(e.donnees, e.bloc * BLOC);
      }
    });
    let p = 16 + entrees.length * 16;
    for (const m of morceaux) { sortie.set(m, p); p += m.length; }
    return sortie;
  }

  async function inflateBrut(octets) {
    if (typeof DecompressionStream === "undefined") return null;
    try {
      const flux = new Blob([octets]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(flux).arrayBuffer());
    } catch (e) {
      return null;
    }
  }

  /**
   * Lit une archive RPF7 : liste des fichiers et cibles de son assembly.xml.
   * @param {Uint8Array} d
   * @returns {Promise<{ chiffre: boolean, fichiers: string[], cibles: string[], nomAssembly: string }>}
   */
  async function lire(d) {
    const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
    if (d.length < 16 || v.getUint32(0, true) !== MAGIE) throw new Error("ce fichier n'est pas un .rpf de GTA V");
    const nb = v.getUint32(4, true), lgNoms = v.getUint32(8, true), chiffrement = v.getUint32(12, true);
    if (chiffrement !== OPEN && chiffrement !== 0) return { chiffre: true, fichiers: [], cibles: [], nomAssembly: "" };
    const dec = new TextDecoder("latin1");
    const baseNoms = 16 + nb * 16;
    const nom = (o) => { let f = baseNoms + o; while (f < d.length && d[f] !== 0) f++; return dec.decode(d.subarray(baseNoms + o, f)); };
    const E = [];
    for (let i = 0; i < nb; i++) {
      const o = 16 + i * 16;
      if (v.getUint32(o + 4, true) === DOSSIER) {
        E.push({ dossier: true, nom: nom(v.getUint32(o, true)), debut: v.getUint32(o + 8, true), compte: v.getUint32(o + 12, true) });
      } else {
        const taille = d[o + 2] | (d[o + 3] << 8) | (d[o + 4] << 16);
        const bloc = (d[o + 5] | (d[o + 6] << 8) | (d[o + 7] << 16)) & 0x7fffff;
        const ressource = (v.getUint32(o + 4, true) & 0x80000000) !== 0;
        E.push({ dossier: false, nom: nom(v.getUint16(o, true)), taille, bloc, ressource, tailleDec: v.getUint32(o + 8, true) });
      }
    }
    const fichiers = [];
    const parcourir = (i, chemin) => {
      const e = E[i];
      if (!e) return;
      if (e.dossier) { for (let j = e.debut; j < e.debut + e.compte && j < E.length; j++) parcourir(j, chemin ? `${chemin}/${E[j].nom}` : E[j].nom); }
      else fichiers.push(chemin);
    };
    parcourir(0, "");
    // Cibles déclarées dans l'assembly.xml à la racine (format des mods FiveM)
    let cibles = [], nomAssembly = "";
    const racine = E[0];
    const idx = racine && racine.dossier ? E.slice(racine.debut, racine.debut + racine.compte).findIndex((e) => !e.dossier && e.nom.toLowerCase() === "assembly.xml") : -1;
    if (idx >= 0) {
      const e = E[racine.debut + idx];
      const brut = d.subarray(e.bloc * BLOC, e.bloc * BLOC + (e.taille || e.tailleDec));
      const texte = new TextDecoder("utf-8").decode((e.taille ? await inflateBrut(brut) : brut) || new Uint8Array());
      const m = texte.match(/<name>([^<]*)<\/name>/);
      nomAssembly = m ? m[1].trim() : "";
      for (const a of texte.matchAll(/<archive[^>]*path="([^"]+)"[^>]*>([\s\S]*?)<\/archive>/g)) {
        for (const add of a[2].matchAll(/<add[^>]*>([^<]+)<\/add>/g)) {
          cibles.push(`${a[1]}:${add[1]}`.replace(/\\/g, "/").replace(/\/+/g, "/").toLowerCase());
        }
      }
    }
    return { chiffre: false, fichiers, cibles, nomAssembly };
  }

  return { creer, lire };
})();
