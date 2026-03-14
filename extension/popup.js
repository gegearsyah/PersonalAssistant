(function () {
  const DEFAULT_BACKEND = 'http://localhost:3000';

  const authView = document.getElementById('auth-view');
  const chatView = document.getElementById('chat-view');
  const userLabel = document.getElementById('user-label');
  const connectorsBtn = document.getElementById('connectors-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const messagesEl = document.getElementById('messages');
  const inputEl = document.getElementById('input');
  const sendBtn = document.getElementById('send-btn');
  const includeContextEl = document.getElementById('include-context');
  const statusEl = document.getElementById('status');
  const settingsBtn = document.getElementById('settings-btn');
  const settingsPanel = document.getElementById('settings-panel');
  const backendUrlEl = document.getElementById('backend-url');
  const apiKeyEl = document.getElementById('api-key');
  const llmProviderEl = document.getElementById('llm-provider');
  const llmApiKeyEl = document.getElementById('llm-api-key');
  const llmModelEl = document.getElementById('llm-model');
  const saveSettingsBtn = document.getElementById('save-settings');
  const closeSettingsBtn = document.getElementById('close-settings');
  const connectorsPanel = document.getElementById('connectors-panel');
  const connectorsList = document.getElementById('connectors-list');
  const closeConnectorsBtn = document.getElementById('close-connectors');
  const authBackendUrl = document.getElementById('auth-backend-url');
  const authEmail = document.getElementById('auth-email');
  const authPassword = document.getElementById('auth-password');
  const authLoginBtn = document.getElementById('auth-login');
  const authRegisterBtn = document.getElementById('auth-register');
  const connectModal = document.getElementById('connect-modal');
  const connectModalTitle = document.getElementById('connect-modal-title');
  const connectLabelText = document.getElementById('connect-label-text');
  const connectHint = document.getElementById('connect-hint');
  const connectApiKey = document.getElementById('connect-api-key');
  const connectSubmit = document.getElementById('connect-submit');
  const connectCancel = document.getElementById('connect-cancel');

  const DEFAULT_MODELS = { claude: 'claude-sonnet-4-20250514', openai: 'gpt-4o-mini', groq: 'llama-3.3-70b-versatile' };

  function setStatus(text, isError = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle('error', isError);
  }

  function appendMessage(role, content, isStreaming = false) {
    const wrap = document.createElement('div');
    wrap.className = `message ${role}`;
    const roleLabel = document.createElement('div');
    roleLabel.className = 'role';
    roleLabel.textContent = role === 'user' ? 'You' : 'Assistant';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = content;
    if (isStreaming) wrap.dataset.streaming = '1';
    wrap.appendChild(roleLabel);
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return bubble;
  }

  function appendToolMessage(toolName, content) {
    const wrap = document.createElement('div');
    wrap.className = 'message tool';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = `Tool: ${toolName}\n${content}`;
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function getStoredSettings() {
    const out = await chrome.storage.local.get([
      'backendUrl', 'apiKey', 'jwt', 'user',
      'llmProvider', 'llmApiKey', 'llmModel'
    ]);
    const provider = out.llmProvider || 'claude';
    return {
      backendUrl: out.backendUrl || DEFAULT_BACKEND,
      apiKey: out.apiKey || '',
      jwt: out.jwt || '',
      user: out.user || null,
      llmProvider: provider,
      llmApiKey: out.llmApiKey || '',
      llmModel: out.llmModel || DEFAULT_MODELS[provider],
    };
  }

  function getAuthToken(settings) {
    return (settings && (settings.jwt || settings.apiKey)) || '';
  }

  function getWsUrl(backendUrl, token) {
    const base = backendUrl.replace(/^http/, 'ws');
    const sep = base.includes('?') ? '&' : '?';
    return token ? `${base}/ws${sep}token=${encodeURIComponent(token)}` : `${base}/ws`;
  }

  async function applyAuthState() {
    const s = await getStoredSettings();
    const hasAuth = !!(s.jwt || s.apiKey);
    if (!hasAuth) {
      authView.classList.remove('hidden');
      chatView.classList.add('hidden');
      userLabel.textContent = '';
      connectorsBtn.classList.add('hidden');
      logoutBtn.classList.add('hidden');
      authBackendUrl.value = s.backendUrl;
      return;
    }
    authView.classList.add('hidden');
    chatView.classList.remove('hidden');
    if (s.user) {
      userLabel.textContent = s.user.email;
      connectorsBtn.classList.remove('hidden');
      logoutBtn.classList.remove('hidden');
    } else {
      userLabel.textContent = 'Using API key';
      connectorsBtn.classList.add('hidden');
      logoutBtn.classList.add('hidden');
    }
  }

  authLoginBtn.addEventListener('click', async () => {
    const backendUrl = (authBackendUrl.value || DEFAULT_BACKEND).trim();
    const email = authEmail.value.trim();
    const password = authPassword.value;
    if (!email || !password) {
      setStatus('Email and password required', true);
      return;
    }
    try {
      const res = await fetch(`${backendUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Login failed');
      await chrome.storage.local.set({
        backendUrl,
        jwt: data.token,
        user: data.user,
      });
      authPassword.value = '';
      setStatus('Signed in.');
      applyAuthState();
    } catch (e) {
      setStatus(e.message || 'Login failed', true);
    }
  });

  authRegisterBtn.addEventListener('click', async () => {
    const backendUrl = (authBackendUrl.value || DEFAULT_BACKEND).trim();
    const email = authEmail.value.trim();
    const password = authPassword.value;
    if (!email || !password) {
      setStatus('Email and password required', true);
      return;
    }
    if (password.length < 6) {
      setStatus('Password must be at least 6 characters', true);
      return;
    }
    try {
      const res = await fetch(`${backendUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Registration failed');
      await chrome.storage.local.set({
        backendUrl,
        jwt: data.token,
        user: data.user,
      });
      authPassword.value = '';
      setStatus('Account created.');
      applyAuthState();
    } catch (e) {
      setStatus(e.message || 'Registration failed', true);
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove(['jwt', 'user']);
    setStatus('Signed out.');
    applyAuthState();
  });

  connectorsBtn.addEventListener('click', () => {
    connectorsPanel.classList.remove('hidden');
    loadConnectors();
  });
  closeConnectorsBtn.addEventListener('click', () => connectorsPanel.classList.add('hidden'));

  let connectService = null;
  connectSubmit.addEventListener('click', async () => {
    if (!connectService) return;
    const s = await getStoredSettings();
    if (!s.jwt) return;
    const key = connectApiKey.value.trim();
    if (!key) return;
    const body = connectService === 'google'
      ? { service: connectService, refresh_token: key }
      : { service: connectService, api_key: key };
    try {
      const res = await fetch(`${s.backendUrl}/users/me/connectors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s.jwt}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      connectModal.classList.add('hidden');
      connectApiKey.value = '';
      connectService = null;
      loadConnectors();
    } catch (e) {
      setStatus(e.message || 'Connect failed', true);
    }
  });
  connectCancel.addEventListener('click', () => {
    connectModal.classList.add('hidden');
    connectService = null;
  });

  async function loadConnectors() {
    const s = await getStoredSettings();
    if (!s.jwt) return;
    try {
      const res = await fetch(`${s.backendUrl}/users/me/connectors`, {
        headers: { Authorization: `Bearer ${s.jwt}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load');
      connectorsList.innerHTML = '';
      (data.connectors || []).forEach((c) => {
        const div = document.createElement('div');
        div.className = 'connector-item' + (c.connected ? ' connected' : '');
        div.innerHTML = `
          <div class="connector-info">
            <strong>${c.name}</strong>
            <span>${c.description || ''}</span>
          </div>
          <button type="button" data-service="${c.service}" data-connected="${c.connected}">
            ${c.connected ? 'Disconnect' : 'Connect'}
          </button>
        `;
        const btn = div.querySelector('button');
        btn.addEventListener('click', async () => {
          if (c.connected) {
            const r = await fetch(`${s.backendUrl}/users/me/connectors/${c.service}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${s.jwt}` },
            });
            if (r.ok) loadConnectors();
          } else {
            connectService = c.service;
            connectModalTitle.textContent = `Connect ${c.name}`;
            connectApiKey.value = '';
            if (c.service === 'google') {
              connectLabelText.textContent = 'Refresh token';
              connectApiKey.placeholder = 'Or use Sign in with Google below';
              connectHint.innerHTML = 'Or <a href="#" id="google-oauth-link">Sign in with Google</a> to connect (opens in new tab).';
              connectHint.classList.remove('hidden');
              const oauthLink = document.getElementById('google-oauth-link');
              if (oauthLink) {
                oauthLink.onclick = (e) => {
                  e.preventDefault();
                  chrome.tabs.create({ url: `${s.backendUrl}/auth/google?token=${encodeURIComponent(s.jwt)}` });
                };
              }
            } else {
              connectLabelText.textContent = 'API Key';
              connectApiKey.placeholder = 'Paste your API key';
              connectHint.classList.add('hidden');
            }
            connectModal.classList.remove('hidden');
          }
        });
        connectorsList.appendChild(div);
      });
    } catch (e) {
      connectorsList.innerHTML = `<p class="error">${e.message || 'Failed to load connectors'}</p>`;
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  settingsBtn.addEventListener('click', async () => {
    const s = await getStoredSettings();
    backendUrlEl.value = s.backendUrl;
    apiKeyEl.value = s.apiKey;
    llmProviderEl.value = s.llmProvider;
    llmApiKeyEl.value = s.llmApiKey;
    llmModelEl.value = s.llmModel;
    settingsPanel.classList.remove('hidden');
  });
  closeSettingsBtn.addEventListener('click', () => settingsPanel.classList.add('hidden'));
  saveSettingsBtn.addEventListener('click', async () => {
    const provider = llmProviderEl.value;
    await chrome.storage.local.set({
      backendUrl: backendUrlEl.value.trim() || DEFAULT_BACKEND,
      apiKey: apiKeyEl.value.trim(),
      llmProvider: provider,
      llmApiKey: llmApiKeyEl.value.trim(),
      llmModel: llmModelEl.value.trim() || DEFAULT_MODELS[provider],
    });
    setStatus('Settings saved.');
    settingsPanel.classList.add('hidden');
  });

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;
    const s = await getStoredSettings();
    const token = getAuthToken(s);
    if (!s.backendUrl) {
      setStatus('Set Backend URL in settings.', true);
      return;
    }
    if (!token) {
      setStatus('Sign in or set Backend API Key in settings.', true);
      return;
    }
    if (!s.llmApiKey) {
      setStatus('Set LLM API Key in settings.', true);
      return;
    }

    inputEl.value = '';
    sendBtn.disabled = true;
    appendMessage('user', text);

    let context = { tabs: [], closed_tabs: [] };
    if (includeContextEl.checked) {
      setStatus('Collecting tab context...');
      try {
        context = await chrome.runtime.sendMessage({ action: 'collectContext' });
        setStatus(`Context: ${context.tabs?.length ?? 0} tabs`);
      } catch (e) {
        setStatus('Context collection failed; sending without.', true);
      }
    } else {
      setStatus('');
    }

    const wsUrl = getWsUrl(s.backendUrl, token);
    const ws = new WebSocket(wsUrl);
    let currentBubble = null;

    ws.onopen = () => setStatus('Connected.');

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'auth_ok') {
          setStatus('Sending...');
          ws.send(JSON.stringify({
            type: 'chat',
            id: crypto.randomUUID(),
            message: text,
            context,
            allow_tools: true,
            provider: s.llmProvider,
            api_key: s.llmApiKey,
            model: s.llmModel,
          }));
          currentBubble = appendMessage('assistant', '', true);
          return;
        }
        if (msg.type === 'error') {
          setStatus(msg.message || 'Error', true);
          if (currentBubble) currentBubble.textContent += '\n[Error: ' + msg.message + ']';
          return;
        }
        if (msg.type === 'text_delta' && currentBubble) {
          currentBubble.textContent += msg.delta;
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
        if (msg.type === 'tool_use') {
          if (currentBubble) currentBubble.textContent += `\n[Tool: ${msg.name}]`;
        }
        if (msg.type === 'tool_result') {
          appendToolMessage(msg.tool_use_id, msg.content);
          if (currentBubble) currentBubble.textContent += '\n[Tool result received]';
        }
        if (msg.type === 'done') {
          if (currentBubble) currentBubble.dataset.streaming = '';
          setStatus(msg.usage ? `Done. Tokens: ${msg.usage.input_tokens + msg.usage.output_tokens}` : 'Done.');
        }
      } catch (e) {
        setStatus('Invalid message from server', true);
      }
    };

    ws.onerror = () => setStatus('WebSocket error.', true);
    ws.onclose = () => {
      sendBtn.disabled = false;
      if (statusEl.textContent === 'Sending...') setStatus('Connection closed.');
    };
  }

  getStoredSettings().then((s) => {
    applyAuthState();
    if (s.backendUrl && getAuthToken(s)) setStatus(`Backend: ${s.backendUrl} · ${s.llmProvider}`);
  });
})();
