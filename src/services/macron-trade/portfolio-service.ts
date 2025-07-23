import { EmbedBuilder } from "discord.js";
import { PriceService } from "./price-service.js";

export class PortfolioService {
  private static async getDB() {
    return (await import("../../dbSetup")).default;
  }

  static async getInvestedAmount(): Promise<number> {
    const db = await this.getDB();
    const currentDate = new Date().toISOString().split('T')[0];
    
    const activeTransactions = db.prepare(`
      SELECT * FROM transactions WHERE end_date > ? AND is_closed = FALSE
    `).all(currentDate);
    
    if (activeTransactions.length === 0) return 0;
    
    const uniqueTickers: any[] = [...new Set(activeTransactions.map((t: any) => t.ticker))];
    const currentPrices = await PriceService.getPricesFromSymbols(uniqueTickers);
    
    let totalCurrentValue = 0;
    
    for (const transaction of activeTransactions) {
      const currentPrice = currentPrices[transaction.ticker];
      
      if (currentPrice) {
        const pnlPercentage = this.calculatePnL(
          transaction.decision,
          transaction.buy_price,
          currentPrice,
          transaction.leverage
        );
        
        const currentValue = transaction.amount_invested * (1 + pnlPercentage / 100);
        totalCurrentValue += currentValue;
        
        console.log(`${transaction.ticker}: $${transaction.amount_invested} → $${currentValue.toFixed(2)} (${pnlPercentage.toFixed(2)}%)`);
      } else {
        totalCurrentValue += transaction.amount_invested;
        console.log(`${transaction.ticker}: Using original investment $${transaction.amount_invested} (price unavailable)`);
      }
    }
    
    return totalCurrentValue;
  }

  static async getTotalPortfolioValue(): Promise<number> {
    const db = await this.getDB();
    const money = db.prepare("SELECT available FROM money WHERE id = 1").get();
    const invested = await this.getInvestedAmount();
    return money.available + invested;
  }

  static async getPortfolioEmbed(): Promise<EmbedBuilder> {
    const db = await this.getDB();
    const currentDate = new Date().toISOString().split('T')[0];
    
    const activeTransactions = db.prepare(`
      SELECT * FROM transactions WHERE end_date > ? AND is_closed = FALSE ORDER BY start_date DESC
    `).all(currentDate);
    
    const money = db.prepare("SELECT available FROM money WHERE id = 1").get();
    const invested = await this.getInvestedAmount();
    const totalPortfolio = await this.getTotalPortfolioValue();

    const embed = new EmbedBuilder()
      .setTitle("📊 Portfolio de Trading - Emmanuel Macron")
      .setColor(0x0099FF)
      .setTimestamp()
      .addFields(
        { name: "💰 Argent Disponible", value: `$${money.available.toFixed(2)}`, inline: true },
        { name: "📈 Valeur Investie", value: `$${invested.toFixed(2)}`, inline: true },
        { name: "📊 Total Portfolio", value: `$${totalPortfolio.toFixed(2)}`, inline: true }
      );

    if (activeTransactions.length === 0) {
      embed.setDescription("Aucune position active actuellement. En même temps, il faut savoir attendre les bonnes opportunités !");
      return embed;
    }

    const portfolioFields = await this.buildPortfolioFields(activeTransactions);
    embed.addFields(...portfolioFields);

    const performanceSummary = this.buildPerformanceSummary(activeTransactions, invested);
    embed.addFields(performanceSummary);

    const randomMessage = this.getRandomMacronMessage();
    embed.setFooter({ text: randomMessage });

    return embed;
  }

  private static calculatePnL(decision: string, entryPrice: number, currentPrice: number, leverage: number): number {
    if (decision === 'Long') {
      return ((currentPrice - entryPrice) / entryPrice) * 100 * leverage;
    } else {
      return ((entryPrice - currentPrice) / entryPrice) * 100 * leverage;
    }
  }

