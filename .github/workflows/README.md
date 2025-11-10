# GitHub Actions Deployment Workflows

This directory contains GitHub Actions workflows for automated deployment of the Investment CRM application.

## Quick Start: Setting Up SSH Private Key

The `SSH_PRIVATE_KEY` is required for GitHub Actions to connect to your server. Here's how to generate it:

### Step 1: Generate SSH Key Pair

**On Windows (PowerShell or Git Bash):**
```bash
# Generate a new SSH key pair (use ed25519 for better security)
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_actions_deploy

# When prompted for a passphrase, press Enter to leave it empty
# (GitHub Actions cannot use keys with passphrases)
```

**On Linux/Mac:**
```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_actions_deploy
```

This creates two files:
- `~/.ssh/github_actions_deploy` (private key) - **This is your SSH_PRIVATE_KEY**
- `~/.ssh/github_actions_deploy.pub` (public key) - This goes on your server

### Step 2: Copy Public Key to Server

**Option A: Using ssh-copy-id (Linux/Mac):**
```bash
ssh-copy-id -i ~/.ssh/github_actions_deploy.pub user@your-server.com
```

**Option B: Manual (Windows or if ssh-copy-id doesn't work):**
```bash
# 1. Display the public key
cat ~/.ssh/github_actions_deploy.pub

# 2. SSH into your server
ssh user@your-server.com

# 3. On the server, add the public key to authorized_keys
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo "PASTE_THE_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### Step 3: Get the Private Key Content

**On Windows (PowerShell):**
```powershell
Get-Content ~/.ssh/github_actions_deploy
```

**On Windows (Git Bash):**
```bash
cat ~/.ssh/github_actions_deploy
```

**On Linux/Mac:**
```bash
cat ~/.ssh/github_actions_deploy
```

**Copy the entire output** - it should look like:
```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
...
(many lines)
...
-----END OPENSSH PRIVATE KEY-----
```

### Step 4: Add to GitHub Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `SSH_PRIVATE_KEY`
5. Value: Paste the **entire private key** (including `-----BEGIN` and `-----END` lines)
6. Click **Add secret**

### Step 5: Test SSH Connection

Test that the key works:
```bash
ssh -i ~/.ssh/github_actions_deploy user@your-server.com
```

If it connects without asking for a password, you're all set!

### Security Notes

- **Never share your private key** - it's like a password
- **Never commit the private key** to your repository
- This key should only be used for deployment
- Consider using a dedicated deployment user on your server with limited permissions

## Workflows

### Backend Deployment (`backend-deploy.yml`)
- **Triggers**: Push to `main`/`master` branch or pull requests affecting `backend/` directory
- **Jobs**:
  1. **Test**: Runs linting, type checking, and tests with PostgreSQL service
  2. **Build**: Builds the TypeScript application and creates deployment package
  3. **Deploy**: Deploys to production server via SSH

### Frontend Deployment (`frontend-deploy.yml`)
- **Triggers**: Push to `main`/`master` branch or pull requests affecting `frontend/` directory
- **Jobs**:
  1. **Test**: Runs linting, type checking, and tests
  2. **Build**: Builds the Next.js application and creates deployment package
  3. **Deploy**: Deploys to production server via SSH

## Required GitHub Secrets

Configure the following secrets in your GitHub repository settings (`Settings > Secrets and variables > Actions`):

### Server Connection
- `SSH_PRIVATE_KEY`: Private SSH key for server access (without passphrase recommended)
- `SERVER_HOST`: Server hostname or IP address
- `SERVER_USER`: SSH username for server access

### Backend Deployment
- `BACKEND_DEPLOY_PATH`: Server path where backend will be deployed (e.g., `/var/www/investment-crm/backend`)
- `BACKEND_URL`: Backend API URL for health checks (e.g., `https://api.example.com`)
- `BACKEND_ENV_FILE`: **(Recommended)** Complete `.env` file content. Paste your entire production environment file here. This is easier than setting individual secrets.

### Frontend Deployment
- `FRONTEND_DEPLOY_PATH`: Server path where frontend will be deployed (e.g., `/var/www/investment-crm/frontend`)
- `FRONTEND_URL`: Frontend URL for health checks (e.g., `https://example.com`)
- `FRONTEND_ENV_FILE`: **(Recommended)** Complete `.env.production` file content. Paste your entire production environment file here. This is easier than setting individual secrets.
- `NEXT_PUBLIC_API_URL`: Public API URL for frontend (e.g., `https://api.example.com`) - *Only needed if not using FRONTEND_ENV_FILE*
- `NEXTAUTH_URL`: NextAuth.js URL (e.g., `https://example.com`) - *Only needed if not using FRONTEND_ENV_FILE*
- `NEXTAUTH_SECRET`: NextAuth.js secret key (generate with: `openssl rand -base64 32`) - *Only needed if not using FRONTEND_ENV_FILE*

### Backend Environment Variables (on server)
The following environment variables should be set on the server in the deployment directory (or use `BACKEND_ENV_FILE` secret):

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: JWT secret key for authentication
- `NODE_ENV`: Set to `production`
- `PORT`: Backend port (default: 3001)
- Email configuration (if using email service):
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASSWORD`
  - `SMTP_FROM`

## Server Setup

### Prerequisites
1. Node.js 20+ installed
2. PostgreSQL database accessible
3. SSH access configured
4. Process manager (optional but recommended):
   - PM2: `npm install -g pm2`
   - Or systemd service configured

### Initial Server Setup

1. **Create deployment directories**:
   ```bash
   sudo mkdir -p /var/www/investment-crm/backend/{releases,shared}
   sudo mkdir -p /var/www/investment-crm/frontend/{releases,shared}
   sudo chown -R $USER:$USER /var/www/investment-crm
   ```

2. **Set up SSH key** (see "Quick Start: Setting Up SSH Private Key" section above for detailed instructions):
   ```bash
   # On your local machine - generate key pair
   ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_actions_deploy
   # Press Enter when asked for passphrase (leave empty)
   
   # Copy public key to server
   ssh-copy-id -i ~/.ssh/github_actions_deploy.pub user@your-server.com
   # OR manually add to ~/.ssh/authorized_keys on server
   
   # Get private key content to add to GitHub Secrets
   cat ~/.ssh/github_actions_deploy
   # Copy entire output and add as SSH_PRIVATE_KEY secret in GitHub
   ```

3. **Configure environment variables**:

   **Option A: Using GitHub Secrets (Recommended)**
   
   Create your `.env` files locally, then add them as GitHub Secrets:
   
   ```bash
   # Backend - Copy your .env file content
   cat backend/.env
   # Copy entire output and add as BACKEND_ENV_FILE secret in GitHub
   
   # Frontend - Copy your .env.production file content
   cat frontend/.env.production
   # Copy entire output and add as FRONTEND_ENV_FILE secret in GitHub
   ```
   
   Then in GitHub:
   - Go to **Settings** → **Secrets and variables** → **Actions**
   - Add `BACKEND_ENV_FILE` secret with your complete backend `.env` file content
   - Add `FRONTEND_ENV_FILE` secret with your complete frontend `.env.production` file content
   
   **Option B: Using Shared Files on Server**
   
   ```bash
   # Backend
   cd /var/www/investment-crm/backend/shared
   nano .env
   # Add all required environment variables
   
   # Frontend
   cd /var/www/investment-crm/frontend/shared
   nano .env.production
   # Add all required environment variables
   ```
   
   **Note**: The workflow will use `BACKEND_ENV_FILE` / `FRONTEND_ENV_FILE` secrets if available, otherwise it will fall back to shared files on the server.

4. **Set up process manager (PM2 example)**:
   ```bash
   # Install PM2
   npm install -g pm2
   
   # Create PM2 ecosystem file
   cat > /var/www/investment-crm/ecosystem.config.js << EOF
   module.exports = {
     apps: [
       {
         name: 'investment-crm-backend',
         script: '/var/www/investment-crm/backend/current/dist/index.js',
         instances: 1,
         exec_mode: 'fork',
         env: {
           NODE_ENV: 'production',
           PORT: 3001
         },
         error_file: '/var/log/pm2/backend-error.log',
         out_file: '/var/log/pm2/backend-out.log',
         log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
         merge_logs: true,
         autorestart: true,
         max_memory_restart: '1G'
       },
       {
         name: 'investment-crm-frontend',
         script: '/var/www/investment-crm/frontend/current/node_modules/.bin/next',
         args: 'start --port 3000',
         instances: 1,
         exec_mode: 'fork',
         env: {
           NODE_ENV: 'production',
           PORT: 3000
         },
         error_file: '/var/log/pm2/frontend-error.log',
         out_file: '/var/log/pm2/frontend-out.log',
         log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
         merge_logs: true,
         autorestart: true,
         max_memory_restart: '1G'
       }
     ]
   };
   EOF
   ```

5. **Set up reverse proxy (Nginx example)**:
   ```nginx
   # /etc/nginx/sites-available/investment-crm
   upstream backend {
       server localhost:3001;
   }
   
   upstream frontend {
       server localhost:3000;
   }
   
   server {
       listen 80;
       server_name api.example.com;
       
       location / {
           proxy_pass http://backend;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   
   server {
       listen 80;
       server_name example.com;
       
       location / {
           proxy_pass http://frontend;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

## Deployment Process

1. **Automatic Deployment**: When code is pushed to `main`/`master` branch:
   - Tests run automatically
   - If tests pass, build is created
   - Build is deployed to server
   - Application is restarted

2. **Rollback**: If deployment fails, you can manually rollback:
   ```bash
   ssh user@server
   cd /var/www/investment-crm/backend/releases
   # List releases
   ls -lt
   # Symlink to previous release
   cd /var/www/investment-crm/backend
   rm current
   ln -s releases/YYYYMMDDHHMMSS current
   pm2 restart investment-crm-backend
   ```

3. **Manual Deployment**: You can also trigger deployment manually:
   - Go to Actions tab in GitHub
   - Select the workflow
   - Click "Run workflow"

## Monitoring

- Check deployment status in GitHub Actions tab
- Monitor application logs:
  ```bash
  # PM2 logs
  pm2 logs investment-crm-backend
  pm2 logs investment-crm-frontend
  
  # Or check log files
  tail -f /var/log/pm2/backend-out.log
  ```

## Troubleshooting

### SSH Connection Issues
- Verify SSH key is correctly added to GitHub Secrets
- Test SSH connection manually: `ssh -i ~/.ssh/github_actions_deploy user@server`
- Check server SSH configuration allows key-based authentication

### Build Failures
- Check Node.js version matches (should be 20+)
- Verify all dependencies are in package.json
- Check build logs in GitHub Actions

### Deployment Failures
- Verify deployment paths exist on server
- Check file permissions
- Verify environment variables are set
- Check application logs on server

### Database Migration Issues
- Ensure database is accessible from server
- Check DATABASE_URL is correct
- Verify Prisma migrations are up to date
- Run migrations manually if needed: `npx prisma migrate deploy`

## Security Notes

1. **SSH Keys**: Use dedicated SSH keys for deployment, not personal keys
2. **Secrets**: Never commit secrets to repository
3. **Environment Variables**: Store sensitive data in GitHub Secrets
4. **Database**: Use strong passwords and restrict database access
5. **HTTPS**: Configure SSL/TLS certificates for production
6. **Firewall**: Restrict server access to necessary ports only

