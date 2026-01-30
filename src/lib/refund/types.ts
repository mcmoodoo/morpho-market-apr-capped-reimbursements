// Event types (parsed from logs)
export interface AccrueInterestEvent {
  type: "accrue";
  blockNumber: bigint;
  transactionIndex: number;
  logIndex: number;
  timestamp: number;
  prevBorrowRate: bigint; // per-second rate in WAD
  interest: bigint; // total interest accrued (in assets)
  feeShares: bigint;
}

export interface BorrowEvent {
  type: "borrow";
  blockNumber: bigint;
  transactionIndex: number;
  logIndex: number;
  timestamp: number;
  borrower: string; // onBehalf address
  assets: bigint;
  shares: bigint;
}

export interface RepayEvent {
  type: "repay";
  blockNumber: bigint;
  transactionIndex: number;
  logIndex: number;
  timestamp: number;
  borrower: string; // onBehalf address
  assets: bigint;
  shares: bigint;
}

export interface LiquidateEvent {
  type: "liquidate";
  blockNumber: bigint;
  transactionIndex: number;
  logIndex: number;
  timestamp: number;
  borrower: string;
  repaidAssets: bigint;
  repaidShares: bigint;
}

export type TimelineEvent =
  | AccrueInterestEvent
  | BorrowEvent
  | RepayEvent
  | LiquidateEvent;

// Output types
export interface BorrowerRefund {
  address: string;
  overpayment: string; // formatted USDC amount
}

export interface RefundReport {
  marketId: string;
  chain: string;
  morphoBlue: string;
  thresholdAprPercent: string;
  periodStartBlock: number;
  periodEndBlock: number;
  periodStartTimestamp: number;
  periodEndTimestamp: number;
  totalOverpayment: string;
  borrowerCount: number;
  borrowers: BorrowerRefund[];
  generatedAt: string;
}
