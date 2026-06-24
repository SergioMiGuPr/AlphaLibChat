frappe.provide('alphalib_chat');

$(document).ready(function() {
  if (frappe.user.has_role('System Manager') || frappe.user.has_role('Accountant')) {
    alphalib_chat.setup_navbar_icon();
    alphalib_chat.setup_notifications();
  }
});

alphalib_chat.setup_navbar_icon = function() {
  if ($('.alphalib-chat-icon').length) return;

  var badge_html = '<li class="nav-item alphalib-chat-icon" title="Chat Clients">' +
    '<a class="nav-link" href="/app/chat-console" style="position:relative; display:flex; align-items:center;">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
      '</svg>' +
      '<span class="alphalib-chat-badge" style="display:none; position:absolute; top:4px; right:0; background:#e85a4f; color:white; font-size:10px; font-weight:700; border-radius:50%; width:18px; height:18px; text-align:center; line-height:18px;">0</span>' +
    '</a>' +
  '</li>';

  var navbar_items = $('.navbar-nav:last');
  if (navbar_items.length) {
    navbar_items.prepend(badge_html);
  }

  alphalib_chat.update_unread_count();
};

alphalib_chat.update_unread_count = function() {
  frappe.call({
    method: 'alphalib_chat.api.advisor_chat.get_unread_count',
    freeze: false,
    callback: function(r) {
      var count = (r && r.message) || 0;
      var badge = $('.alphalib-chat-badge');
      if (count > 0) {
        badge.text(count).show();
      } else {
        badge.hide();
      }
    }
  });
};

alphalib_chat.setup_notifications = function() {
  frappe.realtime.on('alphalib_new_message', function(data) {
    if (data.sender_type === 'Client') {
      alphalib_chat.update_unread_count();

      frappe.show_alert({
        message: '<b>' + (data.sender_name || 'Client') + '</b> : ' + data.content.substring(0, 80),
        subtitle: 'Nouveau message',
        indicator: 'orange'
      }, 10);

      if (Notification.permission === 'granted') {
        new Notification('Nouveau message - ' + (data.sender_name || 'Client'), {
          body: data.content.substring(0, 100),
          icon: '/assets/frappe/images/frappe-icon.svg'
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
      }

      if (window.location.pathname === '/app/chat-console') {
      }
    }
  });

  if ('Notification' in window && Notification.permission === 'default') {
    setTimeout(function() {
      Notification.requestPermission();
    }, 5000);
  }
};