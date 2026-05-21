# Google Drive Aggregator - Storage API

REST API yang mengagregasi beberapa akun Google Drive menjadi satu storage pool terpadu dengan fitur CDN.

## Features

- **Multi-account aggregation** - Gabungkan beberapa akun Google Drive
- **Smart upload** - Otomatis pilih akun dengan free space terbanyak
- **File operations** - Upload, download, list, delete, search
- **CDN** - Public URL dan signed URL dengan expiry
- **Storage info** - Aggregated dan per-account breakdown
- **API Key auth** - Secure access dengan API key
- **Rate limiting** - Proteksi dari abuse

## Quick Start

### 1. Prerequisites

- Node.js 18+
- Google Cloud Console project dengan Drive API enabled
- OAuth2 credentials (Web application type)

### 2. Setup Google Cloud

1. Buka [Google Cloud Console](https://console.cloud.google.com/)
2. Buat project baru atau pilih existing
3. Enable **Google Drive API**
4. Buat OAuth2 credentials:
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3000/api/accounts/oauth/callback`
5. Catat Client ID dan Client Secret

### 3. Installation

```bash
# Clone & install
cd google-drive-agregator
npm install

# Setup environment
cp .env.example .env
# Edit .env dengan credentials Google OAuth2 kamu

# Setup database
npx prisma db push

# Run development server
npm run dev
```

### 4. Generate API Key

Saat pertama kali (belum ada API key), endpoint ini tidak memerlukan auth:

```bash
curl -X POST http://localhost:3000/api/setup/generate-key \
  -H "Content-Type: application/json" \
  -d '{"name": "My First Key"}'
```

Response:
```json
{
  "data": {
    "apiKey": "gdagg_abc123...",
    "name": "My First Key",
    "message": "Store this API key securely. It cannot be retrieved again."
  }
}
```

### 5. Add Google Drive Account

```bash
# Get OAuth URL
curl http://localhost:3000/api/accounts/oauth/url \
  -H "X-API-Key: gdagg_abc123..."

# Buka URL di browser, login Google, authorize
# Callback akan otomatis menambahkan akun
```

## API Reference

Semua endpoint (kecuali CDN public) memerlukan header:
```
X-API-Key: <your_api_key>
```

### Accounts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/accounts/oauth/url` | Get OAuth2 authorization URL |
| GET | `/api/accounts/oauth/callback` | OAuth2 callback (auto) |
| GET | `/api/accounts` | List all accounts |
| GET | `/api/accounts/:id` | Get account details |
| DELETE | `/api/accounts/:id` | Delete account |
| POST | `/api/accounts/:id/refresh` | Refresh token & storage info |

### Files

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/files/upload` | Upload file (multipart/form-data) |
| GET | `/api/files` | List files (paginated) |
| GET | `/api/files/search?q=keyword` | Search files |
| GET | `/api/files/:id` | Get file metadata |
| GET | `/api/files/:id/download` | Download file |
| DELETE | `/api/files/:id` | Delete file |

**Upload example:**
```bash
curl -X POST http://localhost:3000/api/files/upload \
  -H "X-API-Key: gdagg_abc123..." \
  -F "file=@/path/to/file.pdf" \
  -F "path=/documents"
```

**Search with filters:**
```bash
# By name
curl "http://localhost:3000/api/files/search?q=report" \
  -H "X-API-Key: gdagg_abc123..."

# By mime type
curl "http://localhost:3000/api/files/search?mimeType=application/pdf" \
  -H "X-API-Key: gdagg_abc123..."

# By path
curl "http://localhost:3000/api/files/search?path=/documents" \
  -H "X-API-Key: gdagg_abc123..."
```

### Storage

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/storage` | Aggregated storage info |
| GET | `/api/storage/accounts` | Per-account breakdown |

### CDN

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/files/:id/publish` | Make file public |
| DELETE | `/api/files/:id/publish` | Revoke public access |
| GET | `/api/files/:id/signed-url` | Generate signed URL |
| GET | `/cdn/:slug` | Access public file (no auth) |
| GET | `/cdn/signed/:token` | Access via signed URL (no auth) |

**CDN example:**
```bash
# Publish file
curl -X POST http://localhost:3000/api/files/FILE_ID/publish \
  -H "X-API-Key: gdagg_abc123..."

# Access public file (no auth needed)
curl http://localhost:3000/cdn/abc123slug

# Generate signed URL (expires in 1 hour)
curl http://localhost:3000/api/files/FILE_ID/signed-url \
  -H "X-API-Key: gdagg_abc123..."

# Custom expiry (seconds)
curl "http://localhost:3000/api/files/FILE_ID/signed-url?expiry=7200" \
  -H "X-API-Key: gdagg_abc123..."
```

## Scripts

```bash
npm run dev        # Development with hot reload
npm run build      # Build TypeScript
npm start          # Run production build
npm run db:generate # Regenerate Prisma client
npm run db:push    # Push schema changes to DB
npm run db:studio  # Open Prisma Studio (DB GUI)
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `API_KEY_SECRET` | Secret for hashing API keys | - |
| `SIGNED_URL_SECRET` | Secret for signed URLs | - |
| `SIGNED_URL_EXPIRY` | Default signed URL expiry (seconds) | `3600` |
| `GOOGLE_CLIENT_ID` | Google OAuth2 Client ID | - |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2 Client Secret | - |
| `GOOGLE_REDIRECT_URI` | OAuth2 redirect URI | `http://localhost:3000/api/accounts/oauth/callback` |
| `DATABASE_URL` | SQLite database path | `file:./dev.db` |

## Architecture

```
Client (API Key) → Express API → Google Drive Account Pool
                       ↓              (Account 1, 2, ... N)
                    SQLite DB
                   (metadata)
```

**Upload strategy:** File dikirim ke akun dengan free space terbanyak.

## License

MIT
