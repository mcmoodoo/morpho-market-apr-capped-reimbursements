// Event types — only fields needed for ordering + reimbursement math
export interface AccrueInterestEvent {
  type: "accrue";
  blockNumber: bigint;
  transactionIndex: number;
  logIndex: number;
  timestamp: number;
  prevBorrowRate: bigint;
}

export interface BorrowEvent {
  type: "borrow";
  blockNumber: bigint;
  transactionIndex: number;
  logIndex: number;
  timestamp: number;
  borrower: string;
  assets: bigint;
}

export interface RepayEvent {
  type: "repay";
  blockNumber: bigint;
  transactionIndex: number;
  logIndex: number;
  timestamp: number;
  borrower: string;
  assets: bigint;
}

export interface LiquidateEvent {
  type: "liquidate";
  blockNumber: bigint;
  transactionIndex: number;
  logIndex: number;
  timestamp: number;
  borrower: string;
  repaidAssets: bigint;
}

export type TimelineEvent =
  | AccrueInterestEvent
  | BorrowEvent
  | RepayEvent
  | LiquidateEvent;

// Output
export interface BorrowerRefund {
  address: string;
  overpayment: string;
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
