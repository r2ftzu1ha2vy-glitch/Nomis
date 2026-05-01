/* ============================================================
   Nomis AI — app.js
   Uses OpenRouter API (model: anthropic/claude-3-haiku)
   Firebase Auth + Firestore for accounts
   ============================================================ */

const OPENROUTER_API_KEY = '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';
const MODEL = 'anthropic/claude-3-haiku';
const APP_URL = window.location.href;

/* ── Firebase Config ── */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  get,
  update
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBDCr4lwOF-nByznKkrN9XYmnTmJQpeo88",
  authDomain: "nomis-b5dd7.firebaseapp.com",
  projectId: "nomis-b5dd7",
  storageBucket: "nomis-b5dd7.firebasestorage.app",
  messagingSenderId: "840145807175",
  appId: "1:840145807175:web:a46982ba6789d53dc54e62",
  measurementId: "G-JN9F4RBC3D",
  databaseURL: "https://nomis-b5dd7-default-rtdb.firebaseio.com"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);

/* ── System prompts ── */
const SYSTEM_NOMIS = `You are Nomis — an intelligent, eloquent AI assistant created by NoteShelf. You have a refined, sophisticated personality. You are thoughtful, articulate, and helpful. You speak with clarity and elegance, never verbose for the sake of it. You can assist with any topic: writing, analysis, research, creative work, planning, and more. Format your responses with markdown when it aids readability.`;

const SYSTEM_NODEX = `You are Nodex — a powerful code-focused AI built by NoteShelf. You specialize in programming, software architecture, debugging, and technical problem-solving. You provide clean, well-commented code. You prefer precision over verbosity. When writing code, always use proper code blocks with language identifiers. You support all major languages and frameworks. You think like a senior engineer.`;

/* ══════════════════════════════════
   FIREBASE AUTH HELPERS
══════════════════════════════════ */
const Auth = {
  async signup(name, email, password) {
    if (!name || !email || !password) return { ok: false, msg: 'All fields are required.' };
    if (password.length < 6) return { ok: false, msg: 'Password must be at least 6 characters.' };
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const user = { name, email, bio: '', avatar: '', uid: cred.user.uid };
      await set(ref(db, 'users/' + cred.user.uid), user);
      return { ok: true, user };
    } catch (e) {
      return { ok: false, msg: friendlyError(e.code) };
    }
  },

  async login(email, password) {
    if (!email || !password) return { ok: false, msg: 'Please fill in all fields.' };
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const snap = await get(ref(db, 'users/' + cred.user.uid));
const data = snap.exists() ? snap.val() : { name: email.split('@')[0], email, bio: '', avatar: '' };
      return { ok: true, user: { ...data, uid: cred.user.uid } };
    } catch (e) {
      return { ok: false, msg: friendlyError(e.code) };
    }
  },

  async updateProfile(uid, updates) {
    try {
      const snap = await get(ref(db, 'users/' + uid));
if (!snap.exists()) return { ok: false, msg: 'User not found.' };
const current = snap.val();
      const merged = { ...current };
      if (updates.name !== undefined) merged.name = updates.name;
      if (updates.bio !== undefined) merged.bio = updates.bio;
      if (updates.avatar !== undefined) merged.avatar = updates.avatar;

      if (updates.password) {
        if (updates.password.length < 6) return { ok: false, msg: 'Password must be at least 6 characters.' };
        try {
          await updatePassword(auth.currentUser, updates.password);
        } catch (e) {
          if (e.code === 'auth/requires-recent-login') {
            return { ok: false, msg: 'Please sign out and sign back in before changing your password.' };
          }
          return { ok: false, msg: friendlyError(e.code) };
        }
      }

      await update(ref(db, 'users/' + uid), merged);
      return { ok: true, user: { ...merged, uid } };
    } catch (e) {
      return { ok: false, msg: friendlyError(e.code) };
    }
  },

  async logout() {
    await signOut(auth);
  }
};

