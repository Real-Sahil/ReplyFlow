// Runs before the page is drawn, so there is no flash.
// 1. Marks the page as one with script, so the phone menu can start closed.
// 2. The site is at the root and the app is at /app. A link made for the app before that (a password reset, a
//    Facebook connection, a notification, an installed home-screen icon) still lands on the root, so anything
//    that carries an app address, or is the installed app itself, goes on to the app.
document.documentElement.classList.add("js");
(function () {
  var path = location.pathname.replace(/\/$/, "") || "/";
  if (path !== "/" && path !== "/welcome" && path !== "/welcome.html" && path !== "/index.html") return;
  var standalone =
    (window.matchMedia && matchMedia("(display-mode: standalone)").matches) ||
    navigator.standalone === true;
  if (/^#(\/|access_token|error)/.test(location.hash) || standalone) {
    location.replace("/app" + location.search + location.hash);
  }
})();
