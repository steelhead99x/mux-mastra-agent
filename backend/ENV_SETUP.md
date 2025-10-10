# Environment Setup for Mastra Dev

This project includes robust scripts to ensure the `.env` file is always available to Mastra during development, even after builds.

## Quick Commands

```bash
# Check if .env is properly set up
npm run check-env

# Restore .env if missing
npm run restore-env

# Start development (automatically ensures .env)
npm run dev
```

## How It Works

### 1. **Automatic Setup**
- `npm run dev` automatically runs `ensure-env` before starting Mastra
- `npm run build` runs `post-build-env` after compilation to restore .env

### 2. **Multiple Fallback Strategies**
- **Symlink**: Creates a symlink from `.mastra/output/.env` to root `.env` (preferred)
- **Copy**: If symlink fails, creates a copy of the root `.env` file
- **Verification**: Checks that the file is readable before proceeding

### 3. **Scripts Available**

| Script | Purpose |
|--------|---------|
| `npm run ensure-env` | Creates .env symlink/copy in Mastra output directory |
| `npm run check-env` | Checks if .env exists and shows status |
| `npm run restore-env` | Restores .env if missing |
| `npm run post-build-env` | Runs after builds to restore .env |

## Troubleshooting

### If .env keeps disappearing:

1. **Check status**: `npm run check-env`
2. **Restore manually**: `npm run restore-env`
3. **Verify root .env exists**: `ls -la ../.env`

### If you get "MUX_TOKEN_ID and MUX_TOKEN_SECRET are required":

1. Make sure `../.env` exists and has valid API keys
2. Run `npm run restore-env`
3. Check the symlink: `ls -la .mastra/output/.env`

### If symlinks don't work on your system:

The script will automatically fall back to copying the file instead of creating a symlink.

## File Locations

- **Root .env**: `/Users/kdoug0116/Documents/cursor/mux-mastra-agent/.env`
- **Mastra .env**: `/Users/kdoug0116/Documents/cursor/mux-mastra-agent/backend/.mastra/output/.env`

The Mastra .env is either a symlink to or a copy of the root .env file.
