import { Message } from "discord.js";
import { CHANNEL_IDS } from "../config.js";
import { queryAIExtractUserInfo, queryMacronAI } from "../services/ollama.js";
import { RememberService } from "../services/remember-service.js";

/**
 * Automatically analyzes a message to extract and remember user information
 * @param msg - The Discord message to analyze
 */
async function autoLearnFromMessage(msg: Message, cleanedMessageContent: string): Promise<void> {
  try {
    // Check if the message contains interesting user information
    const userInfoAnalysis = await queryAIExtractUserInfo(msg.author.username, cleanedMessageContent);
    console.log(`Auto-learning analysis for ${msg.author.username}:`, userInfoAnalysis);

    // If interesting info is found, automatically remember it
    if (userInfoAnalysis) {
      console.log(`Auto-learning about ${msg.author.username}: ${cleanedMessageContent}`);
      await RememberService.processRememberCommand(
        msg.author.id,
        msg.author.username,
        cleanedMessageContent
      );
    }
  } catch (error) {
    console.error('Error auto-learning user info:', error);
    // Don't throw - this should not interrupt the normal conversation flow
  }
}

export async function handleMessage(msg: Message, client: any): Promise<void> {
  if (msg.mentions.has(client.user!) && msg.author.id !== client.user?.id && !msg.author.bot) {
    if (!CHANNEL_IDS.includes(msg.channel.id)) {
      await msg.reply("Je réponds que dans le channel de mon gars sûr, déso");
      return;
    }

    if (msg.channel.isTextBased() && 'sendTyping' in msg.channel) {
      await msg.channel.sendTyping();
    }


    const history = await msg.channel.messages.fetch({ limit: 10 });
    const pastMessages = Array.from(history.values())
      .reverse()
      .map((m: Message): string => `${m.author.username}: ${m.content}`)
      .join("\n");

    // Filter out bot mention from the message content to reduce noise
    const cleanedMessageContent = msg.content
      .replace(`<@${client.user?.id}>`, '')
      .trim();

    const response = await queryMacronAI(
      pastMessages,
      msg.author.id,
      msg.author.displayName,
      cleanedMessageContent,
      client.user?.username || "Emmanuel Macron",
      msg.attachments
    );
    await msg.reply(response);

    // Auto-learn from the user's message (runs in background)
    await autoLearnFromMessage(msg, cleanedMessageContent);

  }
}
