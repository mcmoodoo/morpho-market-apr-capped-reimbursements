import { createPublicClient, http } from "viem";
import { polygon } from "viem/chains";
import { parseAbiItem } from "viem";
import { MORPHO_BLUE } from "./src/lib/refund/config.ts";

const rpc = process.env.INFURA_POLYGON_MAINNET_RPC;
if (!rpc) {
  console.error("INFURA_POLYGON_MAINNET_RPC not set");
  process.exit(1);
}

const client = createPublicClient({
  chain: polygon,
  transport: http(rpc),
});

const LIQUIDATE_EVENT = parseAbiItem(
  "event Liquidate(bytes32 indexed id, address caller, address indexed borrower, uint256 repaidAssets, uint256 repaidShares, uint256 seizedAssets, uint256 badDebtAssets, uint256 badDebtShares)"
);

// Get a liquidate event that was skipped
const logs = await client.getLogs({
  address: MORPHO_BLUE,
  event: LIQUIDATE_EVENT,
  fromBlock: 82379040n,
  toBlock: 82379050n,
});

if (logs.length > 0) {
  const log = logs[0];
  console.log("Liquidate event:");
  console.log("  Block:", log.blockNumber);
  console.log("  Args:", JSON.stringify(log.args, (k, v) => typeof v === "bigint" ? v.toString() : v, 2));
  console.log("  repaidAssets type:", typeof log.args.repaidAssets);
  console.log("  repaidAssets value:", log.args.repaidAssets);
}
