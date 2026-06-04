// main.js — Processo principal do Electron.
//
// Cria uma janela transparente, sem moldura e sempre-no-topo, posicionada no
// canto inferior direito. Expõe canais IPC para o renderer ler o state.json,
// o caminho do model.glb e a contagem de pendentes (o renderer não tem acesso
// direto ao filesystem do utilizador). Menu de contexto + persistência de posição.
const { app, BrowserWindow, screen, ipcMain, Menu, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, spawn } = require('child_process');

const MM_HOME = process.env.MM_HOME || path.join(os.homedir(), 'mini-miguel');
const MODEL = path.join(MM_HOME, 'avatar', 'model.glb');
const STATE = path.join(MM_HOME, 'data', 'state.json');
const PENDING = path.join(MM_HOME, 'data', 'pending.log');
const LAST_REVIEWED = path.join(MM_HOME, 'data', 'last-reviewed.txt');
const WINPOS = path.join(MM_HOME, 'data', 'avatar-window.json');
const MINI_PERSONA = path.join(MM_HOME, 'config', 'MINI-MIGUEL.md');
const MM_CLI = path.join(MM_HOME, 'mm');

// Resolve o binário do claude (o PATH do Electron pode não incluir /usr/local/bin).
function findClaude() {
  const cands = ['/usr/local/bin/claude', '/opt/homebrew/bin/claude', path.join(os.homedir(), '.claude/local/claude')];
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch (_) {} }
  return 'claude';
}
const CLAUDE_BIN = findClaude();

// Política base do chat: AGIR, com critério sobre quando pedir confirmação.
const CHAT_POLICY = [
  'És o Mini-Miguel, o assistente autónomo do Miguel, a falar com ele num chat.',
  'Tens acesso total às ferramentas disponíveis (Gmail, Google Drive, Notion, Supabase, ficheiros, terminal).',
  'Regra de ouro: NÃO expliques como fazer — FAZ. Usa as ferramentas e devolve o resultado.',
  'Critério para decidir quando perguntar: antes de ações IRREVERSÍVEIS ou para o exterior',
  '(enviar/apagar emails, apagar ficheiros, publicar, gastar dinheiro, contactar terceiros),',
  'pára e pede confirmação ao Miguel ANTES de executar; para leituras, pesquisas e organização',
  'interna, age diretamente. Responde em português europeu, de forma breve e direta.',
].join(' ');

const WIN_W = 92;    // janela ainda mais pequena (não atrapalha)
const WIN_H = 120;

let win = null;
let soundOn = false; // som desligado por defeito
let ghost = false;   // "não atrapalhar": clica através da janela
let parkedPos = null;   // posição "estacionada" (corner/onde o utilizador o deixou)
let slideTimer = null;  // intervalo do passeio pela base do ecrã (estado working)
let moving = false;     // true durante a animação de regresso (não guardar posição)
let chatWin = null;     // janela de chat (conversa limpa com o Mini-Miguel)
let explicitQuit = false; // só sai mesmo pelo menu "Sair" (evita fechar sem querer)

// ── Posição ──────────────────────────────────────────────────────────────
function cornerPosition() {
  const wa = screen.getPrimaryDisplay().workArea; // { x, y, width, height }
  return { x: wa.x + wa.width - WIN_W - 20, y: wa.y + wa.height - WIN_H - 20 };
}

function loadPos() {
  try {
    const p = JSON.parse(fs.readFileSync(WINPOS, 'utf8'));
    if (Number.isFinite(p.x) && Number.isFinite(p.y)) return p;
  } catch (_) { /* sem ficheiro / inválido → usa canto */ }
  return cornerPosition();
}

function savePos() {
  if (!win) return;
  try {
    const [x, y] = win.getPosition();
    fs.mkdirSync(path.dirname(WINPOS), { recursive: true });
    fs.writeFileSync(WINPOS, JSON.stringify({ x, y }));
  } catch (_) { /* ignora */ }
}

// ── Terminal helper ──────────────────────────────────────────────────────
function openInTerminal(cmd) {
  const safe = cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  exec(
    `osascript -e 'tell application "Terminal" to activate' ` +
    `-e 'tell application "Terminal" to do script "${safe}"'`
  );
}

// ── "Não atrapalhar": deixa o rato clicar através da janela ─────────────────
function setGhost(on) {
  ghost = on;
  if (win) win.setIgnoreMouseEvents(ghost, { forward: true });
}

