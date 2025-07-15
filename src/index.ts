import fetch from "node-fetch";
import { Client, GatewayIntentBits, Message, TextChannel } from "discord.js";
import cron from "node-cron";
import dotenv from "dotenv";

dotenv.config();

const CHANNEL_IDS: string[] = ["1215373524923977748", "768470703989063713"];
const randomReplies: string[] = [
  "Tu me fatigues là...",
  "Fin fréro ping moi pas pour dire ca stp la prochaine fois",
];

interface OllamaResponse {
  response: string;
}

async function queryOllama(pastMessages: string, msg: Message): Promise<string> {
  const prompt = `
    Tu es ${client.user?.username}. Voici la conversation précédant la demande :
    ${pastMessages}
    Réponds au message suivant en tant que emmanuel macron : ${msg.content}.
    Sois un peu con, ta réponse doit faire 20 mots MAX, hésite pas à lacher 2 ou 3 insultes de temps en temps. N'hésite pas à mentionner le nom de celui qui fait la demande : ${msg.author.displayName}
    `;
  console.log(prompt);
  
  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "mistral:7b",
      prompt: prompt,
      stream: false,
    }),
  });

  const data = await response.json() as OllamaResponse;
  return data.response;
}

// Daily method that runs every day at 9 AM
async function dailyMethod(): Promise<void> {
  console.log("Daily method executed at:", new Date().toISOString());
  
  // You can add your daily tasks here
  // For example, send a message to a specific channel
  const channel = client.channels.cache.get(CHANNEL_IDS[0]) as TextChannel;
  if (channel) {
    const dailyMessages: string[] = [
      "Bonjour les français ! C'est un nouveau jour pour la startup nation !",
    ];
    
    const randomMessage = dailyMessages[Math.floor(Math.random() * dailyMessages.length)];
    await channel.send(randomMessage);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", (): void => {
  console.log(`Logged in as ${client.user?.tag}`);
  
  // Schedule daily method to run every day at 9:00 AM
  cron.schedule('0 9 * * *', async (): Promise<void> => {
    await dailyMethod();
  });
  
  console.log("Daily cron job scheduled for 9:00 AM");
});

client.on("messageCreate", async (msg: Message): Promise<void> => {
  if (msg.mentions.has(client.user!) && msg.author.id !== client.user?.id) {
    if (!CHANNEL_IDS.includes(msg.channel.id)) {
      await msg.reply("Je réponds que dans le channel de mon gars sûr, déso"); // ignore tout sauf ce channel
      return;
    }
    
    const content = msg.content.replace(`<@${client.user?.id}>`, "").trim();
    if (!content) return;

    if (msg.channel.isTextBased() && 'sendTyping' in msg.channel) {
      await msg.channel.sendTyping();
    }

    if (Math.random() < 0.1) {
      const randomReply = randomReplies[Math.floor(Math.random() * randomReplies.length)];
      await msg.reply(randomReply);
    } else {
      const history = await msg.channel.messages.fetch({ limit: 20 });
      const pastMessages = Array.from(history.values())
        .reverse()
        .map((m: Message): string => `${m.author.username}: ${m.content}`)
        .join("\n");
      const response = await queryOllama(pastMessages, msg);
      await msg.reply(response);
    }
  }
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN is not set in environment variables");
  process.exit(1);
}

client.login(token);
