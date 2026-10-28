# The Ember Room — website preview

Preview build of the new website for Tess Fowler, The Ember Room (Norwood, Adelaide), by The Service Edit.

- Live preview: https://tess.theserviceedit.com
- Static HTML/CSS/JS, no build step. Pages are plain `.html` files; shared styles in `assets/styles.css`, behaviour in `assets/site.js`.
- **Preview only:** every page is `noindex` and `robots.txt` blocks crawlers, so this draft never competes with tessfowler.com.au in search. Remove both before going live on her real domain.
- Text marked with a dashed outline (`mark.confirm`) is a placeholder Tess must confirm before launch.

## Editing (for Tess)

Tess edits in Pages CMS (https://app.pagescms.org), with no code:

- **Journal**: write, edit and publish posts.
- **Fees, days and contact**: `_data/practice.yml`. Every price, the days, street address and email on every page (and the search data) come from here.
- **Fees & FAQ questions**: `_data/faq.yml`. Add, reword, reorder or remove questions.

Page layouts and the rest of the page text are in the `.html` files and are changed by The Service Edit.
