import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {url,key} from './config.js';
import { displayTeamName } from './team-name.js';
import { defaultPuzzlePoints } from './puzzle-points.js';
const client=createClient(url,key);
const grid=document.querySelector('#puzzle-grid');
const dates=['30. NOV','03. DEC','07. DEC','10. DEC','14. DEC','17. DEC','21. DEC','24. DEC'];
let activeTeam = null;
let calendarRequest = 0;
const imageUrls = new Map();
const puzzleDialog = document.querySelector('#puzzle-dialog');
const enlargedImage = document.querySelector('#enlarged-puzzle');
const enlargedTitle = document.querySelector('#enlarged-title');
const enlargedDownload = document.querySelector('#enlarged-download');
let nextCalendarUpdate;

async function load() {
  const request = ++calendarRequest;
  const {data, error} = await client.rpc('public_puzzles');
  if (request !== calendarRequest) return;
  if (error) {
    grid.textContent = 'Gåderne kunne ikke indlæses. Prøv igen senere.';
    return;
  }

  clearTimeout(nextCalendarUpdate);
  const now = Date.now();
  const nextChange = Math.min(...data.flatMap(puzzle => [
    Date.parse(puzzle.opens_at), Date.parse(puzzle.closes_at),
  ]).filter(time => time > now));
  if (Number.isFinite(nextChange)) {
    nextCalendarUpdate = setTimeout(load, Math.min(nextChange - now + 1000, 2147483647));
  }

  const cards = document.createDocumentFragment();
  const dateFormat = new Intl.DateTimeFormat('da-DK', {
    timeZone: 'Europe/Copenhagen', dateStyle: 'medium', timeStyle: 'short',
  });
  for (let number = 1; number <= dates.length; number++) {
    const puzzle = data.find(row => row.number === number);
    const hasOpened = puzzle && now >= Date.parse(puzzle.opens_at);
    const isOpen = hasOpened && now < Date.parse(puzzle.closes_at);
    const card = document.createElement('article');
    card.className = 'puzzle-card';

    const title = document.createElement('div');
    title.className = 'card-top';
    title.textContent = 'GÅDE ' + String(number).padStart(2, '0') + ' ✧';
    card.append(title);

    if (!hasOpened) {
      const gift = document.createElement('div');
      gift.className = 'puzzle-gift';
      gift.textContent = '🎁';
      gift.setAttribute('aria-hidden', 'true');
      card.append(gift);
    } else if (puzzle.puzzle_path) {
      card.append(puzzlePreview(puzzle.puzzle_path, number));
    }

    const date = document.createElement('strong');
    date.textContent = puzzle ? dateFormat.format(new Date(puzzle.opens_at)) : dates[number - 1];
    const state = document.createElement('p');
    state.textContent = !puzzle ? 'Ikke oprettet endnu' : !hasOpened ? 'Åbner snart' : isOpen ? 'Åben' : 'Lukket';
    card.append(date, state);

    const points = document.createElement('span');
    points.className = 'points';
    points.textContent = (puzzle?.points ?? defaultPuzzlePoints(number)) + ' POINT';
    card.append(points);

    if (puzzle) {
      if (hasOpened && puzzle.puzzle_path) {
        card.append(imageDownload(puzzle.puzzle_path, 'gaade-' + number + '.png', 'Download gåden'));
      }
      if (hasOpened && !isOpen && puzzle.solution_path) {
        card.append(imageDownload(puzzle.solution_path, 'loesning-' + number + '.png', 'Download løsningen'));
      }
      if (activeTeam && isOpen) card.append(answerForm(number));
    }
    cards.append(card);
  }
  grid.replaceChildren(cards);
}

function imageUrl(path) {
  if (!imageUrls.has(path)) {
    const pending = client.storage.from('puzzle-images').download(path)
      .then(({data, error}) => {
        if (error) throw error;
        return URL.createObjectURL(data);
      }).catch(error => {
        imageUrls.delete(path);
        throw error;
      });
    imageUrls.set(path, pending);
  }
  return imageUrls.get(path);
}

function imageDownload(path, filename, label) {
  const link = document.createElement('a');
  link.href = '#';
  link.download = filename;
  link.textContent = label + ' ↗';
  link.addEventListener('click', async event => {
    if (link.protocol === 'blob:') return;
    event.preventDefault();
    try {
      link.href = await imageUrl(path);
      link.textContent = label + ' ↗';
      link.click();
    } catch {
      link.textContent = 'Billedet kunne ikke hentes. Prøv igen.';
    }
  });
  return link;
}

