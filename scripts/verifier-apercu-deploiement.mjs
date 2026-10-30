/* « SUIS-JE SUR LE SITE, OU SUR UNE VERSION DE TEST ? »

   CE QUE CE BANC PROTEGE. Chaque proposition de changement est publiee a une
   adresse a elle (deploy preview), pour etre relue avant mise en ligne. Rien,
   a l'ecran, ne la distinguait du vrai site : on suit un lien d'un ancien
   e-mail ou un favori, on se retrouve sur le site public sans s'en apercevoir,
   et l'on conclut que « le changement n'y est pas ». C'est arrive, et c'est ce
   que le bandeau evite.

   Les deux moities comptent autant : il doit apparaitre sur un deploiement de
   test, et surtout ne JAMAIS apparaitre sur le site public. Un bandeau
   « version de test » sur la production ferait fuir les visiteurs.

   Usage : node scripts/verifier-apercu-deploiement.mjs */
import https from "node:https";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const { chromium } = await (async () => {
  try { return await import("playwright"); } catch (e) { return await import("playwright-core"); }
})();

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".jpg": "image/jpeg", ".txt": "text/plain" };

/* La politique de securite de la production : c'est elle qui ignorerait un
   attribut `style=`, et le bandeau serait la sans mise en forme. */
const toml = fs.readFileSync(path.join(RACINE, "netlify.toml"), "utf8");
const CSP = toml.slice(toml.indexOf('for = "/*"')).match(/Content-Security-Policy = "([^"]+)"/)[1];

/* EN HTTPS, PARCE QUE `.netlify.app` EST SUR LA LISTE HSTS : le navigateur
   refuse d'ouvrir ce nom en clair, quoi qu'on fasse. Certificat de
   circonstance, accepte par le seul navigateur de ce banc. */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "banc-apercu-"));
const cle = path.join(tmp, "cle.pem"), cert = path.join(tmp, "cert.pem");
try {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", cle, "-out", cert, "-days", "2", "-subj", "/CN=banc"], { stdio: "ignore" });
} catch (e) {
  console.error("openssl est necessaire a ce banc (certificat de circonstance).");
  process.exit(2);
}

const site = https.createServer({ key: fs.readFileSync(cle), cert: fs.readFileSync(cert) }, (q, r) => {
  let p = decodeURIComponent(q.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(RACINE, "site", p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream",
    "Content-Security-Policy": CSP });
  fs.createReadStream(f).pipe(r);
});
await new Promise((r) => site.listen(0, r));
const PORT = site.address().port;

let ko = 0, total = 0;
const t = (nom, cond, det) => {
  total++;
  console.log((cond ? "  ✅ " : "  ❌ ") + nom + (det ? "  → " + det : ""));
  if (!cond) ko++;
};

/* ON FAIT POINTER LES VRAIS NOMS SUR NOTRE SERVEUR. Le script decide d'apres
   `location.hostname` : rien d'autre que la vraie resolution de noms ne permet
   de verifier les deux cas. Detourner les requetes ne suffit pas, la page
   garderait l'adresse d'origine ou celle de remplacement selon les cas. */
const nav = await chromium.launch(Object.assign(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  /* `--no-proxy-server` : sans lui, le navigateur enverrait ces noms au
     mandataire de l'environnement, qui ne les connait pas. */
  { args: ["--host-resolver-rules=MAP * 127.0.0.1:" + PORT, "--no-proxy-server"],
    ignoreHTTPSErrors: true }));
const erreursJS = [];

async function ouvrir(hote, chemin) {
  const ctx = await nav.newContext({ viewport: { width: 1100, height: 800 }, ignoreHTTPSErrors: true });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => erreursJS.push("[" + hote + "] " + e.message));
  await pg.goto("https://" + hote + chemin, { waitUntil: "networkidle" });
  await pg.waitForTimeout(400);
  const vu = await pg.evaluate(() => {
    const b = document.getElementById("bandeau-apercu");
    if (!b) return { present: false };
    const s = getComputedStyle(b);
    return { present: true, hote: (b.querySelector(".ba-hote") || {}).textContent,
      fond: s.backgroundColor, position: s.position, bas: s.bottom,
      place: getComputedStyle(document.body).paddingBottom,
      lienSortie: b.querySelectorAll("a").length };
  });
  return { pg, ctx, vu };
}

