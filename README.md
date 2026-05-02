A simple [Next.js](https://nextjs.org) chatbot app using OpenAI models with the [AI SDK](https://sdk.vercel.ai).

## Getting Started

### One-time setup

1. Clone this repository.
1. Create an OpenAI API key from your OpenAI dashboard.

### Usage
1. Create a `.env.local` file at the project root and add your OpenAI API key:

   ```bash
   OPENAI_API_KEY=sk-proj-replace_with_your_key
   OPENAI_MODEL_IDS=gpt-5-nano,gpt-5-mini,gpt-4.1-mini
   NEXT_PUBLIC_DEFAULT_MODEL=gpt-5-nano
   ```

   `OPENAI_MODEL_IDS` is a comma-separated list. You can add any OpenAI model id your account can access, including fine-tuned model ids.

1. Install packages with `pnpm i` (or `npm i` or `yarn i`) and run the development server with `pnpm dev`
1. Open http://localhost:3000 to try the chatbot

### CI/CD

Every push to `main` runs `.github/workflows/vercel-production.yml` and deploys the production build to Vercel.

Add these GitHub repository secrets:

```bash
VERCEL_TOKEN=...
VERCEL_ORG_ID=...
VERCEL_PROJECT_ID=...
```

Add these Vercel project environment variables for Production:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL_IDS=gpt-5-nano,gpt-5-mini,gpt-4.1-mini
NEXT_PUBLIC_DEFAULT_MODEL=gpt-5-nano
```

## Authors

This repository is maintained by the [Vercel](https://vercel.com) team and community contributors. 

Contributions are welcome! Feel free to open issues or submit pull requests to enhance functionality or fix bugs.
