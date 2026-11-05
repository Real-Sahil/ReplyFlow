// The demo request form. It posts to the same enquiry endpoint the website form uses, so each request becomes
// a contact and an opportunity in the business that owns the form key below.
//
// ENQUIRY_KEY is the enquiry key of the ReplyFlow Demo business (organisations.enquiry_key), where requests land.
const ENQUIRY_KEY = "29ebc72da4d045d29801d86dacc9b7f3";
const ENDPOINT = "https://mdhmuyhtimjkysvsardi.supabase.co/functions/v1/web_enquiry";

const form = document.getElementById("enquiry");
const status = document.getElementById("status");
if (form && status) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form));
    if (!data.email && !data.phone) {
      status.textContent = "Please give an email or a phone number so we can reply.";
      return;
    }
    if (!ENQUIRY_KEY) {
      status.textContent = "Booking is not open yet. Please check back soon.";
      return;
    }
    status.textContent = "Sending…";
    try {
      const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(ENQUIRY_KEY)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          consent: form.consent.checked,
          product: "ReplyFlow demo request",
          source_url: location.href,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (response.ok) {
        form.reset();
        status.textContent = "Thank you. We will be in touch.";
      } else {
        status.textContent = json.message || "Something went wrong. Please try again.";
      }
    } catch {
      status.textContent = "Something went wrong. Please try again.";
    }
  });
}

// The hero video plays on its own, muted and looping. People who ask their device for less motion get it
// paused, and everyone can pause or play it.
const video = document.getElementById("hero-video");
const toggle = document.getElementById("hero-toggle");
if (video && toggle) {
  const sync = () => {
    toggle.textContent = video.paused ? "Play" : "Pause";
  };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    video.removeAttribute("autoplay");
    video.pause();
  }
  toggle.addEventListener("click", () => {
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  });
  video.addEventListener("play", sync);
  video.addEventListener("pause", sync);
  sync();
}

// The phone menu. The "Book a demo" button stays in the bar; the links open from the three-bar button.
const navToggle = document.querySelector(".nav-toggle");
const navMenu = document.getElementById("site-menu");
if (navToggle && navMenu) {
  const set = (open) => {
    navMenu.classList.toggle("open", open);
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.setAttribute("aria-label", open ? "Close menu" : "Menu");
  };
  navToggle.addEventListener("click", () => set(!navMenu.classList.contains("open")));
  navMenu.addEventListener("click", (event) => {
    if (event.target.closest("a")) set(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && navMenu.classList.contains("open")) {
      set(false);
      navToggle.focus();
    }
  });
  window.matchMedia("(min-width: 760px)").addEventListener("change", (event) => {
    if (event.matches) set(false);
  });
}

// A slow constellation behind the page: points that drift and link up when they pass close, mostly blue with a
// few coral. It stops when the tab is hidden and is drawn once, still, for anyone who asks for less motion.
(function () {
  var NS = "http://www.w3.org/2000/svg";
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "constellation");
  svg.setAttribute("aria-hidden", "true");
  document.body.prepend(svg);
  var links = document.createElementNS(NS, "g"), dots = document.createElementNS(NS, "g");
  svg.append(links, dots);
  var count = innerWidth < 700 ? 11 : 18, nodes = [], pairs = [], i, j;
  for (i = 0; i < count; i++) {
    var g = document.createElementNS(NS, "g"), colour = i % 5 === 2 ? "var(--coral)" : "var(--accent)";
    var halo = document.createElementNS(NS, "circle"), dot = document.createElementNS(NS, "circle");
    halo.setAttribute("r", "10"); halo.setAttribute("fill", colour); halo.setAttribute("opacity", ".12");
    dot.setAttribute("r", "2.6"); dot.setAttribute("fill", colour); dot.setAttribute("opacity", ".7");
    g.append(halo, dot); dots.append(g);
    nodes.push({ el: g, x: (((i * 37) % 97) / 97) * innerWidth, y: (((i * 53) % 89) / 89) * innerHeight,
      vx: ((((i * 7) % 11) - 5) / 5) * 0.2, vy: ((((i * 5) % 13) - 6) / 6) * 0.2 });
  }
  for (i = 0; i < count; i++) for (j = i + 1; j < count; j++) {
    var line = document.createElementNS(NS, "line");
    line.setAttribute("stroke", "var(--accent)"); line.setAttribute("stroke-width", "1"); line.setAttribute("opacity", "0");
    links.append(line); pairs.push([nodes[i], nodes[j], line]);
  }
  function draw(step) {
    var w = innerWidth, h = innerHeight, reach = Math.max(w, h) * 0.2;
    nodes.forEach(function (n) {
      if (step) { n.x += n.vx; n.y += n.vy; if (n.x < 0 || n.x > w) n.vx *= -1; if (n.y < 0 || n.y > h) n.vy *= -1; }
      n.el.setAttribute("transform", "translate(" + n.x.toFixed(1) + " " + n.y.toFixed(1) + ")");
    });
    pairs.forEach(function (p) {
      var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), l = p[2];
      if (d < reach) {
        l.setAttribute("x1", p[0].x.toFixed(1)); l.setAttribute("y1", p[0].y.toFixed(1));
        l.setAttribute("x2", p[1].x.toFixed(1)); l.setAttribute("y2", p[1].y.toFixed(1));
        l.setAttribute("opacity", ((1 - d / reach) * 0.35).toFixed(2));
      } else l.setAttribute("opacity", "0");
    });
  }
  draw(false);
  if (reduced) return;
  var raf = 0, last = 0;
  function tick(now) { raf = requestAnimationFrame(tick); if (now - last < 33) return; last = now; draw(true); }
  raf = requestAnimationFrame(tick);
  document.addEventListener("visibilitychange", function () {
    cancelAnimationFrame(raf);
    if (!document.hidden) raf = requestAnimationFrame(tick);
  });
})();
