import { readFileSync } from 'fs';
import { join } from 'path';
import JSZip from 'jszip';

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

function xe(str){if(!str)return'';return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function rpr(opts){opts=opts||{};let x='<w:rPr>';if(opts.major)x+='<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>';else x+='<w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" w:cstheme="minorHAnsi"/>';if(opts.bold)x+='<w:b/>';if(opts.italic)x+='<w:i/>';x+=`<w:color w:val="${opts.color||'414042'}"/><w:sz w:val="${opts.sz||22}"/><w:szCs w:val="${opts.sz||22}"/>`;x+='</w:rPr>';return x;}
function run(text,opts){return`<w:r>${rpr(opts)}<w:t xml:space="preserve">${xe(text)}</w:t></w:r>`;}
function p(children,before,after,jc){let ppr=`<w:spacing w:before="${before||0}" w:after="${after||0}"/>`;if(jc)ppr+=`<w:jc w:val="${jc}"/>`;return`<w:p><w:pPr>${ppr}</w:pPr>${children}</w:p>`;}
function hr(){return`<w:p><w:pPr><w:spacing w:before="60" w:after="60"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="C8D0DC"/></w:pBdr></w:pPr></w:p>`;}
function sectionHead(text){const r=rpr({major:true,bold:true,sz:24,color:'102E66'});return`<w:p><w:pPr><w:pStyle w:val="berschrift2"/><w:pageBreakBefore w:val="0"/><w:spacing w:before="400" w:after="80"/>${r}</w:pPr><w:r>${r}<w:t>${xe(text)}</w:t></w:r></w:p>`;}
function bodyText(text){const r=rpr({sz:22,color:'414042'});return`<w:p><w:pPr><w:spacing w:before="100" w:after="100"/><w:jc w:val="both"/>${r}</w:pPr><w:r>${r}<w:t xml:space="preserve">${xe(text)}</w:t></w:r></w:p>`;}

function buildBody(d,today){
  const parts=[];
  const ml=rpr({major:true,sz:20,color:'595959'});
  const mv=rpr({major:true,sz:20,color:'1F5C9A',bold:true});
  parts.push(p(run(d.ajd.position,{major:true,bold:true,sz:44,color:'102E66'}),1700,300,'center'));
  parts.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="80"/><w:jc w:val="center"/></w:pPr><w:r>${ml}<w:t xml:space="preserve">Sektor: </w:t></w:r><w:r>${mv}<w:t xml:space="preserve">${xe(d.sector)}</w:t></w:r></w:p>`);
  parts.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="80"/><w:jc w:val="center"/></w:pPr><w:r>${ml}<w:t xml:space="preserve">Standort: </w:t></w:r><w:r>${mv}<w:t xml:space="preserve">${xe(d.location)}</w:t></w:r></w:p>`);
  parts.push(p(run('represented by SIGNIUM',{major:true,sz:22,color:'414042'}),600,80,'center'));
  parts.push(p(run(today,{major:true,sz:18,color:'999999'}),0,0,'center'));
  parts.push(`<w:p><w:pPr><w:pageBreakBefore/><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>`);
  parts.push(sectionHead('DAS UNTERNEHMEN')); parts.push(hr());
  parts.push(bodyText(d.ajd.company_context));
  parts.push(p('',80,0));
  parts.push(bodyText(d.ajd.role_context));
  parts.push(sectionHead('DIE POSITION')); parts.push(hr());
  parts.push(bodyText(d.ajd.responsibilities_text));
  parts.push(sectionHead('DER KANDIDAT')); parts.push(hr());
  parts.push(bodyText(d.ajd.requirements_text));
  parts.push(p('',120,0));
  const subR=rpr({major:true,bold:true,sz:22,color:'262626'});
  parts.push(`<w:p><w:pPr><w:spacing w:before="200" w:after="80"/>${subR}</w:pPr><w:r>${subR}<w:t>F\u00fchrungsprofil &amp; Pers\u00f6nlichkeit</w:t></w:r></w:p>`);
  parts.push(bodyText(d.ajd.leadership_profile));
  parts.push(sectionHead('DAS ANGEBOT')); parts.push(hr());
  parts.push(bodyText(d.ajd.offer));
  parts.push(p('',400,0));
  const sr=rpr({major:true,sz:36,color:'1F5C9A'});
  parts.push(`<w:p><w:pPr><w:spacing w:before="400" w:after="0"/><w:jc w:val="center"/><w:pBdr><w:top w:val="single" w:sz="6" w:space="8" w:color="1F5C9A"/></w:pBdr></w:pPr><w:r>${sr}<w:t>SIGNIUM</w:t></w:r></w:p>`);
  parts.push(p(run('Sami Hamid  |  Managing Partner  |  Orxestra',{bold:true,color:'102E66',sz:18,major:true}),120,0,'center'));
  parts.push(p(run('s.hamid@signium.com  |  signium.com',{color:'888888',sz:17,major:true}),40,0,'center'));
  return parts.join('\n');
}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try{
    const{ajdData}=req.body;
    if(!ajdData) return res.status(400).json({error:'ajdData fehlt'});
    const d=ajdData;
    const today=new Date().toLocaleDateString('de-AT',{year:'numeric',month:'long',day:'numeric'});
    const templateBuffer=readFileSync(join(process.cwd(),'template.docx'));
    const zip=await JSZip.loadAsync(templateBuffer);
    for(const hf of['word/header1.xml','word/header2.xml','word/header3.xml']){
      const file=zip.file(hf);if(!file)continue;
      let xml=await file.async('string');
      const pts=xml.split('[Type text]');
      if(pts.length===4){xml=pts[0]+xe('Anonymes Jobprofil')+pts[1]+xe(d.ajd?.position||'')+pts[2]+xe(today)+pts[3];}
      else{xml=xml.replace(/\[Type text\]/g,xe(d.ajd?.position||''));}
      zip.file(hf,xml);
    }
    const docXml=await zip.file('word/document.xml').async('string');
    const bodyStart=docXml.indexOf('<w:body>')+'<w:body>'.length;
    const bodyEnd=docXml.lastIndexOf('</w:body>');
    const sectPrMatch=docXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
    const sectPr=sectPrMatch?sectPrMatch[0]:'';
    const newXml=docXml.substring(0,bodyStart)+'\n'+buildBody(d,today)+'\n'+sectPr+'\n'+docXml.substring(bodyEnd);
    zip.file('word/document.xml',newXml);
    const out=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}});
    const base64=out.toString('base64');
    const filename=`AJD_${(d.ajd?.position||'Position').replace(/[^a-zA-Z0-9]/g,'_')}_${new Date().getFullYear()}.docx`;
    return res.status(200).json({success:true,docx:base64,filename});
  }catch(err){
    console.error('generate-ajd error:',err);
    return res.status(500).json({error:err.message});
  }
}
