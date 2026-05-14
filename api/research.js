// x-RESEARCH Agent v3 — Orxestra Suite
// Fix: 3 separate Claude calls für 3-Kreis-Struktur (robusteres Parsing)

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
  if (j.error) throw new Error(`Claude API: ${j.error.message}`);
  return j.content?.[0]?.text || '';
}

function parseJsonArray(text) {
  // Robust JSON array parser
  try {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(clean);
  } catch (e1) {
    try {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) return JSON.parse(match[0]);
    } catch (e2) {
      // try line by line
    }
  }
  return [];
}

async function appendLog(runId, entry) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/research_runs?id=eq.${runId}`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const rows = await r.json();
    if (!rows?.length) return;
    const log = rows[0].log || [];
    log.push({ ts: new Date().toISOString(), msg: entry });
    await sbUpdate('research_runs', runId, { log });
  } catch (e) { /* non-critical */ }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');

  const body = req.method === 'POST' ? (req.body || {}) : {};
  const query = req.query || {};
  const action = body.action || query.action;
  const mandate_id = body.mandate_id || query.mandate_id;

  if (!mandate_id) return res.status(400).json({ error: 'mandate_id fehlt' });

  // GET STATUS
  if (action === 'status') {
    const [runRes, candRes, coRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/research_runs?mandate_id=eq.${mandate_id}&order=created_at.desc&limit=1`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }),
      fetch(`${SUPABASE_URL}/rest/v1/candidates?mandate_id=eq.${mandate_id}&order=fit_score.desc`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }),
      fetch(`${SUPABASE_URL}/rest/v1/target_companies?mandate_id=eq.${mandate_id}&order=priority.asc`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } })
    ]);
    return res.json({
      run: (await runRes.json())?.[0] || null,
      candidates: await candRes.json(),
      companies: await coRes.json()
    });
  }

  // GET MANDATE
  const mr = await fetch(`${SUPABASE_URL}/rest/v1/mandates?id=eq.${mandate_id}`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
  const mandates = await mr.json();
  if (!mandates?.length) return res.status(404).json({ error: 'Mandat nicht gefunden' });
  const mandate = mandates[0];

  // CREATE RUN
  const run = await sbInsert('research_runs', {
    mandate_id,
    phase: 'start',
    status: 'running',
    log: [{ ts: new Date().toISOString(), msg: `x-RESEARCH v3 gestartet: ${mandate.title}` }]
  });
  const runId = run.id;

  res.json({ run_id: runId, message: 'Agent gestartet' });

  runAgent(mandate, runId).catch(async (err) => {
    await appendLog(runId, `FEHLER: ${err.message}`);
    await sbUpdate('research_runs', runId, {
      status: 'error', phase: 'error',
      completed_at: new Date().toISOString()
    });
  });
}

