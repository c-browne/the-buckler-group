const { randomUUID } = require('node:crypto');
const BASE_ID='appLvJsO1Q8w5lLnP';
const SURVEY_TABLE='Grenada Post-Session Survey';
const APP_TABLE='Executive Applications';
const clean=v=>v==null?'':Array.isArray(v)?v.map(x=>String(x).trim()).filter(Boolean).join(', '):String(v).trim();
const multi=v=>!v?[]:(Array.isArray(v)?v:String(v).split(',')).map(clean).filter(Boolean);
const response=(statusCode,body)=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(body)});
const redirect=()=>({statusCode:302,headers:{Location:'/grenada-post-session-survey.html?submitted=1','Cache-Control':'no-store'},body:''});
function parse(event){
  const body=event.isBase64Encoded?Buffer.from(event.body||'','base64').toString('utf8'):event.body||'';
  if(Buffer.byteLength(body,'utf8')>40000)throw Object.assign(new Error('too large'),{statusCode:413});
  const type=String(event.headers?.['content-type']||event.headers?.['Content-Type']||'').toLowerCase();
  if(type.includes('application/x-www-form-urlencoded')){
    const out=Object.create(null);
    for(const [rawKey,value] of new URLSearchParams(body)){const key=rawKey.endsWith('[]')?rawKey.slice(0,-2):rawKey;if(Object.prototype.hasOwnProperty.call(out,key))out[key]=[].concat(out[key],value);else out[key]=value}
    return out;
  }
  return JSON.parse(body);
}
function score(d){
  let s=0;
  const op=clean(d.defined_opportunity),h=clean(d.action_horizon),a=clean(d.decision_authority),c=clean(d.ces_interest),rel=clean(d.session_relevance),cap=clean(d.capital_range),deleg=clean(d.inward_delegation_interest);
  if(op==='Yes — active and defined')s+=25; else if(op==='Yes — early-stage')s+=18; else if(op==='Not yet — actively seeking')s+=8;
  if(['Immediately / within 30 days','1–3 months'].includes(h))s+=20; else if(h==='3–6 months')s+=14; else if(h==='6–12 months')s+=7;
  if(a==='Yes')s+=20; else if(a==='Part of the decision-making team')s+=15; else if(a==='Adviser / intermediary')s+=8;
  if(c==='Yes — consider me')s+=20; else if(c==='Possibly — send additional information')s+=10;
  if(rel==='Highly relevant')s+=10; else if(rel==='Very relevant')s+=8; else if(rel==='Relevant')s+=5; else if(rel==='Somewhat relevant')s+=2;
  if(cap&&!['Not yet determined','Prefer to discuss privately'].includes(cap))s+=3;
  if(deleg&&deleg!=='Not at this time')s+=2;
  return Math.min(s,100);
}
function tier(d,s){
  if(clean(d.ces_interest)==='Not at this time')return s>=60?'Strategic Relationship':'General Participant';
  if(s>=75)return 'Priority CES Candidate';
  if(s>=50)return 'CES Development Candidate';
  if(s>=30)return 'Strategic Relationship';
  return 'General Participant';
}
function esc(v){return String(v).replace(/\\/g,'\\\\').replace(/'/g,"\\'")}
async function findApplication(token,email){
  const formula="LOWER({Email Address})='"+esc(clean(email).toLowerCase())+"'";
  const qs=new URLSearchParams({filterByFormula:formula,maxRecords:'1'});
  const r=await fetch('https://api.airtable.com/v0/'+encodeURIComponent(BASE_ID)+'/'+encodeURIComponent(APP_TABLE)+'?'+qs,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(8000)});
  if(!r.ok)return null; const j=await r.json(); return j.records?.[0]?.id||null;
}
exports.handler=async event=>{
  if(event.httpMethod!=='POST')return response(405,{error:'Method not allowed'});
  let d;try{d=parse(event)}catch(e){return response(e.statusCode||400,{error:'Invalid form body.'})}
  if(clean(d['bot-field']))return redirect();
  const required=['full_name','email_address','organization','title_position','current_objective','defined_opportunity','action_horizon','decision_authority','ces_interest','session_relevance'];
  const missing=required.filter(k=>!clean(d[k])); if(missing.length)return response(400,{error:'Please complete the required fields.',fields:missing});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(d.email_address)))return response(400,{error:'Enter a valid email address.'});
  if(d.permission_follow_up!=='yes')return response(400,{error:'Permission to follow up is required.'});
  const started=Number(d.form_started_at); if(Number.isFinite(started)&&Date.now()-started<2500)return response(429,{error:'Please review the survey before submitting.'});
  const token=process.env.AIRTABLE_TOKEN; const baseId=process.env.AIRTABLE_BASE_ID;
  if(!token||!baseId||baseId!==BASE_ID)return response(500,{error:'Survey submission is temporarily unavailable. Please contact TBG.'});
  const applicationId=await findApplication(token,d.email_address).catch(()=>null);
  const s=score(d),t=tier(d,s),now=new Date().toISOString(),requestId=randomUUID();
  const fields={
    'Full Name':clean(d.full_name),'Email Address':clean(d.email_address).toLowerCase(),'Organization':clean(d.organization),'Title / Position':clean(d.title_position),
    'Executive Application':applicationId?[applicationId]:undefined,'Priority Areas':multi(d.priority_areas),'Current Objective':clean(d.current_objective),
    'Defined Opportunity':clean(d.defined_opportunity),'Opportunity Description':clean(d.opportunity_description),'Capital / Transaction Range':clean(d.capital_range),
    'Action Horizon':clean(d.action_horizon),'Support Needed':multi(d.support_needed),'CES Interest':clean(d.ces_interest),
    'CES Desired Outcome':clean(d.ces_desired_outcome),'Decision Authority':clean(d.decision_authority),'Inward Delegation Interest':clean(d.inward_delegation_interest),
    'Priority Question':clean(d.priority_question),'Session Relevance':clean(d.session_relevance),'Permission to Follow Up':true,
    'CES Qualification Score':s,'CES Candidate Tier':t,'Session Jurisdiction':'Grenada','Date Submitted':now.slice(0,10),'Source':clean(d.source||'grenada-post-session-survey')
  };
  for(const k of Object.keys(fields))if(fields[k]===''||fields[k]===undefined||(Array.isArray(fields[k])&&!fields[k].length))delete fields[k];
  try{
    const r=await fetch('https://api.airtable.com/v0/'+encodeURIComponent(baseId)+'/'+encodeURIComponent(SURVEY_TABLE),{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({records:[{fields}],typecast:true}),signal:AbortSignal.timeout(10000)});
    if(!r.ok){const e=await r.text();console.error('Grenada survey Airtable write failed',{status:r.status,requestId,detail:e.slice(0,300)});return response(502,{error:'We could not save your survey response. Please contact TBG.',requestId})}
    return redirect();
  }catch(e){console.error('Grenada survey request failed',{requestId,message:e?.message});return response(502,{error:'Your survey response could not be confirmed. Please contact TBG.',requestId})}
};
exports._test={score,tier,parse};