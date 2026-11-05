#!/usr/bin/env python3
"""Builds the static marketing pages into public/. Run: python3 scripts/marketing/build.py
Pages share one header and footer. Everything is plain HTML and one stylesheet, so nothing here needs a
build step on Vercel: the generated files are committed."""
import html, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parents[2] / "public"

MARK = ('<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="23" fill="#2f6bed"/>'
        '<path d="M26 30a8 8 0 0 1 8-8h32a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8H48L34 73V60a8 8 0 0 1-8-8z" fill="#fff"/>'
        '<path d="M36 42h26m0 0-7-7m7 7-7 7" fill="none" stroke="#2f6bed" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/></svg>')

NAV = [("features", "Features"), ("pricing", "Pricing"), ("blog", "Blog"), ("contact", "Book a demo")]

def page(slug, title, desc, body, depth=0, extra_head="", script=True):
    links = []
    for s_, label in NAV:
        if s_ == "contact":
            continue
        cur = ' aria-current="page"' if slug == s_ or (s_ == "blog" and slug.startswith("blog")) else ""
        links.append(f'<a href="/{s_}"{cur}>{label}</a>')
    nav = "\n        ".join(links)
    return f"""<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:type" content="website">
<link rel="icon" href="/favicon.ico">
<link rel="stylesheet" href="/site/site.css">
<script src="/site/boot.js"></script>
{extra_head}</head>
<body>
<div class="wrap">
  <header class="site-header">
    <a class="brand" href="/">{MARK}<span>ReplyFlow</span></a>
    <a class="btn small header-cta" href="/contact">Book a demo</a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-menu" aria-label="Menu">
      <span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>
    </button>
    <nav class="site-nav" id="site-menu" aria-label="Main">
        {nav}
        <a href="/app">Sign in</a>
    </nav>
  </header>
  <main>
{body}
  </main>
  <footer class="site-footer">
    <span>ReplyFlow. Built for owner-run UK businesses.</span>
    <nav aria-label="Footer">
      <a href="/features">Features</a>
      <a href="/pricing">Pricing</a>
      <a href="/blog">Blog</a>
      <a href="/contact">Contact</a>
      <a href="/privacy">Privacy policy</a>
      <a href="/app">Sign in</a>
    </nav>
  </footer>
</div>
<script src="/site/site.js" defer></script>
</body>
</html>
"""

def shot(name, alt, caption=""):
    cap = f'<p class="caption">{caption}</p>' if caption else ""
    return f'<div><div class="shot"><img src="site/{name}.webp" width="1600" height="1000" loading="lazy" alt="{html.escape(alt)}"></div>{cap}</div>'

# Every link and file on a page is written from the site root (/features, /site/site.css), so a page works
# the same wherever it sits. The pages are served without .html (see cleanUrls in vercel.json).
def absolute(content):
    content = re.sub(r'(href|src|poster)="(?!https?:|/|#|mailto:|tel:)(?:\.\./)*([^"]+)"', r'\1="/\2"', content)
    return content.replace('"/privacy.html"', '"/privacy"')

def write(path, content):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(absolute(content), encoding="utf-8")

DEMO_NOTE = "Screens use made-up shop data."

