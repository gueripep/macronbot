import { Content } from "@google/genai";
import { Message } from "discord.js";
import fetch from "node-fetch";
import { CHANNEL_IDS } from "../config.js";
import db from "../dbSetup.js";
import { getTodaysWordleData } from "../services/macronWordle.js";
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
 * Filters relevant information for a user message
 * @param msg - The Discord message to analyze
 */
async function getRelevantInformation(contents: Content[]): Promise<string> {
  try {
    // Extract all information about all users from the database
    const stmt = db.prepare('SELECT user_id, username, real_name, information FROM user_info');
    const allUsers = stmt.all();

    if (!allUsers || allUsers.length === 0) {
      return "No user information stored yet.";
    }

    // Format the user information into a readable string
    const userInfoStrings = allUsers.map((user: any) => {
      const realNamePart = user.real_name ? ` (${user.real_name})` : '';
      return `${user.username}${realNamePart}: ${user.information}`;
    });

    // Get today's date and format it in French
    const today = new Date().toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });


    // Get today's wordle solution
    const wordleSolution = (await getTodaysWordleData()).solution;

    const completeInfoString = `Aujourd'hui nous sommes le ${today}.\n\nInformations connues sur les utilisateurs:\n${userInfoStrings.join('\n')}\n\nSolution du Wordle d'aujourd'hui: ${wordleSolution}`;


    // Use AI to filter only relevant information for this specific message
    // const relevantInfoString = await queryAIFilterRelevantInfo(contents, completeInfoString);

    return completeInfoString;
  } catch (error) {
    console.error('Error retrieving user information:', error);
    return "Error retrieving user information.";
  }
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

export async function getConversationInGeminiFormat(msg: Message, client: any): Promise<Content[]> {
  const history = await msg.channel.messages.fetch({ limit: 10 });
  const contents: Content[] = [];
  const messages = Array.from(history.values()).reverse();

  // Helper function to clean message content
  const cleanMessageContent = (message: Message) => {
    return message.content
      .replace(/<@\d+>/g, (match) => {
        const mention = message.mentions.users.find((user: any) => user.id === match);
        return mention ? mention.displayName : match;
      })
      .trim();
  };

  for (const message of messages) {
    const cleanContent = cleanMessageContent(message);
    const hasAttachments = message.attachments && message.attachments.size > 0;

    // Skip messages with no content and no attachments
    if (!cleanContent && !hasAttachments) continue;

    // Check if this message is a reply and format accordingly
    let messageText = cleanContent;
    if (message.author.id !== client.user?.id && message.reference?.messageId) {
      const repliedToMessage = await msg.channel.messages.fetch(message.reference.messageId).catch(() => null);
      // remove that part for the model responses because the bot thinks it should write it otherwise
      if (repliedToMessage) {
        const repliedToContent = cleanMessageContent(repliedToMessage);
        const truncatedContent = repliedToContent.substring(0, 50) + (repliedToContent.length > 50 ? '...' : '');
        messageText = `[En réponse à ${repliedToMessage.author.displayName}: "${truncatedContent}"]\n${cleanContent}`;
      }
    }

    const role = (message.author.bot && message.author.id === client.user?.id) ? 'model' : 'user';



    // For current message, remove bot mention
    const finalText = message.id === msg.id
      ? messageText.replace(`<@${client.user?.id}>`, '').trim()
      : messageText;

    const text = role === 'model' ? finalText : `${message.author.displayName}: ${finalText}`;

    // Process attachments for all messages
    const attachmentParts = await processAttachments(message.attachments);

    // Create parts array with text and attachments
    const parts = [{ text }];
    if (attachmentParts.length > 0) {
      parts.push(...attachmentParts);
    }

    contents.push({ role, parts });
  }

  return contents;
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

    const contents = await getConversationInGeminiFormat(msg, client);
    const relevantInfo = await getRelevantInformation(contents);


    const response = await queryMacronAI(
      contents,
      relevantInfo
    );
    await msg.reply(response);
    await autoLearnFromMessage(msg, contents[contents.length - 1].parts![0].text!);
  }
}
