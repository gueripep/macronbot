import { Client, TextChannel } from "discord.js";
import express from "express";
import { squeegeeChannelId } from "./config.js";

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
    this.app.post('/trigger', (req, res) => {
      const { message } = req.body;
      console.log('Received trigger with message:', message);

      try {
        this.handleTrigger(message);
        res.json({ success: true, message: 'Trigger processed successfully' });
      } catch (error) {
        console.error('Error processing trigger:', error);
        res.status(500).json({ success: false, error: 'Failed to process trigger' });
      }
    });

    // PM2 message trigger endpoint
    this.app.post('/pm2-trigger', (req, res) => {
      const { type, data } = req.body;
      console.log('Received PM2 trigger:', type, data);

      try {
        this.handlePM2Trigger(type, data);
        res.json({ success: true, message: 'PM2 trigger processed successfully' });
      } catch (error) {
        console.error('Error processing PM2 trigger:', error);
        res.status(500).json({ success: false, error: 'Failed to process PM2 trigger' });
      }
    });
  }

  /**
   * Handle trigger requests
   * @param message - Trigger message
   * @param action - Optional action type
   */
  private handleTrigger(message: string): void {
    if (!this.client) {
      console.warn('Discord client not set, cannot process trigger');
      return;
    }

    const channel = this.client.channels.cache.get(squeegeeChannelId) as TextChannel;
    if (channel) {
      channel.send(message);
    } else {
      console.error('Could not find Discord channel for trigger');
    }
  }

  /**
   * Handle PM2 trigger requests
   * @param type - Trigger type
   * @param data - Trigger data
   */
  private handlePM2Trigger(type: string, data: any): void {
    if (!this.client) {
      console.warn('Discord client not set, cannot process PM2 trigger');
      return;
    }

    if (type === 'trigger-action') {
      const channel = this.client.channels.cache.get(squeegeeChannelId) as TextChannel;
      if (channel) {
        channel.send("🚀 Triggered by PM2 message!");
      }
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