// ── Menu de contexto (right-click) ─────────────────────────────────────────
function buildMenu() {
  return Menu.buildFromTemplate([
    { label: 'Abrir chat', click: () => openChat() },
    { label: 'Anexar ao agente (terminal)', click: () => attachAgent() },
    { label: 'Ver perguntas pendentes', click: () => openInTerminal(`${MM_CLI} pending`) },
    { type: 'separator' },
    {
      label: ghost ? 'Não atrapalhar: ON ✓  (⌘⇧G)' : 'Não atrapalhar — clica através  (⌘⇧G)',
      click: () => setGhost(!ghost),
    },
    { label: 'Ocultar avatar  (⌘⇧M)', click: () => { if (win) win.hide(); } },
    {
      label: soundOn ? 'Som: ligado ✓' : 'Som: desligado',
      click: () => { soundOn = !soundOn; if (win) win.webContents.send('set-sound', soundOn); },
    },
    { label: 'Voltar ao canto', click: () => { const p = cornerPosition(); if (win) { win.setPosition(p.x, p.y); parkedPos = [p.x, p.y]; savePos(); } } },
    { type: 'separator' },
    { label: 'Sair (fecha tudo)', click: () => { explicitQuit = true; app.quit(); } },
  ]);
}

// ── Janela ─────────────────────────────────────────────────────────────────
function createWindow() {
  const pos = loadPos();
  win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    x: pos.x,
    y: pos.y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile('index.html');

  parkedPos = win.getPosition();
  win.on('moved', () => { if (!slideTimer && !moving) { parkedPos = win.getPosition(); savePos(); } });
  win.webContents.on('context-menu', () => buildMenu().popup({ window: win }));
  win.webContents.on('did-finish-load', () => win.webContents.send('set-sound', soundOn));
}

// ── IPC ──────────────────────────────────────────────────────────────────
ipcMain.handle('get-model-path', () => 'file://' + MODEL);

ipcMain.handle('get-state', () => {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); }
  catch (_) { return null; }
});

ipcMain.handle('get-pending-count', () => {
  try {
    if (!fs.existsSync(PENDING)) return 0;
    const lines = fs.readFileSync(PENDING, 'utf8').split('\n').filter((l) => l.trim());
    let since = 0;
    try { since = (Number(fs.readFileSync(LAST_REVIEWED, 'utf8').trim()) || 0) * 1000; } catch (_) {}
    if (!since) return lines.length; // nunca revisto → tudo conta
    let count = 0;
    for (const l of lines) {
      const m = l.match(/^\[(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})\]/);
      if (m) {
        const t = Date.parse(`${m[1]}T${m[2]}`); // hora local
        if (Number.isFinite(t) && t > since) count++;
      }
    }
    return count;
  } catch (_) { return 0; }
});

// Clique no avatar: faz attach à sessão tmux ativa (a mais recente). Se não houver
// nenhuma, abre o painel do mm no Terminal. Uma linha trata dos dois casos.
function attachAgent() {
  openInTerminal(`tmux attach 2>/dev/null || "${MM_CLI}" dashboard`);
}
ipcMain.on('attach-agent', attachAgent);

// Posição da janela — o arrasto é feito no renderer (janela sem moldura).
ipcMain.handle('get-win-pos', () => (win ? win.getPosition() : [0, 0]));
ipcMain.on('set-win-pos', (_e, p) => { if (win && p) win.setPosition(Math.round(p.x), Math.round(p.y)); });

