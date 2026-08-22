import fs from 'node:fs/promises';
import path from 'node:path';
import { MongoClient } from 'mongodb';

const corpusRoot = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const dbName = process.env.MONGODB_DB || 'forma_rover_demo';
const product = JSON.parse(await fs.readFile(path.join(corpusRoot, 'product.json'), 'utf8'));
const readText = async (file) => fs.readFile(path.join(corpusRoot, file), 'utf8');

const artifactDocs = [];
for (const artifact of product.artifacts) {
  const outgoing = product.relationships.filter((edge) => edge.source === artifact.id);
  const incoming = product.relationships.filter((edge) => edge.target === artifact.id);
  artifactDocs.push({ artifactId: artifact.id, artifactType: artifact.category, revision: artifact.revision || product.revision, label: artifact.label, identifier: artifact.identifier, code: artifact.code, sourceFiles: artifact.source_files, relationships: { outgoing, incoming }, metadata: { synthetic: true, productId: product.product_id } });
}

const fileToArtifacts = new Map();
for (const artifact of product.artifacts) for (const file of artifact.source_files) fileToArtifacts.set(file, [...(fileToArtifacts.get(file) || []), artifact.id]);
const documentDocs = [];
for (const [sourceFile, artifactIds] of fileToArtifacts) {
  const absolute = path.join(corpusRoot, sourceFile);
  try {
    const content = await readText(sourceFile);
    const extension = path.extname(sourceFile).toLowerCase();
    documentDocs.push({ sourceFile, artifactIds, extension, content, parsed: extension === '.json' ? JSON.parse(content) : null, embedding: null, metadata: { synthetic: true, productId: product.product_id, revision: product.revision } });
  } catch (error) {
    if (path.extname(absolute).toLowerCase() !== '.xlsx') throw error;
  }
}

const client = new MongoClient(uri);
await client.connect();
try {
  const db = client.db(dbName);
  const artifacts = db.collection('artifacts');
  const documents = db.collection('engineering_documents');
  const edges = db.collection('relationships');
  for (const doc of artifactDocs) await artifacts.updateOne({ artifactId: doc.artifactId }, { $set: doc }, { upsert: true });
  for (const doc of documentDocs) await documents.updateOne({ sourceFile: doc.sourceFile }, { $set: doc }, { upsert: true });
  for (const edge of product.relationships) await edges.updateOne({ edgeId: edge.id }, { $set: { edgeId: edge.id, ...edge, productId: product.product_id, synthetic: true } }, { upsert: true });
  const revisionFiles = ['revisions/rev-a.json','revisions/rev-b.json','revisions/rev-c.json'];
  for (const sourceFile of revisionFiles) { const doc = JSON.parse(await readText(sourceFile)); await db.collection('revisions').updateOne({ productId: product.product_id, revision: doc.revision }, { $set: { productId: product.product_id, sourceFile, ...doc } }, { upsert: true }); }
  const evalFiles = ['evaluation/builder_tasks.json','evaluation/product_questions.json','evaluation/supply_tasks.json'];
  for (const sourceFile of evalFiles) { const doc = JSON.parse(await readText(sourceFile)); for (const task of doc.tasks) await db.collection('evaluation_tasks').updateOne({ taskId: task.id }, { $set: { taskId: task.id, agent: doc.agent, productId: product.product_id, sourceFile, ...task, synthetic: true } }, { upsert: true }); }
  await artifacts.createIndex({ artifactId: 1 }, { unique: true });
  await artifacts.createIndex({ artifactType: 1, revision: 1 });
  await documents.createIndex({ sourceFile: 1 }, { unique: true });
  await documents.createIndex({ artifactIds: 1, extension: 1 });
  await documents.createIndex({ content: 'text' });
  await edges.createIndex({ source: 1, kind: 1 });
  await edges.createIndex({ target: 1, kind: 1 });
  console.log(JSON.stringify({ database: dbName, artifacts: artifactDocs.length, documents: documentDocs.length, relationships: product.relationships.length }, null, 2));
} finally { await client.close(); }
