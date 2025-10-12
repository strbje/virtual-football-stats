This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Current status

The latest commit on the `work` branch updates the draft management forms to rely on the Next.js router instead of full page reloads. After submitting a form, the router refreshes the relevant data and resets the fields so follow-up submissions start from a clean state. You can confirm that these changes are present locally by running `git log -1` and checking that the most recent entry is titled "Use Next router for draft client forms".

### Getting the commit onto GitHub

This repository currently has no Git remotes configured, so local work stays only on your machine until you add a remote and push to it. To publish the latest commit to GitHub:

1. Create a repository on GitHub (or use an existing one) and copy its SSH or HTTPS URL.
2. Add the remote locally:

   ```bash
   git remote add origin <github-url>
   ```

3. Push the `work` branch:

   ```bash
   git push -u origin work
   ```

After the remote is set up once, future pushes only need `git push`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