function friendlyError(code) {
  const map = {
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

/* ══════════════════════════════════
   CHAT STORE
══════════════════════════════════ */
const Store = {
  KEY: 'nomis_chats',
  get() { try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch { return []; } },
  save(chats) { localStorage.setItem(this.KEY, JSON.stringify(chats)); },
  addChat(chat) {
    const chats = this.get();
    chats.unshift(chat);
    this.save(chats);
  },
  updateChat(id, updates) {
    const chats = this.get();
    const idx = chats.findIndex(c => c.id === id);
    if (idx !== -1) { Object.assign(chats[idx], updates); this.save(chats); }
  },
  deleteChat(id) {
    const chats = this.get().filter(c => c.id !== id);
    this.save(chats);
  }
};

/* ══════════════════════════════════
   APP STATE
══════════════════════════════════ */
let state = {
  user: null,
  mode: 'nomis',
  activeChatId: null,
  messages: [],
  isStreaming: false,
  sidebarOpen: true,
};

/* ══════════════════════════════════
   ELEMENT REFS
══════════════════════════════════ */
const $ = id => document.getElementById(id);

/* ══════════════════════════════════
   STREAM BAR
══════════════════════════════════ */
function startStreamBar() {
  const bar = $('stream-bar');
  const fill = $('stream-bar-fill');
  bar.classList.remove('complete');
  bar.classList.add('active');
  fill.style.width = '0%';
  let w = 0;
  return setInterval(() => {
    w = Math.min(w + (Math.random() * 3 + 1), 88);
    fill.style.width = w + '%';
  }, 120);
}

function finishStreamBar(rampInterval) {
  clearInterval(rampInterval);
  const bar = $('stream-bar');
  const fill = $('stream-bar-fill');
  bar.classList.remove('active');
  bar.classList.add('complete');
  fill.style.width = '100%';
  setTimeout(() => { bar.classList.remove('complete'); fill.style.width = '0%'; }, 900);
}

const authScreen   = $('auth-screen');
const appEl        = $('app');
const sidebar      = $('sidebar');
const sidebarOvl   = document.createElement('div');
sidebarOvl.id = 'sidebar-overlay';
document.body.appendChild(sidebarOvl);

const loginEmail     = $('login-email');
const loginPassword  = $('login-password');
const loginError     = $('login-error');
const loginBtn       = $('login-btn');
const signupName     = $('signup-name');
const signupEmail    = $('signup-email');
const signupPassword = $('signup-password');
const signupError    = $('signup-error');
const signupBtn      = $('signup-btn');

const newChatBtn        = $('new-chat-btn');
const chatHistoryEl     = $('chat-history');
const modeBtns          = document.querySelectorAll('.mode-btn');
const messagesContainer = $('messages-container');
const messagesList      = $('messages-list');
const welcomeScreen     = $('welcome-screen');
const chatInput         = $('chat-input');
const sendBtn           = $('send-btn');
const sidebarToggle     = $('sidebar-toggle');
const topbarLabel       = $('topbar-mode-label');
const topbarIcon        = $('topbar-mode-icon');
const inputModeHint     = $('input-mode-hint');
const userDisplayName   = $('user-display-name');
const userDisplayEmail  = $('user-display-email');
const logoutBtn         = $('logout-btn');
const toast             = $('toast');
const thinkingTpl       = $('thinking-tpl');
const charCount         = $('char-count');

/* ══════════════════════════════════
   AUTH SCREEN LOGIC
══════════════════════════════════ */
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    $('tab-' + tab.dataset.tab).classList.add('active');
  });
});

document.querySelectorAll('.auth-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const target = link.dataset.switch;
    document.querySelectorAll('.auth-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === target);
    });
    document.querySelectorAll('.auth-form').forEach(f => {
      f.classList.toggle('active', f.id === 'tab-' + target);
    });
  });
});

function setAuthLoading(btn, loading) {
  btn.disabled = loading;
  btn.style.opacity = loading ? '0.6' : '';
  const span = btn.querySelector('span');
  if (span) span.textContent = loading ? 'Please wait…' : (btn === loginBtn ? 'Enter the Vault' : 'Begin Journey');
}

loginBtn.addEventListener('click', async () => {
  setAuthLoading(loginBtn, true);
  const res = await Auth.login(loginEmail.value.trim(), loginPassword.value);
  setAuthLoading(loginBtn, false);
  if (!res.ok) { loginError.textContent = res.msg; return; }
  loginError.textContent = '';
  startApp(res.user);
});
[loginEmail, loginPassword].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') loginBtn.click(); }));

signupBtn.addEventListener('click', async () => {
  setAuthLoading(signupBtn, true);
  const res = await Auth.signup(signupName.value.trim(), signupEmail.value.trim(), signupPassword.value);
  setAuthLoading(signupBtn, false);
  if (!res.ok) { signupError.textContent = res.msg; return; }
  signupError.textContent = '';
  startApp(res.user);
});
[signupName, signupEmail, signupPassword].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') signupBtn.click(); }));

