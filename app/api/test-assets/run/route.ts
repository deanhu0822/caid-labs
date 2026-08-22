import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { formaInferenceProvider } from '@/lib/forma-inference.server';
import {
  findEngineeringTestAsset,
  validateEngineeringExtraction,
  type EngineeringTestRunResult,
} from '@/lib/engineering-test-assets';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { assetId?: string } | null;
  const asset = findEngineeringTestAsset(body?.assetId ?? '');
  if (!asset) return NextResponse.json({ error: 'Unknown engineering test asset.' }, { status: 400 });

  const corpusRoot = path.join(process.cwd(), 'public', 'engineering-test-assets');
  const sourcePath = path.join(corpusRoot, asset.sourceFile);
  const fixturePath = path.join(corpusRoot, asset.fixtureFile);
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as unknown;
  const status = formaInferenceProvider.getStatus();
  const parseService = status.services.find((service) => service.capability === 'document-parse');

  let structured: unknown = fixture;
  let inferencePerformed = false;
  let resultKind: EngineeringTestRunResult['resultKind'] = 'golden-fixture';
  let runStatus: EngineeringTestRunResult['status'] = 'prototype';
  let statusLabel = 'Prototype fixture';
  let summary = 'Loaded the teammate-provided golden fixture. No model inference was performed.';

  if (parseService?.mode === 'local') {
    const source = await readFile(sourcePath);
    const parsed = await formaInferenceProvider.parseDocument({
      sourceId: asset.id,
      name: asset.sourceFile,
      mimeType: 'application/pdf',
      dataUrl: `data:application/pdf;base64,${source.toString('base64')}`,
    });
    structured = parsed.structured;
    inferencePerformed = parsed.inferencePerformed;
    resultKind = 'model-output';
    runStatus = parsed.mode === 'local' ? 'local' : parsed.mode === 'unavailable' ? 'unavailable' : 'prototype';
    statusLabel = parsed.mode === 'local' ? 'Local inference' : parsed.mode === 'unavailable' ? 'Unavailable' : 'Prototype fallback';
    summary = parsed.summary;
  } else if (parseService?.mode === 'unavailable') {
    structured = null;
    resultKind = 'none';
    runStatus = 'unavailable';
    statusLabel = 'Unavailable';
    summary = 'Nemotron Parse 2.0 is not configured and prototype fallback is disabled.';
  }

  const validation = validateEngineeringExtraction(structured);
  const result: EngineeringTestRunResult = {
    assetId: asset.id,
    status: runStatus,
    statusLabel,
    pipeline: asset.pipeline,
    inferencePerformed,
    resultKind,
    summary,
    structured,
    validation,
    provenance: {
      corpus: 'engineering_test_assets',
      sourceFile: asset.sourceFile,
      sourceSha256: asset.sourceSha256,
      fixtureFile: asset.fixtureFile,
      fixtureSha256: asset.fixtureSha256,
      repositoryPath: `public/engineering-test-assets/${asset.sourceFile}`,
    },
    committable: false,
    commitBlocker: 'This extraction fixture is not a validated canonical Product. Map it to schema.py and pass validate.py before committing to shared Forma state.',
  };
  return NextResponse.json(result);
}
