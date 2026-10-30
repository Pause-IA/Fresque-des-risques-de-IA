/* « SUIS-JE SUR LE SITE, OU SUR UNE VERSION DE TEST ? »

   LE PROBLEME, SIGNALE PAR L'EQUIPE. Pour relire un changement avant de le
   mettre en ligne, Netlify publie chaque proposition (pull request) a une
   adresse a elle. Rien, a l'ecran, ne distinguait cette version de test du
   vrai site : on ouvre l'adresse de la preview, on suit un lien d'un ancien
   e-mail ou un favori, on se retrouve sur le site public sans s'en apercevoir,
   et l'on conclut que « le changement n'y est pas ».

   CE BANDEAU LE DIT. Il n'apparait QUE sur une adresse de deploiement Netlify
   (*.netlify.app) : sur le site public, il n'existe pas. Il ne porte aucun
   lien vers la production : sortir de la version de test par megarde est
   exactement ce qu'on cherche a eviter. On peut le refermer pour la duree de
   l'onglet (une capture d'ecran propre, par exemple).

   Aucune dependance, aucune requete, aucun attribut `style=` : la politique de
   securite du site (`style-src 'self'`) ignore ces derniers. */
(function () {
  "use strict";
  var hote = location.hostname || "";
  // Les deploiements Netlify (preview de PR, deploiement de branche) vivent
  // tous sous ce domaine. Le site public a le sien : il n'affiche rien.
  if (!/\.netlify\.app$/i.test(hote)) return;

  var en = (document.documentElement.lang || "fr").indexOf("en") === 0;
  var T = en ? {
    titre: "Test version",
    texte: "This is not the public site: it is a preview of a change under review.",
    fermer: "Hide this banner"
  } : {
    titre: "Version de test",
    texte: "Ce n'est pas le site public : c'est l'aperçu d'un changement en cours de relecture.",
    fermer: "Masquer ce bandeau"
  };

  try { if (sessionStorage.getItem("apercu-masque") === "1") return; } catch (e) {}

  /* LA FEUILLE DE STYLE VIENT AVEC. Elle n'est demandee que sur un
     deploiement de test : le site public ne la charge jamais, et les trois
     feuilles du site (pages publiques, tableau en ligne, administration)
     n'ont pas a recopier les memes regles. L'adresse est deduite de celle de
     ce script, pour rester juste depuis n'importe quelle profondeur de
     dossier. */
  function poserFeuille(src) {
    if (!src || document.getElementById("css-apercu")) return;
    var l = document.createElement("link");
    l.id = "css-apercu";
    l.rel = "stylesheet";
    l.href = src.replace(/js\/deploiement\.js.*$/, "css/deploiement.css");
    document.head.appendChild(l);
  }
  var moi = document.currentScript && document.currentScript.src;

  function poser() {
    if (document.getElementById("bandeau-apercu")) return;
    var b = document.createElement("div");
    b.className = "bandeau-apercu";
    b.id = "bandeau-apercu";
    b.setAttribute("role", "status");

    var etiq = document.createElement("strong");
    etiq.textContent = T.titre;
    var txt = document.createElement("span");
    txt.className = "ba-texte";
    txt.textContent = T.texte;
    /* L'ADRESSE EXACTE, parce que c'est elle qui tranche : deux onglets
       ouverts, on ne sait plus lequel est lequel. */
    var adr = document.createElement("code");
    adr.className = "ba-hote";
    adr.textContent = hote;

    var x = document.createElement("button");
    x.type = "button";
    x.className = "ba-x";
    x.setAttribute("aria-label", T.fermer);
    x.title = T.fermer;
    x.textContent = "✕";
    x.addEventListener("click", function () {
      b.remove();
      document.documentElement.classList.remove("avec-apercu");
      try { sessionStorage.setItem("apercu-masque", "1"); } catch (e) {}
    });

    b.appendChild(etiq);
    b.appendChild(txt);
    b.appendChild(adr);
    b.appendChild(x);
    document.body.appendChild(b);
    // La classe sert a degager la place en bas : le bandeau ne doit masquer
    // ni le pied de page, ni la derniere ligne d'un formulaire.
    document.documentElement.classList.add("avec-apercu");
  }

  poserFeuille(moi);
  if (document.body) poser();
  else document.addEventListener("DOMContentLoaded", poser);
})();
