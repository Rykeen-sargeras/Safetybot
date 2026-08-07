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

function page(title,body){
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
  <style>
  body{font-family:Arial,sans-serif;background:#111318;color:#f2f2f2;margin:0}.wrap{max-width:1050px;margin:40px auto;padding:0 18px}
  .card{background:#1b1f27;border:1px solid #303744;border-radius:14px;padding:20px;margin-bottom:18px}.btn{display:inline-block;background:#5865f2;color:white;padding:10px 14px;border-radius:8px;text-decoration:none;border:none;cursor:pointer}
  .red{background:#b3261e}.gray{background:#414754}.green{background:#237a45}input,select{background:#0f1116;color:#fff;border:1px solid #3a4250;border-radius:7px;padding:9px}
  table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid #303744;vertical-align:top}.muted{color:#a7adba}.bad{color:#ff8a80}.ok{color:#77d990}
  .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}code{background:#0f1116;padding:2px 5px;border-radius:4px}
  </style></head><body><div class="wrap">${body}</div></body></html>`;
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
function adminOnly(req,res,next){ if(!isAdmin(req)) return res.redirect('/admin'); next(); }
function passwordMatches(v){
  const a=Buffer.from(String(v||'')),b=Buffer.from(String(config.adminPassword));
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}

app.get('/health',(_req,res)=>res.json({ok:true,service:'verification-bot',version:'2.0.0'}));

app.get('/',(_req,res)=>res.send(page('YouTube Membership Verification',`
<div class="card"><h1>YouTube Membership Verification</h1>
<p>Verify your active YouTube membership and receive the correct Discord role.</p>
<a class="btn" href="/verify?mode=verify">Verify Membership</a>
<a class="btn gray" href="/verify?mode=status">Check Status</a>
<a class="btn gray" href="/verify?mode=recheck">Recheck Membership</a></div>`)));

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
      return res.status(400).send(page('YouTube Not Connected',`
      <div class="card"><h1>YouTube is not connected to Discord</h1>
      <p>Open Discord → User Settings → Connections and connect your YouTube account first.</p>
      <a class="btn" href="/">Go Back</a></div>`));
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

    res.send(page('Membership Status',`
    <div class="card"><h1>Membership Check Complete</h1>
    <p>Discord: <strong>${esc(user.global_name||user.username)}</strong></p>
    <p>YouTube: <strong>${esc(yt.name||yt.id)}</strong></p></div>
    <div class="card"><h2>Results</h2>
    <table><tr><th>Creator</th><th>Status</th></tr>${rows||'<tr><td colspan="2">No creators connected yet.</td></tr>'}</table></div>`));
  }catch(e){next(e);}
});

app.get('/admin',async(req,res,next)=>{
  try{
    if(!isAdmin(req)){
      return res.send(page('Admin Login',`
      <div class="card" style="max-width:460px;margin:80px auto"><h1>Safetybot Admin</h1>
      <form method="post" action="/admin/login"><p><input style="width:95%" type="password" name="password" placeholder="Admin password" required></p>
      <button class="btn" type="submit">Login</button></form></div>`));
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
        return `<tr><td>${esc(l.name)}</td><td><code>${esc(l.id)}</code></td><td>
        <form method="post" action="/admin/mapping" class="row">
        <input type="hidden" name="creator_channel_id" value="${esc(c.youtube_channel_id)}">
        <input type="hidden" name="youtube_level_id" value="${esc(l.id)}">
        <input type="hidden" name="youtube_level_name" value="${esc(l.name)}">
        <select name="discord_role_id" required><option value="">Choose Discord role</option>${opts}</select>
        <button class="btn green" type="submit">Save Role</button></form></td></tr>`;
      }).join('');

      creatorCards.push(`<div class="card"><h2>${esc(c.youtube_channel_name)}</h2>
      <p class="muted"><code>${esc(c.youtube_channel_id)}</code></p>
      <p>Status: <strong>${c.active?'Enabled':'Disabled'}</strong></p>
      <div class="row">
      <form method="post" action="/admin/creator/${c.id}/toggle"><button class="btn gray" type="submit">${c.active?'Disable':'Enable'}</button></form>
      <form method="post" action="/admin/creator/${encodeURIComponent(c.youtube_channel_id)}/sync"><button class="btn" type="submit">Force Sync</button></form>
      <form method="post" action="/admin/creator/${c.id}/delete" onsubmit="return confirm('Remove this creator?')"><button class="btn red" type="submit">Remove Creator</button></form>
      </div>
      <h3 style="margin-top:20px">Grace Period</h3>
      <form method="post" action="/admin/creator/${c.id}/grace" class="row">
      <input type="number" name="grace_period_days" min="0" max="60" value="${esc(c.grace_period_days)}"><span>days</span>
      <button class="btn gray" type="submit">Save</button></form>
      <h3 style="margin-top:20px">Membership Level → Discord Role</h3>
      ${levelError?`<p class="bad">${esc(levelError)}</p>`:''}
      <table><tr><th>YouTube Level</th><th>Level ID</th><th>Discord Role</th></tr>
      ${levelRows||'<tr><td colspan="3">No membership levels returned by YouTube.</td></tr>'}</table></div>`);
    }

    const channelOpts=channels.map(c=>`<option value="${esc(c.id)}">#${esc(c.name)}</option>`).join('');

    res.send(page('Safetybot Admin',`
    <div class="card"><div class="row" style="justify-content:space-between"><div><h1>Safetybot Admin</h1>
    <p class="muted">Manage creators, roles, grace periods, syncing and the verification panel.</p></div>
    <a class="btn gray" href="/admin/logout">Logout</a></div></div>
    <div class="card"><h2>Connect a Creator</h2><p>This button only exists inside the password-protected admin dashboard.</p>
    <a class="btn" href="/admin/creator/connect">Connect YouTube Creator</a></div>
    <div class="card"><h2>Post Verification Panel</h2>
    <form method="post" action="/admin/post-panel" class="row"><select name="channel_id" required>
    <option value="">Choose Discord channel</option>${channelOpts}</select><button class="btn" type="submit">Post Panel</button></form></div>
    ${creatorCards.join('')||'<div class="card"><h2>No creators connected yet</h2></div>'}`));
  }catch(e){next(e);}
});

app.post('/admin/login',(req,res)=>{
  if(!passwordMatches(req.body.password)) return res.status(401).send(page('Login Failed','<div class="card"><h1>Wrong password</h1><a class="btn" href="/admin">Try Again</a></div>'));
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
    res.redirect(auth.generateAuthUrl({
      access_type:'offline',prompt:'consent',state,
      scope:[config.google.membershipScope,config.google.readonlyScope]
    }));
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
       ON CONFLICT(youtube_channel_id) DO UPDATE SET youtube_channel_name=EXCLUDED.youtube_channel_name,
       access_token=EXCLUDED.access_token,refresh_token=EXCLUDED.refresh_token,token_expiry=EXCLUDED.token_expiry,connected_at=NOW(),active=TRUE`,
      [ch.id,ch.name,tokens.access_token||null,refresh,tokens.expiry_date||null]
    );
    res.redirect('/admin');
  }catch(e){next(e);}
});

app.post('/admin/mapping',adminOnly,async(req,res,next)=>{
  try{
    const b=req.body;
    await db.query(
      `INSERT INTO role_mappings(creator_channel_id,youtube_level_id,youtube_level_name,discord_role_id)
       VALUES($1,$2,$3,$4) ON CONFLICT(creator_channel_id,youtube_level_id) DO UPDATE SET
       youtube_level_name=EXCLUDED.youtube_level_name,discord_role_id=EXCLUDED.discord_role_id`,
      [b.creator_channel_id,b.youtube_level_id,b.youtube_level_name,b.discord_role_id]
    );
    res.redirect('/admin');
  }catch(e){next(e);}
});
app.post('/admin/creator/:id/toggle',adminOnly,async(req,res,next)=>{
  try{await db.query(`UPDATE creators SET active=NOT active WHERE id=$1`,[req.params.id]);res.redirect('/admin');}catch(e){next(e);}
});
app.post('/admin/creator/:id/grace',adminOnly,async(req,res,next)=>{
  try{
    const days=Math.max(0,Math.min(60,Number(req.body.grace_period_days||0)));
    await db.query(`UPDATE creators SET grace_period_days=$1 WHERE id=$2`,[days,req.params.id]);res.redirect('/admin');
  }catch(e){next(e);}
});
app.post('/admin/creator/:id/delete',adminOnly,async(req,res,next)=>{
  try{
    const r=await db.query(`DELETE FROM creators WHERE id=$1 RETURNING youtube_channel_id`,[req.params.id]);
    const id=r.rows[0]?.youtube_channel_id;
    if(id){
      await db.query(`DELETE FROM role_mappings WHERE creator_channel_id=$1`,[id]);
      await db.query(`DELETE FROM membership_status WHERE creator_channel_id=$1`,[id]);
    }
    res.redirect('/admin');
  }catch(e){next(e);}
});
app.post('/admin/creator/:channelId/sync',adminOnly,async(req,res,next)=>{
  try{await syncCreator(req.params.channelId);res.redirect('/admin');}catch(e){next(e);}
});
app.post('/admin/post-panel',adminOnly,async(req,res,next)=>{
  try{await postVerificationPanel(req.body.channel_id);res.redirect('/admin');}catch(e){next(e);}
});

app.use((e,_req,res,_next)=>{
  console.error(e);
  res.status(500).send(page('Safetybot Error',`<div class="card"><h1>Something went wrong</h1><p class="bad">${esc(e.message)}</p>
  <a class="btn" href="/">Home</a> <a class="btn gray" href="/admin">Admin</a></div>`));
});

export default app;