async function runAgent(mandate, runId) {
  const geos = mandate.search_geographies || ['DACH'];
  const mandateContext = `Position: ${mandate.title}
Klient: ${mandate.client_name} (${mandate.client_industry}, ${mandate.client_location})
Beschreibung: ${mandate.position_description}
Anforderungen: ${JSON.stringify(mandate.requirements)}
Geographien: ${JSON.stringify(geos)}`;

  const circlePrompt = (circle, circleDesc, examples) => `Du bist Executive Search Researcher. Identifiziere genau 15-18 Unternehmen für ${circleDesc}.

MANDAT:
${mandateContext}

${examples}

WICHTIG: Antworte NUR mit einem JSON-Array. Absolut kein Text davor oder danach. Keine Einleitung, kein Kommentar.
Format:
[{"name":"Unternehmensname","industry":"Branche","country":"DE oder AT oder CH","size_employees":"ca. Zahl MA","website":"domain.com","why_relevant":"1 Satz warum für dieses Mandat relevant","circle":${circle},"priority":${circle}}]`;

  // ===== PHASE 1: 3 SEPARATE CIRCLE CALLS =====
  await sbUpdate('research_runs', runId, { phase: 'phase1_market_mapping' });
  await appendLog(runId, 'Phase 1: Kreis 1 — Direkte Wettbewerber wird analysiert...');

  const circle1Raw = await claudeAnalyze(circlePrompt(1,
    'KREIS 1 — DIREKTE WETTBEWERBER (gleiche Branche, direkter Kandidatenpool)',
    `Gesucht: Unternehmen die DIREKT im selben Markt wie "${mandate.client_name}" tätig sind.
Für Dental/MedTech: andere Dentalgerätehersteller, MedTech-Unternehmen mit ähnlichem Produktportfolio.
Beispiele für diese Kategorie: Dentsply Sirona, Ivoclar, Straumann, KaVo, Planmeca, Danaher Dental, 3M Oral Care.`
  ), 2000);

  const circle1All = parseJsonArray(circle1Raw);
  // Cap Kreis 1 at 25 — overflow goes to Kreis 2
  const CIRCLE1_MAX = 25;
  const circle1 = circle1All.slice(0, CIRCLE1_MAX).map(c => ({ ...c, circle: 1, priority: 1 }));
  const circle1Overflow = circle1All.slice(CIRCLE1_MAX).map(c => ({ ...c, circle: 2, priority: 2, why_relevant: `[Overflow K1] ${c.why_relevant || ''}` }));

  if (circle1Overflow.length > 0) {
    await appendLog(runId, `Kreis 1: ${circle1.length} Wettbewerber (${circle1Overflow.length} überzählige → Kreis 2)`);
  } else {
    await appendLog(runId, `Kreis 1: ${circle1.length} Unternehmen identifiziert`);
  }

  await appendLog(runId, 'Phase 1: Kreis 2 — Adjacent wird analysiert...');
  const circle2Raw = await claudeAnalyze(circlePrompt(2,
    'KREIS 2 — ADJACENT — ÄHNLICHE VERTRIEBSSTRUKTUR ODER KUNDENBASIS',
    `Gesucht: Unternehmen mit ähnlicher Vertriebskomplexität wie "${mandate.client_name}" aber aus verwandten Branchen.
Kriterien: internationale Vertriebsorganisation, Multi-Channel (direkt+indirekt), reguliertes Umfeld, B2B-Fachhandel, ähnliche Unternehmensgröße (100-500 Mio EUR).
Für dieses Mandat: MedTech allgemein, Laborgeräte, Ophthalmologie, Orthopädie, Sterilisation/Reinigung, Präzisionsinstrumente, Endoskopie.`
  ), 2000);

  const circle2Own = parseJsonArray(circle2Raw).map(c => ({ ...c, circle: 2, priority: 2 }));
  // Merge overflow from circle1 + own circle2 results (deduplicate by name)
  const circle2NamesAlready = new Set(circle1.map(c => c.name.toLowerCase()));
  const circle2OwnFiltered = circle2Own.filter(c => !circle2NamesAlready.has(c.name.toLowerCase()));
  const circle2 = [...circle1Overflow, ...circle2OwnFiltered];
  await appendLog(runId, `Kreis 2: ${circle2.length} Unternehmen (${circle1Overflow.length} aus K1-Überlauf + ${circle2OwnFiltered.length} eigen)`);

  await appendLog(runId, 'Phase 1: Kreis 3 — Transfer-Kandidaten wird analysiert...');
  const circle3Raw = await claudeAnalyze(circlePrompt(3,
    'KREIS 3 — TRANSFER-KANDIDATEN — WEITER ENTFERNT ABER TRANSFERIERBARE KOMPETENZEN',
    `Gesucht: Unternehmen aus anderen Branchen deren Führungskräfte transferierbare Kompetenzen für "${mandate.client_name}" mitbringen.
Kriterien: starke internationale Vertriebsorganisation, Export-fokussiert, Premium-B2B-Produkte, Familienunternehmen mit Wachstumsagenda, Multi-Brand Management.
Branchen: Elektronik/Messtechnik, Consumer Durables Premium, Industrieautomation, Photonics/Optik, Verpackungsmaschinen, Laboranalytik.`
  ), 2000);

  const circle3 = parseJsonArray(circle3Raw).map(c => ({ ...c, circle: 3, priority: 3 }));
  await appendLog(runId, `Kreis 3: ${circle3.length} Unternehmen identifiziert`);

  const allCompanies = [...circle1, ...circle2, ...circle3];
  await appendLog(runId, `Total: ${allCompanies.length} Zielunternehmen (K1:${circle1.length} K2:${circle2.length} K3:${circle3.length})`);

  // Save companies
  const savedCompanies = [];
  for (const co of allCompanies) {
    if (!co.name) continue;
    try {
      const saved = await sbInsert('target_companies', { ...co, mandate_id: mandate.id });
      savedCompanies.push(saved);
    } catch (e) {
      await appendLog(runId, `Speicher-Fehler: ${co.name}`);
    }
  }
  await sbUpdate('research_runs', runId, { companies_found: savedCompanies.length });

  // ===== PHASE 2: ORG MAPPING =====
  await sbUpdate('research_runs', runId, { phase: 'phase2_org_mapping' });
  await appendLog(runId, 'Phase 2: Führungskräfte-Mapping via Web-Suche...');

  const allCandidateNames = [];
  // Focus on circle 1 + 2 for candidates
  const searchTargets = savedCompanies.filter(c => c.priority <= 2).slice(0, 18);

  for (const company of searchTargets) {
    await appendLog(runId, `Suche: ${company.name}`);
    const [r1, r2] = await Promise.all([
      serperSearch(`"${company.name}" "VP Sales" OR "Vice President Sales" OR "Head of Sales" OR "Director Sales" OR "Vertriebsleiter" OR "CSO" OR "CCO"`, 8),
      serperSearch(`"${company.name}" Sales Marketing Leadership theorg.com OR xing.com OR rocketreach`, 5)
    ]);

    const snippets = [...r1, ...r2].map(r => `[${r.link}] ${r.title}: ${r.snippet}`).join('\n');
    if (snippets.length < 50) continue;

    const extractRaw = await claudeAnalyze(`Extrahiere Namen von Sales/Marketing Führungskräften aus diesen Suchergebnissen für "${company.name}".
Suchergebnisse:
${snippets}

Antworte NUR mit JSON-Array (kein Text):
[{"name":"Vor Nachname","title":"Titel","company":"${company.name}","source":"URL"}]
Wenn keine Namen gefunden: []`, 600);

    const names = parseJsonArray(extractRaw);
    for (const n of names) {
      if (n.name && n.name.includes(' ') && n.name.length > 5) {
        allCandidateNames.push({ ...n, company_id: company.id, circle: company.circle || company.priority });
      }
    }
  }

  await appendLog(runId, `${allCandidateNames.length} Kandidaten-Namen gefunden`);

  // ===== PHASE 3: DEDUP =====
  await sbUpdate('research_runs', runId, { phase: 'phase3_candidate_id' });
  await appendLog(runId, 'Phase 3: Bereinigung...');

  const seen = new Set();
  const unique = allCandidateNames.filter(c => {
    const key = c.name.toLowerCase().replace(/\s/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  await appendLog(runId, `${unique.length} eindeutige Kandidaten nach Bereinigung`);

  // ===== PHASE 4: DEEP RESEARCH =====
  await sbUpdate('research_runs', runId, { phase: 'phase4_deep_research' });
  await appendLog(runId, 'Phase 4: Tiefenrecherche — 4 Suchen pro Kandidat...');

  const scored = [];

  for (const cand of unique.slice(0, 22)) {
    await appendLog(runId, `Recherchiere: ${cand.name}`);

    const [s1, s2, s3, s4] = await Promise.all([
      serperSearch(`"${cand.name}" "${cand.company}"`, 6),
      serperSearch(`"${cand.name}" 2022 2023 2024 2025 Karriere OR Ernennung OR Interview`, 5),
      serperSearch(`"${cand.name}" Xing OR LinkedIn OR Lebenslauf OR Werdegang`, 5),
      serperSearch(`"${cand.name}" Konferenz OR Keynote OR Speaker OR Beirat OR Aufsichtsrat`, 4)
    ]);

    const snippets = [...s1, ...s2, ...s3, ...s4]
      .map(r => `[${r.link}]\n${r.title}\n${r.snippet}`)
      .join('\n---\n');

    const profileRaw = await claudeAnalyze(`Du bist Executive Search Researcher. Erstelle ein vollständiges Kandidatenprofil.

MANDAT: ${mandate.title} bei ${mandate.client_name} (${mandate.client_industry})
Kernanforderungen: ${JSON.stringify(mandate.requirements)}
Geographien: ${JSON.stringify(geos)}

KANDIDAT: ${cand.name} | ${cand.title} | ${cand.company}

RECHERCHE-ERGEBNISSE:
${snippets || 'Keine Ergebnisse gefunden'}

Antworte NUR mit JSON (kein Text davor/danach):
{
  "first_name": "Vorname",
  "last_name": "Nachname",
  "current_title": "Aktueller Titel",
  "current_company": "Aktuelles Unternehmen",
  "current_country": "DE oder AT oder CH",
  "career_summary": "3-4 Sätze: Kernkompetenz, Karrierehöhepunkte, Branchenfokus",
  "career_stations": [
    {"title": "Titel", "company": "Unternehmen", "years": "2019-2023", "company_size": "ca. MA/Umsatz", "highlights": "Was wurde erreicht"}
  ],
  "education": "Ausbildung falls bekannt",
  "languages": "Bekannte Sprachen",
  "board_mandates": "Beirats-/Aufsichtsratsmandate falls bekannt, sonst leer",
  "public_visibility": "Konferenzen, Interviews, Publikationen falls bekannt",
  "fit_score": 0,
  "fit_reasoning": "Konkrete Begründung auf die Kernanforderungen eingehen — was passt, was fehlt",
  "gaps": "Was unklar oder fehlend ist",
  "tenure_years": 0,
  "change_indicators": ["Signal 1", "Signal 2"],
  "status": "shortlist"
}
fit_score: 0-54=nicht relevant, 55-74=longlist, 75-100=shortlist
status muss mit fit_score übereinstimmen: >=75 -> shortlist, 55-74 -> longlist, <55 -> skip`, 1500);

    try {
      const match = profileRaw.match(/\{[\s\S]*\}/);
      if (!match) continue;
      const result = JSON.parse(match[0]);
      if (!result.fit_score || result.fit_score < 55 || result.status === 'skip') continue;

      // Ensure status matches score
      result.status = result.fit_score >= 75 ? 'shortlist' : 'longlist';

      const saved = await sbInsert('candidates', {
        ...result,
        mandate_id: mandate.id,
        company_id: cand.company_id,
        sources: [...s1, ...s2].slice(0, 4).map(r => r.link)
      });
      scored.push(saved);
    } catch (e) {
      await appendLog(runId, `Profil-Fehler ${cand.name}: ${e.message}`);
    }
  }

  await sbUpdate('research_runs', runId, { candidates_found: scored.length });

  // ===== PHASE 5: FINALIZE =====
  await sbUpdate('research_runs', runId, { phase: 'phase5_shortlist' });

  const shortlist = scored.filter(c => c.fit_score >= 75);
  const longlist = scored.filter(c => c.fit_score >= 55 && c.fit_score < 75);

  await sbUpdate('research_runs', runId, { shortlist_count: shortlist.length });

  await appendLog(runId, `✓ Abgeschlossen: ${savedCompanies.length} Unternehmen (K1:${savedCompanies.filter(c=>c.circle===1).length} K2:${savedCompanies.filter(c=>c.circle===2).length} K3:${savedCompanies.filter(c=>c.circle===3).length}) | ${scored.length} Kandidaten | ${shortlist.length} Shortlist | ${longlist.length} Longlist`);

  await sbUpdate('research_runs', runId, {
    status: 'completed',
    phase: 'completed',
    completed_at: new Date().toISOString()
  });
}
