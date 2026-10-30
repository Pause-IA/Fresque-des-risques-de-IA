/* L'ADRESSE DU SITE, CELLE DU DEPLOIEMENT QUI ENVOIE L'E-MAIL.

   CE QUE CE MODULE CORRIGE. Neuf fonctions repetaient la meme ligne :

     process.env.SITE_URL || "https://fresquedesrisquesdelia.org"

   Sans SITE_URL, tout e-mail partait donc avec des liens vers la PRODUCTION,
   quel que soit le deploiement qui l'avait envoye. Consequence mesuree : on
   s'inscrit aux alertes depuis une deploy preview, le jeton est range dans le
   magasin de CETTE preview, et le lien « Confirmer mon inscription » renvoie
   vers la production, qui ne connait pas ce jeton. Impossible de tester un
   parcours par courriel ailleurs qu'en production, c'est-a-dire impossible de
   le tester avant de le livrer.

   Et comme la ligne etait recopiee, elle avait deja diverge : admin.js se
   repliait sur « fresquedesrisquedelia.netlify.app » quand les huit autres
   visaient « fresquedesrisquesdelia.org ».

   CE QU'ON CHOISIT, DANS CET ORDRE :
   - en production : SITE_URL si l'equipe l'a posee, sinon URL (que Netlify
     donne toujours) ;
   - partout ailleurs (deploy preview, branch deploy) : DEPLOY_PRIME_URL,
     l'adresse du deploiement en cours. On ignore volontairement SITE_URL dans
     ce cas : posee au niveau du site, elle vaut aussi pour les previews et
     ramenerait le probleme.
   - en dernier recours seulement, le domaine en dur.

   CONTEXT vaut « production », « deploy-preview », « branch-deploy » ou
   « dev ». Absent (tests locaux), on suppose la production : c'est le reglage
   le plus sur, et les bancs posent ce qu'il leur faut.
*/
"use strict";

/* NOS ADRESSES, ET ELLES SEULES. On accepte de suivre l'hote de la REQUETE
   (voir `pour`), ce qui est la seule facon sure de renvoyer quelqu'un la ou il
   etait. Mais un en-tete `Host` se forge : sans cette liste, il suffirait
   d'appeler notre fonction en se declarant « exemple-piege.fr » pour que nos
   e-mails partent avec des liens vers ce domaine, signes de notre nom. */
function notre(hote) {
  return /^(www\.)?fresquedesrisquesdelia\.(org|fr)$/i.test(hote)
    // Le site Netlify, ses deploy previews et ses deploiements de branche :
    // « deploy-preview-33--fresquedesrisquedelia.netlify.app ».
    || /^([a-z0-9-]+--)?fresquedesrisquedelia\.netlify\.app$/i.test(hote);
}

/* UN DEPLOIEMENT DE TEST SE RECONNAIT A SON ADRESSE, MEME SANS `CONTEXT`.
   `CONTEXT` est une variable de BUILD ; si elle n'arrive pas jusqu'a
   l'execution des fonctions, l'ancienne regle retombait sur « production » et
   tous les e-mails d'une preview repartaient vers le site public. C'est
   exactement ce qui a ete signale : on cree un atelier depuis la preview, on
   suit le lien recu, et l'on se retrouve sur le vrai site, sans le changement
   qu'on voulait essayer. */
function estDeploiementDeTest(env) {
  var c = env.CONTEXT || "";
  if (c === "deploy-preview" || c === "branch-deploy") return true;
  return /--[a-z0-9-]+\.netlify\.app/i.test(env.DEPLOY_PRIME_URL || "");
}

function calculer(env) {
  env = env || process.env;
  var choisi = estDeploiementDeTest(env)
    // On ignore volontairement SITE_URL ici : posee au niveau du site, elle
    // vaut aussi pour les previews et ramenerait le probleme.
    ? (env.DEPLOY_PRIME_URL || env.URL || env.SITE_URL)
    : (env.SITE_URL || env.URL);
  return String(choisi || "https://fresquedesrisquesdelia.org").replace(/\/+$/, "");
}

/* L'ADRESSE D'OU VIENT LA DEMANDE. Un e-mail declenche depuis la preview doit
   ramener a la preview, un e-mail declenche depuis le site public au site
   public : l'hote de la requete le dit sans ambiguite, la ou les variables
   d'environnement demandent de deviner. Hors de notre liste, on n'en tient
   aucun compte et l'on revient au calcul par l'environnement. */
function pour(event, env) {
  var h = (event && event.headers) || {};
  var brut = String(h["x-forwarded-host"] || h.host || "").split(",")[0].trim().toLowerCase();
  var hote = brut.replace(/:\d+$/, "");
  if (hote && notre(hote)) return "https://" + hote;
  return calculer(env);
}

module.exports = { calculer: calculer, pour: pour, notre: notre, SITE: calculer() };
