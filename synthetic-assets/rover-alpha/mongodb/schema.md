# MongoDB collection design

## `artifacts`

One document per graph node: `artifactId`, `artifactType`, `revision`, normalized properties, explicit outgoing/incoming relationships, and `sourceFiles`. Index `artifactId` unique, plus `artifactType/revision`.

## `engineering_documents`

One document per source file: `sourceFile`, linked `artifactIds`, extension, content text, parsed JSON when applicable, and metadata. A text index supports lexical retrieval; `embedding` is reserved for optional local embeddings.

## `relationships`

One document per graph edge with `source`, `target`, and `kind`. Compound source/target indexes support dependency traversal.

## `revisions` and `evaluation_tasks`

Revision lookup and offline agent scoring records. No cloud service is required.
