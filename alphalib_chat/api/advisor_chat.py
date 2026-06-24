"""
API pour le chat Conseiller + Configuration + Notifications.
"""

import frappe
import json


# ═══════════════════════════════════════
# CONFIGURATION (appelé par le widget)
# ═══════════════════════════════════════

@frappe.whitelist(allow_guest=False)
def get_chat_config():
    """
    Retourne la config du chatbox pour l'utilisateur connecté.
    Le widget appelle ça au chargement pour savoir s'il doit s'afficher.
    """
    user = frappe.session.user
    if user == "Guest":
        return {"visible": False}

    try:
        settings = frappe.get_single("AlphaLib Chat Settings")
    except Exception:
        return {"visible": True, "ia_enabled": True, "welcome": "Bonjour ! Comment puis-je vous aider ?"}

    # Vérifier si le widget est activé
    if not settings.widget_enabled:
        return {"visible": False}

    # Vérifier les rôles autorisés
    visible = True
    if settings.widget_roles and settings.widget_roles.strip():
        allowed_roles = [r.strip() for r in settings.widget_roles.strip().split("\n") if r.strip()]
        if allowed_roles:
            user_roles = frappe.get_roles(user)
            visible = any(role in user_roles for role in allowed_roles)

    return {
        "visible": visible,
        "ia_enabled": bool(settings.ia_enabled),
        "welcome": settings.ia_welcome_message or "Bonjour ! Comment puis-je vous aider ?",
        "advisor_name": settings.advisor_display_name or "Votre conseiller"
    }


# ═══════════════════════════════════════
# CLIENT → CONSEILLER (depuis le widget)
# ═══════════════════════════════════════

@frappe.whitelist(allow_guest=False)
def send_message():
    """Le client envoie un message au conseiller."""
    data = frappe.request.get_json() if frappe.request.is_json else json.loads(frappe.form_dict.get("data", "{}"))

    content = (data.get("content") or "").strip()
    if not content:
        frappe.throw("Message vide")
    if len(content) > 2000:
        frappe.throw("Message trop long (max 2000 caractères)")

    user = frappe.session.user

    msg = frappe.get_doc({
        "doctype": "AlphaLib Chat Message",
        "sender": user,
        "sender_name": frappe.utils.get_fullname(user),
        "sender_type": "Client",
        "content": content,
        "channel": "advisor",
        "read": 0
    })
    msg.insert(ignore_permissions=True)
    frappe.db.commit()

    frappe.publish_realtime(
        event="alphalib_new_message",
        message={
            "name": msg.name,
            "sender": user,
            "sender_name": msg.sender_name,
            "content": content,
            "creation": str(msg.creation),
            "sender_type": "Client"
        },
        after_commit=True
    )

    return {"status": "ok", "name": msg.name, "creation": str(msg.creation)}


@frappe.whitelist(allow_guest=False)
def get_messages():
    """Récupère l'historique des messages pour le client connecté."""
    user = frappe.session.user

    messages = frappe.get_all(
        "AlphaLib Chat Message",
        filters={"channel": "advisor"},
        or_filters=[
            ["sender", "=", user],
            ["recipient", "=", user]
        ],
        fields=["name", "sender", "sender_name", "sender_type", "content", "creation", "read"],
        order_by="creation asc",
        limit=100
    )

    # Marquer comme lus
    unread = [m.name for m in messages if m.sender != user and not m.read]
    if unread:
        for name in unread:
            frappe.db.set_value("AlphaLib Chat Message", name, "read", 1)
        frappe.db.commit()

    return messages


# ═══════════════════════════════════════
# CONSEILLER → CLIENT (depuis le desk)
# ═══════════════════════════════════════

@frappe.whitelist(allow_guest=False)
def reply_message(content=None, recipient=None):
    """Le comptable répond à un client."""
    if not content or not recipient:
        frappe.throw("Message et destinataire requis")

    content = content.strip()
    user = frappe.session.user

    msg = frappe.get_doc({
        "doctype": "AlphaLib Chat Message",
        "sender": user,
        "sender_name": frappe.utils.get_fullname(user),
        "sender_type": "Advisor",
        "recipient": recipient,
        "content": content,
        "channel": "advisor",
        "read": 0
    })
    msg.insert(ignore_permissions=True)
    frappe.db.commit()

    frappe.publish_realtime(
        event="alphalib_new_message",
        message={
            "name": msg.name,
            "sender": user,
            "sender_name": msg.sender_name,
            "content": content,
            "creation": str(msg.creation),
            "sender_type": "Advisor"
        },
        user=recipient,
        after_commit=True
    )

    return {"status": "ok", "name": msg.name}


# ═══════════════════════════════════════
# CONSOLE DESK — Liste des clients
# ═══════════════════════════════════════

@frappe.whitelist(allow_guest=False)
def get_client_list():
    """
    Liste des clients avec messages, triés par dernier message (style Discord).
    """
    clients_raw = frappe.db.sql("""
        SELECT
            sender,
            sender_name,
            MAX(creation) as last_activity
        FROM `tabAlphaLib Chat Message`
        WHERE sender_type = 'Client' AND channel = 'advisor'
        GROUP BY sender
        ORDER BY last_activity DESC
    """, as_dict=True)

    clients = []
    for client in clients_raw:
        # Dernier message de la conversation
        last_msg = frappe.db.sql("""
            SELECT content, sender_type
            FROM `tabAlphaLib Chat Message`
            WHERE channel = 'advisor'
              AND (sender = %(client)s OR recipient = %(client)s)
            ORDER BY creation DESC
            LIMIT 1
        """, {"client": client.sender}, as_dict=True)

        # Non-lus
        unread = frappe.db.count("AlphaLib Chat Message", {
            "sender": client.sender,
            "sender_type": "Client",
            "channel": "advisor",
            "read": 0
        })

        last_message = ""
        if last_msg:
            prefix = "" if last_msg[0].sender_type == "Client" else "Vous : "
            text = last_msg[0].content
            last_message = prefix + (text[:50] + "..." if len(text) > 50 else text)

        clients.append({
            "sender": client.sender,
            "sender_name": client.sender_name or client.sender,
            "last_message": last_message,
            "last_activity": str(client.last_activity),
            "unread_count": unread
        })

    return clients


