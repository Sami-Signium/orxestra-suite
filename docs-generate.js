export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const body = req.body;
  const { mode, language } = body;
  const isDE = (language || 'DE') === 'DE';
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (mode === 'extract') {
    const { fileBase64, mediaType, docxText } = body;

    const systemPrompt = isDE
      ? `Du bist ein Executive Search Berater bei Orxestra. Analysiere das hochgeladene Dokument und extrahiere alle relevanten Informationen. Antworte NUR mit einem JSON-Objekt, kein Text davor oder danach, keine Markdown-Backticks. JSON-Struktur: {"positionTitle":"","clientCompany":"","clientContactName":"","clientContactLastName":"","clientSalutation":"","clientAddress":"","clientCity":"","clientEmail":"","companyProfile":"Professioneller Fliesstext 200-300 Woerter","positionDescription":"Professioneller Fliesstext 150-250 Woerter","functionalTargets":[],"industryTargets":[],"geoTargets":[]}`
      : `You are an Executive Search consultant at Orxestra. Analyse the uploaded document and extract all relevant information. Respond ONLY with a JSON object, no text before or after, no markdown backticks. JSON structure: {"positionTitle":"","clientCompany":"","clientContactName":"","clientContactLastName":"","clientSalutation":"","clientAddress":"","clientCity":"","clientEmail":"","companyProfile":"Professional prose 200-300 words","positionDescription":"Professional prose 150-250 words","functionalTargets":[],"industryTargets":[],"geoTargets":[]}`;

    try {
      let messages;

      if (docxText) {
        // DOCX: text extracted in browser via mammoth.js
        const userMsg = isDE
          ? `Analysiere diesen Text und extrahiere alle Felder als JSON:\n\n${docxText}`
          : `Analyse this text and extract all fields as JSON:\n\n${docxText}`;
        messages = [{ role: 'user', content: userMsg }];
      } else {
        // PDF: base64 encoded
        const userMsg = isDE
          ? 'Analysiere dieses Dokument und extrahiere alle Felder als JSON.'
          : 'Analyse this document and extract all fields as JSON.';
        messages = [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: mediaType, data: fileBase64 } },
          { type: 'text', text: userMsg }
        ]}];
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          system: systemPrompt,
          messages,
        }),
      });

      if (!response.ok) throw new Error(`API ${response.status}`);
      const data = await response.json();
      const raw = data.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
      const clean = raw.replace(/^```json\s*/i,'').replace(/^```/,'').replace(/```$/,'').trim();
      const extracted = JSON.parse(clean);
      return res.status(200).json({ extracted });

    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (mode === 'company') {
    const { company } = body;
    const system = isDE
      ? `Du bist ein Executive Search Berater bei Orxestra. Schreibe ein professionelles Unternehmensprofil fuer ein Angebot. Stil: sachlich, praezise, 3-5 Absaetze, ca. 200-300 Woerter. Nur Fliesstext, keine Aufzaehlungen. Auf Deutsch.`
      : `You are an Executive Search consultant at Orxestra. Write a professional company profile for a proposal. Style: factual, precise, 3-5 paragraphs, approx. 200-300 words. Plain prose only, no bullets. In English.`;
    const userMsg = isDE
      ? `Recherchiere das Unternehmen "${company}" und schreibe ein Unternehmensprofil fuer unser Executive Search Angebot.`
      : `Research the company "${company}" and write a company profile for our Executive Search proposal.`;
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'web-search-2025-03-05' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system,
          messages: [{ role: 'user', content: userMsg }],
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        }),
      });
      if (!response.ok) throw new Error(`API ${response.status}`);
      const data = await response.json();
      const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      return res.status(200).json({ text });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (mode === 'position') {
    const { company, positionTitle, keywords } = body;
    const system = isDE
      ? `Du bist ein Executive Search Berater bei Orxestra. Schreibe eine professionelle Positionsbeschreibung fuer ein Angebot. Stil: praezise, 2-3 Absaetze, ca. 150-250 Woerter. Nur Fliesstext, keine Aufzaehlungen. Auf Deutsch.`
      : `You are an Executive Search consultant at Orxestra. Write a professional position description for a proposal. Style: precise, 2-3 paragraphs, approx. 150-250 words. Plain prose only, no bullets. In English.`;
    const userMsg = isDE
      ? `Unternehmen: ${company || '(nicht angegeben)'}\nPosition: ${positionTitle || ''}\nStichworte: ${keywords || '(keine weiteren Angaben)'}\n\nSchreibe eine professionelle Positionsbeschreibung.`
      : `Company: ${company || '(not specified)'}\nPosition: ${positionTitle || ''}\nKeywords: ${keywords || '(none)'}\n\nWrite a professional position description.`;
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system,
          messages: [{ role: 'user', content: userMsg }],
        }),
      });
      if (!response.ok) throw new Error(`API ${response.status}`);
      const data = await response.json();
      const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      return res.status(200).json({ text });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Unknown mode' });
}
