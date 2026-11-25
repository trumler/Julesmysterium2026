import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { url, key } from './config.js';
import { displayTeamName } from './team-name.js';
import { defaultPuzzlePoints } from './puzzle-points.js';
const client = createClient(url, key);
const message = document.querySelector('#message'), loginSection = document.querySelector('#login-section'), dashboard = document.querySelector('#dashboard');
const form = document.querySelector('#puzzle-form'), select = document.querySelector('#number');
const logout = document.querySelector('#logout');
const bonusField = document.querySelector('#bonus-field');
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
 form.elements.points.value = p?.points ?? defaultPuzzlePoints(n);
 form.elements.answers.value = (p?.answers ?? []).join('\n');
 bonusField.hidden = n !== 2;
 form.elements.bonus_answer.value = n === 2 ? p?.bonus_answer ?? '' : '';
 form.elements.puzzle.value = ''; form.elements.solution.value = '';
}
async function showEntries({id, rpc, empty, label, action, confirm, remove, argument, refresh}, message = '') {
 const list = document.querySelector('#admin-' + id);
 const feedback = document.querySelector('#admin-' + id + '-status');
 const {data, error} = await client.rpc(rpc);
 list.replaceChildren();
 if (error) {
  feedback.textContent = 'Oversigten kunne ikke hentes. Prøv at genindlæse siden.';
  return;
 }
 feedback.textContent = message || (data.length ? '' : empty);
 for (const entry of data) {
  const item = document.createElement('li');
  item.textContent = label(entry) + ' ';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = action;
  button.setAttribute('aria-label', action + ': ' + label(entry));
  button.addEventListener('click', async () => {
   if (!window.confirm(confirm(entry))) return;
   button.disabled = true;
   try {
    const {data: removed, error: removalError} = await client.rpc(remove, {[argument]: entry.id});
    if (removalError) throw removalError;
    await refresh(removed ? 'Sletningen er gennemført.' : 'Posten er allerede fjernet.');
   } catch {
    feedback.textContent = 'Sletningen kunne ikke gennemføres. Prøv igen.';
   } finally {
    button.disabled = false;
   }
  });
  item.append(button);
  list.append(item);
 }
}

const showTeams = (message) => showEntries({
 id: 'teams', rpc: 'admin_teams', empty: 'Der er endnu ingen tilmeldte hold.',
 label: team => displayTeamName(team.name) + ' · ' + team.points + ' point',
 action: 'Fjern hold',
 confirm: team => 'Vil du fjerne holdet „' + displayTeamName(team.name) + '“? Medlemslisten og holdets point slettes også.',
 remove: 'remove_team', argument: 'team_id',
 refresh: message => Promise.all([showTeams(message), showPlayers()]),
}, message);

const showPlayers = (message) => showEntries({
 id: 'players', rpc: 'admin_players', empty: 'Der er endnu ingen deltagerkonti.',
 label: player => player.username + (player.team_name ? ' · ' + displayTeamName(player.team_name) : ' · Intet hold'),
 action: 'Fjern bruger',
 confirm: player => 'Vil du slette brugeren „' + player.username + '“? Et eventuelt hold, medlemslisten og point slettes også. Det kan ikke fortrydes.',
 remove: 'remove_player', argument: 'player_id',
 refresh: message => Promise.all([showPlayers(message), showTeams()]),
}, message);

async function show() {
 const {data:{session}} = await client.auth.getSession();
 loginSection.hidden = !!session; dashboard.hidden = true; logout.hidden = !session;
 if (!session) { say('Log ind med din administratorbruger.'); return; }
 const {data: admin, error} = await client.rpc('is_admin');
 if (error) { say('Kunne ikke kontrollere administratoradgangen. Prøv at genindlæse siden.'); return; }
 if (!admin) { say('Du er logget ind som deltager. Log ud og log ind med din administratorbruger.'); return; }
 const result = await client.from('puzzles').select('*').order('number');
 if (result.error) { say('Kunne ikke hente gåderne: ' + result.error.message); return; }
 puzzles = result.data; dashboard.hidden = false; say('Du er logget ind som administrator.'); fill(); await Promise.all([showTeams(), showPlayers()]);
}
document.querySelector('#login').addEventListener('submit', async e => { e.preventDefault(); const f=e.currentTarget; const {error}=await client.auth.signInWithPassword({email:f.email.value,password:f.password.value}); f.password.value=''; if(error) say('Login mislykkedes. Kontrollér e-mail og adgangskode.'); else await show(); });
logout.addEventListener('click', async () => {
 logout.disabled = true;
 try {
  const {error} = await client.auth.signOut({scope: 'local'});
  if (error) say('Du kunne ikke logges ud. Prøv igen.');
  else await show();
 } finally {
  logout.disabled = false;
 }
});
select.addEventListener('change',fill);
form.addEventListener('submit', async e => {
 e.preventDefault(); const n=Number(select.value), old=puzzles.find(p=>p.number===n); let opens, closes; try { opens=fromLocal(form.elements.opens.value); closes=fromLocal(form.elements.closes.value); } catch(err) { say(err.message); return; }
 if (new Date(closes) <= new Date(opens)) { say('Lukketidspunktet skal være efter åbningstidspunktet.'); return; }
 const row={number:n,opens_at:opens,closes_at:closes,points:Number(form.elements.points.value),answers:form.elements.answers.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),puzzle_path:old?.puzzle_path ?? null,solution_path:old?.solution_path ?? null};
 if (n === 2) row.bonus_answer = form.elements.bonus_answer.value.trim() || null;
 try {
  if (!row.answers.length) throw new Error('Skriv mindst ét facitord.');
  if (row.answers.some(answer => /\s/.test(answer))) throw new Error('Hvert facit skal være ét ord.');
  for (const [field,column] of [['puzzle','puzzle_path'],['solution','solution_path']]) { const file=form.elements[field].files[0]; if (!file) continue; if(file.type !== 'image/png' || file.size > 10485760) throw new Error('Vælg en PNG-fil på højst 10 MB.'); const path=`${n}/${field}-${crypto.randomUUID()}.png`; const {error}=await client.storage.from('puzzle-images').upload(path,file,{contentType:'image/png'}); if(error) throw error; row[column]=path; }
  const {error}=await client.from('puzzles').upsert(row); if(error) throw error;
  const result=await client.from('puzzles').select('*').order('number'); if(result.error) throw result.error; puzzles=result.data; fill(); say(`Gåde ${n} er gemt.`);
 } catch(err) { say('Kunne ikke gemme: '+err.message); }
});
show().catch(() => say('Kunne ikke oprette forbindelse til Supabase.'));
