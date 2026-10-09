// Scheduled TCI executive-approval dispatch. No joining credential is included in the email.
const {createHmac,randomBytes}=require('node:crypto');
const BASE='appLvJsO1Q8w5lLnP', TABLE='Executive Applications';
const json=async(r)=>{if(!r.ok)throw Error('Provider HTTP '+r.status);return r.json()};
const esc=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
const token=(data,secret)=>{const b=Buffer.from(JSON.stringify(data)).toString('base64url');return b+'.'+createHmac('sha256',secret).update('tbg-tci-v1.'+b).digest('base64url')};
const tciFilter="AND({Session Jurisdiction}='Turks and Caicos Islands', {Review Status}='Approved', {Data Quality Status}!='Needs Review', {Data Quality Status}!='Suspected Spam', {Email Address}!='', OR({TCI Access Delivery State}='Pending', {TCI Access Delivery State}=''))";
async function patch(id,fields,key){
 return json(await fetch('https://api.airtable.com/v0/'+BASE+'/'+encodeURIComponent(TABLE)+'/'+id,{method:'PATCH',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({fields}),signal:AbortSignal.timeout(10000)}));
}
exports.handler=async(event)=>{
 const baseId=process.env.AIRTABLE_BASE_ID, airtable=process.env.AIRTABLE_TOKEN, secret=process.env.TBG_REGISTRATION_SIGNING_SECRET;
 const resend=process.env.RESEND_API_KEY, from=process.env.TBG_VERIFICATION_FROM;
 if(baseId!==BASE||!airtable||!secret||!resend||!from)return {statusCode:503,body:'Approval dispatch not configured'};
 // Background invocations only. Explicit manual requests are not authorized.
 if(event.httpMethod && event.httpMethod!=='GET')return {statusCode:405,body:'Method not allowed'};
 const query=new URLSearchParams({filterByFormula:tciFilter,pageSize:'4',sort:'[{"field":"Created Time","direction":"asc"}]'});
 // Airtable sort keys must be expressed as array indices in URLSearchParams.
 query.delete('sort');query.set('sort[0][field]','Created Time');query.set('sort[0][direction]','asc');
 const rows=(await json(await fetch('https://api.airtable.com/v0/'+BASE+'/'+encodeURIComponent(TABLE)+'?'+query,{headers:{Authorization:'Bearer '+airtable},signal:AbortSignal.timeout(10000)}))).records||[];
 let sent=0,failed=0;
 for(const row of rows){
  const f=row.fields||{},email=String(f['Email Address']||'').trim().toLowerCase(),review=String(f['Review Status']||'');
  if(!email||review!=='Approved'||f['Data Quality Status']==='Needs Review'||f['Data Quality Status']==='Suspected Spam')continue;
  const prior=String(f['TCI Access Delivery State']||'');
  if(prior&&!['Pending'].includes(prior))continue;
  // Mark sending before contacting email provider to avoid duplicate deliveries from concurrent runs.
  await patch(row.id,{'TCI Access Delivery State':'Sending'},airtable);
  try{
   const payload={session:'Turks and Caicos Islands',email,exp:Date.now()+48*3600*1000,nonce:randomBytes(18).toString('hex'),recordId:row.id};
   const link=((process.env.CONTEXT==='deploy-preview'||process.env.CONTEXT==='branch-deploy')?process.env.DEPLOY_PRIME_URL:(process.env.URL||'https://thebucklergroup.com')).replace(/\/$/,'')+'/.netlify/functions/tci-verify?token='+encodeURIComponent(token(payload,secret));
   const html='<p>Your participation in The Buckler Group Turks & Caicos Islands Strategic Session has been approved.</p><p><a href="'+link.replace(/&/g,'&amp;')+'">Verify email &amp; confirm attendance</a></p><p>Thursday, October 29, 2026 | 12:30–1:30 p.m. Eastern.</p><p>After verification, the event page provides Zoom joining details and Add to Calendar.</p>';
   const idempotency='tci-approval-'+row.id;
   const result=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+resend,'Content-Type':'application/json','Idempotency-Key':idempotency},body:JSON.stringify({from,to:[email],subject:'Approved | Turks & Caicos Islands Strategic Session',html}),signal:AbortSignal.timeout(10000)});
   if(!result.ok)throw Error('Email provider '+result.status);
   await patch(row.id,{'TCI Access Delivery State':'Sent','TCI Access Delivery Timestamp':new Date().toISOString()},airtable);sent++;
  }catch(err){await patch(row.id,{'TCI Access Delivery State':'Failed'},airtable);console.error('TCI approval delivery failed',row.id,err.message);failed++;}
 }
 return {statusCode:200,body:JSON.stringify({processed:rows.length,sent,failed})};
};
exports.config={schedule:'*/15 * * * *'};