# ---------------------------------------------------------------- Home
home = f"""
    <section class="hero">
      <h1>Replies, orders and the books, in one place.</h1>
      <p class="lede">ReplyFlow is for owner-run UK shops and makers who sell through Facebook and Messenger. Answer customers, follow orders, send invoices, see who owes you and when money gets tight, and let staff send expenses and hours from their phones.</p>
      <div class="actions">
        <a class="btn" href="contact">Book a demo</a>
        <a class="btn quiet" href="features">See what it does</a>
      </div>
      <figure class="hero-video">
        <video id="hero-video" poster="site/hero-poster.webp" width="1280" height="720" muted loop playsinline preload="metadata" autoplay aria-label="A tour of ReplyFlow: the money book, sending a sheet, bills, owed and owing, staff expenses and the weekly summary, shown with demo data for a fictional shop."><source src="site/hero.mp4" type="video/mp4"><source src="site/hero.webm" type="video/webm"></video>
        <figcaption class="caption">A 70-second tour. Shown with demo data for a fictional shop. <button type="button" class="linkbtn" id="hero-toggle" aria-controls="hero-video">Pause</button></figcaption>
      </figure>
    </section>

    <section class="block">
      <div class="split">
        <div class="copy">
          <h2>Know who owes you, today</h2>
          <p>Every invoice you have issued and not been paid for sits on one list, with the days late and a reminder message you can copy in one tap. Record the payment on the order and it drops off.</p>
          <p>Bills you owe suppliers sit underneath, so you see both sides of the same page.</p>
        </div>
        {shot("owed", "The Owed and owing page: three customers who owe £1,458 in total, one six days late, and two suppliers owed £312.", DEMO_NOTE)}
      </div>
    </section>

    <section class="block">
      <div class="split flip">
        <div class="copy">
          <h2>See when money may be tight</h2>
          <p>Type in what is in the bank. ReplyFlow adds what customers owe, the bills coming due and the payments you have planned, and shows the next 30, 60 or 90 days. If the balance would dip below zero, it names the day.</p>
          <p>It is a guide, not a promise, and it says so on the page.</p>
        </div>
        {shot("cashflow", "The Cash flow page: a bank balance of £4,280, a chart of the next 30 days and four summary figures.", DEMO_NOTE)}
      </div>
    </section>

    <section class="block">
      <div class="split">
        <div class="copy">
          <h2>Staff spend money. You see it all.</h2>
          <p>Each person gets their own sign-in, made by you in person, with no email invitation to lose. They send expense claims with a photo of the receipt, record their hours and ask for holiday. You approve or refuse, and you are told as it arrives.</p>
          <p>The same receipt sent twice, or the same amount sent again within three days, is flagged before you pay it.</p>
        </div>
        {shot("claims", "The staff expense claims page, with a claim flagged as a possible duplicate.", DEMO_NOTE)}
      </div>
    </section>

    <section class="block">
      <h2>And the rest of running the place</h2>
      <p class="lede" style="margin-top:12px">Contacts, deals and orders. A Messenger inbox and Facebook posting. Numbered invoices and credit notes with VAT. A money book, bills, mileage and bank matching. Repeating rent and subscriptions. A read-only login for your accountant. <a href="features">The full list is on the features page.</a></p>
    </section>

    <section class="block">
      <div class="narrow" style="margin:0">
        <h2>What it is not</h2>
        <p class="muted" style="margin-top:12px">It does not run payroll and it does not replace your accountant. It keeps good records, adds up hours and holiday, and gives your accountant clean numbers and their own read-only login. It follows UK VAT. Other markets and currencies are supported for amounts and invoices, without local tax rules yet.</p>
      </div>
    </section>

    <section class="closing">
      <h2>See it with your own shop in mind</h2>
      <p class="lede">A short call. We show you the screens, you ask about your business, and we tell you honestly whether it fits.</p>
      <a class="btn" href="contact">Book a demo</a>
    </section>
"""
write("welcome.html", page("welcome", "ReplyFlow: replies, orders and the books for UK shops and makers",
      "ReplyFlow brings customer messages, orders, invoices, money and staff expenses into one app for owner-run UK businesses that sell through Facebook and Messenger.", home, script=True))

# ---------------------------------------------------------------- Features
def group(title, intro, items):
    lis = "\n".join(f"<li><strong>{a}</strong> {b}</li>" for a, b in items)
    return f"""
    <section class="group">
      <div class="copy"><h2>{title}</h2><p>{intro}</p></div>
      <ul class="plain-list">
{lis}
      </ul>
    </section>"""

