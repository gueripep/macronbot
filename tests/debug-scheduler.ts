import { Client, GatewayIntentBits, TextChannel } from "discord.js";
import { fetchRssFeed, getMacronNews } from "../src/services/macronNews.ts";
import { CHANNEL_IDS, squeegeeChannelId, testChannelId } from "../src/config.ts";
import dotenv from "dotenv";

dotenv.config();

async function testDailyMessage() {
  console.log("Testing daily message function...");

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once("ready", async () => {
    console.log(`Logged in as ${client.user?.tag}!`);

    try {
      const channel = client.channels.cache.get(testChannelId) as TextChannel;
      if (channel) {
        console.log(`Found channel: ${channel.name}`);
        const macronNews = await getMacronNews();
        console.log(`RSS feed title: ${macronNews}`);
        await channel.send(macronNews);

        console.log("Message sent successfully!");
      } else {
        console.log("Channel not found");
      }
    } catch (error) {
      console.error("Error:", error);
    }

    client.destroy();
  });

  await client.login(process.env.DISCORD_TOKEN);
}

testDailyMessage();
