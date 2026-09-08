// The Buckler Group — v4.3. Existing scoring/referrals with mandatory consent.
const VERSION = '2026-09-08.1';
const FORM_VERSION = 'v4.3';
const clean = value => value == null ? '' : Array.isArray(value)
  ? value.map(item => String(item).trim()).filter(Boolean).join(', ')
  : String(value).trim();
const multi = value => !value ? [] : (Array.isArray(value) ? value : String(value).split(',')).map(clean).filter(Boolean);
const response = (statusCode, body) => ({statusCode, headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}, body:JSON.stringify(body)});
const redirect = () => ({statusCode:302,headers:{Location:'/thank-you/','Cache-Control':'no-store'},body:''});

function parse(event) {
  const body = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
  const headers = event.headers || {};
  const type = String(headers['content-type'] || headers['Content-Type'] || '').toLowerCase();
  if (type.includes('application/x-www-form-urlencoded')) {
    const data = Object.create(null);
    for (const [rawKey, value] of new URLSearchParams(body)) {
      const key = rawKey.endsWith('[]') ? rawKey.slice(0,-2) : rawKey;
      if (Object.prototype.hasOwnProperty.call(data,key)) data[key] = [].concat(data[key],value);
      else data[key] = value;
    }
    return data;
  }
  const parsed = JSON.parse(body);
  const data = parsed?.payload?.data || parsed?.data || parsed;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid body');
  return data;
}

function scoreApplication(data) {
  let score = 0;
  const stakeholder = clean(data.stakeholder_category).toLowerCase();
  const capacity = clean(data.investment_capacity).toLowerCase();
  const country = clean(data.country_jurisdiction).toLowerCase();
  const area = clean(data.primary_area_of_interest).toLowerCase();
  for (const [term,points] of [['institutional investor',20],['family office',20],['government',18],['investment promotion',16],['developer',16],['hospitality',14],['regional',14],['finance',12],['academic',8]]) if (stakeholder.includes(term)) score += points;
  for (const [term,points] of [['institutional investor',18],['family office',18],['developer',15],['government',14],['advisor',8],['academic',6]]) if (capacity.includes(term)) score += points;
  if (['guyana','barbados','bahamas','grenada','antigua','trinidad','tobago'].some(term => country.includes(term))) score += 12;
  for (const [term,points] of [['hospitality',10],['real estate',10],['infrastructure',10],['capital',10],['sustainable',8],['cultural',6]]) if (area.includes(term)) score += points;
  if (clean(data.organization_company)) score += 5;
  if (clean(data.linkedin_profile)) score += 5;
  if (clean(data.interest_note).length >= 120) score += 7;
  return Math.min(score,100);
}

function buildApplicationFields(data) {
  const score = scoreApplication(data);
  const priority = score >= 85 ? 'Tier 1' : score >= 70 ? 'Tier 2' : score >= 50 ? 'Tier 3' : 'Watchlist';
  const now = new Date().toISOString();
  const fields = {
    'Full Name':clean(data.full_name),'Email Address':clean(data.email_address),
    'Phone Number':clean(data.phone_number),'Title / Position':clean(data.title_position),
    'Organization':clean(data.organization_company),'Country / Jurisdiction':clean(data.country_jurisdiction),
    'LinkedIn Profile':clean(data.linkedin_profile),'Organization Website':clean(data.organization_website),
    'Stakeholder Category':clean(data.stakeholder_category),'Primary Area of Interest':clean(data.primary_area_of_interest),
    'Participation Interest':multi(data.interest),'Investment Capacity':clean(data.investment_capacity),'Notes':clean(data.interest_note),
    'Executive Engagement Score':score,'Review Status':score >= 85 ? 'Under Review' : 'New',
    'Strategic Priority':priority,'Priority':priority,
    'Referral Partner':clean(data.referral_partner),'Referral Code':clean(data.referral_code),
    'Referral Category':clean(data.referral_category),'Referral Entry URL':clean(data.referral_entry_url),
    'Submission Source':clean(data.source_page || 'participation'),
    'Campaign':clean(data.campaign || 'strategic-sessions-2026'),
    'Platform':clean(data.platform || 'thebucklergroup.com'),
    'Form Version':FORM_VERSION,'Date Submitted':now,
    'Next Action':score >= 85 ? 'Review for invitation approval' : 'Review application',
    'Code of Conduct Accepted':true,
    'Code of Conduct Version':VERSION,
    'Code of Conduct Accepted At':now,
    'Application Confirmed':true,
    'Session Jurisdiction':clean(data.session_jurisdiction)
  };
  for (const key of Object.keys(fields)) if (fields[key] === '' || Array.isArray(fields[key]) && !fields[key].length) delete fields[key];
  return fields;
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') return response(405,{error:'Method not allowed. Submit the participation form.'});
  let data;
  try { data = parse(event); } catch { return response(400,{error:'Invalid form body.'}); }
  // Silently discard honeypot submissions, without contacting Airtable.
  if (clean(data['bot-field'])) return redirect();
  // Exact scalar values reject ambiguous duplicate consent fields.
  if (data.code_of_conduct_accepted !== 'yes' || data.code_of_conduct_version !== VERSION)
    return response(400,{error:'Accept the current Strategic Session Code of Conduct before submitting.',field:'code_of_conduct_accepted'});
  if (data.confirmation !== 'yes') return response(400,{error:'Confirm the application is accurate before submitting.',field:'confirmation'});
  const required = ['full_name','email_address','title_position','organization_company','country_jurisdiction','stakeholder_category','primary_area_of_interest'];
  const missing = required.filter(key => typeof data[key] !== 'string' || !data[key].trim());
  if (missing.length) return response(400,{error:'Missing required form fields.',required:missing});
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email_address.trim())) return response(400,{error:'Enter a valid email address.',field:'email_address'});
  if (!multi(data.interest).length) return response(400,{error:'Select at least one participation interest.',field:'interest'});
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_APPLICATIONS_TABLE || 'Executive Applications';
  if (!token || !baseId) return response(500,{error:'Registration is temporarily unavailable. Please contact TBG.'});
  try {
    const result = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}`,{
      method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({records:[{fields:buildApplicationFields(data)}],typecast:true}),
      signal:AbortSignal.timeout(10000)
    });
    if (!result.ok) {
      // Do not return raw Airtable details or applicant information to the browser.
      console.error('Airtable write failed',{status:result.status});
      return response(502,{error:'We could not save your application. Please contact TBG before resubmitting.'});
    }
    return redirect();
  } catch {
    console.error('Airtable request failed or timed out');
    return response(502,{error:'Your submission could not be confirmed. Please contact TBG before resubmitting.'});
  }
};
