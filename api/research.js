// x-RESEARCH Agent v2 — Orxestra Suite
// 3-Kreis Marktstruktur, tiefere Kandidatenrecherche, Fix Shortlist/Longlist

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
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': SERPER_KEY },
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

  const body = req.method === 'POST' ? req.body : {};
  const query = req.query || {};
  const action = body.action || query.action;
  const mandate_id = body.mandate_id || query.mandate_id;

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
    const tcr = await fetch(
      `${SUPABASE_URL}/rest/v1/target_companies?mandate_id=eq.${mandate_id}&order=priority.asc`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const companies = await tcr.json();
    return res.json({ run: runs?.[0] || null, candidates, companies });
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
    log: [{ ts: new Date().toISOString(), msg: `x-RESEARCH Agent v2 gestartet: ${mandate.title}` }]
  });
  const runId = run.id;

  res.json({ run_id: runId, message: 'Agent gestartet' });

  runAgent(mandate, runId).catch(async (err) => {
    await sbUpdate('research_runs', runId, {
      status: 'error',
      phase: 'error',
      completed_at: new Date().toISOString()
    });
    await appendLog(runId, `FEHLER: ${err.message}`);
  });
}

async function runAgent(mandate, runId) {

  // ===== PHASE 1: MARKET MAPPING — 3-KREIS-STRUKTUR =====
  await sbUpdate('research_runs', runId, { phase: 'phase1_market_mapping' });
  await appendLog(runId, 'Phase 1: Markt-Mapping nach 3-Kreis-Struktur startet...');

  const geos = mandate.search_geographies || ['DACH'];
  const industries = mandate.target_industries || [];

  const marketPrompt = `Du bist ein erfahrener Executive Search Research Experte. Analysiere dieses Mandat und identifiziere 50-60 Zielunternehmen nach der 3-Kreis-Struktur.

MANDAT:
Position: ${mandate.title}
Klient: ${mandate.client_name} (${mandate.client_industry}, ${mandate.client_location})
Beschreibung: ${mandate.position_description}
Anforderungen: ${JSON.stringify(mandate.requirements)}
Geographien: ${JSON.stringify(geos)}
Zielbranchen: ${JSON.stringify(industries)}

3-KREIS-STRUKTUR — identifiziere für jeden Kreis 15-20 Unternehmen:

KREIS 1 (priority=1) — DIREKTE WETTBEWERBER:
Unternehmen in derselben Branche mit ähnlichem Produkt/Markt. 
Kandidaten hier kennen die Branche perfekt und wechseln leichter.

KREIS 2 (priority=2) — ADJACENT — ÄHNLICHE STRUKTUREN:
Unternehmen mit ähnlicher Komplexität aber anderer Branche:
- Gleiche Vertriebsstruktur (international, Multi-Channel, indirekt/direkt)
- Ähnliche Kundenbasis (B2B, Fachhandel, regulierte Märkte)
- Vergleichbare Unternehmensgröße und -kultur
- MedTech, Elektronik, Precision Engineering, Consumer Durables

KREIS 3 (priority=3) — TRANSFER-KANDIDATEN:
Unternehmen weiter weg aber mit transferierbaren Kompetenzen:
- Starke internationale Vertriebsorganisationen
- Familienunternehmen mit Export-Fokus
- Branchen mit ähnlichen Führungsanforderungen

Antworte NUR mit einem JSON-Array. Kein Text davor oder danach:
[
  {
    "name": "Unternehmensname",
    "industry": "Branche",
    "country": "Land (DE/AT/CH/...)",
    "size_employees": "ca. Mitarbeiterzahl",
    "website": "domain.com",
    "why_relevant": "Konkreter Grund warum relevant für dieses Mandat",
    "circle": 1,
    "priority": 1
  }
]`;

  await appendLog(runId, 'Claude analysiert Markt — Kreis 1/2/3 werden definiert...');
  const marketResponse = await claudeAnalyze(marketPrompt, 5000);

  let companies = [];
  try {
    const clean = marketResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const match = clean.match(/\[[\s\S]*\]/);
    if (match) companies = JSON.parse(match[0]);
  } catch (e) {
    await appendLog(runId, `Parsing-Fehler Markt: ${e.message}`);
  }

  await appendLog(runId, `${companies.length} Zielunternehmen identifiziert (K1: ${companies.filter(c=>c.circle===1).length}, K2: ${companies.filter(c=>c.circle===2).length}, K3: ${companies.filter(c=>c.circle===3).length})`);

  const savedCompanies = [];
  for (const co of companies) {
    try {
      const saved = await sbInsert('target_companies', { ...co, mandate_id: mandate.id });
      savedCompanies.push(saved);
    } catch (e) {
      // continue
    }
  }
  await sbUpdate('research_runs', runId, { companies_found: savedCompanies.length });

  // ===== PHASE 2: ORG MAPPING =====
  await sbUpdate('research_runs', runId, { phase: 'phase2_org_mapping' });
  await appendLog(runId, 'Phase 2: Führungskräfte-Mapping via Web-Suche...');

  const allCandidateNames = [];
  const targetCompanies = savedCompanies.filter(c => c.priority <= 2).slice(0, 20);

  for (const company of targetCompanies) {
    await appendLog(runId, `Suche Führungskräfte: ${company.name} (${company.country})`);

    const results1 = await serperSearch(
      `"${company.name}" "Vice President Sales" OR "VP Sales" OR "Head of Sales" OR "Director Sales" OR "Vertriebsleiter" OR "Chief Sales"`,
      8
    );
    const results2 = await serperSearch(
      `"${company.name}" site:theorg.com OR site:xing.com OR site:rocketreach.co "Sales" "Marketing"`,
      6
    );

    const snippets = [...results1, ...results2]
      .map(r => `[${r.link}] ${r.title}: ${r.snippet}`).join('\n');

    if (snippets.length > 100) {
      const extractPrompt = `Extrahiere alle Namen von Führungskräften im Bereich Sales, Marketing, Commercial aus diesen Suchergebnissen für "${company.name}".

Suchergebnisse:
${snippets}

Antworte NUR mit JSON-Array:
[{"name": "Vor Nachname", "title": "Exakter Titel", "company": "${company.name}", "source": "URL"}]
Wenn keine Namen: []`;

      const extracted = await claudeAnalyze(extractPrompt, 600);
      try {
        const match = extracted.match(/\[[\s\S]*\]/);
        if (match) {
          const names = JSON.parse(match[0]);
          for (const n of names) {
            if (n.name && n.name.length > 4 && n.name.includes(' ')) {
              allCandidateNames.push({ ...n, company_id: company.id, circle: company.circle || 1 });
            }
          }
        }
      } catch (e) { /* continue */ }
    }
  }

  await appendLog(runId, `${allCandidateNames.length} potenzielle Kandidaten-Namen gefunden`);

  // ===== PHASE 3: DEDUP + FILTER =====
  await sbUpdate('research_runs', runId, { phase: 'phase3_candidate_id' });
  await appendLog(runId, 'Phase 3: Bereinigung und Erstfilter...');

  const seen = new Set();
  const uniqueCandidates = allCandidateNames.filter(c => {
    const key = c.name.toLowerCase().replace(/\s+/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  await appendLog(runId, `${uniqueCandidates.length} eindeutige Kandidaten nach Bereinigung`);

  // ===== PHASE 4: TIEFENRECHERCHE =====
  await sbUpdate('research_runs', runId, { phase: 'phase4_deep_research' });
  await appendLog(runId, 'Phase 4: Tiefenrecherche — 4 Suchen pro Kandidat...');

  const scoredCandidates = [];

  for (const candidate of uniqueCandidates.slice(0, 25)) {
    await appendLog(runId, `Tiefenrecherche: ${candidate.name}`);

    // 4 parallel searches per candidate
    const [general, news, career, conference] = await Promise.all([
      serperSearch(`"${candidate.name}" "${candidate.company}"`, 6),
      serperSearch(`"${candidate.name}" 2023 2024 2025 Karriere OR Interview OR Ernennung`, 5),
      serperSearch(`"${candidate.name}" Lebenslauf OR Werdegang OR Xing OR LinkedIn Career`, 5),
      serperSearch(`"${candidate.name}" Konferenz OR Keynote OR Speaker OR Vortrag OR Beirat`, 4)
    ]);

    const allSnippets = [...general, ...news, ...career, ...conference]
      .map(r => `[${r.link}]\n${r.title}\n${r.snippet}`)
      .join('\n---\n');

    const deepPrompt = `Du bist ein erfahrener Executive Search Researcher. Erstelle ein detailliertes Kandidatenprofil basierend auf allen verfügbaren Informationen.

MANDAT:
Position: ${mandate.title}
Klient: ${mandate.client_name} (${mandate.client_industry})
Kernanforderungen: ${JSON.stringify(mandate.requirements)}
Geographien: ${JSON.stringify(geos)}

KANDIDAT:
Name: ${candidate.name}
Bekannter Titel: ${candidate.title}
Bekanntes Unternehmen: ${candidate.company}

ALLE GEFUNDENEN INFORMATIONEN:
${allSnippets || 'Keine zusätzlichen Informationen gefunden'}

Erstelle ein vollständiges Profil. Antworte NUR mit JSON:
{
  "first_name": "Vorname",
  "last_name": "Nachname",
  "current_title": "Aktueller Titel",
  "current_company": "Aktuelles Unternehmen",
  "current_country": "Land (DE/AT/CH/...)",
  "career_summary": "3-4 Sätze professionelle Zusammenfassung: Kernkompetenz, Karrierehöhepunkte, Branchenerfahrung",
  "career_stations": [
    {
      "title": "Titel",
      "company": "Unternehmen",
      "years": "2018-2022",
      "company_size": "ca. Mitarbeiterzahl oder Umsatz",
      "highlights": "1-2 Sätze was die Person dort erreicht hat"
    }
  ],
  "education": "Ausbildung soweit bekannt",
  "languages": "Bekannte Sprachen",
  "board_mandates": "Beirats- oder Aufsichtsratsmandate falls bekannt",
  "public_visibility": "Konferenzen, Interviews, Publikationen",
  "fit_score": 0-100,
  "fit_reasoning": "Konkrete Begründung warum passend oder nicht für dieses Mandat — auf Kernanforderungen eingehen",
  "gaps": "Was fehlt oder unklar ist",
  "tenure_years": Zahl (geschätzte Jahre in aktueller Rolle),
  "change_indicators": ["Konkretes Signal 1", "Signal 2"],
  "status": "shortlist" (fit_score >= 75) oder "longlist" (fit_score 55-74) oder "skip" (< 55)
}

WICHTIG: status='shortlist' NUR wenn fit_score >= 75. status='longlist' wenn fit_score 55-74.`;

    const analysis = await claudeAnalyze(deepPrompt, 1500);

    try {
      const match = analysis.match(/\{[\s\S]*\}/);
      if (match) {
        const result = JSON.parse(match[0]);
        if (result.fit_score >= 55 && result.status !== 'skip') {
          const saved = await sbInsert('candidates', {
            ...result,
            mandate_id: mandate.id,
            company_id: candidate.company_id,
            sources: [...general, ...news].slice(0, 4).map(r => r.link)
          });
          scoredCandidates.push(saved);
        }
      }
    } catch (e) {
      await appendLog(runId, `Profil-Fehler ${candidate.name}: ${e.message}`);
    }
  }

  await sbUpdate('research_runs', runId, { candidates_found: scoredCandidates.length });

  // ===== PHASE 5: SHORTLIST =====
  await sbUpdate('research_runs', runId, { phase: 'phase5_shortlist' });
  await appendLog(runId, 'Phase 5: Shortlist wird finalisiert...');

  const shortlist = scoredCandidates.filter(c => c.fit_score >= 75);

  for (const c of shortlist) {
    await sbUpdate('candidates', c.id, { status: 'shortlist' });
  }
  const longlist = scoredCandidates.filter(c => c.fit_score >= 55 && c.fit_score < 75);
  for (const c of longlist) {
    await sbUpdate('candidates', c.id, { status: 'longlist' });
  }

  await sbUpdate('research_runs', runId, { shortlist_count: shortlist.length });

  await appendLog(runId, `✓ Research abgeschlossen: ${savedCompanies.length} Unternehmen (K1: ${savedCompanies.filter(c=>c.circle===1).length}, K2: ${savedCompanies.filter(c=>c.circle===2).length}, K3: ${savedCompanies.filter(c=>c.circle===3).length}) | ${scoredCandidates.length} Kandidaten | ${shortlist.length} Shortlist | ${longlist.length} Longlist`);

  await sbUpdate('research_runs', runId, {
    status: 'completed',
    phase: 'completed',
    completed_at: new Date().toISOString()
  });
}
