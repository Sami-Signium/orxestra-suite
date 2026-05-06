<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>x-DOCS | Orxestra Suite</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', 'Segoe UI', sans-serif; background: #F4F6FA; color: #1a1a2e; min-height: 100vh; }

  /* LOGIN */
  #loginScreen {
    position: fixed; inset: 0; background: #081D4D;
    display: flex; align-items: center; justify-content: center; z-index: 1000;
  }
  .login-box {
    background: white; border-radius: 12px; padding: 48px 40px;
    width: 360px; text-align: center;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  }
  .login-logo { font-size: 13px; letter-spacing: 3px; color: #081D4D; font-weight: 700; margin-bottom: 4px; }
  .login-title { font-size: 28px; font-weight: 700; color: #081D4D; margin-bottom: 8px; }
  .login-sub { color: #888; font-size: 14px; margin-bottom: 32px; }
  .login-input {
    width: 100%; padding: 12px 16px; border: 2px solid #e0e0e0;
    border-radius: 8px; font-size: 15px; margin-bottom: 16px;
    transition: border-color 0.2s;
  }
  .login-input:focus { outline: none; border-color: #081D4D; }
  .login-btn {
    width: 100%; padding: 13px; background: #FF6A42; color: white;
    border: none; border-radius: 8px; font-size: 15px; font-weight: 600;
    cursor: pointer; transition: background 0.2s;
  }
  .login-btn:hover { background: #e55a32; }
  .login-error { color: #e53e3e; font-size: 13px; margin-top: 10px; display: none; }

  /* HEADER */
  header {
    background: #081D4D; color: white;
    padding: 0 32px; height: 60px;
    display: flex; align-items: center; justify-content: space-between;
    position: sticky; top: 0; z-index: 100;
  }
  .header-brand { display: flex; align-items: center; gap: 16px; }
  .header-logo { font-size: 11px; letter-spacing: 2px; color: rgba(255,255,255,0.6); }
  .header-title { font-size: 18px; font-weight: 700; letter-spacing: 1px; }
  .header-title span { color: #FF6A42; }
  .back-link { color: rgba(255,255,255,0.7); font-size: 13px; text-decoration: none; }
  .back-link:hover { color: white; }

  /* LAYOUT */
  .container { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }

  /* DOC TYPE TABS */
  .doc-tabs { display: flex; gap: 8px; margin-bottom: 28px; flex-wrap: wrap; }
  .doc-tab {
    padding: 9px 20px; border-radius: 20px; border: 2px solid #081D4D;
    background: white; color: #081D4D; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: all 0.2s; letter-spacing: 0.5px;
  }
  .doc-tab.active { background: #081D4D; color: white; }
  .doc-tab:hover:not(.active) { background: #f0f3ff; }

  /* FORM CARD */
  .card {
    background: white; border-radius: 12px;
    padding: 32px; margin-bottom: 24px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  }
  .card-title {
    font-size: 14px; font-weight: 700; color: #081D4D;
    letter-spacing: 1.5px; text-transform: uppercase;
    margin-bottom: 20px; padding-bottom: 12px;
    border-bottom: 2px solid #FF6A42;
  }

  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  .form-group { margin-bottom: 16px; }
  .form-group label { display: block; font-size: 12px; font-weight: 600; color: #666; margin-bottom: 6px; letter-spacing: 0.5px; text-transform: uppercase; }
  .form-input, .form-select, .form-textarea {
    width: 100%; padding: 10px 14px; border: 1px solid #e0e0e0;
    border-radius: 8px; font-size: 14px; color: #1a1a2e;
    transition: border-color 0.2s; font-family: inherit;
  }
  .form-input:focus, .form-select:focus, .form-textarea:focus {
    outline: none; border-color: #081D4D;
  }
  .form-textarea { resize: vertical; min-height: 100px; }

  /* UPLOAD ZONES */
  .upload-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  .upload-zone {
    border: 2px dashed #c0c8d8; border-radius: 10px; padding: 24px 16px;
    text-align: center; cursor: pointer; transition: all 0.2s;
    background: #F8FAFF; position: relative;
  }
  .upload-zone:hover, .upload-zone.dragover { border-color: #081D4D; background: #EEF2FB; }
  .upload-zone.loaded { border-color: #FF6A42; border-style: solid; background: #FFF5F2; }
  .upload-icon { font-size: 28px; margin-bottom: 8px; }
  .upload-label { font-size: 12px; font-weight: 700; color: #081D4D; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
  .upload-hint { font-size: 11px; color: #999; }
  .upload-status { font-size: 12px; color: #FF6A42; font-weight: 600; margin-top: 6px; }
  .upload-zone input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }

  /* GENERATE BUTTON */
  .generate-btn {
    width: 100%; padding: 15px; background: #081D4D; color: white;
    border: none; border-radius: 10px; font-size: 15px; font-weight: 700;
    cursor: pointer; letter-spacing: 1px; transition: background 0.2s;
    margin-top: 8px;
  }
  .generate-btn:hover:not(:disabled) { background: #0a2560; }
  .generate-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  /* PROGRESS */
  .progress-bar {
    height: 4px; background: #e0e0e0; border-radius: 2px;
    margin: 16px 0; overflow: hidden; display: none;
  }
  .progress-fill {
    height: 100%; background: #FF6A42; border-radius: 2px;
    width: 0%; transition: width 0.3s; animation: progress-anim 2s ease-in-out infinite;
  }
  @keyframes progress-anim {
    0% { width: 10%; } 50% { width: 85%; } 100% { width: 10%; }
  }

  /* RESULT */
  .result-card {
    background: white; border-radius: 12px; padding: 32px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.06); display: none;
  }
  .result-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 20px; padding-bottom: 16px;
    border-bottom: 2px solid #FF6A42;
  }
  .result-title { font-size: 14px; font-weight: 700; color: #081D4D; letter-spacing: 1.5px; text-transform: uppercase; }
  .result-actions { display: flex; gap: 10px; }
  .btn-download {
    padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600;
    cursor: pointer; border: none; transition: all 0.2s; letter-spacing: 0.5px;
  }
  .btn-word { background: #081D4D; color: white; }
  .btn-word:hover { background: #0a2560; }
  .btn-word:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-copy { background: #f0f3ff; color: #081D4D; border: 1px solid #c0c8d8; }
  .btn-copy:hover { background: #e0e6ff; }

  .result-text {
    font-size: 14px; line-height: 1.8; color: #1a1a2e;
    white-space: pre-wrap; font-family: 'Georgia', serif;
    max-height: 600px; overflow-y: auto; padding-right: 8px;
  }

  .error-msg { color: #e53e3e; font-size: 13px; margin-top: 12px; padding: 12px; background: #fff5f5; border-radius: 8px; display: none; }

  @media (max-width: 600px) {
    .form-row, .upload-grid { grid-template-columns: 1fr; }
    .result-header { flex-direction: column; gap: 12px; align-items: flex-start; }
  }
</style>
</head>
<body>

<!-- LOGIN -->
<div id="loginScreen">
  <div class="login-box">
    <div class="login-logo">SIGNIUM AUSTRIA</div>
    <div class="login-title">x-DOCS</div>
    <div class="login-sub">Kandidatenberichte & Dokumente</div>
    <input type="password" class="login-input" id="loginPw" placeholder="Passwort" onkeydown="if(event.key==='Enter') doLogin()">
    <button class="login-btn" onclick="doLogin()">ANMELDEN</button>
    <div class="login-error" id="loginError">Falsches Passwort</div>
  </div>
</div>

<!-- HEADER -->
<header>
  <div class="header-brand">
    <div>
      <div class="header-logo">SIGNIUM AUSTRIA</div>
      <div class="header-title">x-DOCS<span>.</span></div>
    </div>
  </div>
  <a href="https://orxestra-suite.netlify.app" class="back-link">← Zur Suite</a>
</header>

<!-- MAIN -->
<div class="container">

  <!-- DOC TYPE SELECTOR -->
  <div class="doc-tabs">
    <button class="doc-tab active" onclick="setDocType('kandidatenbericht', this)">Kandidatenbericht</button>
    <button class="doc-tab" onclick="setDocType('pitch', this)">Pitch-Brief</button>
    <button class="doc-tab" onclick="setDocType('angebot', this)">Angebot</button>
    <button class="doc-tab" onclick="setDocType('jobdescription', this)">Job Description</button>
  </div>

  <!-- FORM -->
  <div class="card">
    <div class="card-title" id="formTitle">Kandidatenbericht erstellen</div>

    <div id="kandidatenberichtFields">
      <div class="form-row">
        <div class="form-group">
          <label>Kandidat Name</label>
          <input type="text" class="form-input" id="candidateName" placeholder="Vor- und Nachname">
        </div>
        <div class="form-group">
          <label>Position / Rolle</label>
          <input type="text" class="form-input" id="position" placeholder="z.B. Chief Financial Officer">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Klient / Unternehmen</label>
          <input type="text" class="form-input" id="client" placeholder="Vertraulich">
        </div>
        <div class="form-group">
          <label>Datum</label>
          <input type="text" class="form-input" id="datum" id="datum" placeholder="März 2026">
        </div>
      </div>
      <div class="form-group">
        <label>Sprache</label>
        <select class="form-select" id="language">
          <option value="DE">Deutsch</option>
          <option value="EN">English</option>
        </select>
      </div>

      <!-- UPLOADS -->
      <div class="upload-grid">
        <div class="upload-zone" id="cvZone" onclick="document.getElementById('cvFile').click()" ondragover="dragOver(event,'cvZone')" ondragleave="dragLeave('cvZone')" ondrop="dropFile(event,'cvFile','cvZone','cvStatus')">
          <input type="file" id="cvFile" accept=".pdf,.docx,.doc,.txt" onchange="handleFile('cvFile','cvZone','cvStatus')">
          <div class="upload-icon">📄</div>
          <div class="upload-label">CV / Lebenslauf</div>
          <div class="upload-hint">PDF, DOCX oder TXT</div>
          <div class="upload-status" id="cvStatus"></div>
        </div>
        <div class="upload-zone" id="notesZone" onclick="document.getElementById('notesFile').click()" ondragover="dragOver(event,'notesZone')" ondragleave="dragLeave('notesZone')" ondrop="dropFile(event,'notesFile','notesZone','notesStatus')">
          <input type="file" id="notesFile" accept=".pdf,.docx,.doc,.txt" onchange="handleFile('notesFile','notesZone','notesStatus')">
          <div class="upload-icon">📝</div>
          <div class="upload-label">Gesprächsnotizen</div>
          <div class="upload-hint">Optional: Interview-Notizen</div>
          <div class="upload-status" id="notesStatus"></div>
        </div>
      </div>
    </div>

    <div id="otherFields" style="display:none">
      <div class="form-group">
        <label>Inhalt / Stichpunkte</label>
        <textarea class="form-textarea" id="freeText" rows="6" placeholder="Beschreiben Sie was das Dokument enthalten soll..."></textarea>
      </div>
      <div class="form-group">
        <label>Sprache</label>
        <select class="form-select" id="language2">
          <option value="DE">Deutsch</option>
          <option value="EN">English</option>
        </select>
      </div>
    </div>

    <button class="generate-btn" id="generateBtn" onclick="generate()">▶ DOKUMENT GENERIEREN</button>
    <div class="progress-bar" id="progressBar"><div class="progress-fill"></div></div>
    <div class="error-msg" id="errorMsg"></div>
  </div>

  <!-- RESULT -->
  <div class="result-card" id="resultCard">
    <div class="result-header">
      <div class="result-title">Generiertes Dokument</div>
      <div class="result-actions">
        <button class="btn-download btn-word" id="wordBtn" onclick="downloadWord()">⬇ Download Word (.docx)</button>
        <button class="btn-download btn-copy" onclick="copyText()">📋 Text kopieren</button>
      </div>
    </div>
    <div class="result-text" id="resultText"></div>
  </div>

</div>

<script>
let generatedText = '';
let currentDocType = 'kandidatenbericht';
let cvText = '';
let notesText = '';

// ── LOGIN ──────────────────────────────────────────────────────────────────
function doLogin() {
  const pw = document.getElementById('loginPw').value;
  if (pw === 'Orxestra2026') {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('datum').value = new Date().toLocaleDateString('de-AT', { month: 'long', year: 'numeric' });
  } else {
    document.getElementById('loginError').style.display = 'block';
  }
}

// ── DOC TYPE ───────────────────────────────────────────────────────────────
function setDocType(type, btn) {
  currentDocType = type;
  document.querySelectorAll('.doc-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const labels = {
    kandidatenbericht: 'Kandidatenbericht erstellen',
    pitch: 'Pitch-Brief erstellen',
    angebot: 'Angebot erstellen',
    jobdescription: 'Job Description erstellen'
  };
  document.getElementById('formTitle').textContent = labels[type];
  const isKand = type === 'kandidatenbericht';
  document.getElementById('kandidatenberichtFields').style.display = isKand ? 'block' : 'none';
  document.getElementById('otherFields').style.display = isKand ? 'none' : 'block';
}

// ── FILE HANDLING ──────────────────────────────────────────────────────────
function dragOver(e, zoneId) {
  e.preventDefault();
  document.getElementById(zoneId).classList.add('dragover');
}
function dragLeave(zoneId) {
  document.getElementById(zoneId).classList.remove('dragover');
}
function dropFile(e, inputId, zoneId, statusId) {
  e.preventDefault();
  dragLeave(zoneId);
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const input = document.getElementById(inputId);
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  processFile(file, zoneId, statusId, inputId);
}
function handleFile(inputId, zoneId, statusId) {
  const file = document.getElementById(inputId).files[0];
  if (!file) return;
  processFile(file, zoneId, statusId, inputId);
}

async function processFile(file, zoneId, statusId, inputId) {
  const zone = document.getElementById(zoneId);
  const status = document.getElementById(statusId);
  status.textContent = 'Wird gelesen...';
  zone.classList.add('loaded');

  try {
    // Convert file to base64 and send to server for extraction
    const base64 = await fileToBase64(file);
    const response = await fetch('/api/extract-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64: base64, fileName: file.name })
    });

    if (!response.ok) throw new Error('Extraktion fehlgeschlagen');
    const data = await response.json();
    const text = data.text || '';

    if (!text || text.length < 50) throw new Error('Kein Text gefunden');

    if (inputId === 'cvFile') cvText = text;
    else notesText = text;

    status.textContent = '✓ ' + file.name.substring(0, 28) + (file.name.length > 28 ? '...' : '') + ' (' + Math.round(text.length/100)/10 + 'k Zeichen)';
  } catch (err) {
    status.textContent = '✗ Fehler: ' + err.message;
    zone.classList.remove('loaded');
    console.error(err);
  }
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── GENERATE ───────────────────────────────────────────────────────────────
async function generate() {
  if (currentDocType === 'kandidatenbericht' && !cvText) {
    showError('Bitte zuerst einen CV hochladen.');
    return;
  }

  const btn = document.getElementById('generateBtn');
  const progress = document.getElementById('progressBar');
  btn.disabled = true;
  btn.textContent = 'Wird generiert...';
  progress.style.display = 'block';
  hideError();
  document.getElementById('resultCard').style.display = 'none';

  try {
    const lang = document.getElementById('language')?.value || 'DE';
    const name = document.getElementById('candidateName')?.value || '';
    const pos = document.getElementById('position')?.value || '';
    const client = document.getElementById('client')?.value || 'Vertraulich';
    const datum = document.getElementById('datum')?.value || '';

    let prompt = '';

    if (currentDocType === 'kandidatenbericht') {
      prompt = buildKandidatenPrompt(lang, name, pos, client, datum);
    } else {
      const freeText = document.getElementById('freeText')?.value || '';
      prompt = `Erstelle ein professionelles Orxestra ${currentDocType} Dokument auf ${lang === 'DE' ? 'Deutsch' : 'Englisch'}.\n\nInhalt: ${freeText}`;
    }

    const response = await fetch('/api/docs-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], language: lang.toLowerCase() })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    generatedText = data.text || '';

    if (!generatedText) throw new Error('Leere Antwort vom Server');

    document.getElementById('resultText').textContent = generatedText;
    document.getElementById('resultCard').style.display = 'block';
    document.getElementById('resultCard').scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    showError('Fehler: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ DOKUMENT GENERIEREN';
    progress.style.display = 'none';
  }
}

function buildKandidatenPrompt(lang, name, pos, client, datum) {
  const isDE = lang === 'DE';
  return `Erstelle einen professionellen ${isDE ? 'VERTRAULICHEN KANDIDATENBERICHT' : 'CONFIDENTIAL CANDIDATE REPORT'} im exakten Orxestra-Format.

Kandidat: ${name || '[Name aus CV entnehmen]'}
Position: ${pos || '[Position aus CV entnehmen]'}
Klient: ${client}
Datum: ${datum}
Sprache: ${isDE ? 'Deutsch' : 'English'}

WICHTIGE REGELN:
- Kein Markdown, keine ## Symbole
- Abschnittstitel in GROSSBUCHSTABEN
- Leere Abschnitte komplett weglassen
- Bewertungstexte (Persönlichkeit, Motivation) aus den Notizen entnehmen oder aus dem Karrieremuster ableiten
- Für Berufserfahrung: Firmenbeschreibung in Kursiv (mit * markieren), dann Hauptverantwortlichkeiten und Key Achievements mit - Bullets

STRUKTUR:
${name || 'NAME DES KANDIDATEN'}
${isDE ? 'VERTRAULICHER KANDIDATENBERICHT' : 'CONFIDENTIAL CANDIDATE REPORT'}
${pos || ''}
${datum}

[Vertraulichkeitshinweis]

PERSÖNLICHE ANGABEN
Name: 
Geburtsdatum: 
Wohnort: 
Nationalität: 
Sprachen: 

AUSBILDUNG UND QUALIFIKATIONEN
[chronologisch]

VERGÜTUNG UND VERFÜGBARKEIT
[nur wenn vorhanden]

KARRIERE ZUSAMMENFASSUNG
[Zeitraum | Unternehmen | Titel, chronologisch rückwärts]

KANDIDATENBEWERTUNG

FACHLICHES RESÜMEE
[3-4 Paragraphen aus Berater-Perspektive]

BEWERTUNG
[Persönlichkeit, Führungsstil - aus Notizen oder aus Karrieremuster]

BERUFSERFAHRUNG
[detailliert mit Firmeninfo, Verantwortlichkeiten, Achievements]

---
CV-INHALT:
${cvText}
${notesText ? '\nGESPRÄCHSNOTIZEN:\n' + notesText : ''}`;
}

// ── DOWNLOAD WORD ──────────────────────────────────────────────────────────
async function downloadWord() {
  if (!generatedText) return;

  const btn = document.getElementById('wordBtn');
  btn.disabled = true;
  btn.textContent = 'Wird erstellt...';

  try {
    const name = document.getElementById('candidateName')?.value || '';
    const pos = document.getElementById('position')?.value || '';
    const client = document.getElementById('client')?.value || '';
    const datum = document.getElementById('datum')?.value || '';

    const response = await fetch('/api/generate-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ text: generatedText, candidateName: name, position: pos, client, datum, language: document.getElementById('language')?.value?.toLowerCase() || 'de' })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (name ? name.replace(/\s+/g, '_') : 'Kandidat') + '_Orxestra_Bericht.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

  } catch (err) {
    showError('Download-Fehler: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '⬇ Download Word (.docx)';
  }
}

function copyText() {
  navigator.clipboard.writeText(generatedText).then(() => {
    const btn = event.target;
    btn.textContent = '✓ Kopiert!';
    setTimeout(() => { btn.textContent = '📋 Text kopieren'; }, 2000);
  });
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.style.display = 'block';
}
function hideError() {
  document.getElementById('errorMsg').style.display = 'none';
}
</script>
</body>
</html>
