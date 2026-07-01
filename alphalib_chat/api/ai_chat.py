"""
API pour le chat IA (onglet Assistant IA).
Proxy serveur vers l'API Claude.
"""

import frappe
import json
import requests


@frappe.whitelist(allow_guest=False)
def chat():
    data = frappe.request.get_json() if frappe.request.is_json else json.loads(frappe.form_dict.get("data", "{}"))

    messages = data.get("messages", [])
    system_prompt = data.get("system_prompt", "")

    # Récupérer le prompt depuis les settings si configuré
    try:
        settings = frappe.get_single("AlphaLib Chat Settings")
        if settings.ia_system_prompt:
            system_prompt = settings.ia_system_prompt
    except Exception:
        pass

    if not messages:
        frappe.throw("Aucun message fourni")

    last_message = messages[-1].get("content", "")
    if len(last_message) > 2000:
        frappe.throw("Message trop long (max 2000 caractères)")

    # Rate limiting
    user = frappe.session.user
    cache_key = f"alphalib_chat_ratelimit:{user}"
    count = frappe.cache().get(cache_key) or 0
    if int(count) >= 30:
        frappe.throw("Trop de messages envoyés. Veuillez patienter quelques minutes.")
        frappe.cache().set(cache_key, int(count) + 1, ex=3600)

    if len(messages) > 20:
        messages = messages[-20:]

    api_key = frappe.conf.get("anthropic_api_key")
    if not api_key:
        frappe.throw("Clé API Anthropic non configurée dans site_config.json")

    reply = call_claude(api_key, system_prompt, messages)
    return {"reply": reply}


def call_claude(api_key, system_prompt, messages):
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01"
    }

    clean_messages = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "").strip()
        if role in ("user", "assistant") and content:
            clean_messages.append({"role": role, "content": content})

    if not clean_messages or clean_messages[0]["role"] != "user":
        frappe.throw("La conversation doit commencer par un message utilisateur")

    payload = {
        "model": "claude-sonnet-4-6",
        "max_tokens": 1024,
        "system": system_prompt,
        "messages": clean_messages
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        result = response.json()
        content_blocks = result.get("content", [])
        reply_parts = [block["text"] for block in content_blocks if block.get("type") == "text"]
        return "\n".join(reply_parts) if reply_parts else "Désolé, je n'ai pas pu générer de réponse."
    except requests.exceptions.Timeout:
        frappe.log_error("Claude API Timeout", "alphalib_chat")
        return "Le service est temporairement lent. Veuillez réessayer."
    except requests.exceptions.HTTPError as e:
        frappe.log_error(f"Claude API Error: {e.response.status_code} - {e.response.text}", "alphalib_chat")
        return "Une erreur technique est survenue."
    except Exception as e:
        frappe.log_error(f"Claude API Error: {str(e)}", "alphalib_chat")
        return "Une erreur inattendue est survenue. Contactez le cabinet directement."
