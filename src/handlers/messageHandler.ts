import { Message } from "discord.js";
import fetch from "node-fetch";
import { CHANNEL_IDS } from "../config.js";
import { queryAIExtractUserInfo, queryMacronAI } from "../services/ollama.js";
import { RememberService } from "../services/remember-service.js";

/**
 * Processes Discord attachments and converts them to Gemini-compatible parts
 * @param attachments - Discord message attachments
 * @returns Promise<any[]> - Array of processed attachment parts for Gemini
 */
async function processAttachments(attachments: Message['attachments']): Promise<any[]> {
  const parts: any[] = [];
  
  if (attachments && attachments.size > 0) {
    for (const attachment of attachments.values()) {
      if (attachment.contentType?.startsWith('image/')) {
        // For images, fetch the image data and add as inline data
        try {
          const response = await fetch(attachment.url);
          const buffer = await response.arrayBuffer();
          const base64Data = Buffer.from(buffer).toString('base64');
          
          parts.push({
            inlineData: {
              mimeType: attachment.contentType,
              data: base64Data
            }
          });
        } catch (error) {
          console.error('Error processing image attachment:', error);
          parts.push({
            text: `[Error loading image: ${attachment.name}]`
          });
        }
      } else if (attachment.contentType === 'application/pdf' || 
                 attachment.contentType?.startsWith('text/')) {
        // For PDFs and text files, you might want to add a note about the file
        // Note: Gemini may not directly support PDF processing in all models
        parts.push({
          text: `[Attached file: ${attachment.name} (${attachment.contentType})]`
        });
      }
    }
  }
  
  return parts;
}

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

    // Process attachments for Gemini
    const attachmentParts = await processAttachments(msg.attachments);
    const hasAttachments = msg.attachments.size > 0;

    const response = await queryMacronAI(
      pastMessages,
      msg.author.id,
      msg.author.displayName,
      cleanedMessageContent,
      client.user?.username || "Emmanuel Macron",
      { attachmentParts, hasAttachments }
    );
    await msg.reply(response);

    // Auto-learn from the user's message (runs in background)
    await autoLearnFromMessage(msg, cleanedMessageContent);

  }
}
