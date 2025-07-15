# Macron Bot

A Discord bot that responds as Emmanuel Macron with AI-generated responses. Built with TypeScript for better type safety and maintainability.

## Features

- Responds to mentions with AI-generated Emmanuel Macron-style messages
- 10% chance to reply with random preset messages
- Daily scheduled messages
- Channel-specific responses
- Conversation history context for more relevant responses
- Full TypeScript support with type safety

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
5. Update the `CHANNEL_IDS` array in `src/config.ts` with your Discord channel IDs

## Running the Bot

### Development (TypeScript)
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

## Configuration

- **CHANNEL_IDS**: Array of Discord channel IDs where the bot will respond (in `src/config.ts`)
- **Daily schedule**: Bot sends a daily message at 9:00 AM (configurable in `src/services/scheduler.ts`)
- **AI Model**: Uses Ollama with `mistral:7b` model (configurable in `src/services/ollama.ts`)
- **Random replies**: Customizable preset responses (in `src/config.ts`)

## Architecture

The bot is built with a modular architecture for better maintainability:

- **`config.ts`**: Centralized configuration and constants
- **`types.ts`**: TypeScript interfaces and type definitions
- **`handlers/messageHandler.ts`**: Handles Discord message events and routing
- **`services/ollama.ts`**: Manages AI response generation via Ollama API
- **`services/scheduler.ts`**: Handles daily message scheduling with cron jobs
- **`index.ts`**: Main entry point that orchestrates all components

## Dependencies

- `discord.js`: Discord API wrapper
- `node-fetch`: HTTP requests to Ollama
- `node-cron`: Task scheduling
- `dotenv`: Environment variable management
- `typescript`: TypeScript compiler
- `ts-node`: TypeScript execution for development

## Project Structure

```
src/
  index.ts                    # Main entry point
  config.ts                   # Configuration constants
  types.ts                    # TypeScript type definitions
  handlers/
    messageHandler.ts         # Discord message handling logic
  services/
    ollama.ts                 # Ollama API integration
    scheduler.ts              # Daily message scheduling
dist/                         # Compiled JavaScript (auto-generated)
package.json                  # Project configuration
tsconfig.json                 # TypeScript configuration
.env                         # Environment variables (create this)
```

## Usage

Mention the bot in any configured channel and it will respond as Emmanuel Macron with AI-generated messages based on the conversation context.