features = f"""
    <section class="hero">
      <h1>Everything a small shop does between a message and being paid</h1>
      <p class="lede">One app for the front of the shop and the back office. Each business sees only its own information.</p>
    </section>
{group("Talk to customers", "Messages and posts from the Facebook Page you already use.", [
 ("Messenger inbox.", "Read and answer customer messages in the app, with the conversation kept on the contact."),
 ("Comments.", "Reply to or hide comments on your Page posts without opening Facebook."),
 ("Posting.", "Write posts, schedule them and publish to your Page. Nothing goes out without you pressing the button."),
 ("Website enquiries.", "A form on your own website drops each enquiry into the app as a contact and an opportunity."),
])}
{group("Sell", "From first enquiry to a delivered order.", [
 ("Contacts and deals.", "Keep who they are, what they asked for and where each deal stands."),
 ("Orders and tracking links.", "Record what was agreed, take deposits and balances, and send a tracking link."),
 ("Quotes.", "Build a priced quote on a deal and download it as a PDF to send."),
 ("Invoices and credit notes.", "Numbered one after another with no gaps, VAT worked out once per rate, and never edited afterwards. A mistake is fixed with a credit note."),
 ("Repeat invoices.", "Set an invoice to come round again. A draft appears a week ahead for you to check, change and confirm. Nothing is sent by itself."),
])}
{group("Know where the money is", "Records you can show an accountant, in pounds.", [
 ("Money book.", "Everything in and out, planned or done, with receipts attached."),
 ("Bills.", "Supplier bills with their VAT, due dates and paid status."),
 ("Owed and owing.", "Who owes you and who you owe, with the days late and a copy-and-paste reminder."),
 ("Cash flow.", "The next 30, 60 or 90 days from your balance, what is owed, what is due and what is planned. Leave out any line you do not trust."),
 ("Repeating items.", "Rent, subscriptions, insurance and loan payments added ahead of time as planned entries or unpaid bills."),
 ("Customer statements.", "What each customer was invoiced, credited and paid, aged by how late it is."),
 ("Your market and currency.", "Choose a market and a currency for each business. Amounts, invoices, exports and messages are written that way. UK VAT is built in; other markets are invoiced without tax lines for now."),
 ("Mileage, bank matching and sheets.", "Log miles at an editable rate, match bank lines to what you recorded, and import a CSV or Excel sheet with a template."),
 ("Insights and a weekly summary.", "Charts of income, costs and who pays most, and one summary of your week."),
 ("Accountant login and month lock.", "A read-only finance login for your accountant. Lock a signed-off month so nothing dated in it can change."),
])}
{group("Look after the team", "For people who work for you, not just with you.", [
 ("Staff sign-ins.", "Made by you in person with a one-time password. Staff see only their own claims, hours and holiday."),
 ("Expense claims.", "Receipt photo, category and amount from a phone. Likely duplicates are flagged and you approve, refuse or mark as paid back."),
 ("Hours and holiday.", "Staff record hours and ask for holiday. You approve, and approved holiday comes off their allowance in People. It adds up time. It does not calculate pay."),
 ("Alerts.", "You are told when claims, hours or holiday arrive, as a notification on your phone. Only administrators get them."),
 ("People, paperwork and equipment.", "Records for staff and contractors with documents that expire. Insurance, licences and safety certificates with reminders before they run out. A register of vans, tools and who holds them."),
])}
{group("Kept safe", "Small businesses hold other people's details too.", [
 ("Separate businesses.", "Every record belongs to one business and the database enforces it, not just the screens."),
 ("Roles.", "Administrator, team member, accountant (read-only) and staff sign-in, each seeing only what that job needs."),
 ("History and no deleting.", "Changes are logged. Things are voided or archived, not erased, so the trail stays intact."),
 ("Works on a phone.", "Install it from the browser to the home screen. It updates itself."),
])}
    <p class="muted small" style="padding-bottom:16px">Facebook features use Meta's official connection and follow Meta's rules for Pages.</p>
    <section class="closing">
      <h2>Want to see it working?</h2>
      <a class="btn" href="contact">Book a demo</a>
    </section>
"""
write("features.html", page("features", "Features · ReplyFlow",
      "Messenger inbox and posting, orders, invoices, a money book, cash flow, staff expenses, hours and holiday, in one app for UK small businesses.", features))

# ---------------------------------------------------------------- Pricing
def qa(q, a):
    return f"<details><summary>{q}</summary><p>{a}</p></details>"

pricing = f"""
    <section class="hero">
      <h1>Pricing: talk to us</h1>
      <p class="lede">We would rather agree a price that fits your business than guess at one on a web page. It depends on how many people use it and which parts you switch on.</p>
      <div class="actions"><a class="btn" href="contact">Book a demo</a></div>
    </section>
    <section class="block">
      <div class="split">
        <div class="copy">
          <h2>What you get</h2>
        </div>
        <ul class="plain-list">
          <li><strong>The whole app.</strong> Inbox, orders, invoices, the money pages and the staff tools. No features held back for a higher tier.</li>
          <li><strong>Your own business space.</strong> Your information is separate from every other business.</li>
          <li><strong>Your team.</strong> Administrators, team members, a read-only accountant login and staff sign-ins for expenses, hours and holiday.</li>
          <li><strong>Setup help.</strong> We help you put in your business details, products and first customers.</li>
        </ul>
      </div>
    </section>
    <section class="block">
      <h2>Questions</h2>
      <div style="margin-top:24px">
        {qa("What currency do you charge in?", "Pounds sterling.")}
        {qa("Can I use it in another currency or country?", "Yes for the money itself. Each business picks its market and currency in Settings (pounds, euros, dollars and more) before its first record, and every amount, invoice and export follows. Once there are records the currency is fixed, and every invoice keeps the currency it was made in. Tax is UK VAT only for now. In other markets invoices are issued without tax lines and the VAT return tools are switched off. Tell us which tax rules you need on the demo form.")}
        {qa("Is there a contract?", "We will tell you the terms on the call, before you decide anything.")}
        {qa("Do you take payment on this website?", "No. There is nothing to buy here yet. Book a call and we will set you up.")}
        {qa("Will you replace my accountant?", "No. ReplyFlow keeps tidy records and your accountant can look at them with a read-only login. It does not file anything for you.")}
      </div>
    </section>
    <section class="closing">
      <h2>Tell us about your business</h2>
      <p class="lede">Two minutes on the form, then a short call.</p>
      <a class="btn" href="contact">Book a demo</a>
    </section>
"""
write("pricing.html", page("pricing", "Pricing · ReplyFlow", "ReplyFlow pricing is agreed with each business. Book a short call and we will tell you what it costs for your team.", pricing))

