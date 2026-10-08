const {createHmac,timingSafeEqual}=require('node:crypto');
const MEETING_ID=process.env.TCI_ZOOM_MEETING_ID;
const PASSCODE=process.env.TCI_ZOOM_PASSCODE;
const ZOOM=MEETING_ID&&/^\d{9,12}$/.test(MEETING_ID)?'https://us06web.zoom.us/j/'+MEETING_ID:null;
exports.handler=async event=>{const secret=process.env.TBG_REGISTRATION_SIGNING_SECRET;if(!ZOOM||!PASSCODE)return {statusCode:503,body:'Meeting access unavailable'};
const cookie=String(event.headers?.cookie||event.headers?.Cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('tbg_tci_access='));
const [body,sig]=cookie?cookie.slice(15).split('.'):[];
if(event.httpMethod!=='GET'||!secret||!body||!sig)return {statusCode:403,headers:{'Cache-Control':'no-store'},body:'Forbidden'};
const expected=createHmac('sha256',secret).update('tbg-tci-v1.'+body).digest('base64url');
const x=Buffer.from(sig),y=Buffer.from(expected);
if(x.length!==y.length||!timingSafeEqual(x,y))return {statusCode:403,body:'Forbidden'};
try{const p=JSON.parse(Buffer.from(body,'base64url').toString());if(p.session!=='Turks and Caicos Islands'||p.exp<Date.now())throw Error();return {statusCode:200,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'},body:JSON.stringify({authorized:true,zoom:ZOOM,meetingId:MEETING_ID,passcode:PASSCODE})}}catch{return {statusCode:403,body:'Forbidden'}}
};