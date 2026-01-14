# Bio.Link Clone

A modern, fast, and fully responsive Bio Link Builder Website.

## Features
- **Authentication**: Sign up with Email/OTP (Supabase).
- **Dashboard**: Manage links, profile details, and themes.
- **Preview**: Real-time mobile preview.
- **Themes**: Dark, Light, and Gradient themes.
- **Public Profile**: Shareable link `/?u=username` (Local) or `/username` (Production).

## Setup
1. **Running Locally**:
   - `npx serve .`
   - Open `http://localhost:3000`

2. **Backend**:
   - **Supabase**: Project "bio" is already connected.
   - **Tables**: `profiles`, `links` created with RLS policies.

3. **N8N Image Upload**:
   - The app expects an N8N webhook for handling image uploads.
   - Edit `js/app.js` and replace `YOUR_N8N_WEBHOOK_URL` with your actual N8N webhook URL.
   - Ensure the N8N workflow accepts a file and returns `{"url": "https://dropbox..."}`.

4. **Production**:
   - For `bio.domain.com/username` routing, configure your hosting provider (Vercel/Netlify) to rewrite `/*` to `index.html`.
   - The frontend handles the routing logic.
