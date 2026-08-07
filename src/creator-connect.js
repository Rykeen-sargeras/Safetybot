import crypto from 'node:crypto';
import { config } from './config.js';
import { createState } from './oauth-state.js';
import { makeGoogleClient } from './youtube.js';

const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

function passwordMatches(value){
  const expected=String(config.creatorConnectPassword||'');
  const actual=String(value||'');
  if(!expected||actual.length!==expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(expected));
}

function loginPage(error=''){
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>Creator Connect • The Commission</title><style>
  :root{color-scheme:dark;--bg:#070707;--panel:#121316;--line:#35373d;--text:#f4f4f4;--muted:#a7aab0;--red:#9e171d;--red2:#c72731}
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font-family:Inter,system-ui,sans-serif;background:radial-gradient(circle at 50% 0,#291014 0,#0a0a0b 40%,#050506 80%);color:var(--text)}
  .card{width:min(460px,100%);background:linear-gradient(180deg,#17181b,#0f1012);border:1px solid var(--line);border-radius:20px;padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.45)}
  .badge{display:inline-block;border:1px solid #4a4c52;border-radius:999px;padding:5px 9px;color:#d1d2d5;font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px}h1{margin:0 0 10px;font-size:34px}p{color:var(--muted);line-height:1.55}.field{display:grid;gap:7px;margin:20px 0}.field span{font-size:13px;font-weight:700}.field input{width:100%;background:#090a0c;color:#fff;border:1px solid #41444b;border-radius:10px;padding:12px;font:inherit}.btn{width:100%;display:flex;justify-content:center;background:linear-gradient(180deg,var(--red2),var(--red));color:#fff;border:1px solid #c24249;border-radius:10px;padding:12px;font:inherit;font-weight:800;cursor:pointer}.error{color:#ff9199;margin:12px 0}.back{display:block;text-align:center;margin-top:16px;color:#b8bac0;text-decoration:none}
  </style></head><body><main class="card"><span class="badge">Creator authorization</span><h1>Connect a Creator</h1><p>Enter the private creator-connect password. After it is accepted, you will continue to Google to authorize the memberships-enabled YouTube channel.</p>${error?`<p class="error">${esc(error)}</p>`:''}<form method="post" action="/creator-connect"><label class="field"><span>Access password</span><input type="password" name="password" autocomplete="current-password" autofocus required></label><button class="btn" type="submit">Continue to YouTube</button></form><a class="back" href="/">Back to membership verification</a></main></body></html>`;
}

export function registerCreatorConnect(app){
  app.get('/creator-connect',(_req,res)=>res.send(loginPage()));
  app.post('/creator-connect',async(req,res,next)=>{
    try{
      if(!config.creatorConnectPassword){
        return res.status(503).send(loginPage('Creator Connect is not configured. Set CREATOR_CONNECT_PASSWORD in Railway.'));
      }
      if(!passwordMatches(req.body.password)){
        return res.status(401).send(loginPage('That password was not accepted.'));
      }
      const state=await createState('google_creator','creator');
      const auth=makeGoogleClient();
      const url=auth.generateAuthUrl({
        access_type:'offline',
        prompt:'consent',
        state,
        scope:[config.google.membershipScope,config.google.readonlyScope]
      });
      res.redirect(url);
    }catch(error){next(error);}
  });
}
