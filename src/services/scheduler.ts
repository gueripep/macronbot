import cron from "node-cron";
import { BaseMessageOptions, TextChannel } from "discord.js";
import { CHANNEL_IDS, dailyMessages, squeegeeChannelId, testChannelId } from "../config.js";
import { fetchRssFeed, getMacronNews } from "./macronNews.js";
import { checkAndClosePositions, getPortfolioEmbed, trade } from "./macron-trade/macron-trade-service.js";
import { queryAIClosedTransationAnalysis } from "./ollama.js";

export function scheduleDailyTasks(client: any): void {
  cron.schedule('0 10 * * *', async (): Promise<void> => {
    await sendDailyMessage(client);
  });

  cron.schedule('0 16 * * 4', async (): Promise<void> => {
    console.log("Running weekly trade method at 4:00 PM on Thursdays");
    await doWeeklyTrade(client);
  });

  cron.schedule('50 15 * * 1-5', async (): Promise<void> => {
    console.log("Running check positions and update embed at 3:50 PM on weekdays");
    await checkPositionsAndUpdateEmbed(client);
  });
  
}

export async function sendDailyMessage(client: any): Promise<void> {
  console.log("Daily method executed at:", new Date().toISOString());
  
  const channel = client.channels.cache.get(squeegeeChannelId) as TextChannel;
  if (channel) {
    const message = await getMacronNews();
    await channel.send(message);
  }
}

export async function doWeeklyTrade(client: any): Promise<void> {
  console.log("Daily trade method executed at:", new Date().toISOString());
  
  const channel = client.channels.cache.get(squeegeeChannelId) as TextChannel;
  if (channel) {
    // const explicationTrade = await trade();
    const explicationTrade = await trade();
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

export async function checkPositionsAndUpdateEmbed(client: any): Promise<void> {
  console.log("Checking and closing positions at:", new Date().toISOString());
  
  const channel = client.channels.cache.get(squeegeeChannelId) as TextChannel;
  if (channel) {
    const closedTransactions = await checkAndClosePositions();
    const explication = await queryAIClosedTransationAnalysis(closedTransactions);
    if(closedTransactions.length > 0) {
      const embed = await getPortfolioEmbed();


      if (explication && embed) {
        const message: BaseMessageOptions = {
          content: explication,
          embeds: [embed]
        };
        await channel.send(message);
      } else {
        // await channel.send("Aucune position à fermer aujourd'hui.");
      }
    }
  }
}



