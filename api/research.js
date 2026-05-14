// x-RESEARCH Agent — Orxestra Suite
// Autonomer Executive Search Research Agent
// Phases: 1) Market Mapping, 2) Org Mapping, 3) Candidate ID, 4) Deep Research, 5) Scoring

export const config = { maxDuration: 300 };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SERPER_KEY = process.env.SERPER_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

async function sbInsert(table, data) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Supabase INSERT ${table}: ${JSON.stringify(j)}`);
  return Array.isArray(j) ? j[0] : j;
}

async function sbUpdate(table, id, data) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error(`Supabase UPDATE ${table}: ${r.status}`);
}

async function serperSearch(query, num = 10) {
  const r = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': SERPER_KEY
    },
    body: JSON.stringify({ q: query, num, hl: 'de', gl: 'de' })
  });
  const j = await r.json();
  return j.organic || [];
}

async function claudeAnalyze(prompt, maxTokens = 2000) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const j = await r.json();
  return j.content?.[0]?.text || '';
}

async function appendLog(runId, entry) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/research_runs?id=eq.${runId}`, {
    method: 'GET',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  const rows = await r.json();
  if (!rows?.length) return;
  const log = rows[0].log || [];
  log.push({ ts: new Date().toISOString(), msg: entry });
  await sbUpdate('research_runs', runId, { log });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { mandate_id, action } = req.body || req.query;

  // GET STATUS
  if (action === 'status') {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/research_runs?mandate_id=eq.${mandate_id}&order=created_at.desc&limit=1`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const runs = await r.json();
    const cr = await fetch(
      `${SUPABASE_URL}/rest/v1/candidates?mandate_id=eq.${mandate_id}&order=fit_score.desc`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const candidates = await cr.json();
    return res.json({ run: runs?.[0] || null, candidates });
  }

  // GET MANDATE
  const mr = await fetch(
    `${SUPABASE_URL}/rest/v1/mandates?id=eq.${mandate_id}`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );
  const mandates = await mr.json();
  if (!mandates?.length) return res.status(404).json({ error: 'Mandat nicht gefunden' });
  const mandate = mandates[0];

  // CREATE RUN
  const run = await sbInsert('research_runs', {
    mandate_id,
    phase: 'start',
    status: 'running',
    log: [{ ts: new Date().toISOString(), msg: `Research Agent gestartet für: ${mandate.title}` }]
  });
  const runId = run.id;

  res.json({ run_id: runId, message: 'Agent gestartet — verwende /api/research?action=status&mandate_id=X für Updates' });

  // ASYNC EXECUTION — läuft nach Response weiter
  runAgent(mandate, runId).catch(async (err) => {
    await sbUpdate('research_runs', runId, {
      status: 'error',
      phase: 'error',
      completed_at: new Date().toISOString(),
      log: [{ ts: new Date().toISOString(), msg: `FEHLER: ${err.message}` }]
    });
  });
}

async function runAgent(mandate, runId) {

  // ===== PHASE 1: MARKET MAPPING =====
  await sbUpdate('research_runs', runId, { phase: 'phase1_market_mapping' });
  await appendLog(runId, 'Phase 1: Markt-Mapping startet...');

  const geos = mandate.search_geographies || ['DACH'];
  const industries = mandate.target_industries || [];
  const functions = mandate.target_functions || [];

  const marketPrompt = `Du bist ein Executive Search Research Agent. Analysiere dieses Mandat und identifiziere die 25 relevantesten Zielunternehmen für die Kandidatensuche.

MANDAT:
Position: ${mandate.title}
Klient: ${mandate.client_name} (${mandate.client_industry}, ${mandate.client_location})
Beschreibung: ${mandate.position_description}
Anforderungen: ${JSON.stringify(mandate.requirements)}
Geographien: ${JSON.stringify(geos)}
Zielbranchen: ${JSON.stringify(industries)}
Zielfunktionen: ${JSON.stringify(functions)}

Aufgabe: Identifiziere 25 Unternehmen aus denen geeignete Kandidaten kommen könnten. Berücksichtige:
- Direkte Wettbewerber des Klienten
- Unternehmen mit ähnlicher Komplexität und Größe
- Unternehmen in verwandten Branchen mit denselben Anforderungen
- Unternehmen die bekannt sind für exzellente Führungskräfte in dieser Funktion

Antworte NUR mit einem JSON-Array. Kein Text davor oder danach:
[
  {
    "name": "Unternehmensname",
    "industry": "Branche",
    "country": "Land",
    "size_employees": "Mitarbeiterzahl ca.",
    "website": "domain.com",
    "why_relevant": "Ein Satz warum relevant",
    "priority": 1
  }
]
priority: 1=hoch, 2=mittel, 3=niedrig`;

  await appendLog(runId, 'Claude analysiert Markt und definiert Zielunternehmen...');
  const marketResponse = await claudeAnalyze(marketPrompt, 3000);

  let companies = [];
  try {
    const clean = marketResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    companies = JSON.parse(clean);
  } catch (e) {
    const match = marketResponse.match(/\[[\s\S]*\]/);
    if (match) companies = JSON.parse(match[0]);
  }

  await appendLog(runId, `${companies.length} Zielunternehmen identifiziert`);

  // Save companies to DB
  const savedCompanies = [];
  for (const co of companies) {
    try {
      const saved = await sbInsert('target_companies', { ...co, mandate_id: mandate.id });
      savedCompanies.push(saved);
    } catch (e) {
      await appendLog(runId, `Fehler beim Speichern: ${co.name}`);
    }
  }
  await sbUpdate('research_runs', runId, { companies_found: savedCompanies.length });

  // ===== PHASE 2: ORG MAPPING via Web Search =====
  await sbUpdate('research_runs', runId, { phase: 'phase2_org_mapping' });
  await appendLog(runId, 'Phase 2: Org-Mapping via Web-Suche startet...');

  const allCandidateNames = [];
  const prio1Companies = savedCompanies.filter(c => c.priority <= 2).slice(0, 15);

  for (const company of prio1Companies) {
    await appendLog(runId, `Suche Führungskräfte bei: ${company.name}`);

    const searchQuery = `${company.name} "Vice President" OR "VP Sales" OR "Head of Sales" OR "Director Sales" OR "Vertriebsleiter" site:theorg.com OR site:linkedin.com OR site:${company.website || 'xing.com'}`;

    const results = await serperSearch(searchQuery, 8);
    const snippets = results.map(r => `${r.title}: ${r.snippet}`).join('\n');

    if (snippets.length > 50) {
      const extractPrompt = `Extrahiere alle Namen von Führungskräften aus diesen Suchergebnissen für das Unternehmen "${company.name}". 
Gesucht: Personen mit Titeln wie VP Sales, Director Sales, Head of Sales, Vertriebsleiter, CSO, CCO oder ähnlich.

Suchergebnisse:
${snippets}

Antworte NUR mit JSON. Kein Text:
[{"name": "Vor Nachname", "title": "Titel", "company": "${company.name}", "source": "URL oder Quelle"}]
Wenn keine Namen gefunden: []`;

      const extracted = await claudeAnalyze(extractPrompt, 500);
      try {
        const clean = extracted.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const names = JSON.parse(clean.match(/\[[\s\S]*\]/)?.[0] || '[]');
        for (const n of names) {
          if (n.name && n.name.length > 3) {
            allCandidateNames.push({ ...n, company_id: company.id });
          }
        }
      } catch (e) {
        // continue
      }
    }
  }

  await appendLog(runId, `${allCandidateNames.length} potenzielle Kandidaten-Namen gefunden`);

  // ===== PHASE 3: CANDIDATE IDENTIFICATION =====
  await sbUpdate('research_runs', runId, { phase: 'phase3_candidate_id' });
  await appendLog(runId, 'Phase 3: Kandidaten-Identifikation und Erstfilter...');

  // Deduplicate by name
  const seen = new Set();
  const uniqueCandidates = allCandidateNames.filter(c => {
    if (seen.has(c.name.toLowerCase())) return false;
    seen.add(c.name.toLowerCase());
    return true;
  });

  await appendLog(runId, `${uniqueCandidates.length} eindeutige Kandidaten nach Dedup`);

  // ===== PHASE 4: DEEP RESEARCH per Candidate =====
  await sbUpdate('research_runs', runId, { phase: 'phase4_deep_research' });
  await appendLog(runId, 'Phase 4: Tiefenrecherche pro Kandidat startet...');

  const scoredCandidates = [];

  for (const candidate of uniqueCandidates.slice(0, 20)) {
    await appendLog(runId, `Recherchiere: ${candidate.name}`);

    // Web search for candidate
    const candidateSearch = await serperSearch(
      `"${candidate.name}" "${candidate.company}" Vertrieb Sales Marketing Karriere`,
      6
    );
    const newsSearch = await serperSearch(
      `"${candidate.name}" ${candidate.company} 2023 2024 2025`,
      4
    );

    const allSnippets = [...candidateSearch, ...newsSearch]
      .map(r => `[${r.link}] ${r.title}: ${r.snippet}`)
      .join('\n');

    const deepPrompt = `Du bist ein Executive Search Research Agent. Bewerte diesen Kandidaten für folgendes Mandat.

MANDAT:
Position: ${mandate.title}
Klient: ${mandate.client_name} (${mandate.client_industry})
Kernanforderungen: ${JSON.stringify(mandate.requirements)}
Geographien: ${JSON.stringify(geos)}

KANDIDAT:
Name: ${candidate.name}
Aktueller Titel: ${candidate.title}
Aktuelles Unternehmen: ${candidate.company}

GEFUNDENE INFORMATIONEN:
${allSnippets || 'Keine zusätzlichen Informationen gefunden'}

Bewerte den Kandidaten und antworte NUR mit JSON:
{
  "first_name": "Vorname",
  "last_name": "Nachname",
  "current_title": "Aktueller Titel",
  "current_company": "${candidate.company}",
  "current_country": "Land (DE/AT/CH/...)",
  "career_summary": "2-3 Sätze Karrierezusammenfassung basierend auf verfügbaren Infos",
  "fit_score": 0-100,
  "fit_reasoning": "Konkrete Begründung warum passend oder nicht passend für das Mandat",
  "tenure_years": geschätzte Jahre in aktueller Rolle (Zahl),
  "change_indicators": ["Signal 1 das auf Wechselbereitschaft hindeutet", "Signal 2"],
  "status": "longlist" oder "skip"
}
fit_score Skala: 0-40=nicht relevant, 41-60=schwach, 61-75=interessant, 76-90=gut, 91-100=sehr gut`;

    const analysis = await claudeAnalyze(deepPrompt, 800);

    try {
      const clean = analysis.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) {
        const result = JSON.parse(match[0]);
        if (result.fit_score >= 50) {
          const saved = await sbInsert('candidates', {
            ...result,
            mandate_id: mandate.id,
            company_id: candidate.company_id,
            sources: candidateSearch.slice(0, 3).map(r => r.link)
          });
          scoredCandidates.push(saved);
        }
      }
    } catch (e) {
      await appendLog(runId, `Analyse-Fehler für ${candidate.name}: ${e.message}`);
    }
  }

  await sbUpdate('research_runs', runId, { candidates_found: scoredCandidates.length });

  // ===== PHASE 5: SHORTLIST SCORING =====
  await sbUpdate('research_runs', runId, { phase: 'phase5_shortlist' });
  await appendLog(runId, 'Phase 5: Shortlist wird erstellt...');

  const shortlist = scoredCandidates.filter(c => c.fit_score >= 70);
  await sbUpdate('research_runs', runId, { shortlist_count: shortlist.length });

  // Mark shortlist candidates
  for (const c of shortlist) {
    await sbUpdate('candidates', c.id, { status: 'shortlist' });
  }

  // FINAL LOG
  await appendLog(runId, `Research abgeschlossen: ${savedCompanies.length} Unternehmen, ${scoredCandidates.length} Kandidaten, ${shortlist.length} auf Shortlist`);

  await sbUpdate('research_runs', runId, {
    status: 'completed',
    phase: 'completed',
    completed_at: new Date().toISOString()
  });
}
