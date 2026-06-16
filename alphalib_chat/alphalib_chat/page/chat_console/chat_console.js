frappe.pages['chat-console'].on_page_load = function(wrapper) {
  var page = frappe.ui.make_app_page({
    parent: wrapper,
    title: 'Chat Clients',
    single_column: true
  });

  page.main.html('<div id="chat-console-app"></div>');
  new ChatConsole(page);
};

class ChatConsole {
  constructor(page) {
    this.page = page;
    this.currentClient = null;
    this.clients = [];
    this.messages = [];
    this.render();
    this.loadClients();
    this.setupRealtime();
  }

  render() {
    document.getElementById('chat-console-app').innerHTML = `
      <style>
        #chat-console-app { display:flex; height:calc(100vh - 140px); border:1px solid var(--border-color); border-radius:8px; overflow:hidden; background:var(--fg-color); }
        .cc-sidebar { width:300px; border-right:1px solid var(--border-color); display:flex; flex-direction:column; background:var(--subtle-fg); }
        .cc-sidebar-header { padding:16px; border-bottom:1px solid var(--border-color); font-weight:600; font-size:14px; }
        .cc-client-list { flex:1; overflow-y:auto; }
        .cc-client-item { padding:14px 16px; border-bottom:1px solid var(--border-color); cursor:pointer; display:flex; align-items:center; gap:12px; }
        .cc-client-item:hover { background:var(--bg-color); }
        .cc-client-item.active { background:var(--bg-blue); }
        .cc-avatar { width:36px; height:36px; border-radius:50%; background:#e85a4f; color:white; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:600; flex-shrink:0; }
        .cc-client-info { flex:1; min-width:0; }
        .cc-client-name { font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .cc-client-preview { font-size:12px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px; }
        .cc-badge { background:#e85a4f; color:white; font-size:10px; font-weight:700; padding:2px 7px; border-radius:10px; }
        .cc-chat-area { flex:1; display:flex; flex-direction:column; }
        .cc-chat-header { padding:14px 20px; border-bottom:1px solid var(--border-color); display:flex; align-items:center; gap:12px; }
        .cc-chat-header-name { font-weight:600; font-size:14px; }
        .cc-chat-header-email { font-size:12px; color:var(--text-muted); }
        .cc-messages { flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:12px; background:var(--bg-color); }
        .cc-msg { max-width:70%; padding:10px 15px; border-radius:12px; font-size:13px; line-height:1.5; word-wrap:break-word; }
        .cc-msg.client { align-self:flex-start; background:var(--fg-color); border:1px solid var(--border-color); border-bottom-left-radius:4px; }
        .cc-msg.advisor { align-self:flex-end; background:#0f263e; color:white; border-bottom-right-radius:4px; }
        .cc-msg-time { font-size:10px; color:var(--text-muted); margin-top:4px; }
        .cc-msg.advisor .cc-msg-time { color:rgba(255,255,255,0.6); }
        .cc-input-area { padding:14px 20px; border-top:1px solid var(--border-color); display:flex; gap:10px; }
        .cc-input { flex:1; border:1px solid var(--border-color); border-radius:8px; padding:10px 14px; font-size:13px; outline:none; resize:none; max-height:80px; font-family:inherit; }
        .cc-input:focus { border-color:#e85a4f; }
        .cc-send-btn { background:#e85a4f; color:white; border:none; border-radius:8px; padding:10px 20px; font-size:13px; font-weight:600; cursor:pointer; }
        .cc-send-btn:hover { background:#d14a3f; }
        .cc-send-btn:disabled { opacity:0.5; }
        .cc-empty { flex:1; display:flex; align-items:center; justify-content:center; color:var(--text-muted); font-size:14px; }
        .cc-no-clients { padding:20px; text-align:center; color:var(--text-muted); font-size:13px; }
      </style>
      <div class="cc-sidebar">
        <div class="cc-sidebar-header">Conversations</div>
        <div class="cc-client-list" id="cc-client-list"><div class="cc-no-clients">Chargement...</div></div>
      </div>
      <div class="cc-chat-area" id="cc-chat-area">
        <div class="cc-empty">Sélectionnez une conversation</div>
      </div>
    `;
  }

  async loadClients() {
    try {
      var result = await frappe.call({ method: 'alphalib_chat.api.advisor_chat.get_client_list', freeze: false });
      this.clients = result.message || [];
      this.renderClientList();
    } catch (err) {
      document.getElementById('cc-client-list').innerHTML = '<div class="cc-no-clients">Erreur de chargement</div>';
    }
  }