console.log("\n--- Sur un deploiement de test ---");
let o = await ouvrir("deploy-preview-33--fresquedesrisquedelia.netlify.app", "/en-ligne/session/");
t("le bandeau est la", o.vu.present, JSON.stringify(o.vu));
t("il donne l'adresse exacte, celle qui tranche entre deux onglets",
  o.vu.hote === "deploy-preview-33--fresquedesrisquedelia.netlify.app", String(o.vu.hote));
/* LA MISE EN FORME DOIT ARRIVER : la feuille est chargee par le script, sous
   la politique de securite de la production. Un bandeau sans fond ne se voit
   pas, et ne sert donc a rien. */
t("et il est mis en forme (feuille chargee malgre la CSP)",
  o.vu.fond === "rgb(27, 26, 23)" && o.vu.position === "fixed", o.vu.fond + " " + o.vu.position);
t("il degage la place en bas, sans couvrir le pied de page",
  parseFloat(o.vu.place) > 20, o.vu.place);
/* AUCUN LIEN VERS LA PRODUCTION : sortir de la version de test par megarde est
   exactement ce qu'on cherche a eviter. */
t("il ne propose aucun lien pour sortir vers le site public", o.vu.lienSortie === 0);
/* On peut le refermer, pour une capture d'ecran propre. */
await o.pg.click(".ba-x");
await o.pg.waitForTimeout(150);
t("on peut le refermer", await o.pg.evaluate(() => !document.getElementById("bandeau-apercu")));
await o.pg.reload({ waitUntil: "networkidle" });
await o.pg.waitForTimeout(400);
t("et il reste ferme pour la duree de l'onglet",
  await o.pg.evaluate(() => !document.getElementById("bandeau-apercu")));
await o.ctx.close();

o = await ouvrir("fresquedesrisquedelia.netlify.app", "/");
t("un deploiement de branche le montre aussi", o.vu.present);
await o.ctx.close();

console.log("\n--- Sur le site public, jamais ---");
for (const chemin of ["/", "/en-ligne/session/", "/animateurs/", "/participer/"]) {
  o = await ouvrir("fresquedesrisquesdelia.org", chemin);
  t("rien sur " + chemin, !o.vu.present, JSON.stringify(o.vu));
  await o.ctx.close();
}

/* ── ESSAYER LE TABLEAU DEPUIS /admin/ ──────────────────────
   Relire un changement du tableau demandait de programmer un atelier,
   d'attendre l'e-mail et de suivre son lien. Trois etapes sans rapport avec
   ce qu'on veut regarder, et l'e-mail ramenait au site public. */
console.log("\n--- Essayer le tableau depuis /admin/ ---");
for (const [hote, attendu] of [
  ["deploy-preview-33--fresquedesrisquedelia.netlify.app", "version de test"],
  ["fresquedesrisquesdelia.org", "site public"]
]) {
  o = await ouvrir(hote, "/admin/");
  const essai = await o.pg.evaluate(() => {
    const a = document.getElementById("essai-tableau");
    const e = document.getElementById("essai-espace");
    return { hote: (document.getElementById("essai-hote") || {}).textContent,
      etiquette: (document.getElementById("essai-etiquette") || {}).textContent,
      tableau: a ? a.href : null, espace: e ? e.href : null };
  });
  t("/admin/ sur " + (attendu === "site public" ? "la production" : "une preview")
    + " annonce « " + attendu + " »", essai.etiquette === attendu, JSON.stringify(essai));
  t("et il dit sur quelle adresse", essai.hote === hote, String(essai.hote));
  /* LE POINT QUI COMPTE : les deux entrees restent sur LA MEME adresse. Un
     lien absolu vers la production renverrait tester le site public. */
  t("les entrees d'essai restent sur le meme deploiement",
    (essai.tableau || "").indexOf("https://" + hote + "/") === 0
    && (essai.espace || "").indexOf("https://" + hote + "/") === 0,
    essai.tableau + " | " + essai.espace);
  await o.ctx.close();
}

t("aucune erreur JavaScript", erreursJS.length === 0, erreursJS.slice(0, 2).join(" | "));

console.log("\n" + (ko ? "❌" : "✅") + " Bandeau « version de test » : " + (total - ko)
  + " verifications reussies, " + ko + " echouees.\n");
await nav.close();
site.close();
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
process.exit(ko ? 1 : 0);
