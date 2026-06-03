app_name = "alphalib_chat"
app_title = "AlphaLib Chat"
app_publisher = "AlphaLib"
app_description = "Chat IA + Conseiller pour ERPNext"
app_email = "contact@alphalib.fr"
app_license = "MIT"
required_apps = ["frappe"]

doc_events = {
    "AlphaLib Chat Message": {
        "after_insert": "alphalib_chat.api.advisor_chat.notify_advisor"
    }
}