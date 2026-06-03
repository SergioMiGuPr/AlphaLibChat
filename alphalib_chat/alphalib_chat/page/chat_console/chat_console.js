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
		this.pollTimer = null;

		this.render();
		this.loadClients();
		this.setupRealtime();
	}

	render() {
		var container = document.getElementById('chat-console-app');
		container.innerHTML = `
			<style>
				#chat-console-app {
					display: flex;
					height: calc(100vh - 140px);
					border: 1px solid var(--border-color);
					border-radius: 8px;
					overflow: hidden;
					background: var(--fg-color);
				}
				.cc-sidebar {
					width: 300px;
					border-right: 1px solid var(--border-color);
					display: flex;
					flex-direction: column;
					background: var(--subtle-fg);
				}
				.cc-sidebar-header {
					padding: 16px;
					border-bottom: 1px solid var(--border-color);
					font-weight: 600;
					font-size: 14px;
					color: var(--heading-color);
				}
				.cc-client-list {
					flex: 1;
					overflow-y: auto;
				}
				.cc-client-item {
					padding: 14px 16px;
					border-bottom: 1px solid var(--border-color);
					cursor: pointer;
					transition: background 0.15s;
					display: flex;
					align-items: center;
					gap: 12px;
				}
				.cc-client-item:hover { background: var(--bg-color); }
				.cc-client-item.active { background: var(--bg-blue); }
				.cc-client-avatar {
					width: 36px; height: 36px;
					border-radius: 50%;
					background: #e85a4f;
					color: white;
					display: flex;
					align-items: center;
					justify-content: center;
					font-size: 13px;
					font-weight: 600;
					flex-shrink: 0;
				}
				.cc-client-info { flex: 1; min-width: 0; }
				.cc-client-name {
					font-size: 13px;
					font-weight: 600;
					color: var(--heading-color);
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
				}
				.cc-client-preview {
					font-size: 12px;
					color: var(--text-muted);
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
					margin-top: 2px;
				}
				.cc-client-badge {
					background: #e85a4f;
					color: white;
					font-size: 10px;
					font-weight: 700;
					padding: 2px 7px;
					border-radius: 10px;
					min-width: 18px;
					text-align: center;
				}
				.cc-chat-area {
					flex: 1;
					display: flex;
					flex-direction: column;
				}
				.cc-chat-header {
					padding: 14px 20px;
					border-bottom: 1px solid var(--border-color);
					display: flex;
					align-items: center;
					gap: 12px;
					background: var(--fg-color);
				}
				.cc-chat-header-name {
					font-weight: 600;
					font-size: 14px;
					color: var(--heading-color);
				}
				.cc-chat-header-email {
					font-size: 12px;
					color: var(--text-muted);
				}
				.cc-messages {
					flex: 1;
					overflow-y: auto;
					padding: 20px;
					display: flex;
					flex-direction: column;
					gap: 12px;
					background: var(--bg-color);
				}
				.cc-msg {
					max-width: 70%;
					padding: 10px 15px;
					border-radius: 12px;
					font-size: 13px;
					line-height: 1.5;
					word-wrap: break-word;
				}
				.cc-msg.client {
					align-self: flex-start;
					background: var(--fg-color);
					border: 1px solid var(--border-color);
					color: var(--text-color);
					border-bottom-left-radius: 4px;
				}
				.cc-msg.advisor {
					align-self: flex-end;
					background: #0f263e;
					color: white;
					border-bottom-right-radius: 4px;
				}
				.cc-msg-time {
					font-size: 10px;
					color: var(--text-muted);
					margin-top: 4px;
				}
				.cc-msg.advisor .cc-msg-time { color: rgba(255,255,255,0.6); }
				.cc-input-area {
					padding: 14px 20px;
					border-top: 1px solid var(--border-color);
					display: flex;
					gap: 10px;
					background: var(--fg-color);
				}
				.cc-input {
					flex: 1;
					border: 1px solid var(--border-color);
					border-radius: 8px;
					padding: 10px 14px;
					font-size: 13px;
					outline: none;
					resize: none;
					max-height: 80px;
					font-family: inherit;
					background: var(--control-bg);
					color: var(--text-color);
				}
				.cc-input:focus { border-color: #e85a4f; }
				.cc-send-btn {
					background: #e85a4f;
					color: white;
					border: none;
					border-radius: 8px;
					padding: 10px 20px;
					font-size: 13px;
					font-weight: 600;
					cursor: pointer;
					transition: background 0.2s;
					white-space: nowrap;
				}
				.cc-send-btn:hover { background: #d14a3f; }
				.cc-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
				.cc-empty {
					flex: 1;
					display: flex;
					align-items: center;
					justify-content: center;
					color: var(--text-muted);
					font-size: 14px;
				}
				.cc-no-clients {
					padding: 20px;
					text-align: center;
					color: var(--text-muted);
					font-size: 13px;
				}
				@media (max-width: 768px) {
					.cc-sidebar { width: 100%; }
					.cc-chat-area { display: none; }
				}
			</style>

			<div class="cc-sidebar">
				<div class="cc-sidebar-header">
					Conversations
				</div>
				<div class="cc-client-list" id="cc-client-list">
					<div class="cc-no-clients">Chargement...</div>
				</div>
			</div>
			<div class="cc-chat-area" id="cc-chat-area">
				<div class="cc-empty">Sélectionnez une conversation</div>
			</div>
		`;
	}

	async loadClients() {
		try {
			var result = await frappe.call({
				method: 'alphalib_chat.api.advisor_chat.get_client_list',
				freeze: false
			});

			this.clients = result.message || [];
			this.renderClientList();
		} catch (err) {
			console.error('Load clients error:', err);
			document.getElementById('cc-client-list').innerHTML =
				'<div class="cc-no-clients">Erreur de chargement</div>';
		}
	}

	renderClientList() {
		var list = document.getElementById('cc-client-list');

		if (this.clients.length === 0) {
			list.innerHTML = '<div class="cc-no-clients">Aucune conversation pour le moment</div>';
			return;
		}

		var self = this;
		list.innerHTML = '';

		this.clients.forEach(function(client) {
			var initials = self.getInitials(client.sender_name || client.sender);
			var unread = client.unread_count || 0;

			var item = document.createElement('div');
			item.className = 'cc-client-item' + (self.currentClient === client.sender ? ' active' : '');
			item.innerHTML =
				'<div class="cc-client-avatar">' + initials + '</div>' +
				'<div class="cc-client-info">' +
					'<div class="cc-client-name">' + (client.sender_name || client.sender) + '</div>' +
					'<div class="cc-client-preview">' + (client.last_message || '') + '</div>' +
				'</div>' +
				(unread > 0 ? '<div class="cc-client-badge">' + unread + '</div>' : '');

			item.addEventListener('click', function() {
				self.selectClient(client.sender, client.sender_name || client.sender);
			});

			list.appendChild(item);
		});
	}

	async selectClient(clientEmail, clientName) {
		this.currentClient = clientEmail;
		this.currentClientName = clientName;

		// Highlight active
		document.querySelectorAll('.cc-client-item').forEach(function(el, i) {
			el.classList.toggle('active', this.clients[i] && this.clients[i].sender === clientEmail);
		}.bind(this));

		var chatArea = document.getElementById('cc-chat-area');
		var initials = this.getInitials(clientName);

		chatArea.innerHTML =
			'<div class="cc-chat-header">' +
				'<div class="cc-client-avatar">' + initials + '</div>' +
				'<div>' +
					'<div class="cc-chat-header-name">' + clientName + '</div>' +
					'<div class="cc-chat-header-email">' + clientEmail + '</div>' +
				'</div>' +
			'</div>' +
			'<div class="cc-messages" id="cc-messages"></div>' +
			'<div class="cc-input-area">' +
				'<textarea class="cc-input" id="cc-reply-input" rows="1" placeholder="Répondre à ' + clientName + '…"></textarea>' +
				'<button class="cc-send-btn" id="cc-send-btn">Envoyer</button>' +
			'</div>';

		var self = this;
		document.getElementById('cc-send-btn').addEventListener('click', function() { self.sendReply(); });
		document.getElementById('cc-reply-input').addEventListener('keydown', function(e) {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				self.sendReply();
			}
		});

		await this.loadMessages(clientEmail);
	}

	async loadMessages(clientEmail) {
		try {
			var result = await frappe.call({
				method: 'alphalib_chat.api.advisor_chat.get_client_messages',
				args: { client: clientEmail },
				freeze: false
			});

			this.messages = result.message || [];
			this.renderMessages();
		} catch (err) {
			console.error('Load messages error:', err);
		}
	}

	renderMessages() {
		var container = document.getElementById('cc-messages');
		if (!container) return;
		container.innerHTML = '';

		this.messages.forEach(function(msg) {
			var isClient = msg.sender_type === 'Client';
			var time = frappe.datetime.prettyDate(msg.creation);

			var div = document.createElement('div');
			div.className = 'cc-msg ' + (isClient ? 'client' : 'advisor');
			div.innerHTML = this.escapeHtml(msg.content) + '<div class="cc-msg-time">' + time + '</div>';
			container.appendChild(div);
		}.bind(this));

		container.scrollTop = container.scrollHeight;
	}

	async sendReply() {
		var input = document.getElementById('cc-reply-input');
		var btn = document.getElementById('cc-send-btn');
		var text = input.value.trim();
		if (!text || !this.currentClient) return;

		input.value = '';
		btn.disabled = true;

		// Ajouter immédiatement à l'interface
		var container = document.getElementById('cc-messages');
		var div = document.createElement('div');
		div.className = 'cc-msg advisor';
		div.innerHTML = this.escapeHtml(text) + '<div class="cc-msg-time">à l\'instant</div>';
		container.appendChild(div);
		container.scrollTop = container.scrollHeight;

		try {
			await frappe.call({
				method: 'alphalib_chat.api.advisor_chat.reply_message',
				args: {
					content: text,
					recipient: this.currentClient
				},
				freeze: false
			});
		} catch (err) {
			console.error('Reply error:', err);
			frappe.msgprint('Erreur lors de l\'envoi du message');
		} finally {
			btn.disabled = false;
			input.focus();
		}
	}

	setupRealtime() {
		var self = this;
		frappe.realtime.on('alphalib_new_message', function(data) {
			if (data.sender_type === 'Client') {
				// Recharger la liste des clients
				self.loadClients();

				// Si on est sur la conversation de ce client, ajouter le message
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

	getInitials(name) {
		if (!name) return '??';
		return name.split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
	}

	escapeHtml(t) {
		var d = document.createElement('div');
		d.textContent = t;
		return d.innerHTML;
	}
}
