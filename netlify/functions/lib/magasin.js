/* OU LES DONNEES SONT RANGEES : site, ou deploiement de test.

   LE PROBLEME. `getStore({ name })` range a l'echelle du SITE : un atelier
   cree depuis une version de test pour la relire atterrissait donc dans les
   vraies donnees, a cote des vrais ateliers. On teste rarement proprement
   quand chaque essai laisse une trace en production, et la seule facon de
   faire le menage etait d'aller supprimer a la main ce qu'on venait de creer.

   CE QU'ON FAIT. Sur un deploiement de test (deploy preview, deploiement de
   branche), on range dans un magasin lie AU DEPLOIEMENT (`getDeployStore`) :
   un bac a sable, vide au depart, qui disparait avec le deploiement. En
   production, rien ne change : c'est le magasin du site, celui qui porte les
   vraies donnees.

   CE QUE CELA IMPLIQUE, ET C'EST VOULU : chaque nouveau commit d'une
   proposition produit un nouveau deploiement, donc un bac a sable neuf. Un
   atelier cree pour essayer hier n'est plus la aujourd'hui. C'est le prix d'un
   essai qui ne salit rien, et c'est le bon sens pour un essai.

   `connectLambda(event)` doit avoir ete appele avant, comme pour getStore.
*/
"use strict";

var B = require("@netlify/blobs");

/* Un deploiement de test se reconnait a son contexte, ou a son adresse quand
   le contexte n'arrive pas jusqu'a l'execution (voir lien.js, meme piege). */
function estTest(env) {
  env = env || process.env;
  var c = env.CONTEXT || "";
  if (c === "deploy-preview" || c === "branch-deploy") return true;
  if (c === "production") return false;
  return /--[a-z0-9-]+\.netlify\.app/i.test(env.DEPLOY_PRIME_URL || "");
}

/* LE REPLI COMPTE AUTANT QUE LE CHOIX. Si le magasin lie au deploiement n'est
   pas disponible (version de la bibliotheque, execution hors Netlify), on
   revient au magasin du site plutot que de tomber : une version de test qui
   ne demarre pas est pire qu'une version de test qui partage les donnees, et
   le bandeau dit de toute facon ou l'on est. */
function magasin(nom, env) {
  if (estTest(env)) {
    try { return B.getDeployStore({ name: nom }); } catch (e) { /* repli ci-dessous */ }
  }
  return B.getStore({ name: nom });
}

module.exports = { magasin: magasin, estTest: estTest };