/* ══════════════════════════════════
   START APP
══════════════════════════════════ */
function startApp(user) {
  state.user = user;
  authScreen.style.display = 'none';
  appEl.style.display = 'flex';
  refreshUserUI();
  renderHistory();
  newChat();
  updateTimeGreeting();
}

function refreshUserUI() {
  const user = state.user;
  userDisplayName.textContent = user.name;
  userDisplayEmail.textContent = user.email;
  const avEl = $('user-avatar-sidebar');
  avEl.innerHTML = '';
  if (user.avatar) {
    const img = document.createElement('img');
    img.src = user.avatar;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
    avEl.appendChild(img);
    avEl.style.padding = '0';
    avEl.style.background = 'none';
  } else {
    avEl.textContent = user.name.charAt(0).toUpperCase();
    avEl.style.fontFamily = "'Cinzel', serif";
    avEl.style.fontSize = '14px';
    avEl.style.fontWeight = '700';
    avEl.style.color = 'var(--gold)';
    avEl.style.background = '';
    avEl.style.padding = '';
  }
}

function updateTimeGreeting() {
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const fullGreeting = `${greet}, ${state.user?.name?.split(' ')[0] || 'there'}.`;

  const titleEl = $('welcome-title');
  titleEl.textContent = '';

  const cursor = document.createElement('span');
  cursor.style.cssText = 'display:inline-block;width:2px;height:0.9em;background:var(--gold);margin-left:2px;vertical-align:middle;animation:blink 0.9s step-end infinite;';
  titleEl.appendChild(cursor);

  let i = 0;
  const interval = setInterval(() => {
    if (i >= fullGreeting.length) { clearInterval(interval); cursor.remove(); return; }
    cursor.insertAdjacentText('beforebegin', fullGreeting[i++]);
  }, 45);
}

/* ══════════════════════════════════
   LOGOUT
══════════════════════════════════ */
logoutBtn.addEventListener('click', async () => {
  await Auth.logout();
  state.user = null;
  state.messages = [];
  state.activeChatId = null;
  messagesList.innerHTML = '';
  appEl.style.display = 'none';
  authScreen.style.display = 'flex';
  loginEmail.value = '';
  loginPassword.value = '';
  loginError.textContent = '';
});

/* ══════════════════════════════════
   FIREBASE AUTH STATE OBSERVER
══════════════════════════════════ */
onAuthStateChanged(auth, async (firebaseUser) => {
  if (firebaseUser && !state.user) {
    // Restore session on page reload
    try {
      const snap = await get(ref(db, 'users/' + firebaseUser.uid));
if (snap.exists()) {
  const userData = { ...snap.val(), uid: firebaseUser.uid };
        startApp(userData);
      }
    } catch (e) {
      console.warn('Could not restore session:', e);
    }
  }
});

/* ══════════════════════════════════
   MODE SWITCHING
══════════════════════════════════ */
modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    state.mode = btn.dataset.mode;
    modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === state.mode));
    document.body.classList.toggle('nodex-mode', state.mode === 'nodex');
    const isNodex = state.mode === 'nodex';
    topbarLabel.textContent = isNodex ? 'Nodex Mode' : 'Nomis Mode';
    topbarIcon.innerHTML = isNodex
      ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`
      : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>`;
    inputModeHint.innerHTML = isNodex
      ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> Nodex — Code Intelligence`
      : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg> Nomis — General Intelligence`;
    chatInput.placeholder = isNodex ? 'Ask Nodex about code…' : 'Message Nomis…';
    if (state.activeChatId) {
      Store.updateChat(state.activeChatId, { mode: state.mode });
    }
  });
});

/* ══════════════════════════════════
   CHAT MANAGEMENT
══════════════════════════════════ */
function newChat() {
  const id = 'chat_' + Date.now();
  state.activeChatId = id;
  state.messages = [];
  messagesList.innerHTML = '';
  welcomeScreen.classList.remove('hidden');
  chatInput.value = '';
  chatInput.style.height = 'auto';
  sendBtn.disabled = true;
}

