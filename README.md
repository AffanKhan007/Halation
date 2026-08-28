# HALATION ✳ — filters as art

A static, privacy-first photo-filter website with a darkroom/film
aesthetic. Runs entirely in the browser — no build step, no dependencies.

## Run locally
python3 -m http.server 8000      (or: npx serve .)
then open http://localhost:8000

## Structure
- *.html ........... site pages (root level = future Next.js routes)
- css/styles.css ... the entire design system (theme, components, pages)
- js/app.js ........ shared interactions + filter engine
- js/ascii.js ...... "The ASCII Press" canvas engine (16 plates)
- js/webgl-ascii.js  "GPU Ultra" WebGL shader plate
- assets/ .......... favicon + future textures / LUTs / og-images
- docs/ ............ project log and notes

## Pages
index · gallery · playground · pricing · about · notes · note · login

## Future Next.js migration
Each root HTML maps to one App Router route; styles.css becomes
globals.css; the playground becomes a client component. Keep the
filter-registry pattern as-is.
