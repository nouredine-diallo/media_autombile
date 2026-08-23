// Vérifie qu'aucune longueur de titre ne fait remonter le bandeau sur la photo.
import { chromium } from "playwright";

const BASE = process.env.STUDIO_BASE_URL ?? "http://localhost:4100";
const IDS = (process.env.REUSE_IDS ?? "").split(",");
const TITRES = [
  "Porsche 963 : le nouveau monstre de l'endurance",
  "Mercedes SL 60 AM : le roadster qui mêle luxe rétro et technologie moderne",
  "Erling Haaland possède l'une des rares Mercedes-AMG One, estimée à plus de 3 millions de dollars",
  "Renault 5 E-Tech : la citadine électrique qui revisite une icône des années 80 avec un habitacle résolument futuriste",
];

const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1080, height: 1350 } });
c.setDefaultTimeout(240_000); c.setDefaultNavigationTimeout(240_000);
const p = await c.newPage();
await p.goto(`${BASE}/login`); await p.fill("#password", process.env.AUTH_PASSWORD);
await p.click('button[type="submit"]'); await p.waitForURL(`${BASE}/`);

const HAUTEUR_PHOTO = 0.74;
for (const titre of TITRES) {
  const params = new URLSearchParams({
    imageUrl: `/api/images/${IDS[0]}?variant=backdrop`,
    bulle1Url: `/api/images/${IDS[1]}?variant=bulle`,
    bulle2Url: `/api/images/${IDS[2]}?variant=bulle`,
    title: titre,
  });
  await p.goto(`${BASE}/render/3a?${params}`, { waitUntil: "networkidle" });
  const el = await p.waitForSelector('[data-gabarit="3a"]');
  const r = await el.evaluate((n) => {
    const bloc = n.querySelector("p.font-bold");
    const box = bloc.getBoundingClientRect();
    const cadre = n.getBoundingClientRect();
    return {
      haut: (box.top - cadre.top) / cadre.height,
      taille: getComputedStyle(bloc).fontSize,
      lignes: Math.round(box.height / parseFloat(getComputedStyle(bloc).lineHeight)),
    };
  });
  const ok = r.haut >= HAUTEUR_PHOTO;
  console.log(
    `${String(titre.length).padStart(3)} car.  corps ${r.taille.padStart(6)}  ${r.lignes} lignes  ` +
    `haut du titre ${(r.haut * 100).toFixed(1)} %  ${ok ? "OK" : "SUR LA PHOTO"}`,
  );
}
await b.close();
