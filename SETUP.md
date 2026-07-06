# Workout Tracker: Setup Guide

This is your workout tracker as a standalone web app. Unlike the Claude artifact
version, the "Generate this week's plan" button works reliably here, because the
call to Claude happens on a small backend that you control rather than inside the
artifact sandbox. Your data is stored in your browser via localStorage, which
loads synchronously and does not have the race condition that was wiping entries.

You do not need to be a developer to follow this. It is copy, paste, and click.

---

## What you need

1. A free GitHub account (to hold the code): https://github.com
2. A free Vercel account (to host the app): https://vercel.com  (sign in with GitHub)
3. An Anthropic API key (separate from your Claude subscription):
   https://console.anthropic.com  ->  API Keys  ->  Create Key
   Note: API usage is billed per use. Generating a workout plan costs a fraction
   of a cent. Add a small amount of credit in the console's Billing section.

---

## Option A: Deploy without installing anything (recommended)

### 1. Put the code on GitHub
- Create a new repository on GitHub (call it `workout-tracker`, keep it private).
- On the repo page, click "uploading an existing file" and drag in every file
  and folder from this project (including the `api` and `src` folders). Commit.

### 2. Import into Vercel
- Go to https://vercel.com/new and select your `workout-tracker` repo.
- Vercel auto-detects Vite. Leave the build settings as they are.
- Before clicking Deploy, expand "Environment Variables" and add:
    Name:  ANTHROPIC_API_KEY
    Value: (paste your Anthropic API key)
- Click Deploy. After a minute you get a live URL like
  `https://workout-tracker-xxxx.vercel.app`.

### 3. Use it
Open the URL on your phone. On iPhone, tap Share -> Add to Home Screen so it
behaves like an app. Go to the "This week" tab and tap "Generate this week's
plan". Done.

---

## Option B: Run and test locally first

You need Node.js 18+ installed (https://nodejs.org).

```bash
npm install
npm i -g vercel      # one time
vercel dev           # serves the frontend AND the /api function together
```

The first `vercel dev` will ask you to link the project and will prompt for
environment variables, or you can create a file named `.env.local` in this
folder containing:

```
ANTHROPIC_API_KEY=your-key-here
```

Then open the local URL it prints (usually http://localhost:3000).

Note: plain `npm run dev` runs only the frontend, so the Generate button will
fail because `/api/generate-plan` is not served. Use `vercel dev` to test
generation locally.

---

## How your data is stored

All logs, plans, personal records, and settings are saved in your browser's
localStorage under keys prefixed with `wt_`. This means:

- Data persists across sessions and reloads on the same browser and device.
- Data is per-browser. If you switch phones or clear browser data, it is gone.
- Use the "Export data" button (in Settings) periodically to save a backup file.
  You can re-import it later or keep it as insurance.

If you later want data to sync across devices, the next step would be adding a
small database (for example Vercel Postgres or Supabase). Ask Claude to help
with that when you are ready; the app is structured so it is a contained change.

---

## Changing the plan rules

The coaching rules and your routine live in `api/generate-plan.js` inside the
`prompt` array. Edit that text to change how plans are generated (for example to
change session length, split style, or goals). Redeploy (Option A: commit to
GitHub and Vercel redeploys automatically; Option B: it hot-reloads).

---

## Security note

Your Anthropic API key is stored only as a Vercel environment variable and is
used only by the backend function. It is never sent to the browser and never
appears in the app code. Keep the key out of any file you commit to GitHub.
