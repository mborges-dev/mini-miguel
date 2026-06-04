// chat.js — Conversa limpa com o Mini-Miguel.
// Cada mensagem vai ao processo principal (IPC 'chat-send'), que corre o `claude`
// em modo print e devolve texto. Mostramos em balões, como um chat normal.
const ipc = window.ipc;
const log = document.getElementById('log');
const input = document.getElementById('input');
const form = document.getElementById('composer');
const sendBtn = document.getElementById('send');
let pendingBubble = null;

// Vai mostrando a resposta à medida que chega (parece mais rápido).
ipc.on('chat-partial', (_e, t) => {
  if (!pendingBubble) return;
  pendingBubble.classList.remove('pending');
  pendingBubble.textContent = t;
  log.scrollTop = log.scrollHeight;
});

function add(cls, text) {
  const d = document.createElement('div');
  d.className = 'msg ' + cls;
  d.textContent = text; // textContent escapa HTML; o CSS faz o pre-wrap
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  return d;
}

// Textarea cresce com o conteúdo (até ao máximo do CSS).
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(120, input.scrollHeight) + 'px';
});

let busy = false;
async function send() {
  const text = input.value.trim();
  if (!text || busy) return;
  input.value = ''; input.style.height = 'auto';
  add('user', text);
  busy = true; sendBtn.disabled = true;
  const bubble = add('bot pending', 'a pensar…');
  pendingBubble = bubble;
  try {
    const r = await ipc.invoke('chat-send', { text });
    bubble.classList.remove('pending');
    if (r && r.reply) bubble.textContent = r.reply;
    else if (r && r.error) bubble.textContent = '⚠️ ' + r.error;
    else if (bubble.textContent && bubble.textContent !== 'a pensar…') { /* mantém o que já apareceu */ }
    else bubble.textContent = '(sem resposta)';
  } catch (e) {
    bubble.classList.remove('pending');
    bubble.textContent = '⚠️ ' + ((e && e.message) || 'erro');
  }
  pendingBubble = null;
  log.scrollTop = log.scrollHeight;
  busy = false; sendBtn.disabled = false; input.focus();
}

form.addEventListener('submit', (e) => { e.preventDefault(); send(); });
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
document.getElementById('term').addEventListener('click', () => ipc.send('open-terminal'));
input.focus();
