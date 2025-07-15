# Macron Bot

A Discord bot that responds as Emmanuel Macron with AI-generated responses.

## Features

- Responds to mentions with AI-generated Emmanuel Macron-style messages
- 10% chance to reply with random preset messages
- Daily scheduled messages
- Channel-specific responses
- Conversation history context for more relevant responses

## Setup

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with your Discord bot token:
   ```
   DISCORD_TOKEN=your_discord_bot_token_here
   ```
4. Make sure you have Ollama running locally on port 11434 with the `mistral:7b` model
5. Update the `CHANNEL_IDS` array in `index.js` with your Discord channel IDs
6. Run the bot:
   ```bash
   node index.js
   ```

## Configuration

- **CHANNEL_IDS**: Array of Discord channel IDs where the bot will respond
- **Daily schedule**: Bot sends a daily message at 9:00 AM
- **AI Model**: Uses Ollama with `mistral:7b` model

## Dependencies

- `discord.js`: Discord API wrapper
- `node-fetch`: HTTP requests to Ollama
- `node-cron`: Task scheduling
- `dotenv`: Environment variable management

## Usage

Mention the bot in any configured channel and it will respond as Emmanuel Macron with AI-generated messages based on the conversation context.