// ── Chat (conversa limpa com o Mini-Miguel via `claude -p`) ─────────────────
function openChat() {
  if (chatWin && !chatWin.isDestroyed()) { chatWin.show(); chatWin.focus(); return; }
  chatWin = new BrowserWindow({
    width: 400,
    height: 580,
    title: 'Mini-Miguel',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  if (app.dock) app.dock.show(); // com o chat aberto faz sentido ter ícone no dock
  chatWin.loadFile('chat.html');
  chatWin.on('closed', () => { chatWin = null; if (app.dock) app.dock.hide(); });
  ensureAgent(); // pré-aquece o agente enquanto o utilizador lê/escreve
}
ipcMain.on('open-chat', openChat);
ipcMain.on('open-terminal', attachAgent); // botão "Terminal" dentro do chat

// ── Agente de chat persistente ──────────────────────────────────────────────
// Mantemos UM processo `claude` vivo (stream-json) enquanto a app corre: os
// conectores (Gmail/Drive/…) ligam UMA vez e as mensagens seguintes ficam rápidas
// (~6s → ~2.7s). O histórico mantém-se em memória enquanto o processo viver.
let agentProc = null;
let agentBuf = '';
let agentTurn = null; // { resolve, text } da pergunta em curso

function buildSys() {
  const persona = fs.existsSync(MINI_PERSONA) ? fs.readFileSync(MINI_PERSONA, 'utf8') : '';
  return CHAT_POLICY + (persona.trim() ? '\n\n---\n\n' + persona : '');
}

function ensureAgent() {
  if (agentProc) return;
  const args = [
    '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--model', 'sonnet', '--dangerously-skip-permissions', '--append-system-prompt', buildSys(),
  ];
  agentBuf = '';
  agentProc = spawn(CLAUDE_BIN, args, { cwd: MM_HOME });
  agentProc.stdout.on('data', onAgentData);
  agentProc.stderr.on('data', () => { /* ignora avisos */ });
  agentProc.on('error', () => {
    agentProc = null;
    if (agentTurn) { agentTurn.resolve({ error: 'não encontrei o claude' }); agentTurn = null; }
  });
  agentProc.on('exit', () => {
    agentProc = null;
    if (agentTurn) { agentTurn.resolve({ error: 'o agente terminou — tenta de novo' }); agentTurn = null; }
  });
}

// stdout vem em JSON por linha; cada turno termina num evento "result".
function onAgentData(chunk) {
  agentBuf += chunk.toString();
  let nl;
  while ((nl = agentBuf.indexOf('\n')) >= 0) {
    const line = agentBuf.slice(0, nl).trim();
    agentBuf = agentBuf.slice(nl + 1);
    if (!line || !agentTurn) continue;
    let ev; try { ev = JSON.parse(line); } catch (_) { continue; }
    if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
      const txt = ev.message.content.filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
      if (txt) { agentTurn.text = txt; if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('chat-partial', txt); }
    } else if (ev.type === 'result') {
      agentTurn.resolve({ reply: ((ev.result || agentTurn.text) || '').trim() });
      agentTurn = null;
    }
  }
}

ipcMain.handle('chat-send', async (_e, payload) => {
  const text = (payload && payload.text || '').trim();
  if (!text) return { reply: '' };
  ensureAgent();
  if (!agentProc) return { error: 'não consegui arrancar o agente' };
  if (agentTurn) return { error: 'espera pela resposta anterior' };
  return await new Promise((resolve) => {
    agentTurn = { resolve, text: '' };
    const msg = JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n';
    try { agentProc.stdin.write(msg); }
    catch (_) { agentTurn = null; resolve({ error: 'não consegui enviar a mensagem' }); return; }
    setTimeout(() => { if (agentTurn && agentTurn.resolve === resolve) { agentTurn = null; resolve({ error: 'demorou demasiado (timeout)' }); } }, 600000);
  });
});

// ── Movimento da janela conforme o estado ──────────────────────────────────
// working → "vai trabalhar": desce à base do ecrã e passeia de um lado ao outro.
// qualquer outro estado → regressa, devagar, à posição estacionada e fica quieto.
function animateTo(tx, ty, done) {
  if (!win) return;
  const [sx, sy] = win.getPosition();
  let i = 0; const steps = 16;
  moving = true;
  const t = setInterval(() => {
    if (!win) { clearInterval(t); moving = false; return; }
    i++; const k = i / steps;
    win.setPosition(Math.round(sx + (tx - sx) * k), Math.round(sy + (ty - sy) * k));
    if (i >= steps) { clearInterval(t); moving = false; if (done) done(); }
  }, 22);
}

function startSlide() {
  if (slideTimer || !win) return;
  if (!parkedPos) parkedPos = win.getPosition();
  const wa = screen.getPrimaryDisplay().workArea;
  const y = wa.y + wa.height - WIN_H - 4;            // encostado à base do ecrã
  const minX = wa.x + 8;
  const maxX = wa.x + wa.width - WIN_W - 8;
  let x = win.getPosition()[0];
  if (x < minX) x = minX;
  if (x > maxX) x = maxX;
  let dir = 1;
  slideTimer = setInterval(() => {
    if (!win) { clearInterval(slideTimer); slideTimer = null; return; }
    x += dir * 2.0;                                  // passo calmo (~60px/s)
    if (x >= maxX) { x = maxX; dir = -1; }
    if (x <= minX) { x = minX; dir = 1; }
    win.setPosition(Math.round(x), y);
  }, 33);
}

function stopSlide() {
  if (slideTimer) { clearInterval(slideTimer); slideTimer = null; }
}

function onState(s) {
  if (s === 'working') {
    startSlide();
  } else {
    stopSlide();
    if (parkedPos) animateTo(parkedPos[0], parkedPos[1], savePos);
  }
}
ipcMain.on('state', (_e, s) => onState(s));

// ── Ciclo de vida ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  if (app.dock) app.dock.hide(); // overlay: sem ícone no dock
  createWindow();
  // Atalho global para mostrar/ocultar o avatar.
  globalShortcut.register('CommandOrControl+Shift+M', () => {
    if (!win) return;
    if (win.isVisible()) win.hide(); else win.show();
  });
  // Atalho global para "não atrapalhar" (clica através da janela).
  globalShortcut.register('CommandOrControl+Shift+G', () => setGhost(!ghost));
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

// ⌘Q ou fechar o chat NÃO matam o avatar — só o menu "Sair" sai mesmo.
app.on('before-quit', (e) => {
  if (!explicitQuit) { e.preventDefault(); if (chatWin && !chatWin.isDestroyed()) chatWin.close(); }
});
app.on('window-all-closed', () => { /* mantém vivo (overlay); sair via menu */ });
app.on('will-quit', () => { globalShortcut.unregisterAll(); if (agentProc) { try { agentProc.kill(); } catch (_) {} } });
