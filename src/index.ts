import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { scheduleDailyMessages } from "./services/scheduler.js";
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
  scheduleDailyMessages(client);
});

client.on("messageCreate", async (msg) => {
  await handleMessage(msg, client);
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN is not set in environment variables");
  process.exit(1);
}

client.login(token);