function loadChat(id) {
  const chats = Store.get();
  const chat = chats.find(c => c.id === id);
  if (!chat) return;
  state.activeChatId = id;
  state.messages = chat.messages || [];
  state.mode = chat.mode || 'nomis';
  modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === state.mode));
  document.body.classList.toggle('nodex-mode', state.mode === 'nodex');
  const isNodex = state.mode === 'nodex';
  topbarLabel.textContent = isNodex ? 'Nodex Mode' : 'Nomis Mode';
  inputModeHint.innerHTML = isNodex
    ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> Nodex — Code Intelligence`
    : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg> Nomis — General Intelligence`;
  chatInput.placeholder = isNodex ? 'Ask Nodex about code…' : 'Message Nomis…';
  messagesList.innerHTML = '';
  welcomeScreen.classList.add('hidden');
  state.messages.forEach(m => {
    if (m.role !== 'system') appendMessage(m.role, m.content, false);
  });
  renderHistory();
  scrollToBottom();
}

newChatBtn.addEventListener('click', () => {
  newChat();
  renderHistory();
  if (window.innerWidth < 769) closeMobileSidebar();
});

function renderHistory() {
  const chats = Store.get();
  chatHistoryEl.innerHTML = '';
  if (!chats.length) {
    chatHistoryEl.innerHTML = '<div style="font-family:EB Garamond,serif;font-size:13px;color:var(--gold-dim);opacity:0.45;padding:12px 8px;font-style:italic;">No conversations yet</div>';
    return;
  }
  chats.forEach(chat => {
    const div = document.createElement('div');
    div.className = 'history-item' + (chat.id === state.activeChatId ? ' active' : '');
    div.innerHTML = `
      <span class="history-item-text">${escHtml(chat.title || 'Conversation')}</span>
      <span class="history-item-mode ${chat.mode === 'nodex' ? 'nodex' : ''}">${chat.mode === 'nodex' ? 'NDX' : 'NMS'}</span>
      <button class="history-del-btn" data-id="${chat.id}" title="Delete">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    `;
    div.addEventListener('click', e => {
      if (e.target.closest('.history-del-btn')) {
        e.stopPropagation();
        Store.deleteChat(chat.id);
        if (state.activeChatId === chat.id) newChat();
        renderHistory();
        return;
      }
      loadChat(chat.id);
      if (window.innerWidth < 769) closeMobileSidebar();
    });
    chatHistoryEl.appendChild(div);
  });
}

/* ══════════════════════════════════
   SIDEBAR TOGGLE
══════════════════════════════════ */
sidebarToggle.addEventListener('click', () => {
  if (window.innerWidth < 769) {
    sidebar.classList.toggle('mobile-open');
    sidebarOvl.classList.toggle('show', sidebar.classList.contains('mobile-open'));
  } else {
    sidebar.classList.toggle('collapsed');
  }
});
sidebarOvl.addEventListener('click', closeMobileSidebar);

function closeMobileSidebar() {
  sidebar.classList.remove('mobile-open');
  sidebarOvl.classList.remove('show');
}

/* ══════════════════════════════════
   INPUT
══════════════════════════════════ */
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 180) + 'px';
  sendBtn.disabled = chatInput.value.trim() === '' || state.isStreaming;
  const len = chatInput.value.length;
  charCount.textContent = len > 100 ? len : '';
});

chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) sendMessage();
  }
});
sendBtn.addEventListener('click', sendMessage);

/* Chip prompts */
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    chatInput.value = chip.dataset.prompt;
    chatInput.dispatchEvent(new Event('input'));
    sendMessage();
  });
});

/* ══════════════════════════════════
   AI CHAT TITLE GENERATOR
══════════════════════════════════ */
async function generateChatTitle(chatId, firstMessage) {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': APP_URL,
        'X-Title': 'Nomis AI',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16,
        temperature: 0.4,
        messages: [
          {
            role: 'user',
            content: `Generate a short, punchy title (3–5 words max, no quotes, no punctuation at the end) that captures the topic of this message:\n\n"${firstMessage}"`
          }
        ]
      })
    });
    if (!response.ok) return;
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '';
    const title = raw.trim().replace(/^["']|["']$/g, '').trim();
    if (title) {
      Store.updateChat(chatId, { title });
      renderHistory();
    }
  } catch { /* silently fail — title stays as … */ }
}

