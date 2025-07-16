import { Message } from "discord.js";
import { CHANNEL_IDS, randomReplies } from "../config.js";
import { queryMacronAI } from "../services/ollama.js";

export async function handleMessage(msg: Message, client: any): Promise<void> {
  if (msg.mentions.has(client.user!) && msg.author.id !== client.user?.id) {
    if (!CHANNEL_IDS.includes(msg.channel.id)) {
      await msg.reply("Je réponds que dans le channel de mon gars sûr, déso");
      return;
    }
    
    if (msg.channel.isTextBased() && 'sendTyping' in msg.channel) {
      await msg.channel.sendTyping();
    }

    if (Math.random() < 0) {
      const randomReply = randomReplies[Math.floor(Math.random() * randomReplies.length)];
      await msg.reply(randomReply);
    } else {
      const history = await msg.channel.messages.fetch({ limit: 20 });
      const pastMessages = Array.from(history.values())
        .reverse()
        .map((m: Message): string => `${m.author.username}: ${m.content}`)
        .join("\n");
      
      const response = await queryMacronAI(pastMessages, msg, client.user?.username || "MacronBot");
      await msg.reply(response);
    }
  }
}
