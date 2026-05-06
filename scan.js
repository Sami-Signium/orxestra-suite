import Anthropic from '@anthropic-ai/sdk';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

async function extractTextFromBase64(base64, mediaType) {
  const buffer = Buffer.from(base64, 'base64');
  if (mediaType === 'application/pdf') {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    return data.text;
  } else {
    // Word document
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { mode, fileBase64, mediaType, notes, mandate, candidates } = req.body;

  try {
    // ── MODE 1: JD ANALYSE ──
    if (mode === 'jd') {
      if (!fileBase64) return res.status(400).json({ error: 'Kein Dokument hochgeladen' });

      // Extract text from PDF/Word first, then send as plain text to Claude
      const extractedText = await extractTextFromBase64(fileBase64, mediaType || 'application/pdf');

      const prompt = `Analysiere dieses Jobprofil und erstelle LinkedIn-Suchkriterien und ein anonymes Jobprofil.
${notes ? '\nZusätzliche Berater-Notizen:\n' + notes : ''}

JOBPROFIL-TEXT:
${extractedText}

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt. Kein Text davor oder danach.

{
  "position": "Jobtitel",
  "sector": "Branche",
  "location": "Standort",
  "linkedin_criteria": {
    "job_titles": ["Titel 1", "Titel 2", "Titel 3"],
    "keywords": ["Keyword 1", "Keyword 2", "Keyword 3", "Keyword 4", "Keyword 5"],
    "seniority": ["Director", "VP"],
    "years_experience": "10+",
    "industries": ["Branche 1", "Branche 2"],
    "geography": ["Austria", "Germany", "Switzerland"],
    "education": "Master"
  },
  "linkedin_instructions": [
    "Schritt 1: Gehe auf linkedin.com/talent und melde dich an",
    "Schritt 2: Klicke auf Projekte → Neues Projekt erstellen → Namen eingeben → Erstellen",
    "Schritt 3: Klicke im Projekt auf Talentsuche",
    "Schritt 4: Berufsbezeichnung eingeben: [konkreter Titel aus job_titles] → Enter",
    "Schritt 5: + Filter hinzufügen klicken",
    "Schritt 6: Keywords eingeben: [konkrete Keywords] — jedes einzeln mit Enter bestätigen",
    "Schritt 7: Standort wählen: [konkrete Länder]",
    "Schritt 8: Branche wählen: [konkrete Branchen]",
    "Schritt 9: Berufserfahrung wählen: [years_experience]",
    "Schritt 10: Suche anwenden",
    "Schritt 11: Passendes Profil → In Projekt speichern klicken"
  ],
  "ajd": {
    "position": "Jobtitel",
    "company_context": "FLIESSTEXT 2-3 Sätze: Unternehmen anonym — kein Firmenname, nur Branche, Größe, Marktposition, geografische Präsenz.",
    "role_context": "FLIESSTEXT 2 Sätze: Kontext der Suche (Wachstum/Nachfolge/Transformation) und Einbettung der Rolle.",
    "responsibilities_text": "FLIESSTEXT 4-6 Sätze in einem Absatz: Alle Hauptaufgaben und Verantwortlichkeiten — KEINE Bullet Points, KEINE Listen, nur zusammenhängende Sätze.",
    "requirements_text": "FLIESSTEXT 4-6 Sätze in einem Absatz: Ausbildung, Erfahrung, Fachkenntnisse — KEINE Bullet Points, KEINE Listen, nur zusammenhängende Sätze.",
    "leadership_profile": "FLIESSTEXT 2-3 Sätze: Führungsprofil, Persönlichkeit, Führungsstil.",
    "offer": "FLIESSTEXT 2-3 Sätze: Vergütungspaket und Attraktivität der Position."
  }
}`;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }]
      });

      const text = response.content[0].text.trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Kein JSON: ' + text.substring(0, 150));
      const data = JSON.parse(jsonMatch[0]);
      return res.status(200).json({ success: true, data });
    }

    // ── MODE 2: KANDIDATEN SCREENING ──
    if (mode === 'screen') {
      if (!candidates || candidates.length === 0) return res.status(400).json({ error: 'Keine Kandidaten' });

      // Extract text from all candidate PDFs
      const candidateTexts = await Promise.all(candidates.map(async (c, i) => {
        let text = c.text || '';
        if (c.fileBase64) {
          try {
            text = await extractTextFromBase64(c.fileBase64, c.mediaType || 'application/pdf');
          } catch(e) { text = c.text || ''; }
        }
        return `--- Kandidat ${i+1}: ${c.name || 'Anonym'} ---\n${text}`;
      }));

      const prompt = `Du bist Senior Executive Search Berater bei Orxestra.

Suchprofil:
${mandate}

Kandidaten-Profile:
${candidateTexts.join('\n\n')}

Antworte AUSSCHLIESSLICH mit JSON:
{
  "candidates": [
    {
      "name": "Name",
      "fit_score": 85,
      "fit_label": "Sehr guter Fit",
      "strengths": ["Stärke 1", "Stärke 2", "Stärke 3"],
      "gaps": ["Lücke 1", "Lücke 2"],
      "recommendation": "2 Sätze Empfehlung",
      "inmail_de": "Persönlicher InMail-Text DE 3-4 Sätze",
      "inmail_en": "Personalized InMail text EN 3-4 sentences"
    }
  ],
  "ranking_summary": "Gesamtfazit 2-3 Sätze"
}`;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      });

      const text = response.content[0].text.trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Kein JSON: ' + text.substring(0, 150));
      const data = JSON.parse(jsonMatch[0]);
      return res.status(200).json({ success: true, data });
    }

    return res.status(400).json({ error: 'Unbekannter mode' });

  } catch (err) {
    console.error('SCOUT error:', err);
    return res.status(500).json({ error: err.message });
  }
}