/* ══════════════════════════════════
   SEND MESSAGE
══════════════════════════════════ */
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || state.isStreaming) return;

  const barRamp = startStreamBar();
  state.isStreaming = true;
  sendBtn.disabled = true;
  chatInput.value = '';
  chatInput.style.height = 'auto';
  charCount.textContent = '';

  welcomeScreen.classList.add('hidden');

  state.messages.push({ role: 'user', content: text });
  appendMessage('user', text);
  scrollToBottom();

  const isFirstMessage = Store.get().find(c => c.id === state.activeChatId) == null;
  if (isFirstMessage) {
    Store.addChat({
      id: state.activeChatId,
      title: '…',
      mode: state.mode,
      messages: state.messages,
      createdAt: Date.now()
    });
    renderHistory();
    // Fire-and-forget: generate a smart title after the first message
    generateChatTitle(state.activeChatId, text);
  }

  const thinkingRow = thinkingTpl.content.cloneNode(true).querySelector('.thinking-row');
  messagesList.appendChild(thinkingRow);
  scrollToBottom();

  try {
    const systemPrompt = state.mode === 'nodex' ? SYSTEM_NODEX : SYSTEM_NOMIS;
    const messages = [
      { role: 'user', content: systemPrompt + '\n\n[Begin conversation]' },
      { role: 'assistant', content: state.mode === 'nodex'
          ? 'Understood. I am Nodex — your code intelligence engine. Ready to assist.'
          : 'Understood. I am Nomis — at your service. How may I assist you today?' },
      ...state.messages
    ];

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': APP_URL,
        'X-Title': 'Nomis AI',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        stream: true,
        max_tokens: 2048,
        temperature: state.mode === 'nodex' ? 0.2 : 0.8
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${response.status}`);
    }

    thinkingRow.remove();

    const assistantRow = createMessageRow('assistant', '');
    const bubbleEl = assistantRow.querySelector('.msg-bubble');
    messagesList.appendChild(assistantRow);
    scrollToBottom();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
      for (const line of lines) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullContent += delta;
            bubbleEl.innerHTML = renderMarkdown(fullContent);
            addCopyButtons(bubbleEl);
            scrollToBottom();
          }
        } catch { /* skip malformed chunks */ }
      }
    }

    state.messages.push({ role: 'assistant', content: fullContent });
    Store.updateChat(state.activeChatId, { messages: state.messages });

  } catch (err) {
    thinkingRow.remove();
    appendMessage('assistant', `⚠️ ${err.message || 'Something went wrong. Please try again.'}`);
    showToast('Error: ' + (err.message || 'Request failed'));
  }

  finishStreamBar(barRamp);
  state.isStreaming = false;
  sendBtn.disabled = chatInput.value.trim() === '';
  scrollToBottom();
}

/* ══════════════════════════════════
   MESSAGE RENDERING
══════════════════════════════════ */
function appendMessage(role, content, animate = true) {
  const row = createMessageRow(role, content);
  if (!animate) row.style.animation = 'none';
  messagesList.appendChild(row);
}

function createMessageRow(role, content) {
  const row = document.createElement('div');
  row.className = `msg-row ${role}`;

  const avatarDiv = document.createElement('div');
  avatarDiv.className = 'msg-avatar' + (role === 'user' ? ' user-av' : '');

  if (role === 'assistant') {
    const img = document.createElement('img');
    img.src = 'https://iili.io/qIqJ2F2.png';
    img.alt = 'Nomis';
    avatarDiv.appendChild(img);
  } else {
    if (state.user?.avatar) {
      const img = document.createElement('img');
      img.src = state.user.avatar;
      img.alt = state.user.name;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
      avatarDiv.appendChild(img);
      avatarDiv.style.padding = '0';
      avatarDiv.style.background = 'none';
    } else {
      avatarDiv.textContent = state.user?.name?.charAt(0)?.toUpperCase() || 'U';
    }
  }

  const contentDiv = document.createElement('div');
  contentDiv.className = 'msg-content';

  const senderDiv = document.createElement('div');
  senderDiv.className = 'msg-sender';
  senderDiv.textContent = role === 'assistant'
    ? (state.mode === 'nodex' ? 'Nodex' : 'Nomis')
    : (state.user?.name || 'You');

  const bubble = document.createElement('div');
  bubble.className = `msg-bubble ${role}`;
  bubble.innerHTML = role === 'assistant'
    ? renderMarkdown(content)
    : escHtml(content).replace(/\n/g, '<br>');

  const timeDiv = document.createElement('div');
  timeDiv.className = 'msg-time';
  timeDiv.textContent = formatTime(new Date());

  contentDiv.appendChild(senderDiv);
  contentDiv.appendChild(bubble);

  if (role === 'assistant') {
    addCopyButtons(bubble);

    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    actions.innerHTML = `
      <button class="action-btn retry-btn" title="Retry">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
        Retry
      </button>
      <button class="action-btn copy-msg-btn" title="Copy message">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 0-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Copy
      </button>`;

    actions.querySelector('.retry-btn').addEventListener('click', () => retryLastMessage(row, bubble));
    actions.querySelector('.copy-msg-btn').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      navigator.clipboard.writeText(bubble.innerText).then(() => {
        btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
        setTimeout(() => {
          btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 0-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`;
        }, 2000);
      });
    });

    contentDiv.appendChild(actions);
  }

  contentDiv.appendChild(timeDiv);

  row.appendChild(avatarDiv);
  row.appendChild(contentDiv);
  return row;
}