  private static async buildPortfolioFields(activeTransactions: any[]): Promise<any[]> {
    const uniqueTickers = [...new Set(activeTransactions.map((t: any) => t.ticker))];
    const currentPrices = await PriceService.getPricesFromSymbols(uniqueTickers);
    const portfolioFields: any[] = [];

    for (const transaction of activeTransactions) {
      const currentPrice = currentPrices[transaction.ticker];
      
      if (currentPrice) {
        const pnlPercentage = this.calculatePnL(
          transaction.decision,
          transaction.buy_price,
          currentPrice,
          transaction.leverage
        );
        
        const pnlDollar = (transaction.amount_invested * pnlPercentage) / 100;
        const currentValue = transaction.amount_invested + pnlDollar;
        const isProfit = pnlPercentage >= 0;
        const emoji = isProfit ? "🟢" : "🔴";
        const sign = isProfit ? "+" : "";
        
        // Check if we're close to stop loss or take profit
        const stopLossEmoji = pnlPercentage <= (-transaction.stop_loss * 0.8) ? "⚠️" : "";
        const takeProfitEmoji = pnlPercentage >= (transaction.take_profit * 0.8) ? "🎯" : "";
        
        const fieldValue = [
          `**Position:** ${transaction.decision} ${transaction.leverage}x`,
          `**Investi:** $${transaction.amount_invested.toFixed(2)}`,
          `**Valeur Actuelle:** $${currentValue.toFixed(2)}`,
          `**Prix d'Achat:** $${transaction.buy_price.toFixed(2)}`,
          `**Prix Actuel:** $${currentPrice.toFixed(2)}`,
          `**P&L:** ${emoji} ${sign}${pnlPercentage.toFixed(2)}% (${sign}$${pnlDollar.toFixed(2)})`,
          `**Stop Loss:** ${stopLossEmoji} -${transaction.stop_loss}%`,
          `**Take Profit:** ${takeProfitEmoji} +${transaction.take_profit}%`,
          `**Fin:** ${transaction.end_date}`
        ].join('\n');

        portfolioFields.push({
          name: `${emoji} ${transaction.ticker.toUpperCase()}`,
          value: fieldValue,
          inline: true
        });
      } else {
        portfolioFields.push({
          name: `⚠️ ${transaction.ticker.toUpperCase()}`,
          value: [
            `**Position:** ${transaction.decision} ${transaction.leverage}x`,
            `**Investi:** $${transaction.amount_invested.toFixed(2)}`,
            `**Prix d'Achat:** $${transaction.buy_price.toFixed(2)}`,
            `**Stop Loss:** -${transaction.stop_loss}%`,
            `**Take Profit:** +${transaction.take_profit}%`,
            `**Status:** Erreur de prix`,
            `**Fin:** ${transaction.end_date}`
          ].join('\n'),
          inline: true
        });
      }
    }

    return portfolioFields;
  }

  private static buildPerformanceSummary(activeTransactions: any[], invested: number): any {
    const totalOriginalInvestment = activeTransactions.reduce((sum: number, t: any) => sum + t.amount_invested, 0);
    const totalPnL = invested - totalOriginalInvestment;
    const totalPnLPercentage = totalOriginalInvestment > 0 ? (totalPnL / totalOriginalInvestment) * 100 : 0;
    const totalEmoji = totalPnL >= 0 ? "🟢" : "🔴";
    const totalSign = totalPnL >= 0 ? "+" : "";
    
    return {
      name: "📊 Performance Totale",
      value: [
        `**P&L Total:** ${totalEmoji} ${totalSign}${totalPnLPercentage.toFixed(2)}% (${totalSign}$${totalPnL.toFixed(2)})`,
        `**Investi Original:** $${totalOriginalInvestment.toFixed(2)}`,
        `**Valeur Actuelle:** $${invested.toFixed(2)}`
      ].join('\n'),
      inline: false
    };
  }

  private static getRandomMacronMessage(): string {
    const messages = [
      "Investir c'est prendre des risques calculés !",
      "Il faut assumer ses positions et avancer avec détermination !",
      "#startupnation",
      "Nous devons être ambitieux dans nos investissements !"
    ];
    
    return messages[Math.floor(Math.random() * messages.length)];
  }
}