@frappe.whitelist(allow_guest=False)
def get_client_messages(client=None):
    """Messages d'une conversation client spécifique (pour le desk)."""
    if not client:
        frappe.throw("Client requis")

    messages = frappe.get_all(
        "AlphaLib Chat Message",
        filters={"channel": "advisor"},
        or_filters=[
            ["sender", "=", client],
            ["recipient", "=", client]
        ],
        fields=["name", "sender", "sender_name", "sender_type", "content", "creation", "read"],
        order_by="creation asc",
        limit=200
    )

    # Marquer comme lus
    unread = [m.name for m in messages if m.sender == client and not m.read]
    if unread:
        for name in unread:
            frappe.db.set_value("AlphaLib Chat Message", name, "read", 1)
        frappe.db.commit()

    return messages


# ═══════════════════════════════════════
# NOTIFICATIONS (hook after_insert)
# ═══════════════════════════════════════

def notify_advisor(doc, method):
    """Notifie les comptables configurés quand un client écrit."""
    if doc.sender_type != "Client":
        return

    recipients = _get_notification_recipients(doc.sender)

    for email in recipients:
        # Notification realtime
        frappe.publish_realtime(
            event="alphalib_new_message",
            message={
                "name": doc.name,
                "sender": doc.sender,
                "sender_name": doc.sender_name,
                "content": doc.content,
                "creation": str(doc.creation),
                "sender_type": "Client"
            },
            user=email,
            after_commit=True
        )

    # Email
    _send_email_notification(doc, recipients)


def _get_notification_recipients(exclude_sender=None):
    """
    Récupère la liste des emails à notifier depuis les settings.
    """
    recipients = set()

    try:
        settings = frappe.get_single("AlphaLib Chat Settings")
    except Exception:
        # Si pas de settings, notifier les System Manager
        managers = frappe.get_all("Has Role", filters={"role": "System Manager", "parenttype": "User"}, fields=["parent"], distinct=True)
        return [m.parent for m in managers if m.parent != "Administrator" and m.parent != exclude_sender]

    # Emails directs
    if settings.notification_emails and settings.notification_emails.strip():
        for email in settings.notification_emails.strip().split("\n"):
            email = email.strip()
            if email and email != exclude_sender:
                recipients.add(email)

    # Emails par rôle
    if settings.notification_roles and settings.notification_roles.strip():
        roles = [r.strip() for r in settings.notification_roles.strip().split("\n") if r.strip()]
        if roles:
            role_users = frappe.db.sql("""
                SELECT DISTINCT parent
                FROM `tabHas Role`
                WHERE role IN %(roles)s
                  AND parenttype = 'User'
                  AND parent != 'Administrator'
            """, {"roles": roles}, as_dict=True)
            for u in role_users:
                if u.parent != exclude_sender and frappe.db.get_value("User", u.parent, "enabled"):
                    recipients.add(u.parent)

    # Fallback si rien configuré
    if not recipients:
        managers = frappe.get_all("Has Role", filters={"role": "System Manager", "parenttype": "User"}, fields=["parent"], distinct=True)
        for m in managers:
            if m.parent != "Administrator" and m.parent != exclude_sender:
                recipients.add(m.parent)

    return list(recipients)


def _send_email_notification(doc, recipients):
    """Envoie un email de notification aux destinataires."""
    try:
        settings = frappe.get_single("AlphaLib Chat Settings")
        if not settings.email_enabled:
            return
    except Exception:
        pass

    if not recipients:
        return

    try:
        client_name = doc.sender_name or doc.sender
        preview = doc.content[:200] + "..." if len(doc.content) > 200 else doc.content
        site_url = frappe.utils.get_url()

        frappe.sendmail(
            recipients=recipients,
            subject=f"Nouveau message de {client_name} — AlphaLib Chat",
            message=f"""
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px;">
                <div style="background: #0f263e; color: white; padding: 20px; border-radius: 12px 12px 0 0;">
                    <h2 style="margin: 0; font-size: 16px;">Nouveau message client</h2>
                </div>
                <div style="border: 1px solid #e2e8f0; border-top: none; padding: 20px; border-radius: 0 0 12px 12px;">
                    <p style="margin: 0 0 4px; font-weight: 600; color: #e85a4f;">{client_name}</p>
                    <p style="margin: 0 0 16px; color: #64748b; font-size: 13px;">{doc.sender}</p>
                    <div style="background: #f4f5f7; padding: 14px; border-radius: 8px; font-size: 14px; color: #1e293b; line-height: 1.5;">
                        {preview}
                    </div>
                    <a href="{site_url}/app/chat-console"
                       style="display: inline-block; margin-top: 16px; background: #e85a4f; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
                        Répondre
                    </a>
                </div>
            </div>
            """,
            now=True
        )
    except Exception as e:
        frappe.log_error(f"Email notification error: {str(e)}", "alphalib_chat")

@frappe.whitelist(allow_guest=False)
def get_unread_count():
    """Nombre total de messages clients non lus."""
    count = frappe.db.count("AlphaLib Chat Message", {
        "sender_type": "Client",
        "channel": "advisor",
        "read": 0
    })
    return count