# ---------------------------------------------------------------- Contact
contact = """
    <section class="hero">
      <h1>Book a demo</h1>
      <p class="lede">Tell us a little about your business. We will reply to set up a short call and show you the app.</p>
    </section>
    <section class="block" style="padding-top:0">
      <form class="card narrow" id="enquiry" novalidate style="margin:0">
        <label>Your name <input name="name" required minlength="2" maxlength="80" autocomplete="name"></label>
        <label>Email <input name="email" type="email" maxlength="254" autocomplete="email"></label>
        <label>Phone (if you prefer a call) <input name="phone" type="tel" maxlength="20" autocomplete="tel"></label>
        <label>About your business <textarea name="message" required minlength="5" maxlength="1000" placeholder="What you sell, how many people work with you, and what is taking your time"></textarea></label>
        <label class="hp" aria-hidden="true">Leave this empty <input name="website" tabindex="-1" autocomplete="off"></label>
        <label class="check"><input name="consent" type="checkbox" required> <span>I agree ReplyFlow can reply to me about this enquiry. <a href="privacy.html">Privacy policy</a></span></label>
        <button class="btn" type="submit">Send</button>
        <p id="status" role="status"></p>
      </form>
    </section>
"""
write("contact.html", page("contact", "Book a demo · ReplyFlow", "Tell us about your business and we will arrange a short call to show you ReplyFlow.", contact, script=True))

