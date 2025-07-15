import cron from "node-cron";
import { TextChannel } from "discord.js";
import { CHANNEL_IDS, dailyMessages } from "../config.js";

export function scheduleDailyMessages(client: any): void {
  // Schedule daily method to run every day at 9:00 AM
  cron.schedule('0 9 * * *', async (): Promise<void> => {
    await sendDailyMessage(client);
  });
  
  console.log("Daily cron job scheduled for 9:00 AM");
}

async function sendDailyMessage(client: any): Promise<void> {
  console.log("Daily method executed at:", new Date().toISOString());
  
  const channel = client.channels.cache.get(CHANNEL_IDS[0]) as TextChannel;
  if (channel) {
    const randomMessage = dailyMessages[Math.floor(Math.random() * dailyMessages.length)];
    await channel.send(randomMessage);
  }
}
