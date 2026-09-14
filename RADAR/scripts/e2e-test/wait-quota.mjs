import Groq from 'groq-sdk';
import fs from 'fs';

const key = fs.readFileSync('.env.local', 'utf8').match(/^GROQ_API_KEY=(.+)$/m)[1].trim();
const groq = new Groq({ apiKey: key });

async function tryOnce() {
  try {
    const r = await groq.chat.completions.create({
      messages: [{ role: 'user', content: 'Écris exactement 3 phrases sur les voitures de sport en français, style journalistique.' }],
      model: 'openai/gpt-oss-120b',
      max_tokens: 6000,
      reasoning_effort: 'low',
    });
    return { ok: true, text: r.choices[0].message.content, usage: r.usage };
  } catch (e) {
    const match = e.message.match(/try again in ([\dms.]+)/);
    return { ok: false, retryAfter: match ? match[1] : '?', message: e.message.slice(0, 150) };
  }
}

async function main() {
  for (let i = 0; i < 30; i++) {
    const r = await tryOnce();
    if (r.ok) {
      console.log(`QUOTA_READY après ${i} tentative(s):`, r.text.slice(0, 80));
      console.log('usage:', JSON.stringify(r.usage));
      process.exit(0);
    }
    console.log(`[${new Date().toISOString()}] pas encore prêt, retry-after=${r.retryAfter}`);
    await new Promise(res => setTimeout(res, 60000));
  }
  console.log('QUOTA_TIMEOUT après 30 tentatives');
  process.exit(1);
}

main();
