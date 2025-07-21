import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { checkPositionsAndUpdateEmbed, doWeeklyTrade, scheduleDailyTasks, sendDailyMessage } from "./services/scheduler.js";
import { handleMessage } from "./handlers/messageHandler.js";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", (): void => {
  console.log(`Logged in as ${client.user?.tag}`);
  try {
    scheduleDailyTasks(client);
    checkPositionsAndUpdateEmbed(client);
  } catch (error) {
    console.error("Error scheduling daily messages:", error);
  }
});

client.on("messageCreate", async (msg) => {
  try {
    await handleMessage(msg, client);
  } catch (error) {
    console.error("Error handling message:", error);
  }
});

// Handle Discord client errors
client.on("error", (error) => {
  console.error("Discord client error:", error);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled rejection at:", promise, "reason:", reason);
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN is not set in environment variables");
  process.exit(1);
}

// Add error handling for login
client.login(token).catch((error) => {
  console.error("Failed to login to Discord:", error);
  process.exit(1);
});
