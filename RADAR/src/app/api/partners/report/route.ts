import { NextResponse } from 'next/server';
import { generatePartnerReport } from '@/lib/partners';
import { chromium } from 'playwright';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const report = generatePartnerReport(parseInt(id));
    if (!report) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    // Generate HTML report
    const html = generateReportHTML(report);

    // Use Playwright to generate PDF
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      printBackground: true,
    });

    await browser.close();

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="rapport-${report.partner.name.replace(/\s+/g, '-').toLowerCase()}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

function generateReportHTML(report: ReturnType<typeof generatePartnerReport> & object): string {
  if (!report) return '';
  
  const { partner, period, posts, summary } = report;
  
  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #18181b; line-height: 1.5; }
        .container { max-width: 800px; margin: 0 auto; padding: 40px; }
        .header { margin-bottom: 40px; border-bottom: 2px solid #e4e4e7; padding-bottom: 20px; }
        .header h1 { font-size: 24px; font-weight: 600; margin-bottom: 8px; }
        .header p { color: #71717a; font-size: 14px; }
        .summary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 40px; }
        .summary-card { background: #f4f4f5; padding: 16px; border-radius: 8px; }
        .summary-card .label { font-size: 12px; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; }
        .summary-card .value { font-size: 24px; font-weight: 600; margin-top: 4px; }
        .posts { margin-top: 40px; }
        .posts h2 { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
        .post { border: 1px solid #e4e4e7; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
        .post-header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px; }
        .post-title { font-weight: 500; }
        .post-meta { font-size: 12px; color: #71717a; }
        .post-stats { display: flex; gap: 24px; font-size: 13px; }
        .stat { display: flex; align-items: center; gap: 4px; }
        .stat-label { color: #71717a; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e4e4e7; font-size: 12px; color: #a1a1aa; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Rapport Partenaire</h1>
          <p>${partner.name}${partner.brand ? ` — ${partner.brand}` : ''}</p>
          <p>Période : ${new Date(period.start).toLocaleDateString('fr-FR')} — ${new Date(period.end).toLocaleDateString('fr-FR')}</p>
        </div>

        <div class="summary">
          <div class="summary-card">
            <div class="label">Publications</div>
            <div class="value">${summary.total_posts}</div>
          </div>
          <div class="summary-card">
            <div class="label">Engagement moyen</div>
            <div class="value">${summary.avg_engagement}%</div>
          </div>
        </div>

        <div class="posts">
          <h2>Détail des publications</h2>
          ${posts.map(post => `
            <div class="post">
              <div class="post-header">
                <div class="post-title">${post.title}</div>
                <div class="post-meta">${post.published_at ? new Date(post.published_at).toLocaleDateString('fr-FR') : '—'}</div>
              </div>
              ${post.chapeau ? `<p style="font-size: 13px; color: #52525b; margin-bottom: 8px;">${post.chapeau}</p>` : ''}
              <div class="post-stats">
                ${post.engagement_rate !== undefined ? `
                  <div class="stat">
                    <span class="stat-label">Engagement:</span>
                    <span>${post.engagement_rate}%</span>
                  </div>
                ` : ''}
                ${post.reach !== undefined ? `
                  <div class="stat">
                    <span class="stat-label">Portée:</span>
                    <span>${post.reach.toLocaleString('fr-FR')}</span>
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>

        <div class="footer">
          Le Média Automobile — Rapport généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}
        </div>
      </div>
    </body>
    </html>
  `;
}
