export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const NEWS_API_KEY = process.env.NEWSAPI_KEY;
    const OTS_KEY = process.env.OTS_KEY;

    // 7 Tage zurück
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);
    const from = fromDate.toISOString().split('T')[0];
    const fromUnix = Math.floor(fromDate.getTime() / 1000);

    const allArticles = [];

    // --- APA-OTS: Primäre AT-Quelle mit Zeitfilter ---
    const otsQueries = [
      'Vorstandsvorsitzender',
      'Vorstandsvorsitzende',           // weibliche Form
      'Gesch%C3%A4ftsf%C3%BChrer+Wechsel',
      'Gesch%C3%A4ftsf%C3%BChrerin',   // weibliche Form
      'CEO+bestellt',
      'CFO+bestellt',
      'CHRO+bestellt',
      'COO+bestellt',
      'Aufsichtsrat+Bestellung',
      'Aufsichtsratsvorsitzender',
      '%C3%9Cbernahme+Akquisition',
      'Fusion+Merger',
    ];

    for (const q of otsQueries) {
      try {
        // von=Unix-Timestamp begrenzt auf letzte 7 Tage
        const url = `https://www.ots.at/api/liste?app=${OTS_KEY}&query=${q}&inhalt=alle&anz=20&sourcetype=OTS&format=json&von=${fromUnix}`;
        const r = await fetch(url);
        if (r.ok) {
          const d = await r.json();
          (d.ergebnisse || []).forEach(a => allArticles.push({
            title: a.TITEL,
            description: a.LEAD || '',
            url: a.WEBLINK,
            source: 'AT-OTS',
            published_at: a.DATUM || null
          }));
        }
      } catch(e) {}
    }

    // --- AT-Medien Scraping: Leadersnet, Top Leader, Horizont ---
    const atMediaSources = [
      {
        name: 'Leadersnet',
        url: 'https://www.leadersnet.at/',
        linkPattern: /href="(\/news\/\d+,[^"]+\.html)"/g,
        titlePattern: /class="[^"]*title[^"]*"[^>]*>([^<]{10,150})</g,
        baseUrl: 'https://www.leadersnet.at',
      },
      {
        name: 'Top-Leader',
        url: 'https://top-leader.at/category/people/karrieremeldungen/',
        linkPattern: /href="(https:\/\/top-leader\.at\/(?!category|tag|author|page)[^"#?]+)"/g,
        titlePattern: /class="[^"]*title[^"]*"[^>]*>([^<]{10,150})</g,
        baseUrl: '',
      },
      {
        name: 'Horizont-AT',
        url: 'https://www.horizont.at/agenturen/menschen/',
        linkPattern: /href="(\/agenturen\/menschen\/[^"]+)"/g,
        titlePattern: /class="[^"]*title[^"]*"[^>]*>([^<]{10,120})</g,
        baseUrl: 'https://www.horizont.at',
      },
    ];

    for (const src of atMediaSources) {
      try {
        const r = await fetch(src.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SigniumPAUL/1.0; +https://signium.com)',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'de-AT,de;q=0.9',
          },
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) continue;
        const html = await r.text();

        // Extrahiere Links
        const links = [];
        let m;
        const linkRe = new RegExp(src.linkPattern.source, 'g');
        while ((m = linkRe.exec(html)) !== null && links.length < 30) {
          const href = m[1].startsWith('http') ? m[1] : src.baseUrl + m[1];
          if (!links.includes(href)) links.push(href);
        }

        // Extrahiere Titel aus H2/H3 Tags (grobe Zuordnung)
        const titles = [];
        const titleRe = new RegExp(src.titlePattern.source, 'g');
        while ((m = titleRe.exec(html)) !== null && titles.length < 30) {
          const t = m[1].replace(/\s+/g, ' ').trim();
          if (t.length > 10) titles.push(t);
        }

        links.forEach((href, idx) => {
          // URL-Slug als Fallback-Titel: letzten Pfadteil dekodieren
          const slug = decodeURIComponent(href.split('/').filter(Boolean).pop() || '')
            .replace(/[-_]/g, ' ').replace(/\.\w+$/, '').substring(0, 120);
          allArticles.push({
            title: titles[idx] || slug || `${src.name} Personalien`,
            description: '',
            url: href,
            source: src.name,
            published_at: new Date().toISOString().split('T')[0],
          });
        });
      } catch(e) {
        // Lautloser Fehler — Scraping kann jederzeit fehlschlagen
      }
    }

    // --- NewsAPI: DE und CEE ---
    const newsQueries = [
      { q: '(Vorstandswechsel OR "neuer Vorstandsvorsitzender" OR "neuer CEO" OR "neuer CFO" OR "neuer CHRO") AND (DAX OR MDAX OR Deutschland)', language: 'de', label: 'DE' },
      { q: '(Übernahme OR Fusion OR Akquisition) AND (DAX OR MDAX OR Deutschland)', language: 'de', label: 'DE' },
      { q: '(CEO OR CFO OR "chief executive" OR "managing director") AND (Austria OR Vienna OR OMV OR Verbund OR Voestalpine OR Raiffeisen OR "Erste Group")', language: 'en', label: 'AT-EN' },
      { q: '(acquisition OR merger OR takeover) AND (Austria OR Vienna OR Austrian)', language: 'en', label: 'AT-EN' },
      { q: '("new CEO" OR "new CFO" OR "appoints CEO" OR "CEO appointed") AND (Poland OR Romania OR Hungary OR "Czech Republic" OR Slovakia OR Warsaw OR Bucharest OR Budapest OR Prague)', language: 'en', label: 'CEE' },
      { q: '(acquisition OR merger OR takeover) AND (Poland OR Romania OR Hungary OR "Czech Republic" OR Slovakia)', language: 'en', label: 'CEE' },
    ];

    for (const q of newsQueries) {
      try {
        const params = new URLSearchParams({
          q: q.q, language: q.language, sortBy: 'publishedAt',
          pageSize: 100, from, apiKey: NEWS_API_KEY
        });
        const r = await fetch('https://newsapi.org/v2/everything?' + params);
        const d = await r.json();
        (d.articles || []).forEach(a => allArticles.push({
          title: a.title, description: a.description || '',
          url: a.url, source: q.label,
          published_at: a.publishedAt ? a.publishedAt.split('T')[0] : null
        }));
      } catch(e) {}
    }

    // Deduplizierung nach Titel
    const seen = new Set();
    const unique = allArticles.filter(a => {
      if (!a.title || seen.has(a.title)) return false;
      seen.add(a.title); return true;
    });

    if (!unique.length) return res.status(200).json({ text: '[]', articleCount: 0 });

    const summaries = unique.slice(0, 200).map((a, i) =>
      `[${i}] [${a.source}] ${a.title}${a.description ? ' | ' + a.description : ''} | URL: ${a.url}`
    ).join('\n');

    const articleMap = {};
    unique.slice(0, 200).forEach((a, i) => {
      articleMap[i] = { url: a.url, published_at: a.published_at };
    });

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 6000,
        messages: [{ role: 'user', content: `Du bist Analyst bei einer Executive Search Firma in Wien. Extrahiere relevante Business-Events aus diesen Artikeln.

WICHTIG: Jede Firma nur EINMAL aufnehmen — auch wenn mehrere Artikel über dieselbe Firma berichten.

Geografischer Fokus: Österreich, Deutschland, Schweiz, Polen, Rumänien, Ungarn, Tschechien, Slowakei.
Internationale Firmen (USA, UK, Asien etc.) NUR aufnehmen wenn sie explizit DACH/CEE Bezug haben.

Relevante Events — ALLE aufnehmen:
- Führungswechsel: CEO, CFO, COO, CHRO, CSO, Vorstandsvorsitzender, Geschäftsführer, Managing Director
- Aufsichtsrat: Neue Mitglieder, Rücktritte, Vorsitzwechsel
- M&A: Übernahmen, Fusionen, Beteiligungen, Akquisitionen
- Funding: Finanzierungsrunden, Kapitalerhöhungen
- Restrukturierung: Stellenabbau, Umstrukturierung, Insolvenz
- Expansion: Markteintritt DACH/CEE, neue Standorte

Gib NUR ein JSON Array zurück, ohne Markdown, ohne Erklärungen:
[{"article_index": 0, "company":"Firmenname","trigger_type":"CEO-Wechsel","description":"Kurze deutsche Beschreibung max 2 Sätze"}]

Erlaubte trigger_type Werte: "CEO-Wechsel", "CFO-Wechsel", "CHRO-Wechsel", "COO-Wechsel", "Geschaeftsfuehrer-Wechsel", "Neuer Vorstand", "Aufsichtsrat-Bestellung", "Aufsichtsrat-Ruecktritt", "M&A / Fusion", "Funding", "Restrukturierung", "DACH-Expansion", "Sonstige"

Artikel:\n` + summaries }]
      })
    });

    const claudeData = await claudeRes.json();
    const raw = claudeData.content?.find(b => b.type === 'text')?.text || '[]';
    const s = raw.indexOf('['), e = raw.lastIndexOf(']');
    let items = [];
    try { if (s >= 0 && e > s) items = JSON.parse(raw.substring(s, e + 1)); } catch(err) {}

    // Deduplizierung nach Firma + trigger_type
    const seenCompanies = new Set();
    items = items.filter(it => {
      const key = `${it.company}|${it.trigger_type}`;
      if (!it.company || seenCompanies.has(key)) return false;
      seenCompanies.add(key); return true;
    });

    items = items.map(it => ({
      ...it,
      source_url: (it.article_index !== undefined && articleMap[it.article_index]) ? articleMap[it.article_index].url : null,
      published_at: (it.article_index !== undefined && articleMap[it.article_index]) ? articleMap[it.article_index].published_at : null
    }));

    return res.status(200).json({ text: JSON.stringify(items), articleCount: unique.length });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
