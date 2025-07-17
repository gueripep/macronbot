import cron from "node-cron";
import { BaseMessageOptions, TextChannel } from "discord.js";
import { CHANNEL_IDS, dailyMessages, testChannelId } from "../config.js";
import { fetchRssFeed, getMacronNews } from "./macronNews.js";
import { getPortfolioEmbed, trade } from "./macronTrade.js";

export function scheduleDailyMessages(client: any): void {
  // Schedule daily method to run every day at 10:00 AM
  cron.schedule('0 10 * * *', async (): Promise<void> => {
    await sendDailyMessage(client);
  });
  
  console.log("Daily cron job scheduled for 10:00 AM");
}

async function sendDailyMessage(client: any): Promise<void> {
  console.log("Daily method executed at:", new Date().toISOString());
  
  const channel = client.channels.cache.get(CHANNEL_IDS[0]) as TextChannel;
  if (channel) {
    const message = await getMacronNews();
    await channel.send(message);
  }
}

export async function doDailyTrade(client: any): Promise<void> {
  console.log("Daily trade method executed at:", new Date().toISOString());
  
  const channel = client.channels.cache.get(testChannelId) as TextChannel;
  if (channel) {
    // const explicationTrade = await trade();
    const explicationTrade = "bonjour, voici votre trade du jour";
    const embed = await getPortfolioEmbed();

    if (explicationTrade && embed) {
      const message: BaseMessageOptions = {
        content: explicationTrade,
        embeds: [embed]
      };
      await channel.send(message);
    } else {
      await channel.send("Aucune opportunité de trading trouvée aujourd'hui.");
    }
  }
}

