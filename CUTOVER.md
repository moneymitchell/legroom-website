# CUTOVER.md

Moving `legroomcompany.com` off the coming soon page and onto the new site.

**Nothing in this file has been run.** The coming soon page stays up until JD
says otherwise, after reading the QA results.

Read the whole thing once before starting. The cutover itself is about two
minutes. The rollback is under one.

---

## 0. STOP. Do this before anything else, cutover or not.

**Cloudflare Workers Builds is connected to the coming soon Worker and is
watching this repository.**

`legroom-website` is the Worker serving `legroomcompany.com` and `www`. In the
Cloudflare dashboard it shows a GitHub connection to
`moneymitchell/legroom-website`, which is THIS repository, and its build log
carries commit messages from this project. Every push here queues a build that
would deploy this site onto the apex.

Those builds have been failing, which is the only reason the coming soon page
is still up. A build that starts succeeding takes production with it, at a
moment nobody chose, with no review.

`scripts/deploy-guard.mjs` cannot help here. It runs around `npm run deploy` on
a laptop. Workers Builds never calls it.

**Fix, and it is JD's, in the dashboard:**

1. Workers & Pages → **legroom-website** → Settings → **Build**
2. **Disconnect** the GitHub repository
3. Confirm the Worker still shows its last deployment from `Upload`, dated
   2026-09-08, and that `https://legroomcompany.com` still serves the coming
   soon page

Do this whether or not the cutover happens tonight.

---

## 1. Where the rollback lives

**Local:** `~/Desktop/Legroom/website` — the coming soon page, plain HTML,
`index.html` plus `assets/`.

**Remote:** branch **`coming-soon`** on `moneymitchell/legroom-website`, at
commit `299d788`.

That branch was created on 2026-09-12 for exactly this reason. Both projects
were pushing to the same GitHub repository, and this project's history had
already replaced the coming soon page's on `main`. Before that branch existed,
the only copy of the live production page was one laptop.

**The deployed Worker is a separate thing from the source.** `legroom-website`
currently runs a version uploaded on 2026-09-08 and is unaffected by anything
in git. Rolling back does not require the source at all, see section 4.

---

## 2. Before you start

Everything here should already be true. Check, do not assume.

```bash
cd ~/Desktop/Legroom/legroom-web
npm run typecheck && npm run check && npm run build && npm test && npm run test:pixels
```

- [ ] Workers Builds disconnected from `legroom-website`, per section 0
- [ ] All gates green, and CI green on `main`
- [ ] `npm run leads` reviewed, and you accept that the test rows are about to
      be deleted in step 3.2
- [ ] Both founder cards correct. **Sean's degree is still unverified**: it was
      taken from his own bio because LinkedIn answers automated requests with
      HTTP 999. Confirm with Sean before the world sees it
- [ ] You have opened `https://preview.legroomcompany.com` on a real phone and
      a real desktop and used it yourself
- [ ] A booking made on preview arrived in your calendar, and both emails and
      the text landed

---

## 3. The cutover

### 3.1 Point the apex at the new Worker

Add the two routes to `wrangler.jsonc`, alongside the preview one:

```jsonc
"routes": [
  { "pattern": "preview.legroomcompany.com", "custom_domain": true },
  { "pattern": "legroomcompany.com", "custom_domain": true },
  { "pattern": "www.legroomcompany.com", "custom_domain": true }
],
```

**`scripts/deploy-guard.mjs` will refuse this deploy.** That is the guard doing
its job: it blocks any config carrying an apex route, because until this moment
that always meant a mistake. Cutover is the one time it is intentional.

Edit `PRODUCTION_HOSTS` in `scripts/deploy-guard.mjs` to an empty array in the
same commit, with a comment saying the apex moved on purpose and the date. Do
not comment the guard out and do not pass a flag around it: leave a record in
the diff of the one time this was deliberate.

Cloudflare will refuse the custom domain while `legroom-website` still holds
those routes. Remove them first:

Workers & Pages → **legroom-website** → Settings → Domains & Routes → remove
`legroomcompany.com` and `www.legroomcompany.com`.

**The apex is down for the few seconds between removing those routes and the
deploy below landing.** Have the command ready before you remove them.

```bash
cd ~/Desktop/Legroom/legroom-web && npm run deploy
```

### 3.2 Clear the test leads

