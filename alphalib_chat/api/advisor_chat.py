"""
API endpoint pour le chat Conseiller (onglet Mon Conseiller).
Utilise frappe.realtime pour le temps réel + DocType pour le stockage.
"""

import frappe
import json


@frappe.whitelist(allow_guest=False)
def send_message():
    """
    Le client envoie un message au conseiller.
    Stocke dans DocType + notifie via realtime.
    """
    data = frappe.request.get_json() if frappe.request.is_json else json.loads(frappe.form_dict.get("data", "{}"))

    content = (data.get("content") or "").strip()
    if not content:
        frappe.throw("Message vide")
    if len(content) > 2000:
        frappe.throw("Message trop long (max 2000 caractères)")

    user = frappe.session.user

    # Créer le message dans le DocType
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

    # Notifier en temps réel tous les comptables connectés
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
    """
    Récupère l'historique des messages pour le client connecté.
    """
    user = frappe.session.user

    messages = frappe.get_all(
        "AlphaLib Chat Message",
        filters={
            "channel": "advisor",
            "$or": [
                {"sender": user},
                {"recipient": user}
            ]
        },
        or_filters=[
            ["sender", "=", user],
            ["recipient", "=", user]
        ],
        fields=["name", "sender", "sender_name", "sender_type", "content", "creation", "read"],
        order_by="creation asc",
        limit=100
    )

    # Marquer comme lus les messages reçus
    unread = [m.name for m in messages if m.sender != user and not m.read]
    if unread:
        frappe.db.set_value("AlphaLib Chat Message", {"name": ["in", unread]}, "read", 1)
        frappe.db.commit()

    return messages


@frappe.whitelist(allow_guest=False)
def reply_message():
    """
    Le comptable répond à un client (appelé depuis le desk).
    """
    data = frappe.request.get_json() if frappe.request.is_json else json.loads(frappe.form_dict.get("data", "{}"))

    content = (data.get("content") or "").strip()
    recipient = data.get("recipient")

    if not content or not recipient:
        frappe.throw("Message et destinataire requis")

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

    # Notifier le client en temps réel
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


def notify_advisor(doc, method):
    """
    Hook after_insert sur AlphaLib Chat Message.
    Envoie une notification email au comptable quand un client écrit.
    """
    if doc.sender_type != "Client":
        return

    # Récupérer les utilisateurs avec le rôle "Accountant" ou "System Manager"
    advisors = frappe.get_all(
        "Has Role",
        filters={"role": ["in", ["Accountant", "System Manager"]], "parenttype": "User"},
        fields=["parent"],
        distinct=True
    )

    for advisor in advisors:
        # Notification dans le desk
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
            user=advisor.parent,
            after_commit=True
        )
