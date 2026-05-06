import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { prompt } = req.body;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    });

    let text = response.content[0].text;

    // Remove markdown bold/italic
    text = text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');

    // Remove header lines: # SALESBRIEF, # BRIEF, --- separators
    text = text.replace(/^#+\s*(SALESBRIEF|BRIEF|ANSCHREIBEN|PITCH)[^\n]*\n/gim, '');
    text = text.replace(/^---+\s*\n/gm, '');

    // Remove address block at top (lines before "Sehr geehrte" or "Betreff:")
    // Find where the actual letter starts
    const letterStart = text.search(/Sehr geehrte|Betreff:|Guten Tag/i);
    if (letterStart > 0) {
      // Check if the content before letterStart is just address/header junk
      const before = text.substring(0, letterStart).trim();
      const lines = before.split('\n').filter(l => l.trim());
      // If fewer than 6 lines before greeting, it's likely an address block — remove it
      if (lines.length <= 6) {
        text = text.substring(letterStart);
      }
    }

    text = text.trim();

    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
