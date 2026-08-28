# Forma Labs

Forma Labs is an engineering workspace for tracing product dependencies, evaluating proposed changes, validating candidate revisions, and keeping the human approval that creates a revision explicit.

## Concrete loop

The payload walkthrough executes this sequence:

1. Observe the requested change and attached context.
2. Understand fixed and mutable constraints.
3. Trace affected product artifacts.
4. Propose the smallest coherent candidate.
5. Validate the candidate against the canonical Product schema and semantic gates.
6. Pause for human approval.
7. Commit the accepted Product candidate as Rev D.
8. Retain the evidence, tradeoff, hashes, and affected artifacts as an execution receipt.

Model output is advisory. It cannot change protected artifact IDs, pass a semantic gate, approve a change, or create a revision.

## Local development

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The app runs in explicit deterministic mode without credentials. To test Hugging Face Inference Providers, set `FORMA_INFERENCE_PROVIDER=huggingface` and add a server-only `HF_TOKEN` with **Make calls to Inference Providers** permission.

## Verification

```bash
npm run lint
npm run build
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python product_pipeline/validate.py --no-quarantine product_pipeline/dataset/products/*.json
```

## Vercel

The committed `vercel.json` selects the Hugging Face provider and leaves deterministic fallback enabled. Add `HF_TOKEN` to the Vercel project's Production, Preview, and Development environments, then redeploy. Git-connected Vercel projects will build each pushed branch as a preview and deploy the production branch automatically.

Never commit `.env.local`, provider tokens, or Vercel credentials.
