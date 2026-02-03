export interface AccrueInterestEvent {
  type: "accrue";
  marketId: string;
  blockNumber: bigint;
  transactionIndex: number;
  logIndex: number;
  transactionHash: string;
  timestamp: number;
  prevBorrowRate: bigint;
}

export interface BorrowEvent {
  type: "borrow";
  marketId: string;
  blockNumber: bigint;
  transactionIndex: number;
  logIndex: number;
  transactionHash: string;
  timestamp: number;
  borrower: string;
  assets: bigint;
}

export interface RepayEvent {
  type: "repay";
  marketId: string;
  blockNumber: bigint;
  transactionIndex: number;
  logIndex: number;
  transactionHash: string;
  timestamp: number;
  borrower: string;
  assets: bigint;
}

export interface LiquidateEvent {
  type: "liquidate";
  marketId: string;
  blockNumber: bigint;
  transactionIndex: number;
  logIndex: number;
  transactionHash: string;
  timestamp: number;
  borrower: string;
  repaidAssets: bigint;
}

export type TimelineEvent =
  | AccrueInterestEvent
  | BorrowEvent
  | RepayEvent
  | LiquidateEvent;
