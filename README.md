# AlphaLib Chat

Chat IA + Conseiller intégré au website AlphaLib / ERPNext.

## Installation

### 1. Ajouter l'app à ton bench (Frappe Cloud)

- Dashboard Frappe Cloud → Benches → ton bench → Apps → Add from GitHub
- URL du repo : `https://github.com/TON_USER/alphalib_chat`
- Branche : `main`

### 2. Installer sur ton site

Dashboard → Sites → ton site → Install App → alphalib_chat

### 3. Configurer la clé API Claude

Dashboard → Sites → ton site → Site Config → ajouter :
```json
{
  "anthropic_api_key": "sk-ant-api03-TA_CLE_ICI"
}
```

### 4. Migrer

Dashboard → Sites → ton site → Actions → Migrate

### 5. Ajouter le widget

- Va dans Website Settings → Header, Robots → `<head> HTML`
- Colle le contenu de `widget.html` à la fin du HTML existant
- Sauvegarde

## Structure

```
alphalib_chat/
├── setup.py
├── pyproject.toml
├── widget.html              ← à coller dans Website Settings
├── alphalib_chat/
│   ├── __init__.py
│   ├── hooks.py
│   ├── modules.txt
│   ├── api/
│   │   ├── __init__.py
│   │   ├── ai_chat.py      ← proxy Claude API
│   │   └── advisor_chat.py ← chat conseiller temps réel
│   └── alphalib_chat/
│       ├── __init__.py
│       └── doctype/
│           ├── __init__.py
│           └── alphalib_chat_message/
│               ├── __init__.py
│               ├── alphalib_chat_message.json
│               └── alphalib_chat_message.py
```

## Coûts API Claude

- ~$3/million tokens input, ~$15/million tokens output
- En pratique : ~0.003€ par échange
- 1000 conversations/mois ≈ 3-5€/mois
