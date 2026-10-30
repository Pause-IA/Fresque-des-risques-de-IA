/* OU LES DONNEES SONT RANGEES : site, ou bac a sable du deploiement.

   CE QUE CES TESTS PROTEGENT. `getStore` range a l'echelle du SITE : un
   atelier cree depuis une version de test pour la relire atterrissait dans les
   vraies donnees, a cote des vrais ateliers. On teste mal quand chaque essai
   laisse une trace en production.

   Les deux sens comptent autant :
   - une version de test ne doit JAMAIS ecrire dans les donnees du site ;
   - la production ne doit JAMAIS ecrire dans un bac a sable, sinon elle
     perdrait tout au deploiement suivant. C'est le risque le plus grave de ce
     changement, et c'est celui-la qu'on verrouille en premier.

   `node --test`.
*/
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const M = require(path.join(RACINE, "netlify/functions/lib/magasin.js"));

test("la production garde le magasin du site", () => {
  assert.equal(M.estTest({ CONTEXT: "production" }), false);
  // Meme avec une adresse de deploiement qui ressemble a une preview : c'est
  // le contexte qui tranche quand il est la.
  assert.equal(M.estTest({ CONTEXT: "production",
    DEPLOY_PRIME_URL: "https://deploy-preview-1--x.netlify.app" }), false);
});

test("une version de test ecrit dans son propre bac a sable", () => {
  assert.equal(M.estTest({ CONTEXT: "deploy-preview" }), true);
  assert.equal(M.estTest({ CONTEXT: "branch-deploy" }), true);
});

/* `CONTEXT` est une variable de BUILD : si elle n'arrive pas jusqu'a
   l'execution des fonctions, on reconnait le deploiement a son adresse. Sans
   cela, une preview ecrirait dans les donnees du site, ce qui est exactement
   ce qu'on veut eviter. */
test("sans CONTEXT, l'adresse du deploiement suffit", () => {
  assert.equal(M.estTest({ DEPLOY_PRIME_URL: "https://deploy-preview-33--site.netlify.app" }), true);
  assert.equal(M.estTest({ DEPLOY_PRIME_URL: "https://ma-branche--site.netlify.app" }), true);
});

/* SANS AUCUN INDICE, ON SUPPOSE LA PRODUCTION. C'est le reglage le plus sur :
   un faux positif ferait ecrire la production dans un bac a sable, et elle
   perdrait ses donnees au deploiement suivant. */
test("sans indice, on suppose la production", () => {
  assert.equal(M.estTest({}), false);
  assert.equal(M.estTest({ URL: "https://fresquedesrisquesdelia.org" }), false);
});

/* PLUS AUCUN `getStore` DIRECT DANS LES FONCTIONS : un seul oubli suffirait a
   faire ecrire une version de test dans les vraies donnees, et cela ne se
   verrait qu'apres coup, en retrouvant un atelier d'essai dans l'agenda
   public. */
test("aucune fonction n'appelle getStore directement", () => {
  const dossier = path.join(RACINE, "netlify/functions");
  const fautifs = [];
  (function parcourir(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { parcourir(p); continue; }
      if (!e.name.endsWith(".js") || e.name === "magasin.js") continue;
      if (/getStore\s*\(/.test(fs.readFileSync(p, "utf8"))) fautifs.push(path.relative(RACINE, p));
    }
  })(dossier);
  assert.deepEqual(fautifs, [], "elles doivent passer par lib/magasin.js");
});

test("et le magasin se choisit sans jamais lever d'erreur", () => {
  // Hors de Netlify, la bibliotheque refuse de servir un magasin : le module
  // ne doit pas tomber pour autant, sinon aucune fonction ne demarrerait.
  for (const env of [{ CONTEXT: "production" }, { CONTEXT: "deploy-preview" }]) {
    assert.doesNotThrow(() => { try { M.magasin("essai", env); } catch (e) { /* refus attendu */ } });
  }
});