  renderClientList() {
    var list = document.getElementById('cc-client-list');
    if (this.clients.length === 0) { list.innerHTML = '<div class="cc-no-clients">Aucune conversation</div>'; return; }
    var self = this;
    list.innerHTML = '';
    this.clients.forEach(function(client) {
      var item = document.createElement('div');
      item.className = 'cc-client-item' + (self.currentClient === client.sender ? ' active' : '');
      item.innerHTML = '<div class="cc-avatar">' + self.getInitials(client.sender_name) + '</div>' +
        '<div class="cc-client-info"><div class="cc-client-name">' + (client.sender_name || client.sender) + '</div>' +
        '<div class="cc-client-preview">' + (client.last_message || '') + '</div></div>' +
        (client.unread_count > 0 ? '<div class="cc-badge">' + client.unread_count + '</div>' : '');
      item.addEventListener('click', function() { self.selectClient(client.sender, client.sender_name); });
      list.appendChild(item);
    });
  }

  async selectClient(email, name) {
    this.currentClient = email;
    this.renderClientList();
    var chatArea = document.getElementById('cc-chat-area');
    chatArea.innerHTML = '<div class="cc-chat-header"><div class="cc-avatar">' + this.getInitials(name) + '</div>' +
      '<div><div class="cc-chat-header-name">' + (name || email) + '</div><div class="cc-chat-header-email">' + email + '</div></div></div>' +
      '<div class="cc-messages" id="cc-messages"></div>' +
      '<div class="cc-input-area"><textarea class="cc-input" id="cc-reply" rows="1" placeholder="Répondre..."></textarea>' +
      '<button class="cc-send-btn" id="cc-send">Envoyer</button></div>';
    var self = this;
    document.getElementById('cc-send').addEventListener('click', function() { self.sendReply(); });
    document.getElementById('cc-reply').addEventListener('keydown', function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); self.sendReply(); } });
    await this.loadMessages(email);
  }

  async loadMessages(email) {
    try {
      var result = await frappe.call({ method: 'alphalib_chat.api.advisor_chat.get_client_messages', args: { client: email }, freeze: false });
      this.messages = result.message || [];
      this.renderMessages();
    } catch (err) { console.error(err); }
  }

  renderMessages() {
    var container = document.getElementById('cc-messages');
    if (!container) return;
    container.innerHTML = '';
    var self = this;
    this.messages.forEach(function(msg) {
      var div = document.createElement('div');
      div.className = 'cc-msg ' + (msg.sender_type === 'Client' ? 'client' : 'advisor');
      div.innerHTML = self.escapeHtml(msg.content) + '<div class="cc-msg-time">' + frappe.datetime.prettyDate(msg.creation) + '</div>';
      container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
  }

  async sendReply() {
    var input = document.getElementById('cc-reply');
    var btn = document.getElementById('cc-send');
    var text = input.value.trim();
    if (!text || !this.currentClient) return;
    input.value = '';
    btn.disabled = true;
    var container = document.getElementById('cc-messages');
    var div = document.createElement('div');
    div.className = 'cc-msg advisor';
    div.innerHTML = this.escapeHtml(text) + '<div class="cc-msg-time">à l\'instant</div>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    try {
      await frappe.call({ method: 'alphalib_chat.api.advisor_chat.reply_message', args: { content: text, recipient: this.currentClient }, freeze: false });
      this.loadClients();
    } catch (err) { frappe.msgprint('Erreur lors de l\'envoi'); }
    finally { btn.disabled = false; input.focus(); }
  }

  setupRealtime() {
    var self = this;
    frappe.realtime.on('alphalib_new_message', function(data) {
      if (data.sender_type === 'Client') {
        self.loadClients();
        if (self.currentClient === data.sender) {
          var container = document.getElementById('cc-messages');
          if (container) {
            var div = document.createElement('div');
            div.className = 'cc-msg client';
            div.innerHTML = self.escapeHtml(data.content) + '<div class="cc-msg-time">à l\'instant</div>';
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;
          }
        }
      }
    });
  }

  getInitials(name) { return name ? name.split(' ').map(function(w){return w[0];}).join('').substring(0,2).toUpperCase() : '??'; }
  escapeHtml(t) { var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
}