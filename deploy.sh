#!/bin/bash
# log into a file
exec > >(tee -i ~/webhooks/deploy.log)

commit_message=$1
echo "Received commit message: $commit_message"

echo "=== Environment Variables Debug ==="
echo "APP_NAME: ${APP_NAME:-'NOT SET'}"
echo "SERVER_PORT: ${SERVER_PORT:-'NOT SET'}"
echo "PROJECT_PATH: ${PROJECT_PATH:-'NOT SET'}"
echo "DEPLOY_LOG_PATH: ${DEPLOY_LOG_PATH:-'NOT SET'}"
echo "Current working directory: $(pwd)"
echo "Current user: $(whoami)"
echo "Shell: $SHELL"
echo "PATH: $PATH"
echo "==================================="

echo "Loading nvm"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm

echo "Pulling latest changes..."
git pull
echo "Installing dependencies"
npm install
echo "Compiling typescript"
tsc
echo "Restarting app..."
pm2 restart "$APP_NAME"  # or use systemctl restart your-app.service

echo "Sending commit message explanation"
# Wait for server to become available
echo "Waiting for server to be ready..."
until curl --silent --fail http://localhost:$SERVER_PORT/health -o /dev/null; do
  printf '.'
  sleep 1
done
echo -e "\nServer is up!"


# Limit the number of health check attempts
MAX_ATTEMPTS=20  # e.g. 20 seconds max
attempt=0
while ! curl --silent --fail http://localhost:$SERVER_PORT/health -o /dev/null; do
  ((attempt++))
  if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
    echo "\nServer did not become ready after $MAX_ATTEMPTS seconds. Aborting trigger."
    exit 1
  fi
  printf '.'
  sleep 1
done
echo -e "\nServer is up!"

echo "Sending commit message explanation"
curl -X POST http://localhost:$SERVER_PORT/trigger -H "Content-Type: application/json" \
     -d "{\"message\": \"$commit_message\"}"