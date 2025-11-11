# Self-Hosted Runner Setup Guide

This guide explains how to set up a self-hosted runner for GitHub Actions to eliminate the need for SSH keys during deployment.

## Benefits of Self-Hosted Runners

- ✅ **No SSH keys required** - The runner executes directly on your server
- ✅ **Faster deployments** - No file transfers over SSH
- ✅ **Better security** - No need to store SSH private keys in GitHub Secrets
- ✅ **Direct access** - Full access to server resources and services

## Setup Instructions

### 1. Set Up the Self-Hosted Runner

On your server, run:

```bash
# Create a directory for the runner
mkdir actions-runner && cd actions-runner

# Download the latest runner package
curl -o actions-runner-linux-x64-2.311.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz

# Extract the installer
tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz

# Configure the runner (you'll need a token from GitHub)
./config.sh --url https://github.com/YOUR_USERNAME/YOUR_REPO --token YOUR_TOKEN
```

To get the token:
1. Go to your GitHub repository
2. Navigate to **Settings** → **Actions** → **Runners**
3. Click **New self-hosted runner**
4. Copy the token from the configuration command

### 2. Install as a Service (Recommended)

```bash
# Install as a service
sudo ./svc.sh install

# Start the service
sudo ./svc.sh start

# Check status
sudo ./svc.sh status
```

### 3. Configure GitHub Repository Variable

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Go to the **Variables** tab
4. Click **New repository variable**
5. Name: `USE_SELF_HOSTED_RUNNER`
6. Value: `true`
7. Click **Add variable**

### 4. Required Secrets (Still Needed)

Even with self-hosted runners, you still need these secrets:

- `BACKEND_DEPLOY_PATH` - Deployment directory (defaults to `/var/www/investment-crm/backend` if not set)
- `BACKEND_ENV_FILE` - Contents of your `.env` file (optional if you use shared/.env)
- `BACKEND_URL` - Health check URL (defaults to `http://localhost:3001` if not set)

### 5. Optional: Use Shared .env File

Instead of using `BACKEND_ENV_FILE` secret, you can create a shared `.env` file:

```bash
# On your server
mkdir -p /var/www/investment-crm/backend/shared
nano /var/www/investment-crm/backend/shared/.env
# Add your environment variables
```

## How It Works

The workflow automatically detects if you're using a self-hosted runner by checking the `USE_SELF_HOSTED_RUNNER` variable:

- **If `USE_SELF_HOSTED_RUNNER = 'true'`**: 
  - Uses `runs-on: self-hosted`
  - Skips SSH setup steps
  - Deploys directly on the server

- **If `USE_SELF_HOSTED_RUNNER != 'true'` or not set**:
  - Uses `runs-on: ubuntu-latest` (GitHub-hosted)
  - Sets up SSH connection
  - Deploys via SSH

## Troubleshooting

### Runner Not Appearing

1. Check if the runner service is running:
   ```bash
   sudo ./svc.sh status
   ```

2. Check runner logs:
   ```bash
   sudo journalctl -u actions.runner.* -f
   ```

### Permission Issues

Make sure the runner user has permissions to:
- Write to the deployment directory
- Run npm commands
- Restart services (pm2/systemctl)

You may need to add the runner user to appropriate groups:
```bash
sudo usermod -aG www-data runner-user
```

### Build Artifacts Not Found

The workflow downloads build artifacts from the `build` job. Make sure:
- The `build` job completes successfully
- Artifacts are uploaded correctly
- The runner has network access to download artifacts

## Security Considerations

- The runner has access to your repository code and secrets
- Keep the runner updated: `./run.sh` will auto-update, or manually update the service
- Use labels to control which jobs run on which runners
- Consider using runner groups for better organization

## Maintenance

### Update the Runner

```bash
cd actions-runner
./run.sh
# The runner will auto-update when a new version is available
```

### Remove the Runner

1. Stop the service: `sudo ./svc.sh stop`
2. Uninstall the service: `sudo ./svc.sh uninstall`
3. Remove from GitHub: Go to Settings → Actions → Runners → Remove
4. Delete the directory: `rm -rf actions-runner`

## Switching Back to GitHub-Hosted Runners

If you want to switch back to GitHub-hosted runners with SSH:

1. Set `USE_SELF_HOSTED_RUNNER` variable to `false` or delete it
2. Make sure `SSH_PRIVATE_KEY`, `SERVER_HOST`, and `SERVER_USER` secrets are configured
3. The workflow will automatically use SSH deployment