function puzzlePreview(path, number) {
  const preview = document.createElement('button');
  preview.type = 'button';
  preview.className = 'puzzle-preview';
  preview.setAttribute('aria-label', 'Vis gåde ' + number + ' i større format');
  preview.hidden = true;
  const thumbnail = document.createElement('img');
  thumbnail.alt = '';
  preview.append(thumbnail);
  imageUrl(path).then(url => {
    thumbnail.src = url;
    preview.hidden = false;
  }).catch(() => {
    // The download link remains available for retrying.
  });
  preview.addEventListener('click', () => {
    enlargedTitle.textContent = 'Gåde ' + number;
    enlargedImage.src = thumbnail.src;
    enlargedImage.alt = 'Gåde ' + number;
    enlargedDownload.href = thumbnail.src;
    enlargedDownload.download = 'gaade-' + number + '.png';
    puzzleDialog.showModal();
  });
  return preview;
}

const status = document.querySelector('#team-status');
const headerLogin = document.querySelector('a.header-login');
const headerLogout = document.querySelector('#header-logout');
const authPanel = document.querySelector('#team-auth');
const signin = document.querySelector('#signin');
const createForm = document.querySelector('#create-team');
const logout = document.querySelector('#team-logout');
const rosterFields = document.querySelector('#roster-fields');
const addMember = document.querySelector('#add-member');
const saveTeam = document.querySelector('#save-team');
const accountEmail = username => username.trim().toLowerCase() + '@julemysteriet.invalid';

function appendMember(value = '') {
  const index = rosterFields.children.length;
  const label = document.createElement('label');
  label.textContent = index === 0 ? 'Holdkaptajn' : 'Medlem ' + (index + 1);
  const input = document.createElement('input');
  input.name = 'member';
  input.maxLength = 50;
  input.required = index === 0;
  input.value = value;
  label.append(input);
  rosterFields.append(label);
  addMember.disabled = index + 1 >= 50;
  return input;
}

addMember.addEventListener('click', () => appendMember().focus());
const rows = document.querySelector('#leaderboard-rows');
let sessionRequest = 0;

async function loadBoard() {
  const {data, error} = await client.rpc('leaderboard');
  rows.replaceChildren();
  if (error || !data.length) {
    rows.textContent = error ? 'Pointtavlen kunne ikke hentes.' : 'Der er endnu ingen tilmeldte hold.';
    return;
  }
  let placement = 1;
  data.forEach((team, index) => {
    if (index && team.points !== data[index - 1].points) placement = index + 1;
    const row = document.createElement('div');
    row.className = 'board-label';
    const name = document.createElement('span');
    name.textContent = placement + '. ' + displayTeamName(team.name);
    const points = document.createElement('strong');
    points.textContent = team.points;
    row.append(name, points);
    rows.append(row);
  });
}

async function showSession(session) {
  const request = ++sessionRequest;
  const result = session ? await client.rpc('my_team_roster') : {};
  if (request !== sessionRequest) return;
  activeTeam = result.data?.name ?? null;
  if (session && !result.error) {
    createForm.team_name.value = activeTeam ?? '';
    const members = result.data?.members ?? [];
    rosterFields.replaceChildren();
    for (let i = 0; i < Math.max(4, members.length); i++) appendMember(members[i]);
    saveTeam.textContent = activeTeam ? 'Gem ændringer' : 'Opret hold ↗';
  }
  authPanel.hidden = Boolean(session);
  headerLogin.hidden = Boolean(session);
  headerLogout.hidden = !session;
  createForm.hidden = !session || Boolean(result.error);
  logout.hidden = !session;
  status.textContent = result.error ? 'Holdet kunne ikke hentes. Prøv at genindlæse siden.'
    : activeTeam ? 'Du er logget ind for holdet ' + displayTeamName(activeTeam) + '.'
    : session ? 'Du er logget ind. Vælg et navn til jeres hold.' : '';
  load();
}

function handleForm(form, handler) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button:not([type=button])');
    if (button.disabled) return;
    const feedback = form.querySelector('[role=status]') ?? status;
    feedback.textContent = '';
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    try {
      await handler(form, feedback);
    } catch {
      feedback.textContent = 'Forbindelsen blev afbrudt. Prøv igen.';
    } finally {
      button.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
}

