import crypto from 'node:crypto';
import express from 'express';
import { config } from './config.js';
import { db } from './db.js';
import { createState, consumeState } from './oauth-state.js';
import { getGuildRoles, getTextChannels, postVerificationPanel } from './discord.js';
import { getAuthorizedChannel, getMembershipLevels, makeCreatorClient, makeGoogleClient } from './youtube.js';
import { syncCreator, syncUserMembership } from './sync.js';

const app=express();
app.use(express.urlencoded({extended:false}));
app.use(express.json());

const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

function page(title,body,{wide=false}={}){
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${esc(title)}</title>
  <style>
  :root{--bg:#070707;--panel:#111214;--panel2:#17181b;--line:#34363b;--soft:#a7aab0;--text:#f4f4f4;--red:#9e171d;--red2:#c72731;--silver:#c9cbd0;--green:#2b8a57;--danger:#b82c35}
  *{box-sizing:border-box}html{background:var(--bg);color-scheme:dark}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at 50% -10%,#291014 0,#0b0b0c 35%,#060607 72%);color:var(--text);margin:0;min-height:100vh}
  body:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.14;background-image:linear-gradient(135deg,transparent 0 46%,rgba(255,255,255,.08) 47% 48%,transparent 49% 100%);background-size:28px 28px}
  a{color:inherit}.wrap{max-width:${wide?'1220':'1080'}px;margin:0 auto;padding:28px 18px 54px;position:relative}.topnav{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:10px 0 28px}.brand{display:flex;align-items:center;gap:12px;text-decoration:none}.seal{width:42px;height:42px;border:1px solid #55585f;border-radius:50%;display:grid;place-items:center;background:#111;color:#ddd;font-weight:900;letter-spacing:.08em;box-shadow:inset 0 0 0 4px #0a0a0b}.brand strong{display:block;letter-spacing:.12em;text-transform:uppercase}.brand small{display:block;color:var(--soft);margin-top:2px}.navlinks{display:flex;gap:8px;flex-wrap:wrap}
  .hero{border:1px solid #383a40;border-radius:24px;padding:42px;background:linear-gradient(145deg,rgba(158,23,29,.17),rgba(17,18,20,.96) 42%,rgba(9,9,10,.98));position:relative;overflow:hidden;margin-bottom:20px}.hero:after{content:"THE COMMISSION";position:absolute;right:-18px;bottom:-22px;font-size:70px;font-weight:900;letter-spacing:.08em;color:rgba(255,255,255,.025);white-space:nowrap}.kicker{text-transform:uppercase;letter-spacing:.19em;color:#d0d1d4;font-size:12px;font-weight:800}.hero h1{font-size:clamp(34px,7vw,68px);line-height:.95;margin:10px 0 16px;max-width:800px;text-transform:uppercase;letter-spacing:-.035em}.hero p{max-width:690px;color:#c5c6ca;font-size:18px;line-height:1.6;margin:0 0 24px}.hero-actions,.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.section-title{margin:34px 0 12px}.section-title h2{margin:0 0 5px}.section-title p{margin:0;color:var(--soft)}
  .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}.card{background:linear-gradient(180deg,#151619,#101113);border:1px solid var(--line);border-radius:18px;padding:20px;margin-bottom:16px}.card h1,.card h2,.card h3{margin-top:0}.choice{min-height:220px;display:flex;flex-direction:column}.choice .icon{font-size:28px;margin-bottom:18px}.choice p{color:var(--soft);line-height:1.55;flex:1}.choice.viewer{border-color:#603238}.choice.creator{border-color:#494c52}.choice.admin{border-color:#494c52}.badge{display:inline-flex;width:max-content;border:1px solid #4a4c52;border-radius:999px;padding:5px 9px;color:#d1d2d5;font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:linear-gradient(180deg,var(--red2),var(--red));color:white;padding:11px 15px;border-radius:10px;text-decoration:none;border:1px solid #c24249;cursor:pointer;font:inherit;font-weight:750;box-shadow:0 5px 18px rgba(100,0,8,.16)}.btn:hover{filter:brightness(1.08)}.btn.gray{background:#24262b;border-color:#44474e;color:#f0f0f0;box-shadow:none}.btn.green{background:#236d47;border-color:#36895e}.btn.red{background:#842027;border-color:#a63139}.btn.ghost{background:transparent;border-color:#46484e;box-shadow:none}.btn.wide{width:100%}
  input,select{background:#0b0c0e;color:#fff;border:1px solid #41444b;border-radius:9px;padding:10px 11px;font:inherit}input:focus,select:focus{outline:2px solid #7f2a30;outline-offset:1px}.field{display:grid;gap:7px}.field span{font-size:13px;color:#d4d5d8;font-weight:700}.login-card{max-width:460px;margin:60px auto 0}.login-card input{width:100%}.login-card .btn{margin-top:8px}
  table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:11px 9px;border-bottom:1px solid #303238;vertical-align:top}th{color:#cfd0d4;font-size:13px;text-transform:uppercase;letter-spacing:.06em}.muted{color:var(--soft)}.bad{color:#ff8e96}.ok{color:#79d49b}code{background:#0a0b0d;padding:3px 6px;border-radius:5px;border:1px solid #282a2f}.statbar{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:16px}.stat{padding:15px;border:1px solid #32343a;border-radius:13px;background:#0f1012}.stat small{display:block;color:var(--soft);margin-bottom:6px}.stat strong{font-size:19px}.footer{padding:28px 0 8px;color:#74777d;text-align:center;font-size:13px}.divider{height:1px;background:#2b2d32;margin:18px 0}.right{margin-left:auto}
  @media(max-width:820px){.grid,.grid.two,.statbar{grid-template-columns:1fr}.hero{padding:28px}.hero:after{font-size:40px}.topnav{align-items:flex-start;flex-direction:column}.right{margin-left:0}}
  </style></head><body><div class="wrap"><nav class="topnav"><a class="brand" href="/"><span class="seal">TC</span><span><strong>The Commission</strong><small>Membership Verification</small></span></a><div class="navlinks"><a class="btn ghost" href="/creator">Creator Login</a><a class="btn ghost" href="/admin">Admin Login</a></div></nav>${body}<div class="footer">The Commission • Private membership verification for connected Discord communities</div></div></body></html>`;
}

function cookies(req){
  const out={};
  for(const p of (req.headers.cookie||'').split(';')){
    const [k,...r]=p.trim().split('=');
    if(k) out[k]=decodeURIComponent(r.join('='));
  }
  return out;
}
function sign(exp){
  return `${exp}.${crypto.createHmac('sha256',config.sessionSecret).update(String(exp)).digest('hex')}`;
}
function isAdmin(req){
  const t=cookies(req).safetybot_admin;
  if(!t) return false;
  const [e,s]=t.split('.'); const exp=Number(e);
  if(!exp||exp<Date.now()||!s) return false;
  const expected=crypto.createHmac('sha256',config.sessionSecret).update(e).digest('hex');
  try{return crypto.timingSafeEqual(Buffer.from(s,'hex'),Buffer.from(expected,'hex'));}catch{return false;}
}
function creatorCookie(channelId,exp){
  const payload=`${channelId}.${exp}`;
  const sig=crypto.createHmac('sha256',config.sessionSecret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}
function creatorChannel(req){
  const t=cookies(req).safetybot_creator;
  if(!t) return null;
  const parts=t.split('.');
  if(parts.length!==3) return null;
  const [channelId,e,s]=parts,exp=Number(e);
  if(!channelId||!exp||exp<Date.now()||!s) return null;
  const expected=crypto.createHmac('sha256',config.sessionSecret).update(`${channelId}.${e}`).digest('hex');
  try{return crypto.timingSafeEqual(Buffer.from(s,'hex'),Buffer.from(expected,'hex'))?channelId:null;}catch{return null;}
}
function adminOnly(req,res,next){ if(!isAdmin(req)) return res.redirect('/admin'); next(); }
function creatorOnly(req,res,next){ if(!creatorChannel(req)) return res.redirect('/creator'); next(); }
function passwordMatches(v){
  const a=Buffer.from(String(v||'')),b=Buffer.from(String(config.adminPassword));
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}

app.get('/health',(_req,res)=>res.json({ok:true,service:'verification-bot',version:'2.1.0'}));

app.get('/',(_req,res)=>res.send(page('The Commission — Membership Verification',`
<section class="hero"><div class="kicker">Membership desk</div><h1>Your membership. Your role. Verified.</h1><p>Connect through Discord, confirm your linked YouTube membership, and let The Commission assign the correct server role without sharing your password.</p><div class="hero-actions"><a class="btn" href="/verify?mode=verify">Verify Membership</a><a class="btn gray" href="/verify?mode=status">Check Membership</a></div></section>
<div class="section-title"><h2>Choose your access</h2><p>Viewers verify membership. Creators manage their connected channel. Administrators control the system.</p></div>
<section class="grid">
  <article class="card choice viewer"><span class="badge">Viewers</span><div class="icon">◆</div><h2>Verify membership</h2><p>Sign in with Discord, use your connected YouTube identity, and receive the Discord role that matches your active membership level.</p><div class="row"><a class="btn" href="/verify?mode=verify">Verify Membership</a><a class="btn gray" href="/verify?mode=status">Check Membership</a></div></article>
  <article class="card choice creator"><span class="badge">Creators</span><div class="icon">♛</div><h2>Creator access</h2><p>Authorize the YouTube channel you own and open a private creator view for membership levels, connection status, and manual synchronization.</p><a class="btn gray" href="/creator">Creator Login</a></article>
  <article class="card choice admin"><span class="badge">Administration</span><div class="icon">✦</div><h2>Admin control</h2><p>Manage connected creators, role mappings, grace periods, audits, sync actions, and the Discord verification panel.</p><a class="btn gray" href="/admin">Admin Login</a></article>
</section>`)));

app.get('/verify',async(req,res,next)=>{
  try{
    const mode=['verify','status','recheck'].includes(req.query.mode)?req.query.mode:'verify';
    const state=await createState('discord_user',mode);
    const url=new URL('https://discord.com/oauth2/authorize');
    url.searchParams.set('client_id',config.discord.clientId);
    url.searchParams.set('redirect_uri',config.discord.redirectUri);
    url.searchParams.set('response_type','code');
    url.searchParams.set('scope','identify connections');
    url.searchParams.set('state',state);
    res.redirect(url.toString());
  }catch(e){next(e);}
});

app.get('/auth/discord/callback',async(req,res,next)=>{
  try{
    const st=await consumeState(req.query.state);
    if(!st||st.provider!=='discord_user') throw new Error('Discord authorization state is invalid or expired.');

    const tr=await fetch('https://discord.com/api/oauth2/token',{
      method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({
        client_id:config.discord.clientId,client_secret:config.discord.clientSecret,
        grant_type:'authorization_code',code:req.query.code,redirect_uri:config.discord.redirectUri
      })
    });
    if(!tr.ok) throw new Error(`Discord token exchange failed: ${await tr.text()}`);
    const token=await tr.json(), headers={authorization:`Bearer ${token.access_token}`};
    const [ur,cr]=await Promise.all([
      fetch('https://discord.com/api/users/@me',{headers}),
      fetch('https://discord.com/api/users/@me/connections',{headers})
    ]);
    if(!ur.ok||!cr.ok) throw new Error('Discord account information could not be read.');
    const user=await ur.json(), connections=await cr.json();
    const yt=connections.find(c=>c.type==='youtube');

    if(!yt?.id){
      return res.status(400).send(page('YouTube Not Connected',`<div class="card login-card"><span class="badge">Connection required</span><h1>YouTube is not connected to Discord</h1><p class="muted">Open Discord → User Settings → Connections and connect your YouTube account first.</p><a class="btn" href="/">Go Back</a></div>`));
    }

    await db.query(
      `INSERT INTO discord_users(discord_user_id,discord_username,youtube_channel_id,youtube_channel_name,linked_at)
       VALUES($1,$2,$3,$4,NOW())
       ON CONFLICT(discord_user_id) DO UPDATE SET discord_username=EXCLUDED.discord_username,
       youtube_channel_id=EXCLUDED.youtube_channel_id,youtube_channel_name=EXCLUDED.youtube_channel_name,linked_at=NOW()`,
      [user.id,user.global_name||user.username||user.id,yt.id,yt.name||yt.id]
    );

    const results=await syncUserMembership(user.id);
    const rows=results.map(i=>{
      let d=i.status;
      if(i.level)d+=` — ${esc(i.level)}`;
      if(i.graceExpiresAt)d+=` until ${esc(new Date(i.graceExpiresAt).toLocaleString())}`;
      if(i.error)d+=` — ${esc(i.error)}`;
      return `<tr><td>${esc(i.creator)}</td><td>${d}</td></tr>`;
    }).join('');

    res.send(page('Membership Status',`<div class="card"><span class="badge">Verification complete</span><h1>Membership Check Complete</h1><div class="statbar"><div class="stat"><small>Discord</small><strong>${esc(user.global_name||user.username)}</strong></div><div class="stat"><small>YouTube</small><strong>${esc(yt.name||yt.id)}</strong></div><div class="stat"><small>Action</small><strong>${esc(st.context||'verify')}</strong></div></div></div><div class="card"><h2>Results</h2><table><tr><th>Creator</th><th>Status</th></tr>${rows||'<tr><td colspan="2">No creators connected yet.</td></tr>'}</table><div class="row" style="margin-top:16px"><a class="btn" href="/verify?mode=recheck">Recheck Membership</a><a class="btn gray" href="/">Home</a></div></div>`));
  }catch(e){next(e);}
});

app.get('/creator',async(req,res,next)=>{
  try{
    const channelId=creatorChannel(req);
    if(!channelId){
      return res.send(page('Creator Login',`<div class="card login-card"><span class="badge">Creator portal</span><h1>Creator Login</h1><p class="muted">Sign in with the Google account that owns the memberships-enabled YouTube channel you want connected to The Commission.</p><a class="btn wide" href="/creator/login">Continue with YouTube</a><div class="divider"></div><a class="btn ghost wide" href="/">Back to viewer verification</a></div>`));
    }
    const creator=(await db.query(`SELECT * FROM creators WHERE youtube_channel_id=$1`,[channelId])).rows[0];
    if(!creator){
      res.setHeader('Set-Cookie','safetybot_creator=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
      return res.redirect('/creator');
    }
    const mappings=(await db.query(`SELECT * FROM role_mappings WHERE creator_channel_id=$1 ORDER BY youtube_level_name`,[channelId])).rows;
    let levels=[],levelError='';
    try{levels=await getMembershipLevels(makeCreatorClient(creator));}catch(e){levelError=e.message;}
    const levelRows=levels.map(l=>{
      const mapping=mappings.find(m=>m.youtube_level_id===l.id);
      return `<tr><td>${esc(l.name)}</td><td><code>${esc(l.id)}</code></td><td>${mapping?`<code>${esc(mapping.discord_role_id)}</code>`:'<span class="muted">Not mapped</span>'}</td></tr>`;
    }).join('');
    res.send(page('Creator Dashboard',`<div class="card"><div class="row"><div><span class="badge">Creator portal</span><h1>${esc(creator.youtube_channel_name)}</h1><p class="muted"><code>${esc(channelId)}</code></p></div><a class="btn gray right" href="/creator/logout">Logout</a></div><div class="statbar"><div class="stat"><small>Status</small><strong>${creator.active?'Enabled':'Disabled'}</strong></div><div class="stat"><small>Grace period</small><strong>${esc(creator.grace_period_days)} days</strong></div><div class="stat"><small>Connected</small><strong>${creator.connected_at?esc(new Date(creator.connected_at).toLocaleDateString()):'—'}</strong></div></div><form method="post" action="/creator/sync"><button class="btn" type="submit">Sync My Memberships</button></form></div><div class="card"><h2>Membership Levels</h2>${levelError?`<p class="bad">${esc(levelError)}</p>`:''}<table><tr><th>YouTube Level</th><th>Level ID</th><th>Discord Role ID</th></tr>${levelRows||'<tr><td colspan="3">No membership levels returned by YouTube.</td></tr>'}</table><p class="muted">Role mappings are controlled by an administrator.</p></div>`,{wide:true}));
  }catch(e){next(e);}
});

app.get('/creator/login',async(_req,res,next)=>{
  try{
    const state=await createState('google_creator','creator'),auth=makeGoogleClient();
    res.redirect(auth.generateAuthUrl({access_type:'offline',prompt:'consent',state,scope:[config.google.membershipScope,config.google.readonlyScope]}));
  }catch(e){next(e);}
});
app.get('/creator/logout',(_req,res)=>{
  res.setHeader('Set-Cookie','safetybot_creator=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  res.redirect('/creator');
});
app.post('/creator/sync',creatorOnly,async(req,res,next)=>{
  try{await syncCreator(creatorChannel(req));res.redirect('/creator');}catch(e){next(e);}
});

app.get('/admin',async(req,res,next)=>{
  try{
    if(!isAdmin(req)){
      return res.send(page('Admin Login',`<div class="card login-card"><span class="badge">Restricted access</span><h1>Admin Login</h1><p class="muted">Enter the Safetybot administrator password to open system controls.</p><form method="post" action="/admin/login"><label class="field"><span>Admin password</span><input type="password" name="password" autocomplete="current-password" required></label><button class="btn wide" type="submit">Enter Admin Dashboard</button></form></div>`));
    }

    const creators=(await db.query(`SELECT * FROM creators ORDER BY youtube_channel_name`)).rows;
    const mappings=(await db.query(`SELECT * FROM role_mappings ORDER BY creator_channel_id,youtube_level_name`)).rows;
    let roles=[],channels=[];
    try{roles=await getGuildRoles();}catch{}
    try{channels=await getTextChannels();}catch{}

    const creatorCards=[];
    for(const c of creators){
      let levels=[],levelError='';
      try{levels=await getMembershipLevels(makeCreatorClient(c));}catch(e){levelError=e.message;}
      const cm=mappings.filter(m=>m.creator_channel_id===c.youtube_channel_id);
      const levelRows=levels.map(l=>{
        const current=cm.find(m=>m.youtube_level_id===l.id);
        const opts=roles.map(r=>`<option value="${esc(r.id)}" ${current?.discord_role_id===r.id?'selected':''}>${esc(r.name)}</option>`).join('');
        return `<tr><td>${esc(l.name)}</td><td><code>${esc(l.id)}</code></td><td><form method="post" action="/admin/mapping" class="row"><input type="hidden" name="creator_channel_id" value="${esc(c.youtube_channel_id)}"><input type="hidden" name="youtube_level_id" value="${esc(l.id)}"><input type="hidden" name="youtube_level_name" value="${esc(l.name)}"><select name="discord_role_id" required><option value="">Choose Discord role</option>${opts}</select><button class="btn green" type="submit">Save Role</button></form></td></tr>`;
      }).join('');

      creatorCards.push(`<div class="card"><div class="row"><div><span class="badge">Creator</span><h2>${esc(c.youtube_channel_name)}</h2><p class="muted"><code>${esc(c.youtube_channel_id)}</code></p></div><strong class="right">${c.active?'Enabled':'Disabled'}</strong></div><div class="row"><form method="post" action="/admin/creator/${c.id}/toggle"><button class="btn gray" type="submit">${c.active?'Disable':'Enable'}</button></form><form method="post" action="/admin/creator/${encodeURIComponent(c.youtube_channel_id)}/sync"><button class="btn" type="submit">Force Sync</button></form><form method="post" action="/admin/creator/${c.id}/delete"><button class="btn red" type="submit">Remove Creator</button></form></div><div class="divider"></div><h3>Grace Period</h3><form method="post" action="/admin/creator/${c.id}/grace" class="row"><input type="number" name="grace_period_days" min="0" max="60" value="${esc(c.grace_period_days)}"><span>days</span><button class="btn gray" type="submit">Save</button></form><h3 style="margin-top:22px">Membership Level → Discord Role</h3>${levelError?`<p class="bad">${esc(levelError)}</p>`:''}<table><tr><th>YouTube Level</th><th>Level ID</th><th>Discord Role</th></tr>${levelRows||'<tr><td colspan="3">No membership levels returned by YouTube.</td></tr>'}</table></div>`);
    }

    const channelOpts=channels.map(c=>`<option value="${esc(c.id)}">#${esc(c.name)}</option>`).join('');

    res.send(page('Safetybot Admin',`<div class="card"><div class="row"><div><span class="badge">Administration</span><h1>Safetybot Admin</h1><p class="muted">Manage creators, roles, grace periods, syncing and the verification panel.</p></div><a class="btn gray right" href="/admin/logout">Logout</a></div></div><div class="grid two"><div class="card"><h2>Connect a Creator</h2><p class="muted">Authorize a memberships-enabled YouTube channel and add it to verification.</p><a class="btn" href="/admin/creator/connect">Connect YouTube Creator</a></div><div class="card"><h2>Post Verification Panel</h2><form method="post" action="/admin/post-panel"><label class="field"><span>Discord channel</span><select name="channel_id" required><option value="">Choose Discord channel</option>${channelOpts}</select></label><button class="btn" type="submit" style="margin-top:10px">Post Panel</button></form></div></div>${creatorCards.join('')||'<div class="card"><h2>No creators connected yet</h2></div>'}`,{wide:true}));
  }catch(e){next(e);}
});

app.post('/admin/login',(req,res)=>{
  if(!passwordMatches(req.body.password)) return res.status(401).send(page('Login Failed','<div class="card login-card"><h1>Wrong password</h1><p class="bad">The administrator password was not accepted.</p><a class="btn" href="/admin">Try Again</a></div>'));
  const exp=Date.now()+12*60*60*1000;
  res.setHeader('Set-Cookie',`safetybot_admin=${encodeURIComponent(sign(exp))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`);
  res.redirect('/admin');
});
app.get('/admin/logout',(_req,res)=>{
  res.setHeader('Set-Cookie','safetybot_admin=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  res.redirect('/admin');
});

app.get('/admin/creator/connect',adminOnly,async(_req,res,next)=>{
  try{
    const state=await createState('google_creator','admin'),auth=makeGoogleClient();
    res.redirect(auth.generateAuthUrl({access_type:'offline',prompt:'consent',state,scope:[config.google.membershipScope,config.google.readonlyScope]}));
  }catch(e){next(e);}
});

app.get('/auth/google/callback',async(req,res,next)=>{
  try{
    const st=await consumeState(req.query.state);
    if(!st||st.provider!=='google_creator') throw new Error('Google authorization state is invalid or expired.');
    const auth=makeGoogleClient(),{tokens}=await auth.getToken(req.query.code); auth.setCredentials(tokens);
    const ch=await getAuthorizedChannel(auth);
    const old=(await db.query(`SELECT refresh_token FROM creators WHERE youtube_channel_id=$1`,[ch.id])).rows[0];
    const refresh=tokens.refresh_token||old?.refresh_token;
    if(!refresh) throw new Error('Google did not return a refresh token. Remove the app from Google account permissions and connect again.');
    await db.query(
      `INSERT INTO creators(youtube_channel_id,youtube_channel_name,access_token,refresh_token,token_expiry,connected_at,active)
       VALUES($1,$2,$3,$4,$5,NOW(),TRUE)
       ON CONFLICT(youtube_channel_id) DO UPDATE SET youtube_channel_name=EXCLUDED.youtube_channel_name,access_token=EXCLUDED.access_token,refresh_token=EXCLUDED.refresh_token,token_expiry=EXCLUDED.token_expiry,connected_at=NOW(),active=TRUE`,
      [ch.id,ch.name,tokens.access_token||null,refresh,tokens.expiry_date||null]
    );
    if(st.context==='creator'){
      const exp=Date.now()+12*60*60*1000;
      res.setHeader('Set-Cookie',`safetybot_creator=${encodeURIComponent(creatorCookie(ch.id,exp))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`);
      return res.redirect('/creator');
    }
    res.redirect('/admin');
  }catch(e){next(e);}
});

app.post('/admin/mapping',adminOnly,async(req,res,next)=>{
  try{
    const b=req.body;
    await db.query(`INSERT INTO role_mappings(creator_channel_id,youtube_level_id,youtube_level_name,discord_role_id) VALUES($1,$2,$3,$4) ON CONFLICT(creator_channel_id,youtube_level_id) DO UPDATE SET youtube_level_name=EXCLUDED.youtube_level_name,discord_role_id=EXCLUDED.discord_role_id`,[b.creator_channel_id,b.youtube_level_id,b.youtube_level_name,b.discord_role_id]);
    res.redirect('/admin');
  }catch(e){next(e);}
});
app.post('/admin/creator/:id/toggle',adminOnly,async(req,res,next)=>{try{await db.query(`UPDATE creators SET active=NOT active WHERE id=$1`,[req.params.id]);res.redirect('/admin');}catch(e){next(e);}});
app.post('/admin/creator/:id/grace',adminOnly,async(req,res,next)=>{try{const days=Math.max(0,Math.min(60,Number(req.body.grace_period_days||0)));await db.query(`UPDATE creators SET grace_period_days=$1 WHERE id=$2`,[days,req.params.id]);res.redirect('/admin');}catch(e){next(e);}});
app.post('/admin/creator/:id/delete',adminOnly,async(req,res,next)=>{
  try{
    const r=await db.query(`DELETE FROM creators WHERE id=$1 RETURNING youtube_channel_id`,[req.params.id]);
    const id=r.rows[0]?.youtube_channel_id;
    if(id){await db.query(`DELETE FROM role_mappings WHERE creator_channel_id=$1`,[id]);await db.query(`DELETE FROM membership_status WHERE creator_channel_id=$1`,[id]);}
    res.redirect('/admin');
  }catch(e){next(e);}
});
app.post('/admin/creator/:channelId/sync',adminOnly,async(req,res,next)=>{try{await syncCreator(req.params.channelId);res.redirect('/admin');}catch(e){next(e);}});
app.post('/admin/post-panel',adminOnly,async(req,res,next)=>{try{await postVerificationPanel(req.body.channel_id);res.redirect('/admin');}catch(e){next(e);}});

app.use((e,_req,res,_next)=>{
  console.error(e);
  res.status(500).send(page('Safetybot Error',`<div class="card login-card"><span class="badge">System error</span><h1>Something went wrong</h1><p class="bad">${esc(e.message)}</p><div class="row"><a class="btn" href="/">Home</a><a class="btn gray" href="/admin">Admin</a></div></div>`));
});

export default app;