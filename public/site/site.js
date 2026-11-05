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
