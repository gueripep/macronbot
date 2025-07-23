import { ChatInputCommandInteraction } from "discord.js";
import { parseStringPromise } from "xml2js";
import { RedditRssFeed, TenKSection } from "../../types.js";
import { ClosedTransaction } from "../../types/ClosedTransaction.js";
import {
  queryAIMarketDecision,
  queryAISentiment,
  queryAITickerListFromRedditPost,
  queryAITradeExplanation,
} from "../ollama.js";
import { AIAnalysisCacheService } from "./ai-analysis-cache-service.js";
import { CompanyDataService } from "./company-data-service.js";
import { PortfolioService } from "./portfolio-service.js";
import { PriceService } from "./price-service.js";

const NEWS_SOURCE = "https://www.reddit.com/r/wallstreetbets/search.rss?q=flair_name:%22DD%22&restrict_sr=1&sort=new";

// Rate limiting for trade command (1 hour cooldown)
const TRADE_COMMAND_COOLDOWN = 60 * 60 * 1000; // 1 hour in milliseconds
const lastTradeCommandExecution = new Map<string, number>();

// Trading limits to prevent excessive API costs
const MAX_REDDIT_POSTS_TO_PROCESS = 5; // Maximum number of Reddit posts to analyze per trade session
const MAX_TICKERS_PER_POST = 3; // Maximum number of tickers to process from each post

/**
 * Service class responsible for managing automated trading operations
 * Handles fetching market data, analyzing Reddit posts, and executing trades
 */
export class TradingService {
  
  /**
   * Fetches and parses the RSS feed from Reddit's WallStreetBets discussion posts
   * @returns Promise<RedditRssFeed> - Parsed RSS feed containing discussion posts
   */
  static async fetchRssFeed(): Promise<RedditRssFeed> {
    const response = await fetch(NEWS_SOURCE);
    const xml = await response.text();
    const parsed = await parseStringPromise(xml, { explicitArray: false });
    return parsed.feed;
  }

  /**
   * Handles the trade command interaction with rate limiting
   * @param interaction - Discord ChatInputCommandInteraction
   */
  static async handleTradeCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      const userId = interaction.user.id;
      const now = Date.now();
      
      // Check rate limiting
      const lastExecution = lastTradeCommandExecution.get(userId);
      if (lastExecution && now - lastExecution < TRADE_COMMAND_COOLDOWN) {
        const timeLeft = Math.ceil((TRADE_COMMAND_COOLDOWN - (now - lastExecution)) / (60 * 1000));
        await interaction.reply({ 
          content: `🕐 Tu dois attendre encore ${timeLeft} minute(s) avant de pouvoir utiliser cette commande à nouveau.`, 
          ephemeral: true 
        });
        return;
      }

      // Defer the reply since trading analysis might take some time
      await interaction.deferReply();

      // Update rate limiting
      lastTradeCommandExecution.set(userId, now);

      // Execute the trade analysis
      const tradeExplanation = await this.trade();
      const embed = await PortfolioService.getPortfolioEmbed();

