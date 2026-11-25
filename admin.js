import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { url, key } from './config.js';
const client = createClient(url, key);
const message = document.querySelector('#message'), loginSection = document.querySelector('#login-section'), dashboard = document.querySelector('#dashboard');
const form = document.querySelector('#puzzle-form'), select = document.querySelector('#number');
let puzzles = [];
const say = text => { message.textContent = text; };
for (let n = 1; n <= 8; n++) select.add(new Option(`Gåde ${n}`, n));
const parts = date => Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Copenhagen',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p => [p.type,p.value]));
const toLocal = value => { if(!value) return ''; const p=parts(new Date(value)); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; };
const fromLocal = value => { const target=Date.parse(value+'Z'); let t=target; for(let i=0;i<3;i++){ const p=parts(new Date(t)); const represented=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`); t+=target-represented; } if(toLocal(new Date(t).toISOString())!==value.slice(0,16)) throw new Error('Tidspunktet findes ikke i dansk tid.'); return new Date(t).toISOString(); };
function fill() {
 const n = Number(select.value), p = puzzles.find(row => row.number === n);
 const dates = ['2026-11-30','2026-12-03','2026-12-07','2026-12-10','2026-12-14','2026-12-17','2026-12-21','2026-12-24'];
 form.elements.opens.value = p ? toLocal(p.opens_at) : `${dates[n-1]}T08:00`;
 form.elements.closes.value = p ? `${toLocal(p.closes_at)}:${parts(new Date(p.closes_at)).second}` : n < 8 ? `${dates[n]}T08:00` : '2026-12-31T23:59:59';
 form.elements.points.value = p?.points ?? (n === 8 ? 20 : n + 4);
 form.elements.answers.value = (p?.answers ?? []).join('\n');
 form.elements.puzzle.value = ''; form.elements.solution.value = '';
}
async function showTeams() {
 const list = document.querySelector('#admin-teams');
 const feedback = document.querySelector('#admin-teams-status');
 const {data, error} = await client.rpc('leaderboard');
 list.replaceChildren();
 feedback.textContent = error ? 'Holdoversigten kunne ikke hentes.'
   : data.length ? '' : 'Der er endnu ingen tilmeldte hold.';
 for (const team of data ?? []) {
  const item = document.createElement('li');
  item.textContent = team.name + ' · ' + team.points + ' point';
  list.append(item);
 }
}
async function show() {
 const {data:{session}} = await client.auth.getSession();
 loginSection.hidden = !!session; dashboard.hidden = true;
 if (!session) { say('Log ind med din administratorbruger.'); return; }
 const {data: admin, error} = await client.rpc('is_admin');
 if (error || !admin) { say('Denne bruger har ikke administratoradgang.'); return; }
 const result = await client.from('puzzles').select('*').order('number');
 if (result.error) { say('Kunne ikke hente gåderne: ' + result.error.message); return; }
 puzzles = result.data; dashboard.hidden = false; say('Du er logget ind som administrator.'); fill(); await showTeams();
}
document.querySelector('#login').addEventListener('submit', async e => { e.preventDefault(); const f=e.currentTarget; const {error}=await client.auth.signInWithPassword({email:f.email.value,password:f.password.value}); f.password.value=''; if(error) say('Login mislykkedes. Kontrollér e-mail og adgangskode.'); else await show(); });
document.querySelector('#logout').addEventListener('click', async () => { await client.auth.signOut(); await show(); });
select.addEventListener('change',fill);
form.addEventListener('submit', async e => {
 e.preventDefault(); const n=Number(select.value), old=puzzles.find(p=>p.number===n); let opens, closes; try { opens=fromLocal(form.elements.opens.value); closes=fromLocal(form.elements.closes.value); } catch(err) { say(err.message); return; }
 if (new Date(closes) <= new Date(opens)) { say('Lukketidspunktet skal være efter åbningstidspunktet.'); return; }
 const row={number:n,opens_at:opens,closes_at:closes,points:Number(form.elements.points.value),answers:form.elements.answers.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),puzzle_path:old?.puzzle_path ?? null,solution_path:old?.solution_path ?? null};
 try {
  if (!row.answers.length) throw new Error('Skriv mindst ét facitord.');
  if (row.answers.some(answer => /\s/.test(answer))) throw new Error('Hvert facit skal være ét ord.');
  for (const [field,column] of [['puzzle','puzzle_path'],['solution','solution_path']]) { const file=form.elements[field].files[0]; if (!file) continue; if(file.type !== 'image/png' || file.size > 10485760) throw new Error('Vælg en PNG-fil på højst 10 MB.'); const path=`${n}/${field}-${crypto.randomUUID()}.png`; const {error}=await client.storage.from('puzzle-images').upload(path,file,{contentType:'image/png'}); if(error) throw error; row[column]=path; }
  const {error}=await client.from('puzzles').upsert(row); if(error) throw error;
  const result=await client.from('puzzles').select('*').order('number'); if(result.error) throw result.error; puzzles=result.data; fill(); say(`Gåde ${n} er gemt.`);
 } catch(err) { say('Kunne ikke gemme: '+err.message); }
});
show().catch(() => say('Kunne ikke oprette forbindelse til Supabase.'));
