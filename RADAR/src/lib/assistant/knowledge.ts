/**
 * Base de connaissances de l'assistant RADAR.
 * Fiches curatées issues de GUIDE-UTILISATEUR.md — c'est la seule source de vérité.
 * Le token `$STUDIO` est résolu par la route /api/assistant avec getStudioUrl().
 */

import type { AssistantFiche } from "./intents";

export const STUDIO_LINK = "$STUDIO";

export const RADAR_KNOWLEDGE: AssistantFiche[] = [
  {
    id: "connexion",
    title: "Se connecter et choisir son nom",
    keywords: [
      "connexion", "connecter", "login", "motdepasse", "password", "session",
      "nom", "prenom", "identifiant", "membre", "equipe", "compte", "deconnexion",
    ],
    phrases: [
      "comment me connecter",
      "comment se connecter",
      "ou est le mot de passe",
      "je ne peux pas me connecter",
      "comment choisir mon nom",
      "quel est mon nom",
      "mot de passe oublie",
      "comment me deconnecter",
    ],
    description:
      "RADAR et STUDIO partagent la même session : un mot de passe unique (renseigné par l'administrateur dans les variables d'environnement) suivi d'un choix de nom dans la liste de l'équipe. Un seul identifiant ouvre les deux outils.",
    steps: [
      "Ouvrez n'importe quelle page — si la session est absente, vous êtes redirigé vers la page de connexion.",
      "Saisissez le mot de passe d'équipe (celui défini dans la variable AUTH_PASSWORD).",
      "Sélectionnez votre nom parmi les membres (Daniel, Charlotte, Test…) — c'est lui qui signe vos articles et vos validations.",
    ],
    tips: [
      "Votre session dure 7 jours : vous ne devrez pas vous reconnecter chaque matin sauf si elle expire.",
      "En cas de mot de passe perdu, il est réinitialisé uniquement par l'administrateur (variable AUTH_PASSWORD).",
    ],
    related: ["dashboard", "rediger", "publier"],
  },
  {
    id: "dashboard",
    title: "Le tableau de bord (page d'accueil)",
    keywords: [
      "dashboard", "accueil", "tableau", "bord", "aujourdhui", "vue", "apercu",
      "remonter", "tache", "taches", "todo", "priorite", "indicateur", "progression",
    ],
    phrases: [
      "quoi faire aujourd hui",
      "que dois je faire",
      "par ou commencer",
      "que faire ce matin",
      "quel est mon travail",
      "voir le tableau de bord",
      "comment fonctionne la page d accueil",
      "taches du jour",
    ],
    description:
      "Le dashboard est votre point de départ du matin : il affiche les événements urgents, les meilleurs événements pas encore rédigés (« En production »), les articles validés prêts à publier, le nombre de brouillons générés automatiquement dans la nuit et l'état général du pipeline. D'un coup d'œil vous savez quoi traiter en premier.",
    steps: [
      "Ouvrez la page d'accueil (logo RADAR en haut à gauche).",
      "Relisez les sections dans l'ordre : Urgent, puis En production (file d'attente de rédaction), puis Prêt à publier, puis Échéances.",
      "Cliquez sur un événement « En production » pour l'ouvrir et le rédiger — le bouton s'appelle « Rédiger ».",
    ],
    tips: [
      "« En production » ne veut pas dire « en cours de relecture » : ce sont les meilleurs événements qui n'ont PAS ENCORE d'article, triés par score.",
      "Le nombre de brouillons du matin reflète la santé du pipeline : 0 rejeté = veille efficace.",
      "Utilisez le bouton « Ouvrir STUDIO (sans lien) » pour un post ponctuel sans actualité associée — pour un post lié à une actualité, passez plutôt par la fiche événement.",
    ],
    related: ["veille", "brouillons", "publier"],
  },
  {
    id: "veille",
    title: "Comprendre la veille (les événements)",
    keywords: [
      "veille", "evenements", "event", "article", "sources", "rss", "news",
      "actualite", "brief", "sujet", "flus", "flux", "curation", "articles",
      "instantane", "produits", "marques", "sortie", "lancement",
    ],
    phrases: [
      "comment fonctionne la veille",
      "qui choisit les sujets",
      "comment arrivent les articles",
      "d ou viennent les actualites",
      "comment lire un evenement",
      "choisir un sujet",
      "quelle actualite traiter",
      "voir tous les evenements",
      "comprendre les sources",
      "rechercher une actualite",
    ],
    description:
      "RADAR ingère automatiquement des flux RSS d'actualité automobile, les analyse (embeddings locaux, zéro coût API), regroupe les doublons en sujets et calcule un score. La page Événements liste ces sujets avec leur score, l'urgence et les tags. Les événements (articles) sans texte généré sont en attente de traitement : choisir un sujet déclenche en un clic la création du brief et de l'article.",
    steps: [
      "Ouvrez la page Événements (barre latérale).",
      "Repérez les lignes avec un chiffre de score élevé et des tags (marginalité, urgence) — ce sont les plus potentiellement intéressants.",
      "Cliquez sur une ligne pour l'ouvrir en page détaillée : les colonnes Sources → Brief → Article montrent la matière disponible.",
    ],
    tips: [
      "Un événement se compose de sources : préférez celles qui ont une image (la hiérarchie des visuels privilégie une image titre).",
      "Les articles niveau « événement » et « instantané » se combinent : un bon sujet = événement + instantané + produit/marque.",
      "En cas de doute entre deux sujets, choisissez celui avec l'image et l'urgence la plus levée.",
    ],
    related: ["rediger", "image_visuels", "dashboard"],
  },
  {
    id: "rediger",
    title: "Rédiger un article depuis un événement",
    keywords: [
      "rediger", "ecrire", "article", "brief", "generer", "brouillon", "contenu",
      "texte", "base", "faits", "sources", "contredit", "hypothese", "format",
      "plan", "introduction", "conclusion",
    ],
    phrases: [
      "comment rediger un article",
      "comment ecrire un post",
      "que faites le bouton generer",
      "comment fonctionne la generation",
      "creer un article",
      "comment utiliser le brief",
      "comment structurer le texte",
      "comment athender le plan",
      "generer le brouillon",
    ],
    description:
      "Depuis la page détaillée d'un événement, trois boutons pilotent la production : Générer le brief (inventorier les faits vérifiables et les enjeux), Générer l'article (rédiger le post complet à partir du brief), puis un bouton de validation. L'IA s'appuie exclusivement sur les sources du sujet : elle ne connaît pas le monde hors de la veille.",
    steps: [
      "Ouvrez l'événement choisi et cliquez « Générer le brief » — vérifiez que les faits listés correspondent bien aux sources.",
      "Complétez éventuellement le brief (recommandation : l'éditeur peut le modifier) puis cliquez « Générer l'article ».",
      "Relisez l'article généré dans la troisième colonne, corrigez si besoin, puis validez les faits.",
    ],
    tips: [
      "Le brief est LA référence: si l'article contredit le brief, c'est l'article qui se trompe.",
      "Vous pouvez lancer les générations en parallèle sur plusieurs événements — chaque tâche est suivie à part.",
      "Si une source est appelée sans être présente, c'est une hallucination : retirez-la ou ajoutez la source dans l'événement.",
    ],
    related: ["valider", "veille", "image_visuels"],
  },
  {
    id: "valider",
    title: "Valider un article (contrôle qualité)",
    keywords: [
      "valider", "validation", "verifier", "verification", "fact", "faits", "check",
      "crocheter", "cocher", "approuver", "conforme", "controle", "qualite",
      "erreur", "enlever", "retirer",
    ],
    phrases: [
      "comment valider un article",
      "comment verifier les faits",
      "cocher les faits",
      "que signifie valide",
      "comment approuver",
      "pourquoi la validation",
      "comment enlever un fait",
      "quest ce que le controle qualite",
    ],
    description:
      "Valider un article signifie vérifier chaque affirmation contre les sources. La page détaillée affiche un surligneur de faits (bleu) qui met en valeur les points factuels à vérifier : vous cochez chaque fait lorsque la source le confirme. Tant qu'un fait n'est pas vérifié, l'article reste en brouillon.",
    steps: [
      "Relisez l'article généré et identifiez les faits surlignés en bleu.",
      "Cliquez sur chaque coche « Vérifié » seulement si la source en vis-à-vis le confirme vraiment.",
      "Un fait faux ou non sourcé : cochez-le puis cliquez le bouton « Enlever », ou cochez « Rejeter » pour l'écarter.",
    ],
    tips: [
      "Le bouton « Valider sans vérifier » est un raccourci pour les articles simples — utilisez-le avec discernement.",
      "Un verrou (cadenas) sur un article signifie qu'il a déjà été validé : le déverrouiller retire la validation.",
      "Les bandeaux et pastilles de statut vous évitent de republicr un contenu déjà validé.",
      "Certains brouillons du matin sautent complètement cette étape si leur score de confiance est assez haut — ils vous attendent directement sur /ready, badgés « Auto-validé » (voir la fiche « confirmer »).",
    ],
    related: ["rediger", "publier", "confirmer", "corrections"],
  },
  {
    id: "publier",
    title: "Publier un article (page Prêt à publier)",
    keywords: [
      "publier", "publication", "pret", "publier", "partage", "instagram",
      "post", "preview", "apercu", "build", "studio link", "envoyer", "creer le post",
      "lien camion", "ready", "confirmer", "confirmation",
    ],
    phrases: [
      "comment publier un article",
      "comment creer le post",
      "la page pret a publier",
      "que faire des articles valides",
      "comment envoyer vers studio",
      "ouvrir le post dans studio",
      "publier sur instagram",
      "obtenir un lien studio",
      "comment confirmer un post",
    ],
    description:
      "La page « Prêt à publier » liste tous les articles validés. Dès qu'un article est validé (par vous ou automatiquement, voir la fiche « confirmer »), le visuel se génère déjà tout seul côté STUDIO et un créneau est déjà proposé — chaque ligne affiche article + visuel ensemble, avec « Confirmer » (exporte vers Drive, retient le créneau) ou « Modifier » (ouvre l'éditeur STUDIO complet si l'aperçu automatique ne convient pas).",
    steps: [
      "Ouvrez la page Prêt à publier (barre latérale).",
      "Le visuel apparaît déjà préparé sur la ligne de l'article (quelques secondes après validation) — pas besoin d'aller dans STUDIO pour ça.",
      "Cliquez « Confirmer » si tout convient, ou « Modifier » pour ouvrir l'éditeur STUDIO et ajuster gabarit/images/titre avant d'exporter vous-même.",
    ],
    tips: [
      "« Confirmer » est la seule action qui exporte réellement vers Drive et verrouille le créneau — tout le reste n'est qu'un aperçu.",
      "Publier sur Instagram reste toujours un geste humain, à part, jamais automatisé par ce bouton.",
      "Associez la publication à un partenaire pour la traçabilité livrables.",
    ],
    related: ["studio", "valider", "confirmer", "planifier", "partenaires"],
  },
  {
    id: "confirmer",
    title: "Confirmer un post — le geste unique de fin de parcours",
    keywords: [
      "confirmer", "confirmation", "auto-valide", "auto valide", "score",
      "seuil", "rejeter", "rejet", "un seul clic", "un clic", "geste",
      "personne na relu", "auto-genere", "confiance",
    ],
    phrases: [
      "comment confirmer un post",
      "quest ce que confirmer",
      "que veut dire auto-valide",
      "un article auto valide cest quoi",
      "comment rejeter un post auto valide",
      "le post est deja pret le matin",
      "je nai rien fait et un post est pret",
      "que fait le bouton confirmer",
    ],
    description:
      "Le geste final du parcours « un seul geste de décision » : l'automatisation prépare tout (article, visuel, créneau), vous décidez. Un article validé (par vous, ou automatiquement si le score de confiance dépasse le seuil réglé) fait apparaître sur `/ready` article + visuel ensemble. « Confirmer » exporte le visuel vers Drive et verrouille le créneau — c'est la seule action qui a un effet réel. « Modifier » rouvre l'éditeur STUDIO complet si l'aperçu ne convient pas. Sur un article auto-validé (badge « Auto-validé — score X% »), un bouton « Rejeter » apparaît en plus : personne n'a relu ce texte, donc dire non doit être aussi facile que dire oui.",
    steps: [
      "Ouvrez /ready le matin : les articles déjà validés (à la main ou automatiquement) y affichent déjà leur visuel.",
      "Repérez le badge « Auto-validé — score X% » : ça veut dire qu'aucun humain n'a encore lu ce texte, contrairement au reste.",
      "Cliquez « Confirmer » pour finaliser (export Drive + créneau verrouillé), « Modifier » pour ajuster dans STUDIO, ou « Rejeter » pour écarter un auto-validé qui ne convient pas.",
    ],
    tips: [
      "Rien n'est jamais publié sur Instagram par ce bouton — ce clic-là reste, et restera, entièrement humain.",
      "Un article qui reste \"en préparation\" plus d'une minute propose un bouton « Réessayer » — l'automatisation prévient toujours si elle échoue, jamais de blocage silencieux.",
      "Le seuil de confiance qui déclenche l'auto-validation est réglable et volontairement prudent : mieux vaut un article qui attend votre relecture qu'un post de mauvaise qualité auto-validé.",
    ],
    related: ["publier", "valider", "brouillons", "pipeline"],
  },
  {
    id: "planifier",
    title: "Planifier une publication",
    keywords: [
      "planifier", "planification", "calendrier", "planifier", "date", "echeance",
      "deadline", "planning", "ordonnancer", "poster", "poste", "agenda",
    ],
    phrases: [
      "comment planifier une publication",
      "comment planifier un article",
      "mettre dans le calendrier",
      "comment fixer une date",
      "quand publier",
      "planifier sur instagram",
      "ajouter une deadline",
      "organiser les publications",
    ],
    description:
      "Le calendrier hebdomadaire centralise tous les événements de l'équipe : deadlines d'articles, publications Instagram, envois de rapports partenaires, campagnes. Un créneau est déjà proposé automatiquement dès qu'un article est validé — « Planifier » n'apparaît que si aucun créneau n'existe encore. Vous pouvez aussi glisser-déposer des événements pour recaler un planning.",
    steps: [
      "Sur un article validé (page Prêt à publier), ouvrez le menu Planifier.",
      "Choisissez le jour et le type d'événement (publication Instagram, deadline d'article, envoi de rapport, campagne partenaire, autre).",
      "Le calendrier hebdomadaire se met à jour ; déplacez d'un glisser-déposer si besoin.",
    ],
    tips: [
      "Chaque type d'événement a une couleur propre : repérez les campagnes partenaires pour ne pas les chevaucher avec vos publications.",
      "Planifier en avance garantit un rythme de publication régulier sur Instagram — fixez des créneaux fixes.",
    ],
    related: ["calendrier", "publier", "partenaires"],
  },
  {
    id: "calendrier",
    title: "Utiliser le calendrier hebdomadaire",
    keywords: [
      "calendrier", "semaine", "hebdo", "agenda", "planning", "glisser", "deplacer",
      "evenement", "drag", "drop", "semaine",
    ],
    phrases: [
      "comment fonctionne le calendrier",
      "voir le planning de la semaine",
      "comment deplacer un evenement",
      "glisser deposer un evenement",
      "que sont les evenements du calendrier",
      "afficher la semaine",
    ],
    description:
      "Le calendrier est une vue hebdomadaire (lundi → dimanche) des événements de production. Cinq types d'événements existent : deadline d'article, publication Instagram, envoi de rapport, campagne partenaire, autre. Les événements se lisent en un coup d'œil et se déplacent par glisser-déposer.",
    steps: [
      "Ouvrez la page Calendrier.",
      "Cliquez sur un jour pour créer un événement (choisissez le type et l'heure).",
      "Glissez-déposez un événement pour le déplacer à un autre créneau.",
    ],
    tips: [
      "Gardez les deadlines d'articles distinctes des campagnes partenaires : chaque type a sa couleur.",
      "Le calendrier est le reflet du plan : si un article dérape, décalez l'événement plutôt que livrer trop tard.",
    ],
    related: ["planifier", "publier", "partenaires"],
  },
  {
    id: "partenaires",
    title: "Gérer les campagnes partenaires",
    keywords: [
      "partenaire", "partenaires", "campagne", "livraison", "livrables", "delivrables",
      "rapport", "pdf", "annonceur", "marque", "brief partenaire", "campagnes",
      "objectif",
    ],
    phrases: [
      "comment gerer les partenaires",
      "que sont les livrables",
      "comment generer un rapport",
      "suivi des campagnes partenaires",
      "quoi livrer pour un partenaire",
      "creation d un rapport",
      "telecharger le rapport",
      "combien de posts livrer",
    ],
    description:
      "La page Partenaires est le suivi des campagnes : chaque partenaire a un nom, une marque, des dates de campagne et un ensemble de livrables (nombre de publications attendues, format cible — publication ou carrousel). Pour chaque partenaire un bouton génère et télécharge un rapport PDF de la campagne. Cela permet de livrer un post sur le bon compte et de générer un compte-rendu à la fin.",
    steps: [
      "Ouvrez la page Partenaires.",
      "Vérifiez les livrables attendus : nombre de posts, format (publication ou carrousel).",
      "Pour clôturer, cliquez « Générer le rapport » : un PDF est créé (via Playwright) et téléchargé.",
    ],
    tips: [
      "Le format cible (slide_unique vs carrousel) oriente le gabarit à choisir dans STUDIO.",
      "Associer systématiquement vos posts au partenaire permet de compter les livrables sans erreur.",
      "Le rapport PDF se base sur les données de la campagne : gardez les dates à jour pour un compte-rendu exact.",
    ],
    related: ["planifier", "publier", "pipeline"],
  },
  {
    id: "stats",
    title: "Analyser les statistiques Instagram",
    keywords: [
      "stats", "statistiques", "csv", "fichier", "importer", "instagram", "taux",
      "engagement", "portee", "portée", "likes", "commentaires", "ratio", "analyse",
      "dashboard stats", "tendances",
    ],
    phrases: [
      "comment importer les stats",
      "telecharger le csv",
      "comment analyser les statistiques",
      "voir les tendances",
      "quest ce que le taux d engagement",
      "importer un csv instagram",
      "comprendre les graphiques",
    ],
    description:
      "La page Statistiques mesure l'impact des publications. Le flux de travail est simple : exporter un CSV depuis Instagram (Applications et outils) et le déposer dans la zone prévue. La page calcule alors différents indicateurs — taux d'engagement, répartition par format, meilleurs posts, comparaison de métriques et un nuage de points engagement vs portée (chaque point = un post).",
    steps: [
      "Ouvrez la page Statistiques.",
      "Depuis Instagram (Paramètres → Applications et outils), exportez les données des posts au format CSV.",
      "Déposez le fichier CSV dans la zone prévue : les graphiques se mettent à jour immédiatement.",
    ],
    tips: [
      "Exporter régulièrement pour suivre la tendance sur la durée plutôt qu'un instantané.",
      "Reliez les pics d'engagement aux formats : comparez publications vs carrousels pour choisir le bon gabarit.",
      "Un taux d'engagement par publication supérieur à la moyenne de vos comptes = format gagnant à reproduire.",
    ],
    related: ["publier", "pipeline"],
  },
  {
    id: "drive",
    title: "Explorer le Drive et ses exports",
    keywords: [
      "drive", "explorer", "fichiers", "dossier", "upload", "telecharger", "exports",
      "google", "cloud", "stockage", "fichiers",
    ],
    phrases: [
      "comment voir les fichiers drive",
      "ou sont les exports",
      "acceder au drive",
      "activer le drive",
      "configurer le drive",
      "chercher un fichier",
      "lister les fichiers drive",
    ],
    description:
      "La page Drive liste les fichiers accessibles dans le dossier Google Drive partagé de l'équipe et indique l'état de connexion (configuré / connecté). C'est le lieu où arrivent les exports d'images et de posts produits par STUDIO. Note : tant que le Drive n'a pas été configuré (identifiants Google), la page affiche un état « non configuré » avec la marche à suivre.",
    steps: [
      "Ouvrez la page Drive.",
      "Vérifiez l'état : si non configuré, suivez les instructions affichées (variables appliquées par l'administrateur + autorisation Google).",
      "Naviguez dans les dossiers et sous-dossiers ; récupérez les fichiers exportés par STUDIO.",
    ],
    tips: [
      "L'export STUDIO écrit directement dans le Drive partagé quand la configuration est active.",
      "En attendant, les exports peuvent être récupérés en local (téléchargement direct) — vérifiez le chemin indiqué dans STUDIO.",
      "Piège à connaître tant que le Drive n'est pas configuré : RADAR n'est jamais prévenu d'un export réussi en local. La page « Prêt à publier » n'affiche pas de badge « Exporté » et garde le bouton « Créer un post » — ce n'est pas un bug, notez vous-même quels articles sont déjà exportés en ZIP.",
    ],
    related: ["studio_export", "pipeline"],
  },
  {
    id: "pipeline",
    title: "Comprendre le pipeline (cron 4h)",
    keywords: [
      "pipeline", "cron", "automatique", "robot", "tache planifiee", "planification",
      "ingestion", "rss", "clustering", "score", "embeddings", "generation matinale",
      "nuit", "lancement", "deroule", "processus",
    ],
    phrases: [
      "comment fonctionne le pipeline",
      "quest ce que le cron",
      "comment se deroule le traitement automatique",
      "quet ce que la generation matinale",
      "comment arrivent les brouillons",
      "qui lance le pipeline",
      "quand tourne le pipeline",
      "comment relancer le pipeline",
    ],
    description:
      "RADAR tourne en continu (toutes les 4 heures) un pipeline automatique : ingestion des flux RSS, calcul d'embeddings locaux (aucun coût API), regroupement en sujets, calcul du score composite (pertinence, urgence, marginalité) et auto-génération matinale des brouillons. Un brouillon dont le score de confiance dépasse un second seuil (plus strict que le simple contrôle qualité) saute aussi la revue humaine du texte et devient directement un post à confirmer sur /ready — voir la fiche « confirmer ». Vous pouvez aussi lancer le pipeline à la demande.",
    steps: [
      "Sans action de votre part, le pipeline tourne toutes les 4 heures.",
      "Observez le résultat du matin : le tableau de bord distingue les brouillons « prêts à confirmer » (auto-validés, score au-dessus du seuil) des brouillons « à valider » (le reste).",
      "Pour forcer une exécution, utilisez le bouton de relance disponible (démarrage pipeline).",
    ],
    tips: [
      "Des embeddings locaux signifient zéro coût d'API : le traitement peut tourner sans risque de quota.",
      "Plus vos corrections sont prises en compte, plus la génération du matin correspond à votre style (cf. corrections).",
      "Le seuil d'auto-validation est volontairement mesuré : le but n'est jamais de se retrouver sans aucun article, juste d'éviter de relire ce qui est déjà assez fiable.",
    ],
    related: ["brouillons", "confirmer", "corrections", "veille", "dashboard"],
  },
  {
    id: "brouillons",
    title: "Les brouillons du matin générés par l'IA",
    keywords: [
      "brouillons", "brouillon", "matin", "generation matinale", "cartes",
      "generé par ia", "auto", "automatique", "valide", "rejet", "controle qualite",
      "resume", "condense", "brave",
    ],
    phrases: [
      "que sont les brouillons du matin",
      "comment sont generes les brouillons",
      "pourquoi certaines cartes sont rejetees",
      "combien de brouillons ce matin",
      "que signifie genere par ia",
      "ouvrir une carte brouillon",
      "les brouillons automatiques",
    ],
    description:
      "Chaque matin, le pipeline génère des brouillons d'articles à partir du brief le plus pertinent. Le tableau de bord affiche ces brouillons sous forme de cartes marquées « GÉNÉRÉ PAR L'IA ». Les brouillons qui n'ont pas passé le contrôle qualité automatique sont retirés — si rien ne reste, c'est une information, pas un bug. Parmi ceux qui restent, deux groupes de cartes distincts : les cartes vertes « Auto-validé, prêt à confirmer » (score de confiance assez haut, mènent directement à /ready) et les cartes classiques « à valider » (mènent à la fiche événement, comme avant).",
    steps: [
      "Le matin, ouvrez le tableau de bord.",
      "Les cartes vertes « prêt à confirmer » vous envoient directement sur /ready — article et visuel déjà prêts, personne ne les a relus.",
      "Les cartes « à valider » vous envoient sur la fiche événement pour une relecture classique.",
    ],
    tips: [
      "Le nombre de brouillons passés vs tentés (« X/Y ont passé le contrôle qualité ») est un thermomètre de la fiabilité du robot ; le nombre auto-validés en plus dit combien ont sauté votre relecture ce matin-là.",
      "Une carte rejetée peut être régénérée via la page de l'événement : le robot n'écrase jamais ce que vous validez vous-même.",
      "Utilisez les cartes « à valider » comme point de départ : il est plus rapide de corriger un bon brouillon que de partir de zéro.",
    ],
    related: ["pipeline", "rediger", "valider", "confirmer", "dashboard"],
  },
  {
    id: "corrections",
    title: "Apprendre de vos corrections (guide de style)",
    keywords: [
      "corrections", "correction", "style", "voix", "regles", "erreurs", "interdits",
      "recurrence", "ligne editoriale", "ton", "formules", "bannir", "listes",
    ],
    phrases: [
      "comment fonctionnent les corrections",
      "ou sont mes regles de style",
      "comment corriger le style",
      "que voit le robot de mes corrections",
      "comment interdire une formulation",
      "le guide de style",
      "les formules interdites",
    ],
    description:
      "Le système de corrections enregistre vos retours : chaque fois qu'un texte est corrigé, une règle de style est potentiellement générée (formules interdites, formulations bannies, mots attendus à la place). La page Corrections liste ces règles pour les appliquer à vos textes. Un guide de style (page dédiée) centralise ces règles maison.",
    steps: [
      "Ouvrez la page Corrections (barre latérale).",
      "Consultez les modules créés : règles attendues vs interdites, motif de récurrence.",
      "Activez/désactivez les règles pour piloter le style des générations futures.",
    ],
    tips: [
      "Corrigez systématiquement dans la page événement : c'est ainsi que le robot apprend votre style.",
      "Les fréquences de correction mettent en avant les tics de langage à bannir (ex. « la firme »).",
      "Le guide de style est visible côté STUDIO pour un rendu cohérent sur le titre aussi.",
    ],
    related: ["style_guide", "rediger", "brouillons"],
  },
  {
    id: "style_guide",
    title: "Le guide de style",
    keywords: [
      "style", "guide", "regles", "voix", "ton", "tutoiement", "vouvoiement",
      "format", "en-tete", "publier", "marque", "regles maison", "ligne", "edito",
    ],
    phrases: [
      "comment encadrer le style",
      "ou est le guide de style",
      "que doit suivre un article",
      "le ton des publications",
      "regles de redaction",
      "ce qu un article doit respecter",
    ],
    description:
      "Le guide de style est la constitution rédactionnelle : il définit la voix, le registre (tutoiement/vouvoiement), la longueur, les règles maison et l'en-tête d'article (format attendu). C'est l'instance de référence que le robot consulte lors de la génération, et que vous consultez pour toute question rédactionnelle.",
    steps: [
      "Ouvrez la page Style-Guide / Guide de style.",
      "Relisez les sections : voix, registre, longues, règles maison.",
      "Utilisez ces règles dans vos validations (un texte hors style sera rejeté).",
    ],
    tips: [
      "Un style clair rend les corrections du robot bien plus pertinentes et cohérentes.",
      "Mettez à jour le guide dès qu'une règle nouvelle fait consensus dans l'équipe.",
    ],
    related: ["corrections", "rediger", "valider"],
  },
  {
    id: "studio",
    title: "Créer un post visuel dans STUDIO",
    keywords: [
      "studio", "post", "visuel", "gabarit", "template", "image", "titre",
      "carrousel", "montage", "export", "créer le visuel", "titre du post",
      "générer le visuel", "apercu", "render", "v1",
    ],
    phrases: [
      "comment creer le visuel",
      "comment utiliser studio",
      "creer le post visuel",
      "choisir le gabarit",
      "comment exporter le visuel",
      "generer les bulles",
      "modifier le titre",
      "creer un carrousel",
    ],
    description:
      "STUDIO est l'atelier du visuel. Le parcours type est : recevoir un sujet pré-rempli depuis RADAR (titre, image, sources), choisir un gabarit 1A, 1B, 1C, 2A, 2B, 3A ou 3B, ajuster le titre et l'image (recadrage intelligent, découpage), vérifier l'aperçu puis exporter (HD / vers Drive). C'est là que se fabrique ce qui sera publié.",
    steps: [
      "Depuis RADAR, cliquez « Créer un post » : vous arrivez dans STUDIO avec le sujet rempli.",
      "Choisissez le gabarit selon le format visé (publication, carrousel, devis).",
      "Ajustez titre et images, validez l'aperçu et lancez l'export.",
    ],
    tips: [
      "Le pré-remplissage RADAR → STUDIO transporte titre + image + sources : gagnez du temps en ne le resaisissant pas.",
      "Le gabarit se choisit selon le format attendu (un post slide_unique vs un carrousel).",
      "Vérifiez le rendu avant export : l'aperçu doit être strictement identique à la sortie.",
    ],
    link: { label: "Ouvrir STUDIO", href: "$STUDIO", external: true, hint: "ouvre l'atelier visuel dans un nouvel onglet" },
    related: ["publier", "drive", "planifier"],
  },
  {
    id: "raccourcis",
    title: "Les raccourcis clavier",
    keywords: [
      "raccourcis", "clavier", "touches", "keyboard", "touche", "echap", "esc",
      "ctrl", "entrer", "echape", "navigation", "focus",
    ],
    phrases: [
      "quels sont les raccourcis",
      "comment naviguer au clavier",
      "toutes les touches utiles",
      "liste des raccourcis",
      "changer de page au clavier",
      "valider avec ctrl entrer",
    ],
    description:
      "Les pages principales s'ouvrent chacune avec une lettre : V (veille), R (prêts à publier), C (corrections), S (stats), P (partenaires), K (calendrier). Sur la fiche événement, F (ou Échap pour sortir) active le mode focus, et les chiffres 1 à 4 sélectionnent une colonne (Sources → Brief → Article → Validation). Ctrl+Entrée valide rapidement. [ replie ou déplie la barre latérale. ? affiche l'aide clavier à tout moment.",
    steps: [
      "Appuyez sur ? sur n'importe quelle page pour afficher la liste complète.",
      "Utilisez V, R, C, S, P, K pour changer de page sans toucher la souris.",
      "Sur une fiche événement, F active le mode focus puis 1-4 déplace le focus entre les colonnes ; Ctrl+Entrée valide.",
    ],
    tips: [
      "Le mode focus (touche F) affiche les raccourcis directement dans la page — pas besoin de les retenir par cœur au début.",
      "Apprenez V, R, C, S, P, K en premier : ce sont les 6 pages que vous ouvrez le plus souvent.",
      "? rappelle la liste à tout moment, sur n'importe quelle page.",
    ],
    related: ["valider", "rediger", "dashboard"],
  },
  {
    id: "image_visuels",
    title: "Choisir les bonnes images",
    keywords: [
      "image", "images", "visuels", "photo", "photo", "og image", "visuel titre",
      "hierarchie", "couvrante", "apercu", "vignette", "aperçues", "photo de l article",
      "recadrage", "cropper",
    ],
    phrases: [
      "comment choisir l image",
      "quelle image utiliser",
      "la hierarchie des visuels",
      "renforcer l image de l article",
      "quelle image pour le post",
      "recadrer l image",
      "activer le recadrage intelligent",
    ],
    description:
      "La hiérarchie des visuels détermine quelle image illustre un article, par ordre de préférence : og:image, puis twitter:image, puis l'image de la page, puis l'enclosure RSS du flux. Attention : cette recherche automatique se déclenche quand vous ouvrez la fiche d'un événement, pas en tâche de fond pendant le cron — le compteur « visuels trouvés » du pipeline reste à 0 même quand des images RSS sont bien arrivées. Le recadrage intelligent (STUDIO) ajuste ensuite automatiquement la zone de l'image au format cible (portrait, carré, carrousel).",
    steps: [
      "Dans la fiche événement, vérifiez l'image associée (colonne source / article).",
      "Si aucune image n'est présente ou qu'elle ne convient pas, lancez la recherche manuelle d'image.",
      "Dans STUDIO, activez le recadrage intelligent pour adapter l'image au format du gabarit.",
    ],
    tips: [
      "Un visuel fort fait la moitié du post : préférez toujours une image nette plutôt que « pas d'image ».",
      "Le recadrage intelligent évite les déformations : vérifiez quand même le rendu final.",
      "Les carrousels utilisent jusqu'à 5 images : le pipeline détoure et traite vos images.",
    ],
    related: ["veille", "rediger", "studio"],
  },
];

export const RADAR_STARTERS = [
  "rediger",
  "publier",
  "brouillons",
  "raccourcis",
  "pipeline",
];

export const RADAR_DIRECTORY = RADAR_KNOWLEDGE.map((f) => f.title);