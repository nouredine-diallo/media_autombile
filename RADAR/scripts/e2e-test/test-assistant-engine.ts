import { answerQuery, getFicheById } from "../../src/lib/assistant/intents";
import { RADAR_KNOWLEDGE } from "../../src/lib/assistant/knowledge";

const queries = [
  "comment je fais pour publir un article", // typo volontaire : "publir"
  "je veux planifier une publication instagram",
  "c'est quoi la difference entre un carrousel et un post simple",
  "comment savoir si mon post est sur drive",
  "ou est ce que je vois mes stats instagram",
  "je cherche les raccourcis clavier",
  "comment faire un rapport pour un partenaire",
  "bonjour", // devrait ne rien matcher fortement
  "xyzabc", // charabia total
];

for (const q of queries) {
  const reply = answerQuery(q, RADAR_KNOWLEDGE);
  console.log(`\nQ: "${q}"`);
  console.log(`  match: ${reply.match ? reply.match.title : "AUCUN"} (score=${reply.confidence.toFixed(3)})`);
  console.log(`  suggestions: ${reply.suggestions.map((s) => s.title).join(" | ")}`);
}

console.log("\n--- getFicheById ---");
console.log(getFicheById(RADAR_KNOWLEDGE, "publier")?.title);
console.log(getFicheById(RADAR_KNOWLEDGE, "does-not-exist"));

console.log("\n--- tests de robustesse (faux positifs potentiels) ---");
const edgeQueries = [
  "comment ça va",
  "merci",
  "aide",
  "je ne comprends rien à cet outil",
  "quelle heure est il",
  "post",
  "image",
];
for (const q of edgeQueries) {
  const reply = answerQuery(q, RADAR_KNOWLEDGE);
  console.log(`Q: "${q}" -> ${reply.match ? reply.match.title : "AUCUN"} (${reply.confidence.toFixed(3)})`);
}
