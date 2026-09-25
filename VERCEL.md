# Deploy the web app to Vercel

This is an Expo / React Native Web single-page app, not a Next.js app. Vercel must build and serve `dist/index.html` and its web assets. Serving the repository root or `index.ts` can produce a file download instead of a website.

The root `vercel.json` now sets the framework to Other, runs `npm ci` and `npm run build`, publishes `dist`, and adds a single-page-app fallback. `npm run build` checks backend configuration then runs `expo export --platform web`. Android/iOS builds are separate.

## Repair the existing Vercel project

1. Commit and push these changes to the Git branch connected to Vercel: `vercel.json`, `package.json`, and `app.json` (plus the documentation and `.gitignore` changes).
2. Open Vercel → your project → Settings → Build and Deployment. Set the **Root Directory** to the repository folder containing `package.json` and `vercel.json` (the repository root for this project). It must not be `src`, `src/backend`, or `dist`.
3. The checked-in configuration supplies these settings. Remove conflicting dashboard overrides if present:

   | Setting | Value |
   | --- | --- |
   | Framework preset | Other |
   | Install command | `npm ci` |
   | Build command | `npm run build` |
   | Output directory | `dist` |
   | Node.js | 24.x, or supported 22.x ≥22.18 |

4. Under Settings → Environment Variables, add these to **Production**, and to **Preview** if you use preview deployments:

   ```dotenv
   EXPO_PUBLIC_APP_MODE=live
   EXPO_PUBLIC_SUPABASE_URL=https://hrcwhzgznzlxbrhocmoi.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_existing_public_publishable_key
   ```

   Use the existing public key from your local `.env.local` or Supabase dashboard. This app reads `EXPO_PUBLIC_*`, not `NEXT_PUBLIC_*`. Do not use Markdown link syntax around the URL. Never put a Supabase service-role key or RevenueCat secret in public variables. Local `.env.local` is ignored by Git and is not automatically uploaded to Vercel.

5. Deploy the **new commit**. Redeploying an old deployment can rebuild its old source without this fix. If necessary, redeploy the new deployment with the build cache disabled. Environment changes also require a new build because Expo embeds public values into the web bundle.
6. The build log should run `expo export --platform web` and finish with `Exported: dist`. Open the new deployment's URL, then your custom domain. In Settings → Domains, confirm your custom domain points to this project's current production deployment.

## Verify

```sh
npm run build
```

The output must contain `dist/index.html` and `dist/_expo/static/js/web/*.js`. Do not upload the source `index.ts`, an Android APK, or an iOS artifact as the website.

For the live URL:

```sh
curl -I https://YOUR-DOMAIN/
```

The final successful response should have an HTML content type and no `Content-Disposition: attachment`. In browser developer tools → Network, the document and its `/_expo/static/js/web/...js` file should both return successfully; the JavaScript request must not return HTML. Refreshing a client-side path should open the app through the SPA fallback. Existing assets are served directly.

If the new `.vercel.app` deployment works but a custom domain still downloads a file, inspect that domain's redirects, proxy/CDN headers and project assignment. Do not globally force every response to `text/html`: that breaks JavaScript and other assets.

After the page opens, configure Supabase Authentication → URL Configuration with the real production website as Site URL and the exact redirects you use, then verify email confirmation. Follow BACKEND.md for SMTP and recovery-code templates. Native store purchases remain unavailable in the browser; PAYMENTS.md describes testing them with native builds.

Reference: [Expo's Vercel deployment configuration](https://docs.expo.dev/guides/publishing-websites/#vercel), [Vercel build settings](https://vercel.com/docs/builds/configure-a-build).