      if (tradeExplanation && embed) {
        await interaction.editReply({
          content: tradeExplanation,
          embeds: [embed]
        });
      } else {
        await interaction.editReply({
          content: "Aucune opportunité de trading trouvée pour le moment."
        });
      }

    } catch (error) {
      console.error('Error in trade command:', error);
      
      // Handle the error response appropriately
      if (interaction.deferred) {
        await interaction.editReply({ 
          content: 'Désolé, une erreur s\'est produite lors de l\'analyse des opportunités de trading.' 
        });
      } else {
        await interaction.reply({ 
          content: 'Désolé, une erreur s\'est produite lors de l\'analyse des opportunités de trading.',
          ephemeral: true
        });
      }
    }
  }

  /**
   * Main trading method that orchestrates the entire trading process:
   * 1. Checks and closes existing positions based on stop loss/take profit
   * 2. Fetches latest Reddit posts from WallStreetBets
   * 3. Analyzes posts for stock tickers
   * 4. Processes each ticker for potential trades
   * @returns Promise<string | null> - Trade explanation message or null if no trades executed
   */
  static async trade(): Promise<string | null> {
    // First, check and close positions based on stop loss/take profit
    await this.checkAndClosePositions();

    const feed = await this.fetchRssFeed();
    let postsProcessed = 0;

    // Process each Reddit post for trading opportunities (with limit)
    for (const item of feed.entry) {
      if (postsProcessed >= MAX_REDDIT_POSTS_TO_PROCESS) {
        console.log(`Reached maximum posts limit (${MAX_REDDIT_POSTS_TO_PROCESS}), stopping analysis`);
        break;
      }

      try {
        console.log(`Processing Reddit post ${postsProcessed + 1}/${MAX_REDDIT_POSTS_TO_PROCESS}: ${item.title}`);

        // Extract stock tickers mentioned in the post
        const tickers = await queryAITickerListFromRedditPost(item);
        if (!tickers || tickers.length === 0) {
          console.log("No tickers found in this post, trying next...");
          postsProcessed++;
          continue;
        }

        const redditPostWithTickers = { ...item, tickers };
        console.log(`Found tickers: ${tickers.join(", ")}`);

        // Process each ticker found in the post (with limit)
        let tickersProcessed = 0;
        for (const ticker of tickers) {
          if (tickersProcessed >= MAX_TICKERS_PER_POST) {
            console.log(`Reached maximum tickers limit (${MAX_TICKERS_PER_POST}) for this post, moving to next post`);
            break;
          }

          try {
            const result = await this.processTicker(ticker, redditPostWithTickers);
            tickersProcessed++;
            if (result) return result; // Return on first successful trade
          } catch (tickerError) {
            console.error(`Error processing ticker ${ticker}:`, tickerError);
            tickersProcessed++;
            continue;
          }
        }
      } catch (postError) {
        console.error(`Error processing Reddit post "${item.title}":`, postError);
      } finally {
        postsProcessed++;
      }
    }

    console.log(`Processed ${postsProcessed} Reddit posts, no successful trades executed`);
    return null;
  }

  /**
   * Monitors all active positions and automatically closes them when:
   * - Stop loss threshold is reached
   * - Take profit target is hit
   * - Position has expired (past end date)
   * Updates available money when positions are closed
   * @returns Promise<ClosedTransaction[]> - Array of transactions that were closed
   */
  static async checkAndClosePositions(): Promise<ClosedTransaction[]> {
    const db = await this.getDB();
    const currentDate = new Date().toISOString().split('T')[0];
    const closedTransactions: ClosedTransaction[] = [];
    
    // Get all active positions that haven't been closed and haven't expired
    const activePositions = db.prepare(`
      SELECT * FROM transactions 
      WHERE is_closed = FALSE AND end_date >= ?
    `).all(currentDate);

    if (activePositions.length === 0) {
      console.log("No active positions to check");
      return closedTransactions;
    }

    // Get current prices for all active tickers
    const uniqueTickers: any[] = [...new Set(activePositions.map((t: any) => t.ticker))];
    const currentPrices = await PriceService.getPricesFromSymbols(uniqueTickers);

    // Check each position for stop loss, take profit, or expiration
    for (const position of activePositions) {
      const currentPrice = currentPrices[position.ticker];
      
      if (!currentPrice) {
        console.log(`No current price available for ${position.ticker}, skipping...`);
        continue;
      }

      // Calculate current profit/loss percentage
      const pnlPercentage = this.calculatePnL(
        position.decision,
        position.buy_price,
        currentPrice,
        position.leverage
      );

      let shouldClose = false;
      let closeReason: 'stop_loss' | 'take_profit' | 'expired' | 'manual' = 'manual';

      // Check stop loss threshold
      if (pnlPercentage <= -position.stop_loss) {
        shouldClose = true;
        closeReason = 'stop_loss';
        console.log(`Stop loss triggered for ${position.ticker}: ${pnlPercentage.toFixed(2)}% <= -${position.stop_loss}%`);
      }
      // Check take profit threshold
      else if (pnlPercentage >= position.take_profit) {
        shouldClose = true;
        closeReason = 'take_profit';
        console.log(`Take profit triggered for ${position.ticker}: ${pnlPercentage.toFixed(2)}% >= ${position.take_profit}%`);
      }
      // Check if position has expired
      else if (position.end_date < currentDate) {
        shouldClose = true;
        closeReason = 'expired';
        console.log(`Position expired for ${position.ticker}`);
      }

      // Close position and return money to available balance
      if (shouldClose) {
        await this.closePosition(position.id, currentPrice, closeReason);
        
        // Calculate final position value and add back to available money
        const finalValue = position.amount_invested * (1 + pnlPercentage / 100);
        const pnlDollar = finalValue - position.amount_invested;
        const currentAvailable = db.prepare("SELECT available FROM money WHERE id = 1").get().available;
        await this.updateAvailableMoney(currentAvailable + finalValue);

        // Create ClosedTransaction object
        const closedTransaction = new ClosedTransaction(
          position.id,
          position.ticker,
          position.decision,
          position.amount_invested,
          position.buy_price,
          currentPrice,
          position.leverage,
          pnlPercentage,
          pnlDollar,
          closeReason,
          position.start_date,
          position.end_date,
          currentDate,
          finalValue
        );

        closedTransactions.push(closedTransaction);
        
        console.log(`Closed position ${position.ticker} for ${closeReason}: ${pnlPercentage.toFixed(2)}% P&L`);
        console.log(closedTransaction.toString());
      }
    }

    // Log summary of closed positions
    if (closedTransactions.length > 0) {
      console.log(`\n=== POSITION CLOSURE SUMMARY ===`);
      console.log(`Total positions closed: ${closedTransactions.length}`);
      
      const profitable = closedTransactions.filter(t => t.isProfit);
      const losses = closedTransactions.filter(t => !t.isProfit);
      
      console.log(`Profitable: ${profitable.length} | Losses: ${losses.length}`);
      
      const totalPnL = closedTransactions.reduce((sum, t) => sum + t.pnlDollar, 0);
      console.log(`Total P&L: $${totalPnL.toFixed(2)}`);
      
      console.log(`\nClosed positions:`);
      closedTransactions.forEach(t => console.log(`  ${t.toString()}`));
      console.log(`================================\n`);
    }

    return closedTransactions;
  }

  /**
   * Marks a position as closed in the database with closing details
   * @param transactionId - Database ID of the transaction to close
   * @param closePrice - Final price at which the position was closed
   * @param closeReason - Reason for closure ('stop_loss', 'take_profit', 'expired', 'manual')
   */
  private static async closePosition(transactionId: number, closePrice: number, closeReason: string): Promise<void> {
    const db = await this.getDB();
    const closeDate = new Date().toISOString().split('T')[0];
    
    db.prepare(`
      UPDATE transactions 
      SET is_closed = TRUE, close_reason = ?, close_price = ?, close_date = ?
      WHERE id = ?
    `).run(closeReason, closePrice, closeDate, transactionId);
  }

  /**
   * Calculates profit/loss percentage for a position considering leverage
   * @param decision - Trade direction ('Long' or 'Short')
   * @param entryPrice - Price at which position was opened
   * @param currentPrice - Current market price
   * @param leverage - Leverage multiplier (1x to 10x)
   * @returns Profit/loss percentage including leverage effect
   */
  private static calculatePnL(decision: string, entryPrice: number, currentPrice: number, leverage: number): number {
    if (decision === 'Long') {
      // For long positions: profit when price goes up
      return ((currentPrice - entryPrice) / entryPrice) * 100 * leverage;
    } else {
      // For short positions: profit when price goes down
      return ((entryPrice - currentPrice) / entryPrice) * 100 * leverage;
    }
  }

  /**
   * Processes a specific ticker for potential trading opportunities:
   * 1. Fetches 10-K filing and extracts required sections
   * 2. Gets or generates AI analysis (using cache when available)
   * 3. Gathers financial data and price information
   * 4. Generates AI sentiment analysis
   * 5. Makes trading decision using AI
   * 6. Saves transaction and updates available money
   * @param ticker - Stock ticker symbol to analyze
   * @param redditPost - Reddit post containing the ticker mention
   * @returns Promise<string | null> - AI-generated trade explanation or null if no trade
   */
  private static async processTicker(ticker: string, redditPost: any): Promise<string | null> {
    console.log(`Processing ticker: ${ticker}`);
    //Ignore the ticker if there is already an active position
    const db = await this.getDB();
    const currentDate = new Date().toISOString().split('T')[0];
    const existingPosition = db.prepare(`
      SELECT * FROM transactions 
      WHERE ticker = ? AND is_closed = FALSE AND end_date >= ?
    `).get(ticker, currentDate);
    if (existingPosition) {
      console.log(`Active position already exists for ${ticker}, skipping...`);
      return null;
    }

    // Get 10-K filing content for fundamental analysis
    const tenKSections = await CompanyDataService.get10KContent(ticker);
    const business10k = tenKSections[TenKSection.Business];
    const riskFactors10k = tenKSections[TenKSection.RiskFactors];
    const mdna = tenKSections[TenKSection.MDNA];
    
    // Validate all required sections are available
    if (!mdna || mdna.trim().length === 0) {
      console.log(`No MD&A section found for ticker ${ticker}`);
      return null;
    }
    if(!business10k || business10k.trim().length === 0) {
      console.log(`No Business section found for ticker ${ticker}`);
      return null;
    }
    if(!riskFactors10k || riskFactors10k.trim().length === 0) {
      console.log(`No Risk Factors section found for ticker ${ticker}`);
      return null;
    }

    // Get or generate AI analysis (using cache when available)
    const tenKSummary = await AIAnalysisCacheService.getOrGenerateAnalysis(
      ticker, 
      business10k, 
      riskFactors10k, 
      mdna
    );

    // Gather comprehensive financial data
    const [priceInfo, companyOverview] = await Promise.all([
      CompanyDataService.getPriceInformation(ticker),
      CompanyDataService.getCompanyOverview(ticker)
    ]);

    console.log(`Financial data gathered for ${ticker}`);
    console.log("Initializing AI decision...");
    // Generate AI sentiment and trading decision
    const sentiment = await queryAISentiment(redditPost, tenKSummary.aiAnalysis, companyOverview);
    
    const availableMoney = db.prepare("SELECT available FROM money WHERE id = 1").get().available;
    
    // Get AI trading recommendation
    const tradingDecisionJson = await queryAIMarketDecision(sentiment, availableMoney);
    const tradingDecision = JSON.parse(tradingDecisionJson);

    // Execute the trade: save transaction and update money
    await this.saveTransaction(tradingDecision, ticker, priceInfo.currentPrice);
    await this.updateAvailableMoney(availableMoney - tradingDecision.amountToInvest);

    console.log(`Successfully processed ${ticker} trade`);
    return await queryAITradeExplanation(tradingDecision, ticker);
  }

  /**
   * Saves a new trading transaction to the database
   * @param tradingDecision - AI-generated trading decision object containing all trade parameters
   * @param ticker - Stock ticker symbol
   * @param buyPrice - Current market price for the stock
   */
  private static async saveTransaction(tradingDecision: any, ticker: string, buyPrice: number): Promise<void> {
    const db = await this.getDB();
    const stmt = db.prepare(`
      INSERT INTO transactions (decision, ticker, amount_invested, buy_price, leverage, start_date, end_date, summary, confidence, stop_loss, take_profit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      tradingDecision.decision,
      ticker,
      tradingDecision.amountToInvest,
      buyPrice,
      tradingDecision.suggestedLeverage,
      tradingDecision.startDate,
      tradingDecision.endDate,
      tradingDecision.summary,
      tradingDecision.confidenceLevel,
      tradingDecision.stopLoss,
      tradingDecision.takeProfit
    );
  }

  /**
   * Updates the available money balance in the database
   * @param newAmount - New available money amount
   */
  private static async updateAvailableMoney(newAmount: number): Promise<void> {
    const db = await this.getDB();
    db.prepare("UPDATE money SET available = ? WHERE id = 1").run(newAmount);
    console.log(`Available money updated to: ${newAmount}`);
  }

  /**
   * Gets the database connection instance
   * @returns Database connection object
   */
  private static async getDB() {
    return (await import("../../dbSetup")).default;
  }
  /**
   * Gets the count of currently active trading positions
   * @returns Promise<number> - Number of active positions
   */
  static async getActiveTradesCount(): Promise<number> {
    const db = await this.getDB();
    const currentDate = new Date().toISOString().split('T')[0];
    
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM transactions 
      WHERE is_closed = FALSE AND end_date >= ?
    `).get(currentDate);
    
    return result.count;
  }
}

// Export convenience functions for external use
export const fetchRssFeed = TradingService.fetchRssFeed.bind(TradingService);
export const trade = TradingService.trade.bind(TradingService);
export const getPortfolioEmbed = PortfolioService.getPortfolioEmbed.bind(PortfolioService);
export const checkAndClosePositions = TradingService.checkAndClosePositions.bind(TradingService);
export const getActiveTradesCount = TradingService.getActiveTradesCount.bind(TradingService);
export const handleTradeCommand = TradingService.handleTradeCommand.bind(TradingService);