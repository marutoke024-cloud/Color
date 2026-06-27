# Onyx Folio

A quiet gallery for **color studies**. Turn a photograph into a stylised,
illustration-like cut-out, pull a five-colour palette from it, and keep the
finished study in a folio you spin through on a **3D cylinder carousel**.

The whole experience is deliberately **achromatic** — an off-white paper
surface, neutral-grey UI, serif wordmark — so the only real colour on screen
is the artwork itself. No warm beige, no tinted chrome to bias how you read a
palette.

## Features

- **3D cylinder gallery** (`react-three-fiber` + `three`) — saved studies sit
  on the wall of a rotating cylinder. Scroll the wheel or drag/swipe to turn it;
  the front card is large and crisp while cards rotating away shrink and fade
  with perspective. A serif wordmark sits fixed behind the cards.
  - Sparse galleries (1–8 studies) are handled gracefully: the cards spread
    across a partial arc and rotation is clamped so you never spin into an empty
    void.
  - Card textures load lazily, one per card.
- **Create a study** — drop in a photo and it's processed entirely in the
  browser:
  - *Stylise* — box-blur + posterise + Sobel edge inking for a flattened,
    illustration-like cut-out, with adjustable strength and saturation.
  - *Palette* — a five-colour palette extracted with a median-cut quantiser.
  - *Composite* — the artwork with the five colours laid in as a band beneath
    it, saved as a single image.
- **Detail page** — the composite, the palette as copyable HEX codes, the
  original source photograph, and the creation date. Studies can be deleted.
- **Local-first** — every study is stored in **IndexedDB** on the device. No
  account, no upload, nothing leaves the browser.

## Stack

- React 18 + TypeScript + Vite
- `@react-three/fiber` / `@react-three/drei` / `three` for the WebGL cylinder
- `idb` for IndexedDB
- `react-router-dom` (hash routing)
- Canvas 2D for all image processing (no ML model, no network)

## Develop

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build
npm run preview  # preview the production build
```

## A note on "cut-out"

The stylisation is a fast, fully client-side canvas effect (smoothing +
posterisation + edge inking) rather than ML subject segmentation, so it works
offline and instantly on any photo. The "Load sample set" button on an empty
gallery seeds a handful of procedurally generated studies so you can see the
carousel immediately.
