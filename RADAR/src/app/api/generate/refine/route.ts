import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { article_id, instruction } = body;

  if (!article_id || !instruction) {
    return NextResponse.json({ error: 'article_id and instruction required' }, { status: 400 });
  }

  const db = getDb();

  const article = db.prepare(`
    SELECT a.*, b.headline, b.lede, b.body as brief_body
    FROM articles a
    JOIN briefs b ON b.id = a.brief_id
    WHERE a.id = ?
  `).get(article_id) as {
    id: number;
    event_id: number;
    title: string;
    content: string;
    chapeau: string | null;
    headline: string;
    lede: string | null;
    brief_body: string | null;
  } | undefined;

  if (!article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 });
  }

  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

  const prompt = `Tu es un rédacteur automobile expert. Voici l'article actuel :

---
${article.content}
---

**Instruction de correction** : ${instruction}

Réécris l'article en appliquant uniquement la demande. Ne modifie pas le reste. Réponds UNIQUEMENT avec le nouveau texte de l'article, sans commentaire.`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Tu es un rédacteur automobile. Tu réponds UNIQUEMENT avec le texte de l\'article, sans commentaire ni explication.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `LLM error: ${err}` }, { status: 500 });
    }

    const data = await res.json();
    const newContent = data.choices?.[0]?.message?.content?.trim();

    if (!newContent) {
      return NextResponse.json({ error: 'Empty response from LLM' }, { status: 500 });
    }

    // Save the refined article
    const wordCount = newContent.split(/\s+/).length;
    db.prepare(`
      UPDATE articles
      SET content = ?, word_count = ?, generated_at = datetime('now')
      WHERE id = ?
    `).run(newContent, wordCount, article_id);

    return NextResponse.json({
      id: article_id,
      content: newContent,
      word_count: wordCount,
    });
  } catch (err) {
    return NextResponse.json({ error: `Network error: ${err}` }, { status: 500 });
  }
}
