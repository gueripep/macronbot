import { BaseMessageOptions, TextChannel } from "discord.js";
import cron from "node-cron";
import { squeegeeChannelId } from "../config.js";
import { checkAndClosePositions, getActiveTradesCount, getPortfolioEmbed, trade } from "./macron-trade/macron-trade-service.js";
import { getMacronNews } from "./macronNews.js";
import { sendDailyWordleMessage } from "./macronWordle.js";
import { queryAIClosedTransationAnalysis } from "./ollama.js";

export function scheduleDailyTasks(client: any): void {
  cron.schedule('0 10 * * *', async (): Promise<void> => {
    await sendDailyMessage(client);
  });

  cron.schedule('0 16 * * 1-5', async (): Promise<void> => {
    console.log("Checking if we should run trade method at 4:00 PM on weekdays");
    const activeTradesCount = await getActiveTradesCount();
    console.log(`Current active trades: ${activeTradesCount}`);
    
    if (activeTradesCount < 3) {
      console.log("Less than 3 active trades, running trade method");
      await doWeeklyTrade(client);
    } else {
      console.log("3 or more active trades, skipping trade execution");
    }
  });

  cron.schedule('50 15 * * 1-5', async (): Promise<void> => {
    console.log("Running check positions and update embed at 3:50 PM on weekdays");
    await checkPositionsAndUpdateEmbed(client);
  });

  //wordle
  cron.schedule('0 9 * * *', async (): Promise<void> => {
    sendDailyWordleMessage(client);
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
      }
    }
  }
}



