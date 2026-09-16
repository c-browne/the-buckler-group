// The Buckler Group — v4.5. Additive data migration and submission hardening.
const { randomUUID } = require('node:crypto');

const VERSION = '2026-09-16.1';
const FORM_VERSION = 'v4.5';
const ACCEPTED_CONDUCT_VERSIONS = new Set([VERSION,'2026-09-08.1']);
const JURISDICTIONS_BASE = 'appLvJsO1Q8w5lLnP';
const JURISDICTION_IDS = Object.freeze({"antigua & barbuda":"rechV8oz7jl8L1VvP","antigua and barbuda":"rechV8oz7jl8L1VvP","bahamas":"recczzVQLd2XkFRDI","barbados":"reccHf525q9E47YEc","canada":"recVD7yMAap2T3Cu7","dominican republic":"recWXhpQWhD7e4lvy","grenada":"recEGhw3KcGYMH9BT","guyana":"recmE3RDbMV84nS3Z","jamaica":"recyFPXHCSic5iVz7","other":"rec36O5zGtgIAH1ta","the bahamas":"recczzVQLd2XkFRDI","tobago":"rec38yRR8u016vNoJ","trinidad & tobago":"rec5y3fEZrCKYnYod","trinidad and tobago":"rec5y3fEZrCKYnYod","united kingdom":"rec1T8AkIrA5TKkr6","united states":"recKckUdA5YAe2Rf2"});
const STAKEHOLDERS = new Set(['Government / Public Sector','Investment Promotion Agency','Institutional Investor','Family Office / UHNW Principal','Developer / Project Sponsor','Hospitality Executive','Finance / Lending Institution','Architecture / Planning / Engineering','Academic Institution','Professional Services','Diaspora Business Leader','Regional / Multilateral Institution']);
const AREAS = new Set(['Hospitality & Tourism','Real Estate Development','Infrastructure & PPP','Investment & Capital Markets','Sustainable Development','Cultural & Economic Transformation']);
const INTERESTS = new Set(['Strategic Sessions','Partnerships / Collaborations','Advisory Opportunities','EXODUS Membership','Investment Opportunities','Other']);
const PERSONAS = new Set(['Government / Policy Leader','Institutional Investor','Family Office / UHNW Principal','Developer / Sponsor','Advisor / Consultant','Academic / Institutional Partner','Service Provider']);
const CAPITAL_RANGES = new Set(['<$1M','$1M-$5M','$5M-$25M','$25M-$100M','$100M+','Not Applicable','Not Disclosed']);
const SESSIONS = new Set(['Guyana','Grenada','Trinidad & Tobago','Barbados','The Bahamas','Dominican Republic']);
const PERSONA_NORMALIZATION = Object.freeze({'Academic / Institutional Partner':'Other / Unclassified'});
const clean = value => value == null ? '' : Array.isArray(value) ? value.map(item => String(item).trim()).filter(Boolean).join(', ') : String(value).trim();
const multi = value => !value ? [] : (Array.isArray(value) ? value : String(value).split(',')).map(clean).filter(Boolean);
const response = (statusCode, body) => ({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(body)});
const redirect = () => ({statusCode:302,headers:{Location:'/thank-you/','Cache-Control':'no-store'},body:''});
function parse(event) {
  const body = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
  if (Buffer.byteLength(body,'utf8') > 30000) throw Object.assign(new Error('Payload too large'),{statusCode:413});
  const headers = event.headers || {};
  const type = String(headers['content-type'] || headers['Content-Type'] || '').toLowerCase();
  if (type.includes('application/x-www-form-urlencoded')) {
    const data = Object.create(null);
    for (const [rawKey,value] of new URLSearchParams(body)) {
      const key = rawKey.endsWith('[]') ? rawKey.slice(0,-2) : rawKey;
      if (Object.prototype.hasOwnProperty.call(data,key)) data[key] = [].concat(data[key],value); else data[key] = value;
    }
    return data;
  }
  const parsed = JSON.parse(body);
  const data = parsed?.payload?.data || parsed?.data || parsed;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid body');
  return data;
}
function validHttpUrl(value) { if (!value) return true; try { return ['http:','https:'].includes(new URL(value).protocol); } catch { return false; } }
function validate(data) {
  const required = ['full_name','email_address','title_position','organization_company','country_jurisdiction','stakeholder_category','primary_area_of_interest'];
  const missing = required.filter(key => typeof data[key] !== 'string' || !data[key].trim());
  if (missing.length) return {statusCode:400,body:{error:'Missing required form fields.',required:missing}};
  const limits = {full_name:120,email_address:254,title_position:160,organization_company:200,phone_number:50,linkedin_profile:500,organization_website:500,interest_note:3000,referral_partner:160,referral_code:100,referral_category:160,referral_entry_url:500};
  const tooLong = Object.entries(limits).filter(([key,max]) => clean(data[key]).length > max).map(([key]) => key);
  if (tooLong.length) return {statusCode:400,body:{error:'One or more fields exceed the permitted length.',fields:tooLong}};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(data.email_address))) return {statusCode:400,body:{error:'Enter a valid email address.',field:'email_address'}};
  if (!validHttpUrl(clean(data.linkedin_profile))) return {statusCode:400,body:{error:'Enter a valid LinkedIn URL.',field:'linkedin_profile'}};
  if (!validHttpUrl(clean(data.organization_website))) return {statusCode:400,body:{error:'Enter a valid organization URL.',field:'organization_website'}};
  if (!validHttpUrl(clean(data.referral_entry_url))) return {statusCode:400,body:{error:'Invalid referral URL.',field:'referral_entry_url'}};
  if (!Object.prototype.hasOwnProperty.call(JURISDICTION_IDS,clean(data.country_jurisdiction).toLowerCase())) return {statusCode:400,body:{error:'Select a supported country or choose Other.',field:'country_jurisdiction'}};
  if (!STAKEHOLDERS.has(clean(data.stakeholder_category))) return {statusCode:400,body:{error:'Select a valid stakeholder category.',field:'stakeholder_category'}};
  if (!AREAS.has(clean(data.primary_area_of_interest))) return {statusCode:400,body:{error:'Select a valid primary interest.',field:'primary_area_of_interest'}};
  const interests = multi(data.interest);
  if (!interests.length || interests.some(value => !INTERESTS.has(value))) return {statusCode:400,body:{error:'Select valid participation interests.',field:'interest'}};
  const persona = clean(data.applicant_persona || data.investment_capacity);
  if (persona && !PERSONAS.has(persona)) return {statusCode:400,body:{error:'Select a valid applicant description.',field:'applicant_persona'}};
  const capital = clean(data.deployable_capital_range);
  if (capital && !CAPITAL_RANGES.has(capital)) return {statusCode:400,body:{error:'Select a valid capital range.',field:'deployable_capital_range'}};
  const session = clean(data.session_jurisdiction);
  if (session && !SESSIONS.has(session)) return {statusCode:400,body:{error:'Select a valid Strategic Session.',field:'session_jurisdiction'}};
  const started = Number(data.form_started_at);
  if (Number.isFinite(started) && Date.now() - started < 2500) return {statusCode:429,body:{error:'Please review the application before submitting.'}};
  return null;
}
function scoreApplication(data) {
  let score = 0;
  const stakeholder = clean(data.stakeholder_category).toLowerCase(); const persona = clean(data.applicant_persona || data.investment_capacity).toLowerCase(); const country = clean(data.country_jurisdiction).toLowerCase(); const area = clean(data.primary_area_of_interest).toLowerCase();
  for (const [term,points] of [['institutional investor',20],['family office',20],['government',18],['investment promotion',16],['developer',16],['hospitality',14],['regional',14],['finance',12],['academic',8]]) if (stakeholder.includes(term)) score += points;
  for (const [term,points] of [['institutional investor',18],['family office',18],['developer',15],['government',14],['advisor',8],['academic',6]]) if (persona.includes(term)) score += points;
  if (['guyana','barbados','bahamas','grenada','antigua','trinidad','tobago'].some(term => country.includes(term))) score += 12;
  for (const [term,points] of [['hospitality',10],['real estate',10],['infrastructure',10],['capital',10],['sustainable',8],['cultural',6]]) if (area.includes(term)) score += points;
  if (clean(data.organization_company)) score += 5; if (clean(data.linkedin_profile)) score += 5; if (clean(data.interest_note).length >= 120) score += 7; return Math.min(score,100);
}
function riskSignals(data) { const signals=[]; const interests=multi(data.interest); if (interests.length===INTERESTS.size) signals.push('all_participation_options'); else if (interests.length>4) signals.push('high_option_count'); if (!clean(data.form_started_at)) signals.push('missing_client_timing'); return signals; }
function buildApplicationFields(data,{organizationRecordId,requestId,signals}) {
  const score=scoreApplication(data); const priority=score>=85?'Tier 1':score>=70?'Tier 2':score>=50?'Tier 3':'Watchlist'; const now=new Date().toISOString(); const persona=clean(data.applicant_persona || data.investment_capacity); const normalizedPersona=PERSONA_NORMALIZATION[persona] || persona; const capital=clean(data.deployable_capital_range);
  const fields={'Full Name':clean(data.full_name),'Email Address':clean(data.email_address).toLowerCase(),'Phone Number':clean(data.phone_number),'Title / Position':clean(data.title_position),'Organization':clean(data.organization_company),'Organization Link':organizationRecordId?[organizationRecordId]:[],'Country / Jurisdiction':[JURISDICTION_IDS[clean(data.country_jurisdiction).toLowerCase()]],'LinkedIn Profile':clean(data.linkedin_profile),'Organization Website':clean(data.organization_website),'Stakeholder Category':clean(data.stakeholder_category),'Primary Area of Interest':clean(data.primary_area_of_interest),'Participation Interest':multi(data.interest),'Investment Capacity':persona,'Applicant Persona':normalizedPersona,'Deployable Capital Range':capital,'Notes':clean(data.interest_note),'Executive Engagement Score':score,'Review Status':score>=85?'Under Review':'New','Strategic Priority':priority,'Priority':priority,'Referral Partner':clean(data.referral_partner),'Referral Code':clean(data.referral_code),'Referral Category':clean(data.referral_category),'Referral Entry URL':clean(data.referral_entry_url),'Submission Source':clean(data.source_page || 'participation'),'Campaign':clean(data.campaign || 'strategic-sessions-2026'),'Platform':clean(data.platform || 'thebucklergroup.com'),'Form Version':FORM_VERSION,'Date Submitted':now.slice(0,10),'Next Action':score>=85?'Review for invitation approval':'Review application','Code of Conduct Accepted':true,'Code of Conduct Version':clean(data.code_of_conduct_version),'Code of Conduct Accepted At':now,'Application Confirmed':true,'Session Jurisdiction':clean(data.session_jurisdiction),'Data Quality Status':signals.length?'Needs Review':'Unreviewed','Email Verification Status':'Not Verified','Submission Request ID':requestId,'Submission Risk Signals':signals.join('; ')};
  for (const key of Object.keys(fields)) if (fields[key] === '' || Array.isArray(fields[key]) && !fields[key].length) delete fields[key]; return fields;
}
function escapeFormula(value) { return String(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
async function listAirtableRecords({token,baseId,tableName,formula,maxRecords=1}) { const query=new URLSearchParams({filterByFormula:formula,maxRecords:String(maxRecords)}); const result=await fetch(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}?${query}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)}); if (!result.ok) throw new Error(`Airtable lookup failed: ${result.status}`); const body=await result.json(); return Array.isArray(body.records)?body.records:[]; }
async function findRecentDuplicate(config,data) { const email=escapeFormula(clean(data.email_address).toLowerCase()); const formula=`AND(LOWER({Email Address})='${email}',DATETIME_DIFF(NOW(),{Created Time},'minutes')<15)`; return (await listAirtableRecords({...config,formula}))[0] || null; }
async function findOrganization(config,name) { const formula=`LOWER({Organization Name})='${escapeFormula(clean(name).toLowerCase())}'`; const records=await listAirtableRecords({...config,formula}); return records.length===1?records[0].id:null; }
exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') return response(405,{error:'Method not allowed. Submit the participation form.'});
  let data; try { data=parse(event); } catch (error) { return response(error.statusCode || 400,{error:error.statusCode===413?'Form submission is too large.':'Invalid form body.'}); }
  if (clean(data['bot-field']) || clean(data.company_fax)) return redirect();
  if (data.code_of_conduct_accepted !== 'yes' || !ACCEPTED_CONDUCT_VERSIONS.has(clean(data.code_of_conduct_version))) return response(400,{error:'Accept the current Strategic Session Code of Conduct before submitting.',field:'code_of_conduct_accepted'});
  if (data.confirmation !== 'yes') return response(400,{error:'Confirm the application is accurate before submitting.',field:'confirmation'});
  const validationError=validate(data); if (validationError) return response(validationError.statusCode,validationError.body);
  const token=process.env.AIRTABLE_TOKEN; const baseId=process.env.AIRTABLE_BASE_ID; const tableName=process.env.AIRTABLE_APPLICATIONS_TABLE || 'Executive Applications'; const organizationsTable=process.env.AIRTABLE_ORGANIZATIONS_TABLE || 'Organizations';
  if (!token || !baseId) return response(500,{error:'Registration is temporarily unavailable. Please contact TBG.'});
  if (baseId !== JURISDICTIONS_BASE) { console.error('Jurisdiction mapping base mismatch'); return response(500,{error:'Registration configuration needs attention. Please contact TBG.'}); }
  const config={token,baseId,tableName}; let duplicate=null; let organizationRecordId=null;
  const lookups=await Promise.allSettled([findRecentDuplicate(config,data),findOrganization({token,baseId,tableName:organizationsTable},data.organization_company)]);
  if (lookups[0].status==='fulfilled') duplicate=lookups[0].value; else console.error('Duplicate preflight lookup failed',{message:lookups[0].reason?.message});
  if (lookups[1].status==='fulfilled') organizationRecordId=lookups[1].value; else console.error('Organization enrichment lookup failed',{message:lookups[1].reason?.message});
  if (duplicate) return response(429,{error:'An application using this email was recently received. Please wait before resubmitting.'});
  const requestId=randomUUID(); const signals=riskSignals(data);
  try {
    const result=await fetch(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({records:[{fields:buildApplicationFields(data,{organizationRecordId,requestId,signals})}],typecast:true}),signal:AbortSignal.timeout(10000)});
    if (!result.ok) { const detail=await result.json().catch(()=>({})); const errorType=typeof detail.error?.type==='string' && /^[A-Z0-9_]+$/.test(detail.error.type)?detail.error.type:'UNKNOWN'; console.error('Airtable write failed',{status:result.status,errorType,requestId}); return response(502,{error:'We could not save your application. Please contact TBG before resubmitting.',requestId}); }
    return redirect();
  } catch { console.error('Airtable request failed or timed out',{requestId}); return response(502,{error:'Your submission could not be confirmed. Please contact TBG before resubmitting.',requestId}); }
};
exports._test = {parse,validate,riskSignals,buildApplicationFields};
