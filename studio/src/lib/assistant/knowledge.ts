/**
 * Base de connaissances de l'assistant STUDIO.
 * Fiches curatées issues de GUIDE-UTILISATEUR.md. Liens internes relatifs
 * (pas de token cross-app) : STUDIO est l'extrémité d'arrivée du flux RADAR.
 */

import type { AssistantFiche } from "./intents";

export const STUDIO_KNOWLEDGE: AssistantFiche[] = [
  {
    id: "debuter",
    title: "Démarrer dans STUDIO",
    keywords: [
      "debuter", "demarrer", "commencer", "comment", "utilisation", "nouveau",
      "creer", "post", "visuel", "parcours", "etapes", "mode d emploi", "page",
      "accueil",
    ],
    phrases: [
      "comment demarrer",
      "par ou commencer",
      "comment creer un post",
      "comment utiliser studio",
      "le parcours complet",
      "modes d emploi",
      "comment ca marche",
      "quelle est la premiere etape",
    ],
    description:
      "STUDIO est l'atelier du visuel : c'est ici que naît le post final (image + titre + gabarit) avant l'export. Le flux normal vient de RADAR : choisir un article prêt, puis créer le visuel. Vous pouvez aussi démarrer un post vierge depuis l'accueil.",
    steps: [
      "Depuis RADAR, cliquez « Créer un post » sur un article validé : vous arrivez ici pré-rempli.",
      "Sur la page d'accueil, « Créer un post » ouvre un flux vierge (à n'utiliser que sans actualité liée).",
      "Suivez ensuite : choix du gabarit → titre → images → aperçu → export.",
    ],
    tips: [
      "Toujours relier le post à une actualité quand c'est possible : il devient traçable et associable à un partenaire.",
      "Le pré-remplissage depuis RADAR transfère titre + image + sources : ne perdez pas ce travail en repartant d'un post vierge.",
    ],
    related: ["titres", "gabarits", "images", "export"],
  },
  {
    id: "gabarits",
    title: "Choisir un gabarit",
    keywords: [
      "gabarit", "gabarits", "template", "modele", "format", "mise en page",
      "layout", "1a", "1b", "1c", "2a", "2b", "3a", "3b", "slide", "carrousel",
      "variantes", "facades",
    ],
    phrases: [
      "quel gabarit choisir",
      "comment choisir le gabarit",
      "que sont les gabarits",
      "les differents templates",
      "quel modele pour un carrousel",
      "comment fonctionnent les gabarits",
      "difference entre les gabarits",
    ],
    description:
      "Un gabarit définit la structure du visuel : disposition de l'image, du titre, des bulles. STUDIO propose des gabarits 1A, 1B, 1C (grandes images + texte), 2A, 2B (textes forts, bulles de style), 3A, 3B et un CTA final. Le bon gabarit dépend du message et du format (publication simple vs carrousel).",
    steps: [
      "Dans le parcours de création, ouvrez le sélecteur de gabarits.",
      "Prévisualisez les variantes avec votre contenu (image + titre réels).",
      "Validez celui qui met l'information en avant sans surcharger.",
    ],
    tips: [
      "Pour un carrousel, choisissez une série cohérente de gabarits (rôle de chauffe, d'illustration, de CTA).",
      "Le gabarit le plus lisible n'est pas le plus chargé : l'image et le titre doivent rester dominants.",
      "Reproduisez les gabarits qui performent dans vos statistiques Instagram (cf. RADAR /stats).",
    ],
    link: { label: "Créer un post", href: "/nouveau-post" },
    related: ["titres", "images", "carrousel", "export"],
  },
  {
    id: "titres",
    title: "Générer et ajuster le titre",
    keywords: [
      "titre", "titre du post", "sur titre", "surtitre", "generer", "generation",
      "mots cles", "theme", "accroche", "introduction", "paragraphe", "texte",
      "longueur", "caracteres",
    ],
    phrases: [
      "comment generer un titre",
      "comment ecrire le titre",
      "quelle longueur de titre",
      "generer des variations de titre",
      "comment fonctionne la generation de titres",
      "ajuster le sur titre",
      "modifier le texte du post",
    ],
    description:
      "La page Titres propose la génération d'idées à partir d'un thème ou de mots-clés, plus une édition libre du titre, du surtitre et du texte. Les gabarits imposent une longueur (mini/maxi en caractères) pour garder une lecture au format post Instagram.",
    steps: [
      "Ouvrez la page Titres (ou arrivez-y pré-remplie depuis RADAR).",
      "Générez des variantes ou saisissez votre propre accroche.",
      "Vérifiez la longueur : respectez le mini/maxi indiqué pour que le rendu tienne dans le gabarit.",
    ],
    tips: [
      "Le surtitre accroche, le titre vend, le paragraphe déroule : hiérarchisez l'information de la même façon qu'un article.",
      "Un titre trop long sera tronqué visuellement : gardez l'essentiel dans les premiers caractères.",
      "Reprenez les formules validées par vos stats plutôt que de tout réinventer à chaque post.",
    ],
    related: ["gabarits", "debuter", "export"],
  },
  {
    id: "images",
    title: "Gérer les images",
    keywords: [
      "image", "images", "photo", "upload", "importer", "televerser", "recadrage",
      "cropping", "detourage", "transparence", "png", "apercu", "vignette",
      "selection",
    ],
    phrases: [
      "comment importer une image",
      "comment televerser une image",
      "recadrer l image",
      "activer le recadrage intelligent",
      "detourer une image",
      "quelle image utiliser",
      "comment choisir les images",
      "importer depuis une url",
    ],
    description:
      "STUDIO accepte l'upload d'images (fichier) ou l'import depuis une URL (URLs fournies par RADAR). Un recadrage intelligent adapte automatiquement l'image au format du gabarit. En dernier, une étape de détourage (suppression de fond / transparence) traite les visuels qui le nécessitent, selon un processus de traitement garanti.",
    steps: [
      "Sur la page de création, importez l'image : déposez le fichier ou collez l'URL.",
      "Activez le recadrage intelligent pour remplir correctement la zone du gabarit.",
      "Pour un visuel détouré (objet seul sur fond transparent), lancez l'étape de détourage.",
    ],
    tips: [
      "Les images issues de la veille RADAR arrivent déjà récupérées : privilégiez-les.",
      "Vérifiez toujours le rendu après recadrage : un recadrage automatique peut couper un élément important.",
      "Un visuel net et bien centré transforme le post — préférez une seule image forte à plusieurs faibles.",
    ],
    related: ["gabarits", "carrousel", "export"],
  },
  {
    id: "bulles",
    title: "Manipuler les bulles de texte",
    keywords: [
      "bulles", "manipulation", "positionner", "deplacer", "geometrie", "palette",
      "calque", "repositionner", "texte", "3a", "3b", "montage",
    ],
    phrases: [
      "comment deplacer les bulles",
      "comment positionner une bulle",
      "a quoi servent les bulles",
      "comment fonctionnent les bulles",
      "repositionner le texte sur le visuel",
    ],
    description:
      "Certains gabarits (2A, 2B, 3A, 3B) affichent des bulles : des zones de texte déplaçables sur le visuel. Vous les repositionnez pour ne pas cacher l'élément principal de l'image et pour équilibrer la composition du post.",
    steps: [
      "Sur l'aperçu, sélectionnez une bulle.",
      "Glissez-la pour la repositionner (les contraintes du gabarit restent respectées).",
      "Vérifiez le rendu final : une bulle ne doit jamais coller à un bord ni écraser le sujet.",
    ],
    tips: [
      "L'œil lit une bulle avant l'image : placez-la sur une zone neutre de la photo.",
      "Garde au moins un peu d'air entre la bulle et les bords du visuel.",
      "Les gabarits 2A/2B/3A/3B imposent des limites mini/maxi de texte : respectez-les pour un rendu propre.",
    ],
    related: ["gabarits", "titres", "images"],
  },
  {
    id: "carrousel",
    title: "Créer un carrousel",
    keywords: [
      "carrousel", "plusieurs slides", "slides", "multi", "post multiple",
      "carousels", "sequence", "glisser", "tenir", "serie",
    ],
    phrases: [
      "comment creer un carrousel",
      "quoi mettre dans un carrousel",
      "combien de slides",
      "difference post simple et carrousel",
      "creer plusieurs visuels",
      "le mode carrousel",
    ],
    description:
      "Le carrousel est un post Instagram composé de plusieurs slides (jusqu'à 5), chacun portant un visuel et un texte. Le mode carrousel de STUDIO compose le package complet : titre, images, slides avec gabarits, puis un score de pertinence et une accroche porteuse sont générés pour garantir une séquence qui « scrolle ».",
    steps: [
      "Depuis RADAR, « Créer un post » sur un article dont le format cible est carrousel, ou ouvrez le mode carrousel de STUDIO.",
      "Constituez les slides : jusqu'à 5, chacune avec son gabarit, son texte et son image.",
      "Validez le language (titre/sur-titre), vérifiez la cohérence de la séquence puis exportez.",
    ],
    tips: [
      "La première slide doit donner envie de swiper : mettez-y l'accroche la plus forte.",
      "Votre rapport stats RADAR compare publications vs carrousels : réutilisez ce qui engage le plus.",
      "Respectez le format du partenaire (slide_unique vs carrousel) pour ne pas casser la livraison.",
    ],
    related: ["images", "gabarits", "export", "debuter"],
  },
  {
    id: "export",
    title: "Exporter le post (HD / Drive)",
    keywords: [
      "export", "exporter", "rendu", "render", "telechargement", "hd", "haute",
      "qualite", "playwright", "job", "progres", "zip", "drive",
    ],
    phrases: [
      "comment exporter le post",
      "comment telecharger le visuel",
      "ou va le fichier exporte",
      "comment suivre le job d export",
      "le rendu est il identique",
      "exporter en haute definition",
    ],
    description:
      "L'export génère le visuel final (rendu Playwright pixel-par-pixel) puis le dépose dans le dossier Drive partagé quand la configuration Drive est active, ou propose un téléchargement direct sinon. La page Export du job affiche la progression, l'état et les fichiers produits.",
    steps: [
      "Sur le post terminé, lancez l'export.",
      "Suivez le job sur la page Export (progression, statut).",
      "Récupérez le fichier dans le Drive partagé ou via le téléchargement direct retourné.",
    ],
    tips: [
      "L'aperçu et l'export doivent être strictement identiques : « zéro écart » entre aperçu et rendu final.",
      "Si la configuration Drive n'est pas active, le job produit un téléchargement local — vérifiez le chemin retourné.",
      "Évitez de relancer tout juste avant une échéance partenaire : anticipez le temps de rendu (Playwright).",
    ],
    related: ["images", "carrousel", "drive_connect", "gabarits"],
  },
  {
    id: "drive_connect",
    title: "Connecter le Drive (config Google)",
    keywords: [
      "drive", "configurer", "configuration", "connexion", "google", "dossier",
      "partage", "autorisation", "credentials", "export drive", "activer",
    ],
    phrases: [
      "comment connecter le drive",
      "configurer le drive",
      "activer l export vers drive",
      "ou arrivent les exports",
      "configurer google drive",
    ],
    description:
      "Les exports atterrissent dans un dossier Google Drive partagé quand la configuration est active. Cette configuration relève de l'administrateur : identifiants Google (credentials JSON/API) et variable d'activation. Sans elle, STUDIO fonctionne mais les fichiers sont rendus en téléchargement local.",
    steps: [
      "Demandez à l'administrateur d'activer la variable d'environnement de connexion Drive.",
      "Déposez les identifiants de service Google autorisés sur le dossier partagé.",
      "Une fois connecté, chaque export écrit directement dans le dossier Drive de l'équipe.",
    ],
    tips: [
      "Sans configuration, l'export reste utilisable : pensez à récupérer le téléchargement local.",
      "Vérifiez l'état « connecté » sur la page Drive avant une session d'exports en série.",
    ],
    related: ["export", "debuter"],
  },
  {
    id: "pipeline_upscale",
    title: "Pipeline et upscale HD",
    keywords: [
      "pipeline", "upscale", "hd", "haute definition", "detourage", "process",
      "job", "traitement", "en attente", "televerser", "ameliorer", "resolution",
    ],
    phrases: [
      "comment fonctionne le pipeline studio",
      "a quoi sert l upscale",
      "ameliorer la qualite d une image",
      "augmenter la resolution",
      "suivre le traitement des images",
      "comment televerser les imagesRADAR",
    ],
    description:
      "Le pipeline d'images traite vos téléversements : upload, amélioration de la résolution (upscale HD via modèle local), et détourage à la demande. Les pages Pipeline d'images montrent l'état de chaque traitement (en attente, terminé, échec) avec les fichiers produits.",
    steps: [
      "Téléversez vos images via la page Pipeline d'images.",
      "Lancez l'upscale pour augmenter la définition des visuels entrants.",
      "Déclenchez le détourage sur les images qui doivent être isolées sur fond transparent.",
    ],
    tips: [
      "L'upscale est local (aucun coût API) : utilisez-le pour améliorer les visuels issus de la veille.",
      "Un visuel détouré se réutilise sur plusieurs gabarits sans recadrage manuel.",
      "Traiter les images en amont du montage garantit un rendu net à l'export final.",
    ],
    related: ["images", "export", "carrousel"],
  },
  {
    id: "verification",
    title: "Vérification et contrôle qualité",
    keywords: [
      "verification", "verifier", "controle", "qualite", "rendu", "apercu",
      "identique", "ecart", "blocker", "eviter", "erreur", "test",
    ],
    phrases: [
      "comment verifier le rendu",
      "comment eviter les erreurs d export",
      "que verifie le controle qualite",
      "comment valider un visuel",
      "le rendu est il identique a l apercu",
    ],
    description:
      "Avant l'export, STUDIO vérifie le post : structure, texte, longueurs, images. Le but est un rendu « zéro écart » entre l'aperçu affiché et le fichier final. Les mises à jour sont rétro-compatibles pour ne pas casser des gabarits existants déjà approuvés.",
    steps: [
      "Prévisualisez le post dans le gabarit choisi.",
      "Relisez texte et images : longueurs, recadrages, position des bulles.",
      "Lancez l'export uniquement quand l'aperçu est parfait.",
    ],
    tips: [
      "Comparez toujours l'aperçu à l'export final sur le premier post d'une série.",
      "Contrôlez les caractères spéciaux et les pauses de titres (longueur mini/maxi).",
      "Un gabarit déjà éprouvé réduit le risque : réutilisez vos gabarits validés.",
    ],
    related: ["gabarits", "export", "titres"],
  },
];

export const STUDIO_STARTERS = ["debuter", "gabarits", "titres", "export", "carrousel"];