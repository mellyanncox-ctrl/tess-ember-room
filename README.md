# The Ember Room — website preview

Preview build of the new website for Tess Fowler, The Ember Room (Norwood, Adelaide), by The Service Edit.

- Live preview: https://tess.theserviceedit.com
- Static HTML/CSS/JS, no build step. Pages are plain `.html` files; shared styles in `assets/styles.css`, behaviour in `assets/site.js`.
- **Preview only:** every page is `noindex` and `robots.txt` blocks crawlers, so this draft never competes with tessfowler.com.au in search. Remove both before going live on her real domain.
- Text marked with a dashed outline (`mark.confirm`) is a placeholder Tess must confirm before launch.

## How the site is built (page builder)

- Every page lives in `pages/*.md` as a list of **sections** in its front matter. The layout `_layouts/page.html` renders each section with a block template from `_includes/blocks/`.
- Block types: `home_hero`, `page_hero`, `panel` (stone, charcoal, plum, photo, closing), `numbered`, `tabs`, `prose` (text, rows of prices/options, short Q&As), `story`, `faq`, `booking`, `journal_card`, `custom`.
- Shared parts: `_includes/header.html` and `_includes/footer.html`, driven by `_data/site.yml` (menus, footer, sign-up band).
- Prices, days, address and email come from `_data/practice.yml`. In any text, tokens fill in automatically: `[days]`, `[street]`, `[email]`, `[individual-60]`, `[individual-90]`, `[couples-60]`, `[couples-90]`, `[rest-60]`, `[rest-90]`, `[course]`, `[course-sessions]`, `[sessions-value]`.
- Search data per page: `_includes/schema/<page>.html` (set `schema:` in the page). Page-only styles: `_includes/head/<page>.html` (`head_extra:`).
- A page file's name is its web address: `pages/workshops.md` publishes at `/workshops.html`.

## Editing (for Tess)

Tess edits everything in Pages CMS (https://app.pagescms.org), with no code:

- **Pages**: edit any section, add sections from the block list, reorder or delete them, and create new pages.
- **Menu, footer and sign-up**: the top menu, phone menu, footer columns and the free week-one band.
- **Fees, days and contact**: every price, the days, street address and email across the site.
- **Fees & FAQ questions** and **Journal**.

The design (colours, fonts, layout of each block) stays in code, so edits can't break the look.
