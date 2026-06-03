app_name = "alphalib_chat"
app_title = "AlphaLib Chat"
app_publisher = "AlphaLib"
app_description = "Chat IA + Conseiller intégré au website AlphaLib"
app_email = "contact@alphalib.fr"
app_license = "MIT"
required_apps = ["frappe"]

# Doc Events
doc_events = {
    "AlphaLib Chat Message": {
        "after_insert": "alphalib_chat.api.advisor_chat.notify_advisor"
    }
}

# Website context — expose chat config to website pages
website_context = {
    "include_js": [],
    "include_css": []
}