# ---------------------------------------------------------------- Blog
POSTS = [
 {
  "slug": "the-invoice-you-didnt-chase",
  "title": "The invoice you didn't chase",
  "desc": "Late payment is rarely a customer problem. It is a list problem. How to see who owes you every morning.",
  "date": "5 November 2026",
  "body": """
<p>Most small businesses don't have a late-payment problem. They have a visibility problem.</p>
<p>The invoice went out on the 3rd. Nobody replied. A fortnight later you're busy, so you tell yourself you'll look at it on Friday. Friday's a delivery day. By the time it reaches the top of your list it's six weeks old and chasing it feels awkward, because you left it so long.</p>
<p>That awkwardness is what costs money. Not the customer.</p>
<h2>Put the list where you'll see it</h2>
<p>You don't need a collections process. You need one list, in one place, that answers a single question: who owes me money and how late is it? If that list lives in three spreadsheets and the back of your head, you will chase the loud customers and forget the quiet ones.</p>
<p>The quiet ones are usually the ones who'd pay the same day if they were asked.</p>
<h2>Make asking cheap</h2>
<p>The second thing that stops people is the wording. Nobody wants to write the message. So write it once, in your own voice, and reuse it. Something short and polite: the invoice number, the amount, the date it was due, and how to pay. No apology and no threat.</p>
<p>In ReplyFlow the Owed and owing page shows every unpaid invoice with the days late, and a button that copies a reminder you can paste into Messenger or an email. That's all it does. It doesn't send anything on your behalf, which is deliberate. A reminder that arrives from you lands differently to one that arrives from a system.</p>
<h2>Check the other side too</h2>
<p>The same page lists what you owe suppliers. Late bills cost you goodwill and sometimes your terms. If you're waiting on a customer and a supplier is waiting on you, seeing both together tells you which call to make first.</p>
<h2>A five-minute habit</h2>
<p>Open the list on Monday morning. Copy three reminders. Send them. When a payment lands, record it on the order and the invoice drops off the list. That's the whole routine.</p>
""",
 },
 {
  "slug": "staff-expenses-without-the-carrier-bag",
  "title": "Staff expenses without the carrier bag of receipts",
  "desc": "How to let staff claim what they've spent without losing receipts, paying twice or finding out at month end.",
  "date": "5 November 2026",
  "body": """
<p>Somewhere in your business there's a carrier bag of receipts. It might be a drawer, an envelope or a photo roll. It gets sorted once a month, in a hurry, and something always goes missing.</p>
<p>The cost isn't the lost receipt. It's the argument three weeks later about whether you've already paid it.</p>
<h2>Claim at the moment of spending</h2>
<p>The fix is boring: make it easier to claim straight away than to claim later. A phone, a photo of the receipt, an amount, a category. Thirty seconds, while the person is still standing in the car park.</p>
<p>That means each person needs their own way in. We give each staff member a sign-in the administrator creates in person, with a one-time password. No invitation email to go astray, and they only see their own claims.</p>
<h2>Catch the repeat before you pay it</h2>
<p>Honest people claim twice. They forget they sent it, or they send the photo and the screenshot. So the app compares each new claim with the old ones. The same receipt photo, or the same person claiming the same amount within three days, gets a flag. A flag isn't a block. You see it, you decide, and the button says Approve anyway so you know what you're doing.</p>
<h2>Know when it arrives</h2>
<p>You get a notification when a claim comes in, and a batch of claims is one notification, not forty. Approve or refuse with a reason the person can read, then mark it paid back when the money has gone.</p>
<h2>What it won't do</h2>
<p>It doesn't decide what's a legitimate business expense. That's your call and your accountant's. It makes sure you're deciding with the receipt in front of you.</p>
""",
 },
 {
  "slug": "your-bank-balance-is-a-forecast",
  "title": "Your bank balance is a forecast, not a number",
  "desc": "Why the balance in your banking app tells you less than you think, and what to look at instead.",
  "date": "5 November 2026",
  "body": """
<p>The number in your banking app is the least useful figure in your business. It tells you where you are. It says nothing about next Thursday.</p>
<p>Thursday is when the van insurance goes out, rent leaves on the 1st, and the customer who owes you £1,200 has still not paid. The balance looks fine on Wednesday. It doesn't on Friday.</p>
<h2>Three things move the line</h2>
<p>Money you're owed and expect to land. Bills and regular payments that will leave. Planned money, like a craft fair or a retainer, that hasn't happened yet. Put those on a calendar against today's balance and you get a line, not a number.</p>
<p>If the line goes below zero, you want to know which day. Then you have options. Chase the customer. Move a payment. Ask a supplier for another week. None of that is possible once you're already overdrawn.</p>
<h2>Be honest about late customers</h2>
<p>A customer who's already late won't magically pay today. In ReplyFlow you choose when to assume they pay: in a week, a fortnight, a month, or not at all. If you pick not at all, the page tells you how much it left out. You can also leave out any single line you don't trust, and put it back later.</p>
<h2>Don't count the same money twice</h2>
<p>A repeating retainer can show up as planned income and as an invoice. Link them, and once the invoice is issued that month's planned entry drops out of the forecast. The money's counted through the invoice instead.</p>
<h2>It's a guide</h2>
<p>It starts from the balance you type in, and it says how old that is. It's only as good as what you've recorded. But a rough picture of the next month beats a precise picture of this morning.</p>
""",
 },
]

# index
items = "\n".join(f"""<li><h2><a class="title" href="blog/{p['slug']}">{html.escape(p['title'])}</a></h2><p class="muted" style="margin:0">{html.escape(p['desc'])}</p><span class="meta" style="margin:0">{p['date']}</span></li>""" for p in POSTS)
blog = f"""
    <section class="hero">
      <h1>Notes on running a small business</h1>
      <p class="lede">Practical pieces on getting paid, looking after staff and seeing what's coming.</p>
    </section>
    <ul class="post-list narrow" style="margin-left:0">
{items}
    </ul>
"""
write("blog/index.html", page("blog", "Blog · ReplyFlow", "Practical notes on getting paid, staff expenses and cash flow for small UK businesses.", blog, depth=1))

for p in POSTS:
    body = f"""
    <article class="post">
      <h1>{html.escape(p['title'])}</h1>
      <p class="meta">{p['date']} · The ReplyFlow team</p>
{p['body']}
      <div class="postfoot">
        <p><strong>Want this in your own business?</strong></p>
        <p class="muted">Book a short demo and we will show you how it works with real screens.</p>
        <a class="btn" href="../contact">Book a demo</a>
      </div>
    </article>
"""
    write(f"blog/{p['slug']}.html", page("blog-" + p["slug"], p["title"] + " · ReplyFlow", p["desc"], body, depth=1))

# ---------------------------------------------------------------- Not found
missing = """
    <section class="hero">
      <h1>That page is not here</h1>
      <p class="lede">The link may be old, or mistyped. Try one of these.</p>
      <div class="actions">
        <a class="btn" href="/">Home</a>
        <a class="btn quiet" href="/features">Features</a>
        <a class="btn quiet" href="/blog">Blog</a>
      </div>
    </section>
"""
write("404.html", page("404", "Page not found · ReplyFlow", "That page could not be found.", missing))
print("built")
