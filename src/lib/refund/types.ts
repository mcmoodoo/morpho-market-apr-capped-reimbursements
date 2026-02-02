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