/* ══════════════════════════════════
   RETRY
══════════════════════════════════ */
async function retryLastMessage(row, bubble) {
  if (state.isStreaming) return;

  const lastAiIdx = state.messages.map(m => m.role).lastIndexOf('assistant');
  if (lastAiIdx === -1) return;
  state.messages = state.messages.slice(0, lastAiIdx);

  bubble.innerHTML = '';
  state.isStreaming = true;
  sendBtn.disabled = true;

  const barRamp = startStreamBar();
  const streamStatus = $('stream-status');
  if (streamStatus) streamStatus.classList.add('visible');

  try {
    const systemPrompt = state.mode === 'nodex' ? SYSTEM_NODEX : SYSTEM_NOMIS;
    const messages = [
      { role: 'user', content: systemPrompt + '\n\n[Begin conversation. Please provide a DIFFERENT response than any previous ones — vary your phrasing, structure, and approach.]' },
      { role: 'assistant', content: state.mode === 'nodex'
          ? 'Understood. I am Nodex — ready to assist with a fresh perspective.'
          : 'Understood. I am Nomis — I will approach this differently.' },
      ...state.messages
    ];

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': APP_URL,
        'X-Title': 'Nomis AI',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        stream: true,
        max_tokens: 2048,
        temperature: state.mode === 'nodex' ? 0.5 : 1.0
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value, { stream: true }).split('\n').filter(l => l.startsWith('data: '));
      for (const line of lines) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta?.content || '';
          if (delta) {
            fullContent += delta;
            bubble.innerHTML = renderMarkdown(fullContent);
            addCopyButtons(bubble);
            scrollToBottom();
          }
        } catch { /* skip */ }
      }
    }

    state.messages.push({ role: 'assistant', content: fullContent });
    Store.updateChat(state.activeChatId, { messages: state.messages });

  } catch (err) {
    showToast('Retry failed: ' + (err.message || 'Request failed'));
  }

  finishStreamBar(barRamp);
  if (streamStatus) streamStatus.classList.remove('visible');
  state.isStreaming = false;
  sendBtn.disabled = chatInput.value.trim() === '';
}

