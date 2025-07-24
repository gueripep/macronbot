import { Client, TextChannel } from "discord.js";
import express from "express";
import { testChannelId } from "./config.js";
import { queryGeminiWithPrompt } from "./services/ollama.js";

/**
 * Express server for handling external triggers and webhooks
 */
export class TriggerServer {
  private app: express.Application;
  private port: number;
  private client: Client | null = null;

  constructor(port: number = 3001) {
    this.app = express();
    this.port = port;
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Set the Discord client instance for server operations
   * @param client - Discord client instance
   */
  setDiscordClient(client: Client): void {
    this.client = client;
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    this.app.use(express.json());
  }

  /**
   * Setup Express routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Main trigger endpoint
    this.app.post('/trigger', async (req, res) => {
      const { message } = req.body;
      console.log('Received trigger with message:', message);

      try {
        await this.handleTrigger(message);
        res.json({ success: true, message: 'Trigger processed successfully' });
      } catch (error) {
        console.error('Error processing trigger:', error);
        res.status(500).json({ success: false, error: 'Failed to process trigger' });
      }
    });
  }

  /**
   * Handle trigger requests
   * @param message - Trigger message (usually a commit message)
   */
  private async handleTrigger(message: string): Promise<void> {
    if (!this.client) {
      console.warn('Discord client not set, cannot process trigger');
      return;
    }

    // Ask AI to explain the commit/trigger message as Emmanuel Macron
    const macronResponse = await this.generateMacronResponse(message);

    const channel = this.client.channels.cache.get(testChannelId) as TextChannel;
    if (channel) {
      await channel.send(macronResponse);
    } else {
      console.error('Could not find Discord channel for trigger');
    }
  }

  /**
   * Generate Emmanuel Macron's response to a trigger/commit message
   * @param triggerMessage - The original trigger message
   * @returns Promise<string> - Macron's response
   */
  private async generateMacronResponse(triggerMessage: string): Promise<string> {
    const prompt = `
      Tu es Emmanuel Macron, président de la République française. On vient de te mettre à jour avec les changements suivants :

      "${triggerMessage}"

      En environ 50 mots explique ces changements en Français comme si tu étais le président, et explique pourquoi ils sont importants pour la France.
      N'écris ABSOLUMENT rien d'autre que ce que Macron dirait.
      Commence le message par "🔧 Mise à jour reçue : "
    `;

    try {
      return await queryGeminiWithPrompt(prompt, { maxOutputTokens: 100 });
    } catch (error) {
      console.error('Error generating Macron response:', error);
      return `🔧 Mise à jour reçue : "${triggerMessage}". En tant que président, je supervise personnellement ces améliorations technologiques !`;
    }
  }


  /**
   * Start the Express server
   */
  start(): void {
    this.app.listen(this.port, () => {
      console.log(`🌐 Trigger server listening on http://localhost:${this.port}`);
      console.log(`Available endpoints:`);
      console.log(`  GET  /health - Health check`);
      console.log(`  POST /trigger - Main trigger endpoint`);
      console.log(`  POST /pm2-trigger - PM2 trigger endpoint`);
    });
  }

  /**
   * Get Express app instance (for testing or advanced configuration)
   */
  getApp(): express.Application {
    return this.app;
  }
}
