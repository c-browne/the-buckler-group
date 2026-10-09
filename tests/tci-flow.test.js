const test=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const SESSION='Turks and Caicos Islands';
process.env.TCI_ZOOM_MEETING_ID='12345678901';
process.env.TCI_ZOOM_PASSCODE='test-only';
process.env.TBG_REGISTRATION_SIGNING_SECRET='local-test-secret';
const access=require('../netlify/functions/tci-access').handler;
const verify=require('../netlify/functions/tci-verify').handler;
const dispatch=require('../netlify/functions/tci-approval-dispatch').handler;
function token(payload){const body=Buffer.from(JSON.stringify(payload)).toString('base64url');return body+'.'+createHmac('sha256',process.env.TBG_REGISTRATION_SIGNING_SECRET).update('tbg-tci-v1.'+body).digest('base64url');}
const ok=data=>({ok:true,status:200,json:async()=>data});
test('anonymous and forged access cannot reveal meeting credentials',async()=>{
 assert.equal((await access({httpMethod:'GET',headers:{}})).statusCode,403);
 assert.equal((await access({httpMethod:'GET',headers:{cookie:'tbg_tci_access=forged.signature'}})).statusCode,403);
});
test('verified link grants protected access and expired links are rejected',async()=>{
 const valid=token({session:SESSION,email:'test@example.com',exp:Date.now()+60000});
 const result=await verify({httpMethod:'GET',rawQuery:'token='+valid});
 assert.equal(result.statusCode,302);assert.match(result.headers['Set-Cookie'],/Secure; HttpOnly; SameSite=Lax/);
 const cookie=result.headers['Set-Cookie'].split(';')[0];
 const granted=await access({httpMethod:'GET',headers:{cookie}});
 assert.equal(granted.statusCode,200);assert.equal(JSON.parse(granted.body).authorized,true);
 assert.equal((await verify({httpMethod:'GET',rawQuery:'token='+token({session:SESSION,exp:Date.now()-1})})).statusCode,403);
});
test('first-time approval dispatch sends preview verification once and records delivery',async()=>{
 Object.assign(process.env,{AIRTABLE_BASE_ID:'appLvJsO1Q8w5lLnP',AIRTABLE_TOKEN:'test',RESEND_API_KEY:'test',TBG_VERIFICATION_FROM:'Test <test@example.com>',CONTEXT:'deploy-preview',DEPLOY_PRIME_URL:'https://preview.example.com',URL:'https://production.example.com'});
 const patches=[];let mail;let filter;
 global.fetch=async(url,options={})=>{
  if(String(url).includes('api.resend.com')){mail=JSON.parse(options.body);assert.equal(options.headers['Idempotency-Key'],'tci-approval-recControlled');return ok({id:'test'});}
  if(options.method==='PATCH'){patches.push(JSON.parse(options.body).fields);return ok({});}
  filter=new URL(String(url)).searchParams.get('filterByFormula');
  return ok({records:[{id:'recControlled',fields:{'Email Address':'test@example.com','Review Status':'Approved','TCI Access Delivery State':'Pending'}}]});
 };
 const result=await dispatch({httpMethod:'POST',body:JSON.stringify({next_run:new Date().toISOString()})});
 assert.equal(JSON.parse(result.body).sent,1);
 assert.match(filter,/{Review Status}='Approved'/);
 assert.match(mail.html,/https:\/\/preview\.example\.com\/\.netlify\/functions\/tci-verify/);
 assert.doesNotMatch(mail.html,/test-only|12345678901/);
 assert.deepEqual(patches.map(p=>p['TCI Access Delivery State']),['Sending','Sent']);
 delete process.env.CONTEXT;delete process.env.DEPLOY_PRIME_URL;delete process.env.URL;
});
test('unapproved and already-sent records never send approval mail',async()=>{
 let sends=0;
 global.fetch=async(url,options={})=>{
  if(String(url).includes('api.resend.com'))sends++;
  return ok({records:[{id:'recPending',fields:{'Email Address':'test@example.com','Review Status':'New'}},{id:'recSent',fields:{'Email Address':'test@example.com','Review Status':'Approved','TCI Access Delivery State':'Sent'}}]});
 };
 const result=await dispatch({});
 assert.equal(sends,0);assert.equal(JSON.parse(result.body).sent,0);
});
