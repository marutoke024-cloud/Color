# Opal Folio

A quiet gallery for **color studies**. Turn a photograph into a stylised,
illustration-like cut-out, pull a five-colour palette from it, and keep the
finished study in a folio you spin through on a **3D cylinder carousel**.

The whole experience is deliberately **achromatic** — an off-white paper
surface, neutral-grey UI, serif wordmark — so the only real colour on screen
is the artwork itself. No warm beige, no tinted chrome to bias how you read a
palette. (The one place colour is allowed is the app icon: a pearly opal with
a soft iridescent play-of-colour.)

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
- **Local-first** — every study is stored in **IndexedDB** on the device.
- **Cloud sync (optional)** — back the folio up to **Firebase Storage** and
  restore it on another device by signing in with the same Google account.

## Stack

- React 18 + TypeScript + Vite
- `@react-three/fiber` / `@react-three/drei` / `three` for the WebGL cylinder
- `idb` for IndexedDB
- `firebase` (Auth + Storage) for optional cloud sync
- `react-router-dom` (hash routing)
- Canvas 2D for all image processing (no ML model, no network)

## Develop

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build
npm run preview  # preview the production build
```

## Cloud sync setup (Firebase)

Cloud sync is opt-in. Works are stored one JSON file each at
`users/{uid}/works/{id}.json` in your Storage bucket (the JSON carries the
palette, dates and the image data URLs).

1. Create a Firebase project and a **Web app** in it.
2. In the console, enable **Authentication → Google** sign-in, and **Storage**.
3. Provide the config to the app, either way:
   - **In-app:** open **Cloud** in the top bar and paste your `firebaseConfig`
     object. It is kept in `localStorage` on that device only — no rebuild
     needed.
   - **At build time:** copy `.env.example` to `.env.local` and fill in the
     `VITE_FIREBASE_*` values.
4. Sign in with Google, then **Back up to cloud**. On another device, connect
   the same project, sign in with the same account, and **Restore from cloud**.

### Storage security rule

Restrict each user to their own folder:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{uid}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

### CORS

Web reads/writes against Storage need the bucket to allow your app's origin.
With the `gsutil` CLI:

```bash
echo '[{"origin":["http://localhost:4173","https://YOUR-DOMAIN"],"method":["GET","PUT","POST"],"responseHeader":["Content-Type"],"maxAgeSeconds":3600}]' > cors.json
gsutil cors set cors.json gs://YOUR-BUCKET.appspot.com
```

Also add your app's domain under **Authentication → Settings → Authorized
domains** for the Google sign-in popup.

## A note on "cut-out"

The stylisation is a fast, fully client-side canvas effect (smoothing +
posterisation + edge inking) rather than ML subject segmentation, so it works
offline and instantly on any photo. The "Load sample set" button on an empty
gallery seeds a handful of procedurally generated studies so you can see the
carousel immediately.
