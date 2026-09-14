-- R5: split the name and capture the website.
-- Applied with: npx wrangler d1 migrations apply legroom-leads --remote
--
-- `name` is KEPT and still written, holding the two parts joined. Everything
-- downstream already reads it: the alert email subject and body, the Sheet
-- row, `npm run leads`. Splitting the column rather than adding beside it
-- would have meant changing all of them at once to gain nothing, and would
-- have left the five existing rows with a null in the column people read.
--
-- `website` is the field that changes what a call is worth. It is the one
-- input the teardown work needs, and the prospect can give it without
-- thinking. Optional on the form: a required field that somebody skips is a
-- lead you never got.

ALTER TABLE leads ADD COLUMN first_name TEXT;
ALTER TABLE leads ADD COLUMN last_name TEXT;
ALTER TABLE leads ADD COLUMN website TEXT;