/* ══════════════════════════════════
   MARKDOWN RENDERER
══════════════════════════════════ */
function renderMarkdown(text) {
  let html = escHtml(text);

  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><button class="copy-code-btn" onclick="copyCode(this)">Copy</button><code class="lang-${lang}">${code.trim()}</code></pre>`;
  });

  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_\n]+)_/g, '<em>$1</em>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^[\*\-] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/\n{2,}/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  if (!html.startsWith('<')) html = '<p>' + html + '</p>';

  return html;
}

function addCopyButtons(container) {
  container.querySelectorAll('pre').forEach(pre => {
    if (!pre.querySelector('.copy-code-btn')) {
      const btn = document.createElement('button');
      btn.className = 'copy-code-btn';
      btn.textContent = 'Copy';
      btn.onclick = () => copyCode(btn);
      pre.insertBefore(btn, pre.firstChild);
    }
  });
}

window.copyCode = function(btn) {
  const pre = btn.parentElement;
  const code = pre.querySelector('code');
  if (!code) return;
  navigator.clipboard.writeText(code.textContent).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 2000);
  });
};

/* ══════════════════════════════════
   UTILS
══════════════════════════════════ */
function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}

let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

/* ══════════════════════════════════
   PROFILE MODAL
══════════════════════════════════ */
const profileOverlay   = $('profile-overlay');
const profileModal     = $('profile-modal');
const profileClose     = $('profile-modal-close');
const profileNameInput = $('profile-name-input');
const profileEmailDisp = $('profile-email-display');
const profileBioInput  = $('profile-bio-input');
const profileBioCount  = $('profile-bio-count');
const profilePassInput = $('profile-password-input');
const profileError     = $('profile-error');
const profileSaveBtn   = $('profile-save-btn');
const profileAvatarDisp = $('profile-avatar-display');
const profileAvatarInp  = $('profile-avatar-input');
const profileAvatarRem  = $('profile-avatar-remove');

let pendingAvatar = null;

function openProfileModal() {
  const u = state.user;
  profileNameInput.value = u.name || '';
  profileEmailDisp.textContent = u.email || '';
  profileBioInput.value = u.bio || '';
  profilePassInput.value = '';
  profileError.textContent = '';
  pendingAvatar = null;
  profileBioCount.textContent = `${(u.bio || '').length} / 160`;
  renderProfileAvatar(u.avatar || null);
  profileOverlay.classList.add('open');
}

function closeProfileModal() {
  profileOverlay.classList.remove('open');
}

function renderProfileAvatar(src) {
  profileAvatarDisp.innerHTML = '';
  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = 'avatar';
    profileAvatarDisp.appendChild(img);
  } else {
    profileAvatarDisp.textContent = (state.user?.name || 'U').charAt(0).toUpperCase();
  }
}

$('edit-profile-icon').addEventListener('click', e => { e.stopPropagation(); openProfileModal(); });
$('user-info').addEventListener('click', openProfileModal);

profileClose.addEventListener('click', closeProfileModal);
profileOverlay.addEventListener('click', e => { if (e.target === profileOverlay) closeProfileModal(); });

profileAvatarInp.addEventListener('change', () => {
  const file = profileAvatarInp.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    profileError.textContent = 'Image must be under 2 MB.';
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    pendingAvatar = e.target.result;
    renderProfileAvatar(pendingAvatar);
    profileError.textContent = '';
  };
  reader.readAsDataURL(file);
  profileAvatarInp.value = '';
});

profileAvatarRem.addEventListener('click', () => {
  pendingAvatar = '';
  renderProfileAvatar(null);
});

profileBioInput.addEventListener('input', () => {
  profileBioCount.textContent = `${profileBioInput.value.length} / 160`;
});

profileSaveBtn.addEventListener('click', async () => {
  const name = profileNameInput.value.trim();
  const bio  = profileBioInput.value.trim();
  const pass = profilePassInput.value;

  if (!name) { profileError.textContent = 'Display name cannot be empty.'; return; }
  profileError.textContent = '';

  profileSaveBtn.disabled = true;
  profileSaveBtn.style.opacity = '0.6';
  const origText = profileSaveBtn.querySelector('span') || profileSaveBtn;

  const updates = { name, bio };
  if (pendingAvatar !== null) updates.avatar = pendingAvatar;
  if (pass) updates.password = pass;

  const res = await Auth.updateProfile(state.user.uid, updates);

  profileSaveBtn.disabled = false;
  profileSaveBtn.style.opacity = '';

  if (!res.ok) { profileError.textContent = res.msg; return; }

  state.user = res.user;
  refreshUserUI();
  closeProfileModal();
  showToast('Profile updated successfully.');
});

/* ══════════════════════════════════
   DOWNLOAD MODAL
══════════════════════════════════ */
const downloadOverlay = $('download-overlay');
const downloadClose   = $('download-modal-close');
const downloadBtn     = $('download-nomis-btn');

downloadBtn.addEventListener('click', () => downloadOverlay.classList.add('open'));
downloadClose.addEventListener('click', () => downloadOverlay.classList.remove('open'));
downloadOverlay.addEventListener('click', e => { if (e.target === downloadOverlay) downloadOverlay.classList.remove('open'); });

// PWA install
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  $('pwa-install-btn').style.display = 'flex';
});

$('pwa-install-btn').addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') {
    showToast('Nomis installed successfully!');
    downloadOverlay.classList.remove('open');
  }
  deferredInstallPrompt = null;
  $('pwa-install-btn').style.display = 'none';
});
