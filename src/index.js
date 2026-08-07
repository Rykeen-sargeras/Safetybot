import app from './web.js';
import { config } from './config.js';
import { db, ensureSchema } from './db.js';
import { startDiscord } from './discord.js';
import { syncAllCreators } from './sync.js';

let server, auditTimer;

async function boot(){
  await ensureSchema();
  console.log('Database schema ready.');
  server=app.listen(config.port,'0.0.0.0',()=>console.log(`Web server listening on ${config.port}`));
  try{ await startDiscord(); }catch(e){ console.error('Discord startup failed:',e); }

  auditTimer=setInterval(async()=>{
    try{
      console.log('Starting scheduled membership audit...');
      console.log(await syncAllCreators());
    }catch(e){ console.error('Scheduled audit failed:',e); }
  },config.auditIntervalMinutes*60*1000);
  auditTimer.unref();
}

async function shutdown(signal){
  console.log(`${signal} received.`);
  if(auditTimer) clearInterval(auditTimer);
  if(server) await new Promise(resolve=>server.close(resolve));
  await db.end();
  process.exit(0);
}

process.on('SIGTERM',()=>shutdown('SIGTERM'));
process.on('SIGINT',()=>shutdown('SIGINT'));

boot().catch(e=>{ console.error('Fatal startup error:',e); process.exit(1); });
