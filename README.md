# CloudStore

Distributed cloud file storage for a B.Tech project. It uses React, Express, PostgreSQL, Redis, SHA-256 content-addressing, and three filesystem-backed storage nodes.

## Run it

Copy `.env.example` to `.env`, set a real `JWT_SECRET`, then run `docker compose up --build`. Visit `http://localhost:5173`.

Use Docker Compose v2 (`docker compose`), rather than the retired Python-based `docker-compose` command. If an old container was created by that command and its image has since been removed, recreate the stack with `docker compose up --build --force-recreate`.

The PostgreSQL initialization migration creates logical files and versions, chunks, ordered chunk references, physical replicas, users, shares, nodes, and upload-session tables. Data and storage directories persist in Docker volumes/bind mounts.

## How it works

Files are read in 4 MiB blocks, so the backend does not load an entire large file into memory. Each block is SHA-256 hashed. Redis provides a fast `chunk:<hash>` cache; PostgreSQL is the persistent fallback. A new hash is physically written only once using `node-N/ab/<hash>` paths, then replicated to the two least-used online nodes. Existing hashes receive another logical reference instead.

`file_chunks` preserves the sequence used to stream a reconstructed download. A download tries a primary replica and then another online replica. Mark a storage node `OFFLINE` through the dashboard (or `PATCH /api/storage/nodes/:id`); it genuinely removes that replica from both placement and reads. On deletion, a chunk is removed only after its reference count reaches zero.

Logical bytes, unique physical bytes, savings, deduplication ratio, references, replicas, and node usage are all queried from the real database—nothing is hardcoded.

## APIs

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `POST /api/files/upload` (multipart `file`; optional `fileId` makes a new version)
- `GET /api/files`, `GET /api/files/:id`, `GET /api/files/:id/download`, `DELETE /api/files/:id`
- `POST /api/files/:id/share`, `GET /api/files/shared`
- `GET /api/storage/nodes`, `PATCH /api/storage/nodes/:id`
- `GET /api/analytics/overview`

## Viva-ready algorithms

Chunking and hashing are O(n) in file size with O(chunk-size) working memory. Dedup lookup is expected O(1) with Redis and indexed by PostgreSQL. The least-used-node selector is O(k log k), where k is the number of configured nodes. The physical identity is the hash, separate from file name and logical metadata.
