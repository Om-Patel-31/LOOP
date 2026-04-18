# Loop

Loop is a full-stack social app for async creativity across time zones. Friends share challenge-based photo posts in equal-access groups with no admin hierarchy.

## Core Product Rules

- No admin role exists.
- No user can remove another user from a group.
- Users cannot leave groups; they can only delete a group.

These rules are enforced in API routes (`405` responses for member removal and leaving).

## Stack

- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express
- Database: MongoDB + Mongoose
- Auth: JWT access + refresh cookie session
- Media upload: client-side encryption + encrypted object storage (S3/GCS)
- Tests: Vitest + Supertest + Testing Library

## Project Structure

- `client` React UI
- `server` Express API

## Setup

### 1) Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 2) Configure server env

```bash
cd server
copy .env.example .env
```

### 3) Run MongoDB

Start a local MongoDB instance on `mongodb://127.0.0.1:27017` or update `MONGO_URI`.

### 4) Start backend

```bash
cd server
npm run dev
```

### 5) Start frontend

```bash
cd client
npm run dev
```

Frontend runs on `http://localhost:5173` and API on `http://localhost:4000`.

## Authentication Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`
- `POST /api/auth/logout`

## API Highlights

- `POST /api/groups` create group
- `POST /api/groups/join` join by invite code
- `PATCH /api/groups/:id/controls` mute/hide/archive group (member-local)
- `DELETE /api/groups/:id` delete group
- `POST /api/groups/:id/challenges` create challenge
- `POST /api/groups/:groupId/challenges/:challengeId/posts` upload encrypted photo response
- `GET /api/posts/:id/media-access` get short-lived encrypted media access
- `POST /api/posts/:id/likes` toggle like
- `POST /api/posts/:id/comments` add comment

## End-to-End Encryption Design (Simplified Initial Implementation)

Loop includes an encryption-ready architecture:

- Each user has a persistent RSA-OAEP key pair whose private key is wrapped with a password-derived AES key.
- Group secrets are generated client-side, wrapped to member public keys, and stored as encrypted envelopes on the server.
- On a fresh device, the user signs in and then unlocks the encrypted private key with their password before group secrets can be recovered.
- Captions/comments are encrypted locally using AES-GCM (`client/src/crypto.ts`).
- Image bytes are encrypted client-side before upload, and decrypted after fetch for display.
- API stores ciphertext + IV metadata (`captionCipherText`, `captionIv`, `comment.cipherText`, `comment.iv`).
- Encrypted media bytes are stored in object storage (`S3` or `GCS`) through a provider abstraction.

`STORAGE_PROVIDER=memory` is supported for local development/tests.

## Tests

Backend integration tests:

```bash
cd server
npm test
```

Frontend component tests:

```bash
cd client
npm test
```

## Seed Demo Data

```bash
cd server
npm run seed
```

Creates:

- Demo users: `alex@loop.dev`, `mira@loop.dev` (password `password123`)
- One shared group, one challenge, and one encrypted-style demo post

## Notes on Async Interaction

Posts, likes, and comments are designed for asynchronous use across time zones and are shown in chronological feed order.
