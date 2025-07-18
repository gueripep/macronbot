/**
 * Represents a transaction that was automatically closed by the system
 */
export class ClosedTransaction {
  constructor(
    public readonly id: number,
    public readonly ticker: string,
    public readonly decision: 'Long' | 'Short',
    public readonly amountInvested: number,
    public readonly buyPrice: number,
    public readonly closePrice: number,
    public readonly leverage: number,
    public readonly pnlPercentage: number,
    public readonly pnlDollar: number,
    public readonly closeReason: 'stop_loss' | 'take_profit' | 'expired' | 'manual',
    public readonly startDate: string,
    public readonly endDate: string,
    public readonly closeDate: string,
    public readonly finalValue: number
  ) {}

  /**
   * Checks if the position was profitable
   */
  get isProfit(): boolean {
    return this.pnlPercentage > 0;
  }

  /**
   * Gets a human-readable description of the close reason
   */
  get closeReasonDescription(): string {
    switch (this.closeReason) {
      case 'stop_loss': return 'Stop Loss Triggered';
      case 'take_profit': return 'Take Profit Reached';
      case 'expired': return 'Position Expired';
      case 'manual': return 'Manually Closed';
      default: return 'Unknown';
    }
  }

  /**
   * Gets a formatted string representation of the P&L
   */
  get formattedPnL(): string {
    const sign = this.pnlPercentage >= 0 ? '+' : '';
    return `${sign}${this.pnlPercentage.toFixed(2)}% (${sign}$${this.pnlDollar.toFixed(2)})`;
  }

  /**
   * Gets the duration of the position in days
   */
  get positionDuration(): number {
    const start = new Date(this.startDate);
    const close = new Date(this.closeDate);
    return Math.ceil((close.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * Creates a summary string for logging or display
   */
  toString(): string {
    const emoji = this.isProfit ? '🟢' : '🔴';
    return `${emoji} ${this.ticker} ${this.decision} - ${this.closeReasonDescription}: ${this.formattedPnL} (${this.positionDuration} days)`;
  }

  /**
   * Converts to a plain object for JSON serialization
   */
  toJSON() {
    return {
      id: this.id,
      ticker: this.ticker,
      decision: this.decision,
      amountInvested: this.amountInvested,
      buyPrice: this.buyPrice,
      closePrice: this.closePrice,
      leverage: this.leverage,
      pnlPercentage: this.pnlPercentage,
      pnlDollar: this.pnlDollar,
      closeReason: this.closeReason,
      startDate: this.startDate,
      endDate: this.endDate,
      closeDate: this.closeDate,
      finalValue: this.finalValue,
      isProfit: this.isProfit,
      closeReasonDescription: this.closeReasonDescription,
      formattedPnL: this.formattedPnL,
      positionDuration: this.positionDuration
    };
  }
}