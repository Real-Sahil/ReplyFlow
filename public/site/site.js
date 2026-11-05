// The demo request form. It posts to the same enquiry endpoint the website form uses, so each request becomes
// a contact and an opportunity in the business that owns the form key below.
//
// ENQUIRY_KEY is the business's enquiry key (organisations.enquiry_key). While it is empty nothing is sent
// and the page says so, so a request can never land in the wrong business.
const ENQUIRY_KEY = "";
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
