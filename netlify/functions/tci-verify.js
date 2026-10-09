const {createHmac,timingSafeEqual}=require('node:crypto');
const SESSION='Turks and Caicos Islands';
const eq=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)};
function check(token,secret){const [body,sig,...rest]=String(token||'').split('.');if(!body||!sig||rest.length)return null;const target=createHmac('sha256',secret).update('tbg-tci-v1.'+body).digest('base64url');if(!eq(sig,target))return null;try{const p=JSON.parse(Buffer.from(body,'base64url').toString());return p.session===SESSION&&p.exp>Date.now()?p:null}catch{return null}}
exports.handler=async(event)=>{const token=new URLSearchParams(event.rawQuery||'').get('token');const secret=process.env.TBG_REGISTRATION_SIGNING_SECRET;if(event.httpMethod!=='GET'||!secret||!token)return {statusCode:400,body:'Invalid verification request'};
const p=check(token,secret);if(!p)return {statusCode:403,body:'Verification link expired or invalid'};
const granted=Buffer.from(JSON.stringify({session:SESSION,email:p.email,exp:Date.now()+12*60*60*1000})).toString('base64url');
const signature=createHmac('sha256',secret).update('tbg-tci-v1.'+granted).digest('base64url');
return {statusCode:302,headers:{Location:'/thank-you/?session=tci&status=confirmed','Set-Cookie':'tbg_tci_access='+granted+'.'+signature+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=43200','Cache-Control':'no-store'},body:''};
};