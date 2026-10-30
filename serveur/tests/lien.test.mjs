/* L'ADRESSE MISE DANS LES COURRIELS.

   CE QUE CES TESTS PROTEGENT. Un courriel part avec des liens. Si ces liens
   visent la production alors que c'est une deploy preview qui les a envoyes,
   le destinataire atterrit sur un site qui ne connait ni son jeton ni son
   inscription : le parcours devient intestable ailleurs qu'en production,
   c'est-a-dire intestable avant livraison. C'est exactement ce qui s'est passe
   avec « Confirmer mon inscription ».
*/
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const L = require("../../netlify/functions/lib/lien.js");

test("en production, l'adresse configuree l'emporte", () => {
  assert.equal(L.calculer({ CONTEXT: "production", SITE_URL: "https://choisi.org", URL: "https://auto.org" }),
    "https://choisi.org");
});

test("en production sans SITE_URL, Netlify donne toujours URL", () => {
  assert.equal(L.calculer({ CONTEXT: "production", URL: "https://auto.org" }), "https://auto.org");
});

/* LE COEUR DU CORRECTIF. SITE_URL est posee au niveau du site : elle vaut donc
   aussi pour les previews, et c'est elle qui y ramenait vers la production. */
test("sur une deploy preview, c'est la preview qui gagne, meme si SITE_URL existe", () => {
  assert.equal(L.calculer({
    CONTEXT: "deploy-preview",
    SITE_URL: "https://production.org",
    URL: "https://production.org",
    DEPLOY_PRIME_URL: "https://deploy-preview-30--site.netlify.app"
  }), "https://deploy-preview-30--site.netlify.app");
});

test("sur une branche deployee aussi", () => {
  assert.equal(L.calculer({ CONTEXT: "branch-deploy", SITE_URL: "https://production.org",
    DEPLOY_PRIME_URL: "https://ma-branche--site.netlify.app" }), "https://ma-branche--site.netlify.app");
});

test("la barre oblique finale est retiree, sinon les liens en portent deux", () => {
  assert.equal(L.calculer({ CONTEXT: "production", SITE_URL: "https://choisi.org///" }), "https://choisi.org");
});

/* Sans rien du tout (tests locaux, execution hors Netlify), on vise le domaine
   public : c'est le seul choix qui ne fabrique pas de lien casse. */
test("sans aucune variable, le domaine public", () => {
  assert.equal(L.calculer({}), "https://fresquedesrisquesdelia.org");
});

/* NEUF FONCTIONS REPETAIENT CETTE LIGNE, et elle avait deja diverge : admin.js
   se repliait sur un autre domaine que les huit autres. */
test("plus aucune fonction ne recalcule l'adresse dans son coin", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const dir = path.join(process.cwd(), "netlify", "functions");
  const fautifs = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".js")) continue;
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    if (/process\.env\.SITE_URL/.test(src)) fautifs.push(f);
  }
  assert.deepEqual(fautifs, [], "ces fonctions lisent encore SITE_URL directement");
});

/* ── LES LIENS SUIVENT LE DEPLOIEMENT QUI LES ENVOIE ──────────
   SIGNALE PAR L'EQUIPE : « on cree un atelier depuis la preview, on suit le
   lien recu, et l'on se retrouve sur le vrai site, sans le changement qu'on
   voulait essayer ». Deux causes possibles, les deux traitees ici :
   - `CONTEXT` est une variable de BUILD ; si elle n'arrive pas jusqu'a
     l'execution des fonctions, l'ancienne regle retombait sur « production » ;
   - l'hote de la requete dit sans ambiguite d'ou vient la demande. */
test("sans CONTEXT, une adresse de deploy preview est reconnue quand meme", () => {
  const r = L.calculer({
    DEPLOY_PRIME_URL: "https://deploy-preview-33--fresquedesrisquedelia.netlify.app",
    URL: "https://fresquedesrisquesdelia.org",
    SITE_URL: "https://fresquedesrisquesdelia.org"
  });
  assert.equal(r, "https://deploy-preview-33--fresquedesrisquedelia.netlify.app");
});

test("en production, on garde le domaine public", () => {
  assert.equal(L.calculer({ CONTEXT: "production", SITE_URL: "https://fresquedesrisquesdelia.org",
    DEPLOY_PRIME_URL: "https://fresquedesrisquesdelia.org" }), "https://fresquedesrisquesdelia.org");
});

test("l'hote de la requete l'emporte : on revient la ou l'on etait", () => {
  const ev = (h) => ({ headers: { host: h } });
  assert.equal(L.pour(ev("deploy-preview-33--fresquedesrisquedelia.netlify.app"), {}),
    "https://deploy-preview-33--fresquedesrisquedelia.netlify.app");
  assert.equal(L.pour(ev("fresquedesrisquesdelia.org"), {}), "https://fresquedesrisquesdelia.org");
  assert.equal(L.pour({ headers: { "x-forwarded-host": "fresquedesrisquesdelia.fr" } }, {}),
    "https://fresquedesrisquesdelia.fr");
});

/* UN EN-TETE `Host` SE FORGE. Sans liste blanche, il suffirait d'appeler notre
   fonction en se declarant « exemple-piege.fr » pour que nos e-mails partent
   avec des liens vers ce domaine, signes de notre nom. */
test("un hote etranger est ignore, on ne signe pas les liens de n'importe qui", () => {
  const env = { CONTEXT: "production", SITE_URL: "https://fresquedesrisquesdelia.org" };
  for (const faux of ["exemple-piege.fr", "fresquedesrisquesdelia.org.piege.fr",
    "evil--fresquedesrisquedelia.netlify.app.piege.io", "localhost", ""]) {
    assert.equal(L.pour({ headers: { host: faux } }, env), "https://fresquedesrisquesdelia.org", faux);
  }
});

test("le port eventuel ne trompe pas la reconnaissance", () => {
  assert.equal(L.pour({ headers: { host: "fresquedesrisquesdelia.org:443" } }, {}),
    "https://fresquedesrisquesdelia.org");
});

test("et plusieurs hotes empiles ne font pas passer le second", () => {
  // `x-forwarded-host` peut contenir une liste : seul le premier compte.
  assert.equal(L.pour({ headers: { "x-forwarded-host": "fresquedesrisquesdelia.org, piege.fr" } }, {}),
    "https://fresquedesrisquesdelia.org");
  assert.equal(L.pour({ headers: { "x-forwarded-host": "piege.fr, fresquedesrisquesdelia.org" } },
    { CONTEXT: "production", SITE_URL: "https://fresquedesrisquesdelia.org" }),
    "https://fresquedesrisquesdelia.org");
});
