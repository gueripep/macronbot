# Macron Bot

A Discord bot that responds as Emmanuel Macron with AI-generated responses. Built with TypeScript for better type safety and maintainability.

## Features

- Responds to mentions with AI-generated Emmanuel Macron-style messages
- 10% chance to reply with random preset messages
- Daily scheduled messages at 10:00 AM
- Channel-specific responses
- Conversation history context for more relevant responses
- RSS feed integration for Macron news
- **Remember Command**: Store and organize information about users using AI
- **Auto-Learning**: Automatically extracts and remembers user information from conversations
- Full TypeScript support with type safety
- Comprehensive error handling to prevent crashes

## Features in Detail

### 🧠 **Auto-Learning System**
The bot automatically analyzes every message to detect interesting personal information about users and remembers it for future conversations. 

**What it learns:**
- Professional information (job, skills, company)
- Personal interests and hobbies
- Location and background
- Preferences and experiences
- Educational details

**How it works:**
1. User mentions the bot in a message
2. AI analyzes if the message contains personal information worth remembering
3. If yes: Automatically stores the information using the remember system
4. If no: Continues with normal conversation
5. Future conversations include this learned context

### 📝 **Manual Remember System**

## Commands

### `/remember`
Store personal information about yourself or someone else that the bot will remember for future interactions.

**Usage:** 
- `/remember information:"Your information here"` - Store info about yourself
- `/remember information:"Some information" user:@SomeUser` - Store info about another user

**Features:**
- Store information about yourself or other Discord users
- If no information exists, the AI will format and organize the new information
- If information already exists, the AI will intelligently combine new information with existing data
- The bot uses AI to avoid duplicates and organize information coherently
- Information is stored persistently in the database and used in future conversations
- When mentioning users in chat, Macron will reference what he knows about them

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
- **Daily schedule**: Bot sends a daily message at 10:00 AM (configurable in `src/services/scheduler.ts`)
- **AI Model**: Uses Ollama with `mistral:7b` model (configurable in `src/services/ollama.ts`)
- **Random replies**: Customizable preset responses (in `src/config.ts`)
- **News Integration**: RSS feed integration for Macron-related news

## Architecture

The bot is built with a modular architecture for better maintainability:

- **`config.ts`**: Centralized configuration and constants
- **`types.ts`**: TypeScript interfaces and type definitions
- **`handlers/messageHandler.ts`**: Handles Discord message events and routing
- **`services/ollama.ts`**: Manages AI response generation via Ollama API
- **`services/scheduler.ts`**: Handles daily message scheduling with cron jobs
- **`services/macronNews.ts`**: RSS feed integration for Macron news
- **`index.ts`**: Main entry point with comprehensive error handling

## Dependencies

- `discord.js`: Discord API wrapper
- `node-fetch`: HTTP requests to Ollama and RSS feeds
- `node-cron`: Task scheduling
- `dotenv`: Environment variable management
- `typescript`: TypeScript compiler
- `ts-node`: TypeScript execution for development

## Project Structure

```
src/
  index.ts                    # Main entry point with error handling
  config.ts                   # Configuration constants
  types.ts                    # TypeScript type definitions
  handlers/
    messageHandler.ts         # Discord message handling logic
  services/
    ollama.ts                 # Ollama API integration
    scheduler.ts              # Daily message scheduling
    macronNews.ts             # RSS feed integration for news
dist/                         # Compiled JavaScript (auto-generated)
package.json                  # Project configuration
tsconfig.json                 # TypeScript configuration
.env                         # Environment variables (create this)
```

## Error Handling

The bot includes comprehensive error handling to prevent crashes:
- Process-level error handlers for uncaught exceptions
- Discord client error handling
- Try-catch blocks around async operations
- Graceful handling of API failures

## Usage

Mention the bot in any configured channel and it will respond as Emmanuel Macron with AI-generated messages based on the conversation context. The bot also sends daily news updates about Emmanuel Macron at 10:00 AM.
