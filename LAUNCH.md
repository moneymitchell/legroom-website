# LAUNCH.md

The runbook for putting legroomcompany.com live. Follow it in order. Every step says what it is, why it matters, exactly what to click, and how to check it worked.

Budget about two hours, most of it waiting for DNS and for Resend to verify.

**Before you start, have open:** the Cloudflare dashboard, a terminal in this repo, and the Google account that owns jd@legroomcompany.com.

---

## 0. Deploy once, before any of the integrations

Get the site up first. Every integration below is optional to the page rendering, by design.

```bash
npm install
npm run build
npx wrangler login          # opens a browser, authorises Wrangler
```

Create the two storage bindings and note the ids they print:

```bash
npx wrangler d1 create legroom-leads
npx wrangler kv namespace create LEAD_RATE
```

Open `wrangler.jsonc` and replace `REPLACE_WITH_D1_DATABASE_ID` and `REPLACE_WITH_KV_NAMESPACE_ID` with those ids. Then:

```bash
npx wrangler d1 migrations apply legroom-leads --remote
npx wrangler deploy
```

**Verify:** Wrangler prints a `legroom-web.<your-subdomain>.workers.dev` URL. Open it. The page should render completely, the buttons should press, and the wordmark band should react to your mouse. The form will not work yet, which is expected.

---

## 1. DNS and the domain

legroomcompany.com is already in Cloudflare, so everything here is in one place.

### 1a. Point the domain at the Worker

Cloudflare dashboard → **Compute → Workers & Pages → legroom-web → Settings → Domains & Routes → Add → Custom Domain**.

Add both, one at a time:

- `legroomcompany.com`
- `www.legroomcompany.com`

Cloudflare creates the DNS records itself. You do not add A or CNAME records by hand.

**Then redirect www to the apex** so there is one canonical address. Dashboard → your domain → **Rules → Redirect Rules → Create rule**:

| Field | Value |
| --- | --- |
| Name | `www to apex` |
| When incoming requests match | Custom filter expression |
| Field / Operator / Value | Hostname / equals / `www.legroomcompany.com` |
| Then | Dynamic redirect |
| Expression | `concat("https://legroomcompany.com", http.request.uri.path)` |
| Status code | 301 |
| Preserve query string | on |

**Verify:** `curl -sI https://www.legroomcompany.com | head -3` returns `301` with `location: https://legroomcompany.com/`. And `https://legroomcompany.com` returns 200.

### 1b. Email Routing, so hello@ reaches your Gmail

The site prints `hello@legroomcompany.com`. It has to go somewhere.

Dashboard → **Compute → Email Service → Email Routing → Onboard Domain**. Then **Routing rules → Create address**:

- Custom address: `hello@legroomcompany.com`
- Action: Send to an email
- Destination: your Gmail address

Cloudflare emails that Gmail address a verification link. Click it.

Cloudflare adds three records automatically: MX records for inbound mail, an SPF TXT, and a DKIM TXT. Leave them alone.

**Verify:** send an email from your phone to hello@legroomcompany.com. It should land in Gmail within a minute.

### 1c. Resend sending records

Resend sends *outbound* mail; Cloudflare Email Routing handles *inbound*. They do not conflict, because they use different record names. Resend signs from the `send` subdomain, which is also why the next section uses a subdomain sender.

Do this after you create the Resend domain in step 4 — Resend generates the values. The records are:

| Type | Name | Value | Priority | Proxy |
| --- | --- | --- | --- | --- |
| MX | `send` | the `feedback-smtp.*.amazonses.com` host Resend shows | 10 | DNS only |
| TXT | `send` | the `v=spf1 include:amazonses.com ~all` string Resend shows | | |
| TXT | `resend._domainkey` | the long DKIM key Resend shows | | DNS only |

Paste only the short name (`send`, not `send.legroomcompany.com`). Cloudflare appends the domain. **Proxy must be off (grey cloud) on all of them.**

### 1d. DMARC

DMARC tells receiving servers what to do with mail that fails SPF and DKIM, and gives you reports. Start in monitor mode so nothing legitimate gets blocked while you are still setting up.

Add a TXT record:

