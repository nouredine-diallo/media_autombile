import { translateTextLocal } from "../../src/lib/translateLocal";

async function main() {
  const samples = [
    "Toyota unveils the new Land Cruiser with a hybrid powertrain and 300 horsepower.",
    "The car will be available starting next year at a price of $45,000, offering improved fuel efficiency compared to the previous generation.",
    "Aston Martin has revealed the Valen, its most powerful V12 ever built, on the Concept Lawn 2026.",
  ];

  for (const s of samples) {
    const start = Date.now();
    const result = await translateTextLocal(s);
    console.log(`\nEN: ${s}`);
    console.log(`FR: ${result}`);
    console.log(`(${Date.now() - start}ms)`);
  }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
