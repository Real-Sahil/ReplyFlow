# Website enquiry form

Enquiries from the Mere & Row website become contacts and opportunities in ReplyFlow
automatically. Nothing else needs to run: the endpoint is a Supabase Edge Function,
and the database function does the saving.

## Endpoint

    POST https://mdhmuyhtimjkysvsardi.supabase.co/functions/v1/web_enquiry
    Content-Type: application/json

Body fields:

| Field | Required | Notes |
|---|---|---|
| `name` | yes | 2 to 80 characters |
| `email` | one of email or phone | must look like an email |
| `phone` | one of email or phone | 7 to 20 digits, spaces, brackets or a leading + |
| `message` | yes | 5 to 1000 characters |
| `product` | no | the product name, shown on the opportunity |
| `source_url` | no | the page the form was on, must start with http or https |
| `consent` | yes | must be `true`: the customer agreed to be contacted |
| `website` | never fill | a hidden honeypot; if it has a value, the enquiry is dropped quietly |

Replies: `200 {"data":{"received":true}}` when saved, `422` with a `message` when a
field is wrong, `413` when the body is over 8 KB.

## Adding the form to the site

Paste this where the enquiry form should appear. It only needs the browser's own
`fetch`, so there is no paid service and no tracking script.

```html
<form id="enquiry" novalidate>
  <label>Name <input name="name" required minlength="2" maxlength="80" autocomplete="name"></label>
  <label>Email <input name="email" type="email" maxlength="254" autocomplete="email"></label>
  <label>Phone <input name="phone" type="tel" maxlength="20" autocomplete="tel"></label>
  <label>Message <textarea name="message" required minlength="5" maxlength="1000"></textarea></label>
  <label class="sr-only">Leave this empty <input name="website" tabindex="-1" autocomplete="off"></label>
  <label><input name="consent" type="checkbox" required> I agree Mere &amp; Row can reply to me about this enquiry.</label>
  <button type="submit">Send enquiry</button>
  <p id="enquiry-status" role="status"></p>
</form>
<script>
  const form = document.getElementById("enquiry");
  const status = document.getElementById("enquiry-status");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const body = {
      ...data,
      consent: form.consent.checked,
      product: document.title,
      source_url: location.href,
    };
    status.textContent = "Sending…";
    const response = await fetch(
      "https://mdhmuyhtimjkysvsardi.supabase.co/functions/v1/web_enquiry",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    const json = await response.json().catch(() => ({}));
    if (response.ok) {
      form.reset();
      status.textContent = "Thank you. We will be in touch.";
    } else {
      status.textContent = json.message || "Something went wrong. Please call us on 0118 2111 567.";
    }
  });
</script>
```

The page URL is recorded with each enquiry, so the sales team can see which product
page it came from.

## Behaviour

- A new email creates a contact. An existing contact with the same email is reused.
- A second enquiry from the same person within a day adds a note to the open
  opportunity instead of opening another one.
- Enquiries land in the `Opportunity` stage with the note showing the product, the page
  and the message.

## Limits

- The honeypot and field rules stop simple bots, not determined ones. There is no
  CAPTCHA, because the free options need a third-party account. If spam arrives, add
  a free Cloudflare Turnstile check later.
- Requests are not rate-limited per IP. The same-email rule keeps repeat submissions
  from multiplying deals.
