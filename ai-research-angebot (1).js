import JSZip from 'jszip';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { docxBase64 } = req.body;
    if (!docxBase64) return res.status(400).json({ error: 'No docxBase64 provided' });

    const buffer = Buffer.from(docxBase64, 'base64');
    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file('word/document.xml').async('string');

    // Fix: set w:before="0" on any paragraph with Coverdoctitle style
    // This removes the 4200 twips spacing that causes the blank first page
    const fixedXml = docXml.replace(
      /(<w:pStyle w:val="Coverdoctitle"\/>[\s\S]*?)<w:spacing([^>]*)w:before="[0-9]+"([^>]*)\/>/g,
      (match, pre, mid, post) => {
        return pre + '<w:spacing' + mid + 'w:before="0"' + post + '/>';
      }
    );

    zip.file('word/document.xml', fixedXml);
    const fixedBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    res.status(200).json({ docxBase64: fixedBuffer.toString('base64') });
  } catch (err) {
    console.error('fix-angebot error:', err);
    res.status(500).json({ error: err.message });
  }
}