handleForm(document.querySelector('#signup'), async (form, feedback) => {
  const username = form.username.value.trim().toLowerCase();
  const password = form.password.value;
  if (new TextEncoder().encode(password).length > 72) {
    feedback.textContent = 'Vælg en kortere adgangskode.';
    return;
  }
  const {error} = await client.functions.invoke('register-player', {body: {username, password}});
  if (error) {
    const code = error.context?.status;
    feedback.textContent = code === 409 ? 'Brugernavnet er optaget. Vælg et andet.'
      : code === 429 ? 'Der er oprettet mange konti fra denne forbindelse. Prøv igen senere.'
      : 'Kontoen kunne ikke oprettes. Prøv igen.';
    return;
  }
  form.reset();
  signin.username.value = username;
  signin.password.value = '';
  signin.querySelector('[role=status]').textContent = 'Kontoen er oprettet. Log ind for at oprette dit hold.';
  signin.password.focus();
});

handleForm(signin, async (form, feedback) => {
  const username = form.username.value.trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,30}$/.test(username)) {
    feedback.textContent = 'Forkert brugernavn eller adgangskode.';
    return;
  }
  const {error} = await client.auth.signInWithPassword({
    email: accountEmail(username), password: form.password.value,
  });
  if (!error) form.reset();
  else if (error.code === 'invalid_credentials') {
    feedback.textContent = 'Forkert brugernavn eller adgangskode.';
  } else if (error.status === 429) {
    feedback.textContent = 'For mange loginforsøg. Prøv igen om lidt.';
  } else {
    feedback.textContent = 'Du kunne ikke logge ind lige nu. Prøv igen.';
  }
});

handleForm(createForm, async (form, feedback) => {
  const teamName = form.team_name.value.trim();
  if (teamName.length < 2) {
    feedback.textContent = 'Holdnavnet skal være mindst to tegn.';
    return;
  }
  const members = new FormData(form).getAll('member').map(name => name.trim());
  if (!members[0]) {
    feedback.textContent = 'Skriv et navn eller kaldenavn til holdkaptajnen.';
    return;
  }
  const {error} = await client.rpc('save_team_roster', {
    team_name: teamName, roster: members.filter(Boolean),
  });
  if (error) {
    feedback.textContent = error.code === '23505' ? 'Holdnavnet er allerede taget. Vælg et andet.'
      : 'Holdet kunne ikke oprettes. Prøv igen.';
    return;
  }
  const {data} = await client.auth.getSession();
  await showSession(data.session);
  status.textContent = 'Holdet er gemt.';
  loadBoard();
});

async function signOut() {
  const {error} = await client.auth.signOut({scope: 'local'});
  if (error) {
    status.textContent = 'Du kunne ikke logges ud. Prøv igen.';
    status.scrollIntoView({block: 'center'});
  }
}

logout.addEventListener('click', signOut);
headerLogout.addEventListener('click', signOut);

function answerForm(number) {
  const form = document.createElement('form');
  form.className = 'answer-form';
  form.innerHTML = '<label>Jeres svar<input name="guess" required maxlength="100"></label><button class="button button-green">Send svar</button><p role="status"></p>';
  handleForm(form, async () => {
    const {data, error} = await client.rpc('submit_answer', {
      p_number: number, guess: form.guess.value,
    });
    const messages = {
      correct: 'Rigtigt! Holdet har fået point.',
      incorrect: 'Det var ikke det rigtige svar. Prøv igen.',
      already_solved: 'Jeres hold har allerede fået point for denne gåde.',
      closed: 'Gåden er ikke åben for svar.',
      no_team: 'Log ind og opret et hold for at svare.',
    };
    form.querySelector('[role="status"]').textContent = error ? 'Svaret kunne ikke sendes. Prøv igen.' : messages[data];
    if (data === 'correct' || data === 'already_solved') {
      form.guess.disabled = true;
      form.querySelector('button').hidden = true;
    }
    if (data === 'correct') loadBoard();
  });
  return form;
}

client.auth.onAuthStateChange((event, session) => {
  if (['INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT'].includes(event)) {
    setTimeout(() => showSession(session), 0);
  }
});
loadBoard();
