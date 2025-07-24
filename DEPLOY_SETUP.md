# Deployment Script Template

This deployment script is designed to be triggered by git webhooks for automated deployments when code is pushed to your repository.

## Setup Instructions

1. Copy `deploy.sh.template` to `deploy.sh`:
   ```bash
   cp deploy.sh.template deploy.sh
   ```

2. Replace the following placeholders in `deploy.sh`:
   - `{{APP_NAME}}`: Your PM2 application name
   - `{{SERVER_PORT}}`: The port your server runs on

3. Make the script executable:
   ```bash
   chmod +x deploy.sh
   ```

## Usage

### Manual Deployment
Run the deployment script with a commit message:
```bash
./deploy.sh "Your commit message here"
```

### Git Webhook Integration
This script is designed to be called by git webhooks. When setting up your webhook:
1. Configure your git hosting service (GitHub, GitLab, etc.) to call this script on push events
2. The webhook should pass the commit message as the first argument
3. Ensure your server has proper permissions to execute the script and restart services

## What the script does

1. Loads NVM (Node Version Manager)
2. Pulls latest changes from git
3. Installs npm dependencies
4. Compiles TypeScript
5. Restarts the PM2 application
6. Waits for the server to be ready
7. Sends the commit message to the application via HTTP POST

## Configuration

Make sure to set the following before using:
- PM2 app name (replace `{{APP_NAME}}`)
- Server port (replace `{{SERVER_PORT}}`)
