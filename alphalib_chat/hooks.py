app_name = "alphalib_chat"
app_title = "AlphaLib Chat"
app_publisher = "AlphaLib"
app_description = "Chat IA + Conseiller pour ERPNext"
app_email = "contact@alphalib.fr"
app_license = "MIT"
required_apps = ["frappe"]

app_include_js = "/assets/alphalib_chat/js/alphalib_chat.js"

doc_events = {
    "AlphaLib Chat Message": {
        "after_insert": "alphalib_chat.api.advisor_chat.notify_advisor"
    }
}