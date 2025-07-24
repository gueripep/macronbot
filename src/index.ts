import { Client, GatewayIntentBits, Routes } from "discord.js";
import dotenv from "dotenv";
import { clientId } from "./config.js";
import { commands, rest } from "./deploy-command.js";
import { handleMessage } from "./handlers/messageHandler.js";
import { TriggerServer } from "./server.js";
import { getPortfolioEmbed, handleTradeCommand } from "./services/macron-trade/macron-trade-service.js";
import { RememberService } from "./services/remember-service.js";
import { scheduleDailyTasks } from "./services/scheduler.js";

dotenv.config();

// Initialize the trigger server
const triggerServer = new TriggerServer(3001);


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", (): void => {
  console.log(`Logged in as ${client.user?.tag}`);
  
  // Set the Discord client in the trigger server
  triggerServer.setDiscordClient(client);
  
  // Start the trigger server
  triggerServer.start();
  
  try {
    scheduleDailyTasks(client);
  } catch (error) {
    console.error("Error scheduling daily messages:", error);
  }
});

// Handle incoming messages
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


//handle slash commands
client.on('interactionCreate', async interaction => {
	if (!interaction.isChatInputCommand()) return;

	const { commandName } = interaction;

	if (commandName === 'portfolio') {
		const embed = await getPortfolioEmbed();
		await interaction.reply({ content: 'Voici mes positions actuelles', embeds: [embed] });
	}
  else if (commandName === 'remember') {
    await RememberService.handleRememberCommand(interaction);
  }
  else if (commandName === 'trade') {
    await handleTradeCommand(interaction);
  }
});

await rest.put(
	Routes.applicationCommands(clientId),
	{ body: commands },
);