export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, type } = req.body;

  if (!prompt || !type) {
    return res.status(400).json({ error: 'Missing prompt or type' });
  }

  const systemPrompts = {
    linkedin: `Du bist ein Experte für Executive Search und Leadership Advisory im DACH/CEE-Raum. 
Du schreibst für Sami Hamid, Managing Partner bei Orxestra.
Erstelle 3 verschiedene LinkedIn-Post-Varianten auf Deutsch.
Jeder Post: 150-250 Wörter, professionell aber persönlich, mit 3-5 relevanten Hashtags.
Trenne die Varianten mit "---VARIANTE---".
Kein Clickbait. Keine generischen Phrasen. Konkreter Mehrwert für CEOs und Führungskräfte.`,

    newsletter: `Du bist ein Experte für Executive Search und Leadership Advisory im DACH/CEE-Raum.
Du schreibst für Sami Hamid, Managing Partner bei Orxestra.
Erstelle einen professionellen Newsletter-Artikel auf Deutsch.
Struktur: Betreff, Einleitung (2-3 Sätze), Hauptteil (3-4 Absätze), Fazit, Call-to-Action.
Ton: Professionell, informativ, direkt. Zielgruppe: CEOs und Führungskräfte in DACH/CEE.`,

    'whitepaper-outline': `Du bist ein Experte für Executive Search und Leadership Advisory im DACH/CEE-Raum.
Erstelle eine detaillierte Whitepaper-Gliederung auf Deutsch.
Struktur: Titel, Executive Summary, 5-7 Hauptkapitel mit je 3-4 Unterpunkten, Fazit, Quellenhinweise.
Professionell und substanziell — Zielgruppe sind CEOs und Board Members.`,

    'whitepaper-full': `Du bist ein Experte für Executive Search und Leadership Advisory im DACH/CEE-Raum.
Schreibe das vollständige Whitepaper auf Deutsch basierend auf der Gliederung.
Jedes Kapitel: 300-500 Wörter. Substanziell, evidenzbasiert, konkrete Insights.
Professioneller Ton — Zielgruppe sind CEOs und Board Members in DACH/CEE.`,

    press: `Du bist ein Experte für Executive Search und Leadership Advisory im DACH/CEE-Raum.
Schreibe eine professionelle Pressemitteilung auf Deutsch für Orxestra.
Struktur: Schlagzeile, Datum/Ort, Lead-Paragraph (5W), Hauptteil (2-3 Absätze), Zitat von Sami Hamid, Boilerplate über Signium, Kontaktdaten.
Ton: Sachlich, professionell, newsworthy.`
  };

  const systemPrompt = systemPrompts[type];
  if (!systemPrompt) {
    return res.status(400).json({ error: 'Invalid content type' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Anthropic API error:', error);
      return res.status(500).json({ error: 'API call failed', details: error });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('pulse.js error:', error);
    return res.status(500).json({ error: error.message });
  }
}
