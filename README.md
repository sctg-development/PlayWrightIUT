![](https://tokei.rs/b1/github/sctg-development/PlayWrightIUT?type=TypeScript&category=code)
![](https://tokei.rs/b1/github/sctg-development/PlayWrightIUT?type=TypeScript&category=comments)  

# PlayWrightIUT

A Cloudflare Worker that automates the export of ICS calendar files from the ADE (Application de Gestion des Emplois du Temps) system for IUT Béthune groups. This project uses Playwright to interact with the ADE web interface, caches the data in Cloudflare D1 and KV, and serves the calendars via a REST API.

## Features

- **Automated ADE Scraping**: Uses Playwright to log into the ADE system and export ICS files for specific groups.
- **Caching**: Stores parsed events in Cloudflare D1 database and uses KV for cache timestamps and rate limiting.
- **Rate Limiting**: Prevents abuse with IP-based rate limiting.
- **Static Landing Page**: Serves a simple animated landing page at the root URL.
- **Monorepo Structure**: Organized with Yarn workspaces for easy development and deployment.

## Screenshot  
<img width="758" height="497" alt="iut" src="https://github.com/user-attachments/assets/46e2276e-73ab-439b-a4e4-415e0bce009f" />

## Architecture

The project is structured as a Yarn monorepo with the following components:

- `apps/cf-playwrightiut-worker/`: The main Cloudflare Worker application.
- `tests/`: Playwright tests for validating the ADE automation logic.

The worker handles two endpoints:
- `/`: Serves a static HTML landing page with IUT branding.
- `/iutrt-bethune?group=<GROUP>`: Returns an ICS calendar file for the specified group.

Data flow:
1. Check rate limit and cache validity.
2. If cache is stale, use Playwright to fetch fresh ICS from ADE.
3. Parse ICS and store events in D1 database.
4. Generate and return ICS from cached data.

## Cache System

The application implements a sophisticated caching strategy to minimize costs associated with Cloudflare's browser rendering service, which is free for up to 10 minutes per day but incurs charges beyond this limit.

### How the Cache Works

**Cache Validity Period**: 12 hours per group
- Each calendar group maintains its own cache timestamp in Cloudflare KV
- Cache keys follow the pattern `last_${group}` (e.g., `last_RT1_A2`)

**Cache Storage**:
- **Cloudflare D1 Database**: Stores parsed calendar events with the following structure:
  - `id`: Auto-incrementing primary key
  - `grp`: Group identifier (e.g., "RT1_A2")
  - `uid`: Event unique identifier
  - `start`/`end`: Event timestamps
  - `summary`/`description`: Event details
- **Cloudflare KV**: Stores cache metadata:
  - Last fetch timestamps per group
  - Group statistics
  - Known groups list

**Cache Logic Flow**:
1. **Cache Check**: When a request arrives for `/iutrt-bethune?group=X`:
   - Retrieve `last_X` timestamp from KV
   - Calculate if 12+ hours have passed since last fetch

2. **Cache Hit**: If cache is still valid (< 12 hours old):
   - Skip browser rendering entirely
   - Generate ICS directly from D1 database
   - Return cached calendar data

3. **Cache Miss**: If cache is stale (≥ 12 hours old):
   - Launch Cloudflare Browser Rendering (Playwright)
   - Navigate to ADE system and export fresh ICS
   - Parse ICS content and store events in D1
   - Update `last_X` timestamp in KV
   - Generate and return new calendar data

### Cost Optimization Benefits

- **Browser Rendering Usage**: Only triggered when cache expires (every 12 hours per group)
- **Free Tier Utilization**: With typical usage patterns, stays well within 10 minutes/day free limit
- **Scalability**: Multiple groups can share the same infrastructure without multiplicative costs
- **Performance**: Cached responses serve near-instantaneously from database

### Cache Invalidation Strategy

- **Time-based**: Automatic expiration after 12 hours
- **Group-specific**: Each group maintains independent cache validity
- **Error-resilient**: Cache misses don't break functionality (fallback to fresh fetch)

## Setup

### Prerequisites

- Node.js (v18 or later)
- Yarn
- Cloudflare account with Workers, D1, and KV enabled

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/sctg-development/PlayWrightIUT
   cd PlayWrightIUT
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

3. Set up environment variables:
   Create a `.env` file in `at root` with:
   ```
   USERNAME=your-ade-username
   PASSWORD=your-ade-password
   DOMAIN=your-domain.com
   ALLOWED_GROUPS="RT1_A1|RT1_A2|RT1_B1|RT1_B2"
   ```

4. Configure Cloudflare resources:
   - Create a D1 database named `iuticsdb`
   - Create a KV namespace named `CACHE`
   - Set up rate limiting (see wrangler.jsonc for configuration)

## Deployment

### Recommended Method: Automated Deployment with GitHub Actions (Best for Beginners)

This is the easiest way to deploy your own worker. You don't need to install anything on your computer except Git.

#### Step 1: Create a Free Cloudflare Account

1. Go to [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
2. Create a free account (you only need an email address)
3. Verify your email address
4. Log in to your Cloudflare dashboard

#### Step 2: Create Required Cloudflare Resources

**Create a D1 Database:**

1. In your Cloudflare dashboard, go to **Workers & Pages** → **D1**
2. Click **"Create database"**
3. Name it exactly: `iuticsdb`
4. Click **"Create"**
5. Once created, click on your database
6. Go to the **"Console"** tab
7. Copy and paste the SQL schema from `apps/cf-playwrightiut-worker/schema.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS events (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       grp TEXT NOT NULL,
       uid TEXT NOT NULL,
       start TEXT NOT NULL,
       end TEXT NOT NULL,
       summary TEXT,
       description TEXT
   );
   CREATE INDEX IF NOT EXISTS idx_grp ON events(grp);
   ```
8. Click **"Execute"**

**Create a KV Namespace:**

1. In your Cloudflare dashboard, go to **Workers & Pages** → **KV**
2. Click **"Create a namespace"**
3. Name it: `iutics_cache` (the name doesn't have to be exact, but it's easier to remember)
4. Click **"Add"**
5. **Important**: Copy the **Namespace ID** (you'll need it later)

**Get Your Cloudflare API Token:**

1. Go to **My Profile** (top right) → **API Tokens**
2. Click **"Create Token"**
3. Use the **"Edit Cloudflare Workers"** template
4. Under **Account Resources**, select your account
5. Under **Zone Resources**, select **All zones** (or specific zones if you prefer)
6. Click **"Continue to summary"**
7. Click **"Create Token"**
8. **Important**: Copy the token immediately (you won't be able to see it again!)

**Get Your Cloudflare Account ID:**

1. Go to **Workers & Pages** → **Overview**
2. On the right side, you'll see **"Account ID"**
3. Click to copy it

#### Step 3: Fork or Clone This Repository to Your GitHub Account

**Option A: Fork (Easier - Keep connection to original repository):**

1. Go to [https://github.com/sctg-development/PlayWrightIUT](https://github.com/sctg-development/PlayWrightIUT)
2. Click the **"Fork"** button (top right)
3. Click **"Create fork"**
4. You now have your own copy of the repository!

**Option B: Create a New Repository from Template:**

1. Download this repository as a ZIP file or clone it:
   ```bash
   git clone https://github.com/sctg-development/PlayWrightIUT
   cd PlayWrightIUT
   ```
2. Create a new repository on GitHub:
   - Go to [https://github.com/new](https://github.com/new)
   - Name it (e.g., `my-iut-calendar`)
   - Make it **Private** (to keep your credentials safe)
   - Click **"Create repository"**
3. Push your code to the new repository:
   ```bash
   git remote remove origin
   git remote add origin https://github.com/YOUR-USERNAME/my-iut-calendar.git
   git push -u origin main
   ```

#### Step 4: Configure GitHub Secrets

GitHub Secrets are a secure way to store sensitive information like passwords and API keys.

1. Go to your GitHub repository
2. Click **"Settings"** (top menu)
3. In the left sidebar, click **"Secrets and variables"** → **"Actions"**
4. Click **"New repository secret"** for each of the following:

   **Required Secrets:**
   
   | Secret Name | Value | Description |
   |-------------|-------|-------------|
   | `CLOUDFLARE_API_TOKEN` | The token you created in Step 2 | Allows GitHub to deploy to Cloudflare |
   | `CLOUDFLARE_ACCOUNT_ID` | Your account ID from Step 2 | Your Cloudflare account identifier |
   | `USERNAME` | Your ADE username | Your university login |
   | `PASSWORD` | Your ADE password | Your university password |
   | `DOMAIN_NAME` | Your custom domain (optional) | e.g., `calendar.example.com` (leave empty if you don't have one) |
   | `ALLOWED_GROUPS` | The groups you want to allow, separated by `|` | e.g., `RT1_A1|RT1_A2|RT1_B1|RT1_B2` |

5. Click **"Add secret"** after entering each one

#### Step 5: Update Configuration Files

**Update wrangler.jsonc with your resource IDs:**

1. In your GitHub repository, go to the file: `apps/cf-playwrightiut-worker/wrangler.jsonc`
2. Click the **pencil icon** to edit
3. Find the `kv_namespaces` section and replace the `id` with your KV Namespace ID:
   ```jsonc
   "kv_namespaces": [
     {
       "binding": "CACHE",
       "id": "YOUR_KV_NAMESPACE_ID_HERE"  // Replace this
     }
   ]
   ```
4. Find the `d1_databases` section - the database name should already be `iuticsdb`
5. Click **"Commit changes"** at the bottom

#### Step 6: Enable GitHub Actions

1. In your GitHub repository, click the **"Actions"** tab
2. If you see a message saying "Workflows aren't being run on this forked repository", click **"I understand my workflows, go ahead and enable them"**
3. You should see a workflow called **"CloudflareWorkerDeploy"**

#### Step 7: Trigger Your First Deployment

**Option A: Push a change (easiest):**
1. Make any small edit to a file in `apps/cf-playwrightiut-worker/` (e.g., edit a comment in `src/index.ts`)
2. Commit and push the change
3. GitHub Actions will automatically deploy

**Option B: Manual trigger:**
1. Go to **"Actions"** tab
2. Click on **"CloudflareWorkerDeploy"** workflow
3. Click **"Run workflow"** button
4. Click the green **"Run workflow"** button

#### Step 8: Monitor the Deployment

1. Go to the **"Actions"** tab
2. Click on the running workflow
3. Watch the deployment progress
4. If everything is green ✓, your worker is deployed!
5. If there's a red ✗, click on the failed step to see what went wrong

#### Step 9: Find Your Worker URL

1. Go to your Cloudflare dashboard
2. Navigate to **Workers & Pages**
3. Click on your worker (it should be named `cf-playwrightiut-worker` or similar)
4. You'll see your worker URL, something like: `https://cf-playwrightiut-worker.YOUR-USERNAME.workers.dev`

#### Step 10: Test Your Deployment

Open your browser and go to:
```
https://your-worker-url.workers.dev/
```

You should see the landing page!

To get a calendar, try:
```
https://your-worker-url.workers.dev/iutrt-bethune?group=RT1_A2
```

Replace `RT1_A2` with your actual group name.

### Common Issues and Solutions

**Problem: "Error: No namespace with ID..."**
- Solution: Make sure you updated the `wrangler.jsonc` file with your actual KV Namespace ID

**Problem: "Error: Authentication error"**
- Solution: Double-check your `CLOUDFLARE_API_TOKEN` secret in GitHub

**Problem: "Rate limit exceeded"**
- Solution: The worker has rate limiting enabled. Wait 10 seconds and try again.

**Problem: GitHub Actions not running**
- Solution: Make sure you enabled Actions in Step 6

**Problem: Worker deploys but shows errors when accessing**
- Solution: Check that your D1 database is created and the schema is loaded

### Alternative: Manual Deployment with Wrangler CLI

If you prefer to deploy from your computer:

1. Install Wrangler CLI:
   ```bash
   npm install -g wrangler
   ```

2. Authenticate with Cloudflare:
   ```bash
   wrangler auth login
   ```

3. Deploy the worker:
   ```bash
   cd apps/cf-playwrightiut-worker
   wrangler deploy
   ```

4. Set up the D1 database schema:
   ```bash
   wrangler d1 execute iuticsdb --file=schema.sql
   ```

## Usage

### API Endpoints

- **GET /**: Returns the landing page.
- **GET /iutrt-bethune?group=<GROUP>**: Returns the ICS calendar for the specified group.

Example:
```
https://your-worker-url/iutrt-bethune?group=RT1_A2
```

### Testing

Run the Playwright tests:
```bash
yarn test
```

## Development

### Running Locally

1. Start the worker locally:
   ```bash
   cd apps/cf-playwrightiut-worker
   wrangler dev
   ```

2. The worker will be available at `http://localhost:8787`

### Sensitive Data Handling

The project includes two scripts for securely managing sensitive data backups:

#### `store_sensitive_datas` - Create Encrypted Backup

This script creates an encrypted backup of sensitive configuration files:

```bash
./_sensitive_datas/store_sensitive_datas
```

**Functionality:**
- Compresses selected files using tar.xz for efficient storage
- Encrypts the archive using AES-256-CBC with PBKDF2 key derivation
- Generates a SHA256 integrity hash for verification
- Stores the encrypted backup as `_sensitive_datas.tar.xz.enc`

**Security Level:**
- **Encryption:** AES-256-CBC (Advanced Encryption Standard with 256-bit key in Cipher Block Chaining mode)
- **Key Derivation:** PBKDF2 (Password-Based Key Derivation Function 2) for secure key generation from passphrase
- **Integrity:** SHA256 hash verification to detect tampering or corruption
- **Compression:** XZ compression reduces file size while maintaining security

**Choosing Files to Backup:**
The script uses a `FILES_TO_BACKUP` array that you can customize. Consider including:
- Environment variable files (`.env`, `.env.local`)
- Configuration files with secrets (`wrangler.toml`, `config.json`)
- Private keys or certificates
- Database credentials
- API keys and tokens

**Example Configuration:**
```bash
# In store_sensitive_datas script
FILES_TO_BACKUP=(
    ".env"
    ".env.local"
    "apps/cf-playwrightiut-worker/wrangler.toml"
    "config/secrets.json"
)
```

#### `restore_sensitive_datas` - Restore from Encrypted Backup

This script decrypts and restores files from the encrypted backup:

```bash
./_sensitive_datas/restore_sensitive_datas
```

**Functionality:**
- Decrypts the `_sensitive_datas.tar.xz.enc` archive using the same AES-256-CBC encryption
- Verifies integrity using the stored SHA256 hash before extraction
- Extracts files to their original locations
- Provides clear error messages if decryption fails or integrity check fails

**Security Features:**
- **Verification:** SHA256 hash check ensures backup integrity before restoration
- **Safe Decryption:** Uses the same secure parameters as encryption
- **Error Handling:** Fails safely if passphrase is incorrect or file is corrupted

**Important Notes:**
- Both scripts require the `CRYPTOKEN` environment variable (your encryption passphrase)
- The `PROJECT_ROOT` environment variable should point to the project directory
- Keep your encryption passphrase secure and separate from the backup files
- Test restoration on a copy of your data before relying on backups in production

**Best Practices:**
1. Store the encryption passphrase securely (password manager, separate from backups)
2. Test backup and restore procedures regularly
3. Include only necessary sensitive files in `FILES_TO_BACKUP`
4. Keep multiple backup versions for redundancy
5. Document your backup procedures for team members

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

Copyright (c) 2025 Ronan Le Meillat - SCTG Development
