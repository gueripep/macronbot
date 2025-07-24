#!/bin/bash
# In order to get the commit message

commit_message=$1
echo "Received commit message: $commit_message"

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

echo "Sending commit message explanation"
curl -X POST http://localhost:$SERVER_PORT/trigger -H "Content-Type: application/json" \
     -d "{\"message\": \"$commit_message\"}"