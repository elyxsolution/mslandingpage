# Malnad Stories — Coming Soon

A scroll-driven 3D "coming soon" landing page for **Malnad Stories** — handcrafted
trekking photo albums from the misty Western Ghats.

Built with vanilla HTML/CSS/JS and [Three.js](https://threejs.org/) (loaded via CDN).
**No build step.** Just open `index.html`.

## Run locally
Either double-click `index.html`, or serve it:

```bash
npx serve .
```

## Deploy (Vercel)
This is a static site, so Vercel needs no configuration:

1. Push this folder to a GitHub repo.
2. Go to [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
3. Framework Preset: **Other** · Build Command: *(empty)* · Output Directory: `./`
4. Deploy.

## Files
- `index.html` — markup + text overlays
- `style.css` — styling, loader, typography
- `app.js` — the Three.js scene (mountains, sunrise, mist, parallax)
- `favicon.svg` — icon

## Customize
- **Contact email:** change `hello@malnadstories.com` in `index.html`.
- **Sky colors / sunrise:** edit the `SKY` keyframes in `app.js`.
- **Mountain ranges:** tweak `RIDGE_COUNT` and `buildRidge()` in `app.js`.