| Field | Value |
| --- | --- |
| Type | TXT |
| Name | `_dmarc` |
| Content | `v=DMARC1; p=none; rua=mailto:dmarc@legroomcompany.com; fo=1; adkim=r; aspf=r` |

Then add `dmarc@legroomcompany.com` as another Email Routing address pointing at your Gmail, so the reports arrive somewhere.

**When to tighten it.** Leave `p=none` for two weeks. Read the reports: they are XML, and [dmarcian's free report viewer](https://dmarcian.com) will read them for you. Once every legitimate sender you see is passing (that will be Resend and Google), move to `p=quarantine; pct=100`. After another month clean, `p=reject`. Do not jump straight to reject; if the alignment is wrong your own confirmation emails go to spam and you will not know why.

---

## 2. Secrets

Two, both set through Wrangler. Neither ever goes in the repo.

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put RESEND_API_KEY
```

Each prompts for the value and stores it encrypted on Cloudflare. Get the values in steps 4 and 5.

The non-secret values live in `wrangler.jsonc` under `vars`. After Cal.com exists, set `CAL_LINK` there to the full booking URL, which is what the confirmation email sends people to.

Two more are **build-time** and belong in `.env.local` for local work and in the Cloudflare build environment for deploys:

```
PUBLIC_CAL_LINK=legroom/breakdown
PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAA...
```

These are public by design: they are compiled into the HTML and visible in view-source. That is correct for both.

| Name | Where it goes | Where it comes from |
| --- | --- | --- |
| `TURNSTILE_SECRET_KEY` | Wrangler secret | Turnstile dashboard (step 5) |
| `RESEND_API_KEY` | Wrangler secret | Resend dashboard (step 4) |
| `CAL_LINK` | `wrangler.jsonc` vars | Cal.com (step 3) |
| `NOTIFY_TO` | `wrangler.jsonc` vars | already `jd@legroomcompany.com` |
| `MAIL_FROM` | `wrangler.jsonc` vars | see step 4 |
| `PUBLIC_CAL_LINK` | build env | Cal.com (step 3) |
| `PUBLIC_TURNSTILE_SITE_KEY` | build env | Turnstile (step 5) |

---

## 3. Cal.com

The whole site funnels to one thing: a 45-minute breakdown. This is that thing.

1. Sign up at cal.com. Take the username `legroom` if it is free.
2. **Event Types → New**:
   - Title: `The free breakdown`
   - URL: `breakdown` (so the link is `cal.com/legroom/breakdown`)
   - Duration: **45 minutes**
   - Description: paste the offer language from the site so the booking page matches: *Forty-five minutes on how work actually moves through your business. We size what it's costing you, then hand you the two things worth automating first, with the hours and dollars attached. No pitch.*
3. **Availability**: set real hours. Two things that matter more than they sound:
   - **Minimum notice: 12 hours.** Without it someone books you for 20 minutes from now.
   - **Buffer after: 15 minutes.** You will want to write the notes up while they are fresh.
   - **Limit: 2 per day, 6 per week.** You take two builds a month; you do not need forty calls.
4. **Apps → Google Calendar → Install**, and connect the jd@legroomcompany.com calendar. Set it as both the "check for conflicts" calendar and the "add bookings to" calendar. Without this you will double-book yourself.
5. **Event Type → Advanced → Booking questions**: add one required question, *What part of the week keeps disappearing?* You will walk into every call already knowing the answer.
6. **Workflows → New**: "Reminder", email to attendee, 24 hours before. Then a second, SMS to attendee, 1 hour before. SMS reminders are the single biggest no-show reducer.
7. Copy the booking link.

Then set it in two places:

```bash
# build-time, so the buttons point at it
echo 'PUBLIC_CAL_LINK=legroom/breakdown' >> .env.local
```

and in `wrangler.jsonc`, `vars.CAL_LINK` → `https://cal.com/legroom/breakdown`, so the confirmation email carries it.

```bash
npm run build && npx wrangler deploy
```

**Verify:** click "Book a free breakdown" on the live site. The Cal modal should open over the page. Book a slot with a personal email address. Check that it lands on the Google Calendar and that you and the test address both get the confirmation.

---

## 4. Resend

Transactional email. Free tier is 3,000 a month and **100 a day**. The daily cap is the real ceiling; if a day ever gets busy, leads still land in the database and only the emails stop.

1. Sign up at resend.com.
2. **Domains → Add Domain**: enter `legroomcompany.com`. Choose the region closest to you.
3. Resend shows three DNS records. Add them in Cloudflare exactly as in step 1c, with proxy off.
4. Click **Verify**. It usually takes a few minutes. Cloudflare DNS is fast; if it sits on "pending" for more than an hour, check you pasted the short names.
5. **API Keys → Create API Key**. Permission: **Sending access** only, not full access. Copy it once; you cannot see it again.
6. `npx wrangler secret put RESEND_API_KEY` and paste it.
7. Sender identity: because the records live on the `send` subdomain, set `MAIL_FROM` in `wrangler.jsonc` to:
   ```
   "MAIL_FROM": "Legroom <hello@send.legroomcompany.com>"
   ```
   The Worker sets `reply_to` to the submitter's address on your notification, so replying in Gmail goes straight to them.
8. `npx wrangler deploy`.

**Verify:** submit the form on the live site with a real address. You should get a notification, and that address should get the confirmation with the booking link. Then check the row landed:

```bash
npx wrangler d1 execute legroom-leads --remote \
  --command "SELECT created_at, source, email FROM leads ORDER BY created_at DESC LIMIT 5"
```

---

## 5. Turnstile

Cloudflare's captcha. Free, and it does not make people identify traffic lights.

1. Dashboard → **Turnstile → Add widget**.
   - Name: `legroom-web`
   - Hostnames: `legroomcompany.com`, `www.legroomcompany.com`, and `localhost` for testing
   - Widget mode: **Managed**. It shows a checkbox only when Cloudflare is unsure, which for your traffic will be almost never. Invisible mode gives you no way to recover a false positive; non-interactive is stricter than you need.
2. Copy the **Site Key** (starts `0x4AAAAAAA`) into `.env.local` as `PUBLIC_TURNSTILE_SITE_KEY`, and into the Cloudflare build environment variables if you wire up Workers Builds.
3. Copy the **Secret Key** into `npx wrangler secret put TURNSTILE_SECRET_KEY`.
4. `npm run build && npx wrangler deploy`.

The widget script is only fetched when someone first touches a form, so it costs nothing on page load.

**Verify:** submit the form again. It should still go through. Then check the Turnstile dashboard: the widget should show one solved challenge.

---

## 6. Google Search Console

1. Go to search.google.com/search-console → **Add property → Domain** (the left option, not URL prefix). Domain properties cover www, non-www, http and https in one go, which is what you want.
2. Enter `legroomcompany.com`. Google gives you a TXT record.
3. In Cloudflare DNS, add it: Type `TXT`, Name `@`, Content the `google-site-verification=...` string.
4. Back in Search Console, click **Verify**. With Cloudflare DNS this usually works on the first try.
5. **Sitemaps → Add a new sitemap** → enter `sitemap.xml` → Submit.
6. **URL Inspection** → paste `https://legroomcompany.com/` → **Request Indexing**.

**Verify:** within a few days, Coverage should show 2 valid pages (`/` and `/contact`). `/thanks` and `/404` are deliberately `noindex`.

---

## 7. Bing Webmaster Tools

Two minutes, and Bing feeds ChatGPT search and Copilot.

1. bing.com/webmasters → **Import from Google Search Console** → authorise → pick the property.
2. It brings the sitemap across with it.

Worth doing. Nothing else in this category is.

---

## 8. GA4 and Google Tag Manager

Current practice, 2026: one GTM web container, GA4 configured inside it, **Consent Mode v2 initialised before any tag fires**.

### 8a. Create the containers

1. tagmanager.google.com → **Create Account**: account `Legroom`, container `legroomcompany.com`, platform **Web**. Note the `GTM-XXXXXXX` id.
2. analytics.google.com → **Admin → Create Property**: `Legroom`, your timezone, USD. Create a **Web** data stream for `https://legroomcompany.com`. Note the `G-XXXXXXXX` id.

### 8b. Consent Mode v2, before anything else

In GTM, create a tag that runs first:

- **Tag type:** Custom HTML
- **Name:** `Consent Mode default`
- **Trigger:** Consent Initialization - All Pages (this trigger exists specifically to run before everything)
- **HTML:**
  ```html
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'granted',
      functionality_storage: 'granted',
      security_storage: 'granted',
      wait_for_update: 500
    });
  </script>
  ```

That denies everything advertising-related by default and allows analytics. Which brings us to the banner question.

### 8c. Do you need a cookie banner? No.

Plainly: not for this site, as it stands.

You are a Washington business selling to US small businesses in youth sports and home services. You run no advertising pixels, no remarketing, and no cross-site tracking. GDPR and the UK rules are what force a consent banner, and they apply to people in the EU and UK. Your ICP is not there, and a banner on a page whose whole argument is "we remove the friction" is a bad first impression.

What makes that true rather than wishful: the Consent Mode defaults above deny all advertising storage, so even an EU visitor gets no ad cookies. GA4 with `analytics_storage` granted sets a first-party analytics cookie, which is the low-risk end of this.

**Revisit it when any of these change:** you start running Meta or LinkedIn ads and add their pixels; you start selling into the EU or UK; or California's rules start applying to you (CCPA kicks in above roughly \$25M revenue or 100,000 consumers, so not soon). At that point add a banner and switch `analytics_storage` to `denied` by default.

### 8d. GA4 through GTM

1. GTM → **Tags → New → Google Tag**.
   - Tag ID: your `G-XXXXXXXX`
   - Trigger: **Initialization - All Pages**
2. **Admin → Install Google Tag Manager** and copy the two snippets. They go in `src/layouts/Base.astro`: the `<script>` in `<head>`, the `<noscript>` iframe immediately after `<body>`.
3. **The CSP will block it until you allow it.** In `public/_headers`, add `https://www.googletagmanager.com` to `script-src` and `connect-src`, and `https://*.google-analytics.com` to `connect-src`. Deploy and check the browser console for CSP violations before you trust the data.

### 8e. Turn off the enhanced measurement you do not want

GA4 → **Admin → Data Streams → your stream → Enhanced measurement → gear icon**. Turn **off**:

- **Scrolls.** GA4's version fires once at 90% and tells you nothing. The site already pushes its own scroll depth at four thresholds.
- **Outbound clicks.** Your only outbound link is Cal.com, and you are tracking that deliberately.
- **Site search**, **Video engagement**, **File downloads.** None of these exist on the page.

Leave **Page views** and **Form interactions** on.

### 8f. The dataLayer pushes already in the site

These are wired and firing. You only need to create the triggers.

| Event name | Fires when | Payload |
| --- | --- | --- |
| `book_call_click` | any "Book" CTA is clicked | `{ location: 'nav' \| 'nav-mobile' \| 'hero-primary' \| 'final-primary' }` |
| `form_submit` | the contact form submits | `{ source: 'contact' }` |
| `email_capture` | the inline capture submits | `{ source: 'breakdown' }` |
| `scroll_depth` | 25 / 50 / 75 / 100% reached, once each | `{ percent: 25 }` |
| `cal_booking_complete` | Cal.com reports a completed booking | `{}` |

For each, in GTM: **Triggers → New → Custom Event**, event name exactly as above. Then **Tags → New → Google Analytics: GA4 Event**, pointing at your Google Tag, with the event name and the parameter mapped from a Data Layer Variable.

Then mark the conversions: GA4 → **Admin → Events → Mark as key event** for `book_call_click`, `form_submit`, `email_capture`, and `cal_booking_complete`.

`cal_booking_complete` is the one that matters. The other three are leading indicators; that one is the money.

**Verify:** GTM **Preview** mode, walk the page, and watch each event appear. Then GA4 → **Reports → Realtime** and confirm they arrive.

---

## 9. Google Business Profile

**My honest read: create one, but keep it to twenty minutes.**

The case against is real. You are a service-area business with no storefront, your clients come from JD's network rather than from search, and nobody types "AI operations consultant near me". GBP will not be a lead source.

The case for is narrower and still worth it: a verified profile is the strongest entity signal Google accepts for a business name, and "Legroom" is a common English word. Without a profile, searching your own company name is a coin flip against airline seating articles. It also gives you a place to collect reviews, and a Legroom review is more useful on Google than anywhere else when a prospect checks you out after a call.

If you do it:

1. business.google.com → **Add business**.
2. Name: **Legroom** exactly. Not "Legroom Company", not "Legroom AI Automation". Keyword-stuffed names get suspended and the suspension is painful to appeal.
3. Category: primary **Business management consultant**. Secondary: **Software company**, **Marketing consultant**.
4. **Hide your address.** Choose "I deliver goods and services to my customers" and set the service area to Washington State, or the specific counties you work in.
5. Verification will most likely be video: a recorded walkthrough showing your workspace, evidence of the business, and you. Have a business card, a laptop with the site open, and any paperwork ready. It takes about five minutes.
6. Description, 750 characters. Reuse the site's language rather than inventing new copy: *Legroom finds the work eating a business's week and builds the systems that do it instead. We start with a free 45-minute breakdown: how work actually moves through your business, what the manual version costs in hours and dollars, and the two automations worth building first. Builds are quoted flat. Youth sports and home services.*
7. Photos: the logo (use `public/icon-512.png`), a cover image (use `public/og-image.jpg`), and two or three real photos of you working. Stock photography on a GBP is obvious and it cheapens the listing.
8. Website: `https://legroomcompany.com`. Add the UTM if you want the attribution: `?utm_source=google&utm_medium=organic&utm_campaign=gbp`.
9. First review: after your next delivered build, ask that client directly with the short link from the dashboard. One real review beats ten thin ones and gets you past the "no reviews" look.

Finally, add the profile URL to the site's structured data so the entity and the profile point at each other. In `src/layouts/Base.astro`, add `sameAs: ["<your GBP share URL>"]` to the Organization node.

---

## 10. Post-launch checks, the day after

Twenty minutes. Do them on the live domain, not the workers.dev URL.

1. **Real device.** Open the site on your actual phone, on cellular, not wifi. Press the yellow button and feel whether it bottoms out. Scroll the founder cards with your thumb. Open the menu.
2. **Form, end to end, with a real inbox.** Submit from your phone with a personal address. Confirm: notification arrives, confirmation arrives, the booking link in it works, and the row is in D1.
3. **Form with JavaScript off.** In Safari, Settings → Advanced → turn off JavaScript, or use a browser extension. Submit the contact form. You should land on `/thanks` and the row should still appear. This is the path that proves the form is not a JavaScript toy.
4. **Cal.com, end to end.** Book a real slot from the site. Check the calendar invite, the reminder workflow, and then cancel it.
5. **PageSpeed Insights** on `https://legroomcompany.com`. Field data will be empty at first; the lab numbers should land near the local ones (100 performance, LCP well under 1.5s). If performance has dropped, the usual cause is a newly added third-party script.
6. **Rich Results Test** at search.google.com/test/rich-results. Confirm Organization, ProfessionalService, WebSite and Service are all detected with no errors.
7. **Broken links.** `npx linkinator https://legroomcompany.com --recurse --skip "cal.com|linkedin|instagram"`. The founder and footer social links are still `#` placeholders and will flag; that is the reminder to fill them in.
8. **Security headers.** securityheaders.com on the live URL. Expect A or A+. If CSP shows a violation, it is almost certainly a script you added in step 8 that is not in the allowlist.
9. **The placeholders.** Read the page top to bottom and count the brackets. See below.

---

## 11. Placeholders still waiting on you

These render literally, in brackets, so they are impossible to miss. All live in `src/content/site.ts`.

| Placeholder | Where |
| --- | --- |
| `[School]` | both founder cards |
| `[Last name]` | Sean's surname |
| `[Year]` | Sean, "In the game since" |
| `[Stat]` | Sean, "Best number on the board" |
| `[Focus]` | Sean, "Home field" |
| `[Bio to confirm.]` | Sean's bio, first sentence |
| `[Pull quote to confirm — one line, in his own words.]` | Sean's quote |
| `href="#"` | founder social links and the two footer social links |
| Hero illustration | the measured-drawing panel stands on its own until the figure artwork arrives |

Nothing else on the page is provisional.

---

## Rollback

If a deploy goes wrong:

```bash
npx wrangler deployments list
npx wrangler rollback [deployment-id]
```

That is instant and does not touch D1, so no leads are lost.