```bash
cd ~/Desktop/Legroom/legroom-web && npm run leads -- --all --out ~/Desktop/legroom-test-leads.csv
```

Then, once you have that file:

```bash
cd ~/Desktop/Legroom/legroom-web && npx wrangler d1 execute legroom-leads --remote --command "DELETE FROM leads;"
```

Staging and production share one database on purpose, so that what was tested
is what runs. The cost is that the QA rows are in the table you are about to
launch with. Export first, then empty it.

### 3.3 Turn off the crawl ban

Nothing to do. The ban is decided per hostname in `worker/index.ts`, and
`legroomcompany.com` and `www` are already in `PRODUCTION_HOSTS` there, which
is a different list from the deploy guard's. The moment the apex serves this
Worker it serves without `X-Robots-Tag` and with the real `robots.txt`.

`tests/robots.spec.ts` has asserted both halves of this since R3. **Do not
"simplify" that file.** A crawl ban that leaks to production takes the real
site out of Google for weeks.

### 3.4 Point the monitor at the apex

In `.github/workflows/monitor.yml`:

- Change `TARGET` to `https://legroomcompany.com`
- Delete the `AT CUTOVER` banner at the top
- Delete the `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` repository
  secrets. The apex is public and the service token stops being needed

---

## 4. The first sixty seconds after

```bash
cd ~/Desktop/Legroom/legroom-web && node scripts/deploy-guard.mjs post
```

That now reports rather than gates, since the apex is intentionally ours. Then:

```bash
curl -sSI https://legroomcompany.com | grep -iE "^HTTP|x-robots-tag|content-security-policy"
```

- [ ] **No `X-Robots-Tag` header at all.** If `noindex` is present, roll back now
- [ ] `https://legroomcompany.com/robots.txt` says `Allow: /` and points at the
      real sitemap, not `Disallow: /`
- [ ] `https://www.legroomcompany.com` resolves and serves the site
- [ ] The page loads, the hero measure responds to the cursor, the sticky bar runs
- [ ] Every booking CTA opens Cal.com
- [ ] Submit the contact form with a real address. Row in `npm run leads`, both
      emails, the text
- [ ] `https://legroomcompany.com/definitely-not-a-page` gives the styled 404
- [ ] GA4 Realtime shows you

```bash
cd ~/Desktop/Legroom/legroom-web && npm run qa:live -- --url https://legroomcompany.com
```

---

## 5. Rollback, under two minutes

Do this if the apex is wrong in any way you cannot fix in one edit. Rolling
back is cheap. Debugging in production is not.

**Fastest path, no source needed.** The coming soon Worker still exists and
still has its 2026-09-08 version:

1. Workers & Pages → **legroom-web** → Settings → Domains & Routes → remove
   `legroomcompany.com` and `www.legroomcompany.com`
2. Workers & Pages → **legroom-website** → Settings → Domains & Routes → add
   both back
3. Load `https://legroomcompany.com` and confirm the coming soon page

Then revert the routes out of `wrangler.jsonc` and restore `PRODUCTION_HOSTS`
in the deploy guard, so the repo matches reality again.

**If the coming soon Worker is gone**, rebuild it from source:

```bash
cd ~/Desktop/Legroom/website && npx wrangler deploy --name legroom-website --assets .
```

If that directory is missing, `git clone -b coming-soon https://github.com/moneymitchell/legroom-website.git`.

---

## 6. Within the first day

- **Google Search Console**: add `legroomcompany.com`, verify by DNS TXT in
  Cloudflare, submit `https://legroomcompany.com/sitemap.xml`. Not before
  cutover: the apex serves the coming soon page until then and you would be
  registering the wrong site
- **Bing Webmaster Tools**: import from Search Console, two clicks
- Watch `npm run leads` and GA4 Realtime for the first real submission
- Deliverability: submit once from a Gmail address and once from Outlook, and
  confirm both confirmations land in the inbox rather than Promotions or spam
- Turn `send_page_view` off in GA4 only if you add a second page later

---

## What this does not cover

The apex currently answers on a Worker uploaded by hand on 2026-09-08. After
cutover it answers on a Worker deployed from a laptop. Neither is a pipeline.
Connecting Workers Builds to **`legroom-web`**, with a deploy command that runs
the guard, is worth doing once the dust settles. It is explicitly NOT worth
doing on the day of cutover, and it is the thing that created the hazard in
section 0.
