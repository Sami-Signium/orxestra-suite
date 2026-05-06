import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { readFileSync } from 'fs';
import { join } from 'path';
import JSZip from 'jszip';

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

function xe(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function rpr(opts) {
  opts = opts || {};
  let x = '<w:rPr>';
  if (opts.major) {
    x += '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>';
  } else {
    x += '<w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" w:cstheme="minorHAnsi"/>';
  }
  if (opts.bold) x += '<w:b/>';
  if (opts.italic) x += '<w:i/>';
  const color = opts.color || '414042';
  x += `<w:color w:val="${color}"/>`;
  const sz = opts.sz || 22;
  x += `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`;
  x += '</w:rPr>';
  return x;
}

function run(text, opts) {
  return `<w:r>${rpr(opts)}<w:t xml:space="preserve">${xe(text)}</w:t></w:r>`;
}

function np(text, before, after, opts) {
  opts = opts || {};
  let ppr = '';
  if (before !== undefined || after !== undefined) {
    const b = before !== undefined ? ` w:before="${before}"` : '';
    const a = after !== undefined ? ` w:after="${after}"` : '';
    ppr += `<w:spacing${b}${a}/>`;
  }
  if (opts.jc) ppr += `<w:jc w:val="${opts.jc}"/>`;
  if (!text && text !== 0) return `<w:p><w:pPr>${ppr}</w:pPr></w:p>`;
  return `<w:p><w:pPr>${ppr}</w:pPr>${run(text, opts)}</w:p>`;
}

function personalRow(label, value) {
  const labelRpr = rpr({ sz: 22, color: '414042' });
  const valueRpr = rpr({ sz: 22, color: '262626' });
  return `<w:p>
    <w:pPr><w:pStyle w:val="SPTBodytext66"/>${rpr({ sz: 22 })}</w:pPr>
    <w:r>${labelRpr}<w:t>${xe(label)}</w:t><w:tab/><w:tab/><w:tab/><w:tab/></w:r>
    <w:r>${valueRpr}<w:t xml:space="preserve">${xe(value)}</w:t></w:r>
  </w:p>`;
}

function hr() {
  return np('________________________________________________________________________________', 60, 60, { color: 'CCCCCC', sz: 16 });
}

function bullet(text, before, after) {
  const spacing = `<w:spacing w:before="${before||60}" w:after="${after||60}"/>`;
  const ind = `<w:ind w:left="400" w:hanging="200"/>`;
  const r = rpr({ sz: 22, color: '262626' });
  return `<w:p>
    <w:pPr>
      <w:numPr><w:ilvl w:val="0"/><w:numId w:val="18"/></w:numPr>
      ${spacing}
      ${ind}
    </w:pPr>
    <w:r>${r}<w:t xml:space="preserve">${xe(text)}</w:t></w:r>
  </w:p>`;
}

function companyHeader(datePart, companyPart, before, after) {
  const dateRpr = rpr({ sz: 22, color: '414042' });
  const companyRpr = rpr({ sz: 28, color: '262626', bold: true });
  let ppr = `<w:pStyle w:val="Amrop-header"/>`;
  ppr += `<w:spacing w:before="${before||120}" w:after="${after||120}"/>`;
  ppr += rpr({ sz: 22, color: '414042' });
  if (companyPart) {
    return `<w:p><w:pPr>${ppr}</w:pPr>
      <w:r>${dateRpr}<w:t xml:space="preserve">${xe(datePart)}: </w:t><w:tab/></w:r>
      <w:r>${companyRpr}<w:t xml:space="preserve">${xe(companyPart)}</w:t></w:r>
    </w:p>`;
  }
  return `<w:p><w:pPr>${ppr}</w:pPr>
    <w:r>${dateRpr}<w:t xml:space="preserve">${xe(datePart)}</w:t></w:r>
  </w:p>`;
}

function sectionHead(text, pageBreak) {
  let ppr = `<w:pStyle w:val="berschrift2"/>`;
  if (pageBreak) ppr += `<w:pageBreakBefore/>`;
  ppr += `<w:spacing w:before="120"/>`;
  const r = rpr({ major: true, bold: true, sz: 28, color: '102E66' });
  ppr += r;
  return `<w:p><w:pPr>${ppr}</w:pPr><w:r>${r}<w:t xml:space="preserve">${xe(text)}</w:t></w:r></w:p>`;
}

const SECTION_KEYS_DE = [
  'PERSOENLICHE ANGABEN','AUSBILDUNG UND QUALIFIKATIONEN','AUSBILDUNG',
  'VERGUETUNG UND VERFUEGBARKEIT','VERGUETUNG',
  'KARRIERE ZUSAMMENFASSUNG',
  'KANDIDATENBEWERTUNG','FACHLICHES RESUEMEE','BEWERTUNG',
  'BEWERBERMOTIVATION','KANDIDATENMOTIVATION',
  'BERUFSERFAHRUNG','BERUFLICHER WERDEGANG','ANMERKUNGEN ZUM WERDEGANG'
];

const SECTION_KEYS_EN = [
  'PERSONAL DETAILS',
  'EDUCATION & QUALIFICATIONS','EDUCATION',
  'COMPENSATION & AVAILABILITY','COMPENSATION',
  'CAREER SUMMARY',
  'CANDIDATE EVALUATION','PROFESSIONAL SUMMARY','PERSONAL EVALUATION',
  'CANDIDATE MOTIVATION','MOTIVATION',
  'PROFESSIONAL EXPERIENCE','WORK EXPERIENCE','CONCLUSION AND FIT FOR THE ROLE'
];

function getSectionKeys(lang) {
  return lang === 'en' ? [...SECTION_KEYS_EN, ...SECTION_KEYS_DE] : [...SECTION_KEYS_DE, ...SECTION_KEYS_EN];
}

function needsPageBreak(key) {
  const u = key.toUpperCase();
  if (u.includes('PERS') && (u.includes('NLICH') || u.includes('ONAL'))) return true;
  if (u.includes('VERG') || u.includes('COMPENSATION')) return true;
  if (u.includes('KARRIERE') || u.includes('CAREER')) return true;
  if (u.includes('FACHLICH') || u.includes('PROFESSIONAL SUMMARY')) return true;
  if (u.includes('BEWERTUNG') || u.includes('PERSONAL EVALUATION')) return true;
  if (u.includes('BERUFS') || u.includes('BERUFLICHER') || u.includes('WORK EXP') || u.includes('PROFESSIONAL EXP')) return true;
  if (u.includes('CONCLUSION')) return true;
  return false;
}

function parseReport(raw, lang) {
  const lines = raw.split('\n');
  const result = [];
  let current = { key: 'HEADER', lines: [] };
  const keys = getSectionKeys(lang);
  for (const line of lines) {
    const t = line.trim();
    const u = t.toUpperCase();
    const matched = keys.find(k => u === k || u.startsWith(k + ':'));
    if (matched && t.length > 0) {
      result.push(current);
      current = { key: t, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  result.push(current);
  return result;
}

function buildBodyXml(reportText, candidateName, position, client, datum, lang) {
  const sections = parseReport(reportText, lang);
  const parts = [];
  const isEN = lang === 'en';

  const coverTitle = isEN ? 'CONFIDENTIAL REPORT ON THE CANDIDATE' : 'VERTRAULICHER KANDIDATENBERICHT';
  const disclaimerText = isEN
    ? 'The following evaluation has been prepared for the exclusive use of the client named above. Its use should be controlled and limited to designated executives concerned with the selection of the candidate, and under no circumstances should the evaluation contained herein be transmitted to the candidate.'
    : 'Dieser Vertrauliche Bericht enthaelt zum Teil Informationen, die uns unter Zusicherung strengster Vertraulichkeit mitgeteilt wurden.';
  const preparedBy = isEN
    ? 'Prepared by: Dr. Sami Hamid  |  Managing Partner  |  Orxestra'
    : 'Vorbereitet von: Dr. Sami Hamid  |  Managing Partner  |  Orxestra';

  // Titleheader removed — name appears in page header
  parts.push(`<w:p><w:pPr><w:pStyle w:val="Coverdoctitle"/><w:spacing w:before="4080" w:after="0"/></w:pPr>
    ${run(coverTitle, { sz: 32, color: '102E66' })}</w:p>`);
  if (position) parts.push(`<w:p><w:pPr><w:pStyle w:val="Coverdate"/><w:spacing w:before="720" w:after="1000"/></w:pPr>
    ${run(position.toUpperCase(), { major: true, bold: true, sz: 28, color: '414042' })}</w:p>`);
  if (client && client !== 'Vertraulich') parts.push(`<w:p><w:pPr><w:pStyle w:val="Coverdate"/><w:spacing w:before="120" w:after="120"/></w:pPr>
    ${run(client, { major: true, bold: true, sz: 32, color: '414042' })}</w:p>`);
  parts.push(`<w:p><w:pPr><w:pStyle w:val="Coverdate"/><w:spacing w:before="120" w:after="1000"/></w:pPr>
    ${run(datum || '', { sz: 22, color: '414042' })}</w:p>`);
  parts.push(np('', 120));
  parts.push(np(disclaimerText, 120, undefined, { italic: true, color: '595959', sz: 18, jc: 'both' }));
  parts.push(np('', 120));

  for (const section of sections) {
    if (section.key === 'HEADER') continue;
    const content = section.lines.map(l => l.trim()).filter(Boolean);
    if (!content.length) continue;

    const ku = section.key.toUpperCase();
    const isPersonal = ku.includes('PERS') && (ku.includes('NLICH') || ku.includes('ONAL DETAILS'));
    const isExperience = ku.includes('BERUFS') || ku.includes('BERUFLICHER') || ku.includes('WORK EXP') || ku.includes('PROFESSIONAL EXP');
    const isKarriere = ku.includes('KARRIERE') || ku.includes('CAREER SUMMARY');
    const isVergutung = ku.includes('VERG') || ku.includes('COMPENSATION');
    const isKandidaten = ku.includes('FACHLICH') || ku.includes('BEWERTUNG') || ku.includes('PERSONAL EVAL') ||
      ku.includes('PROFESSIONAL SUMMARY') || ku.includes('KANDIDATEN') || ku.includes('MOTIVATION') ||
      ku.includes('CANDIDATE EVAL') || ku.includes('CANDIDATE MOT') || ku.includes('CONCLUSION');
    const pageBreak = needsPageBreak(section.key);

    parts.push(sectionHead(section.key.toUpperCase(), pageBreak));
    parts.push(hr());

    if (isPersonal) {
      for (const line of content) {
        if (line.includes(':')) {
          const idx = line.indexOf(':');
          parts.push(personalRow(line.slice(0, idx).trim(), line.slice(idx + 1).trim()));
        } else { parts.push(personalRow(line, '')); }
      }
      parts.push(np('', 120));
      continue;
    }

    if (isVergutung) {
      for (const line of content) {
        if (line.includes(':')) {
          const idx = line.indexOf(':');
          const label = line.slice(0, idx).trim();
          const value = line.slice(idx + 1).trim();
          const labelRpr = rpr({ bold: true, sz: 22, color: '414042' });
          const valueRpr = rpr({ sz: 22, color: '262626' });
          parts.push(`<w:p><w:pPr><w:spacing w:before="140" w:after="140"/></w:pPr>
            <w:r>${labelRpr}<w:t>${xe(label)}</w:t><w:tab/><w:tab/><w:tab/><w:tab/></w:r>
            <w:r>${valueRpr}<w:t xml:space="preserve">${xe(value)}</w:t></w:r>
          </w:p>`);
        } else { parts.push(np(line, 140, 140, { bold: true, sz: 22 })); }
      }
      parts.push(np('', 120));
      continue;
    }

    if (isKarriere) {
      for (const line of content) {
        const pipeParts = line.split('|').map(s => s.trim());
        if (pipeParts.length >= 2) {
          const dateRpr = rpr({ sz: 22, color: '414042' });
          const compRpr = rpr({ bold: true, sz: 22, color: '262626' });
          const titleRpr = rpr({ sz: 22, color: '262626' });
          parts.push(`<w:p><w:pPr><w:spacing w:before="120" w:after="120"/></w:pPr>
            <w:r>${dateRpr}<w:t>${xe(pipeParts[0])}</w:t><w:tab/><w:tab/></w:r>
            <w:r>${compRpr}<w:t xml:space="preserve">${xe(pipeParts[1])}</w:t></w:r>
            ${pipeParts[2] ? `<w:r>${titleRpr}<w:t xml:space="preserve">  |  ${xe(pipeParts[2])}</w:t></w:r>` : ''}
          </w:p>`);
        } else { parts.push(np(line, 120, 120, { bold: true, sz: 22, color: '262626' })); }
      }
      parts.push(np('', 120));
      continue;
    }

    if (isKandidaten) {
      for (const line of content) {
        if (!line.trim()) continue;
        if (/^[-•▪]/.test(line)) { parts.push(bullet(line.replace(/^[-•▪]\s*/, ''))); }
        else { parts.push(np(line, 160, 160, { jc: 'both', sz: 22, color: '262626' })); }
      }
      parts.push(np('', 120));
      continue;
    }

    if (isExperience) {
      let firstCompany = true;
      let i = 0;
      while (i < content.length) {
        const line = content[i];
        const isBullet = /^[-\u2013\u2022]/.test(line);
        const isCompanyDesc = /^\*/.test(line);
        const isDateHeader = /^(Jan|Feb|M.r|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez|Oct|Mar|Januar|Februar|M.rz|April|Juni|Juli|August|September|Oktober|November|Dezember|January|February|March|April|May|June|July|August|September|October|November|December|\d{2}\/\d{4}|\d{4}|seit|since)/.test(line) && !isBullet;
        if (isDateHeader) {
          if (!firstCompany) parts.push(hr());
          firstCompany = false;
          let datePart = line, companyPart = '';
          const colonIdx = line.indexOf(': ');
          const dashIdx = line.indexOf(' - ');
          if (colonIdx > 4) { datePart = line.slice(0, colonIdx); companyPart = line.slice(colonIdx + 2); }
          else if (dashIdx > 4) { datePart = line.slice(0, dashIdx); companyPart = line.slice(dashIdx + 3); }
          parts.push(companyHeader(datePart, companyPart));
        } else if (isCompanyDesc) {
          const r = rpr({ sz: 22, color: '595959', italic: true });
          parts.push(`<w:p><w:pPr><w:pStyle w:val="Listing1"/><w:spacing w:before="60" w:after="60"/>${r}</w:pPr>
            <w:r>${r}<w:t xml:space="preserve">${xe(line.replace(/^\*|\*$/g, ''))}</w:t></w:r></w:p>`);
          parts.push(hr());
        } else if (isBullet) {
          parts.push(bullet(line.replace(/^[-\u2013\u2022]\s*/, '')));
        } else if (line.trim()) {
          parts.push(np(line, 120, 80, { bold: true, sz: 24, color: '262626' }));
        }
        i++;
      }
      parts.push(np('', 120));
      continue;
    }

    for (const line of content) {
      parts.push(np(line, 120, 80, { sz: 22, color: '262626' }));
    }
    parts.push(np('', 120));
  }

  parts.push(np('', 240));
  parts.push(np(preparedBy, 120, 0, { bold: true, color: '102E66', sz: 18 }));
  parts.push(np('t +43 664 4568862  |  sami.hamid@signium.com', 40, 0, { color: '595959', sz: 17 }));

  return parts.join('\n');
}

async function updateHeaders(zip, candidateName, position, client) {
  for (const hf of ['word/header1.xml','word/header2.xml','word/header3.xml']) {
    const file = zip.file(hf);
    if (!file) continue;
    let xml = await file.async('string');
    xml = xml.replace(/Quintin Stephen/g, xe(candidateName || ''));
    xml = xml.replace(/Director of Identity &amp; Authentication/g, xe(position || ''));
    xml = xml.replace(/Austriacard/g, xe(client && client !== 'Vertraulich' ? client : 'Confidential'));
    xml = xml.replace(/AustriaCard Holdings[^<]*/g, xe(candidateName || ''));
    zip.file(hf, xml);
  }

  // Fix: make first-page header show same as default header
  const docFile = zip.file('word/document.xml');
  if (docFile) {
    let docXml = await docFile.async('string');
    // Find the default header rId and apply it to first page header too
    const defaultMatch = docXml.match(/w:headerReference w:type="default" r:id="([^"]+)"/);
    if (defaultMatch) {
      const defaultRid = defaultMatch[1];
      docXml = docXml.replace(
        /w:headerReference w:type="first" r:id="[^"]+"/,
        `w:headerReference w:type="first" r:id="${defaultRid}"`
      );
      zip.file('word/document.xml', docXml);
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { text, candidateName, position, client, datum, language } = req.body;
    if (!text) return res.status(400).json({ error: 'No text provided' });
    const lang = language === 'en' ? 'en' : 'de';

    const templatePath = join(process.cwd(), 'template.docx');
    const templateBuffer = readFileSync(templatePath);
    const zip = await JSZip.loadAsync(templateBuffer);

    await updateHeaders(zip, candidateName, position, client);

    const docXmlRaw = await zip.file('word/document.xml').async('string');
    const bodyStart = docXmlRaw.indexOf('<w:body>') + '<w:body>'.length;
    const bodyEnd = docXmlRaw.lastIndexOf('</w:body>');
    const sectPrMatch = docXmlRaw.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
    const sectPr = sectPrMatch ? sectPrMatch[0] : '';

    const newDocXml = docXmlRaw.substring(0, bodyStart) + '\n' +
      buildBodyXml(text, candidateName, position, client, datum, lang) + '\n' +
      sectPr + '\n' + docXmlRaw.substring(bodyEnd);

    zip.file('word/document.xml', newDocXml);
    const outputBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const safeName = (candidateName || 'Kandidat').replace(/\s+/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_Signium_Report.docx"`);
    res.send(outputBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
