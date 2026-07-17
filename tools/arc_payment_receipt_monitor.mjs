#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_RPC_URL = "https://rpc.testnet.arc.network";
export const DEFAULT_CONTRACT = "0x05fd366E0F1Af3C5DCDCdC88ED8824bbf175E1Df";
export const DEFAULT_FROM_BLOCK = 52159957;
export const PAYMENT_TOPIC = "0x2df51f58b1137cc09ade81bcd25f7b43daaf3584cf06d28132b94501050b083f";
export const RECEIPTS_SELECTOR = "0xef6cf04d";

function quantity(value) {
  return `0x${BigInt(value).toString(16)}`;
}

function strip0x(value) {
  return value.startsWith("0x") ? value.slice(2) : value;
}

function word(data, index) {
  const clean = strip0x(data);
  return clean.slice(index * 64, (index + 1) * 64).padStart(64, "0");
}

function topicAddress(topic) {
  return `0x${strip0x(topic).slice(-40)}`.toLowerCase();
}

function wordAddress(value) {
  return `0x${value.slice(-40)}`.toLowerCase();
}

function decimal(value, decimals = 18) {
  const raw = BigInt(value);
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const fraction = (raw % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function decodePaymentLog(log) {
  if (!log?.topics || log.topics.length !== 4 || log.topics[0].toLowerCase() !== PAYMENT_TOPIC) {
    throw new Error("Log is not a PaymentReceived event");
  }
  return {
    order_id: log.topics[1].toLowerCase(),
    payer: topicAddress(log.topics[2]),
    merchant: topicAddress(log.topics[3]),
    amount_wei: BigInt(`0x${word(log.data, 0)}`).toString(),
    amount_usdc: decimal(BigInt(`0x${word(log.data, 0)}`)),
    metadata_hash: `0x${word(log.data, 1)}`.toLowerCase(),
    transaction_hash: log.transactionHash.toLowerCase(),
    block_number: Number(BigInt(log.blockNumber)),
    log_index: Number(BigInt(log.logIndex))
  };
}

export function decodeReceiptResult(data) {
  const clean = strip0x(data);
  if (clean.length < 256) throw new Error("Receipt call returned incomplete data");
  return {
    payer: wordAddress(word(clean, 0)),
    amount_wei: BigInt(`0x${word(clean, 1)}`).toString(),
    amount_usdc: decimal(BigInt(`0x${word(clean, 1)}`)),
    metadata_hash: `0x${word(clean, 2)}`.toLowerCase(),
    block_number: Number(BigInt(`0x${word(clean, 3)}`))
  };
}

function encodeReceiptCall(orderId) {
  const clean = strip0x(orderId);
  if (clean.length !== 64) throw new Error(`Invalid orderId: ${orderId}`);
  return `${RECEIPTS_SELECTOR}${clean}`;
}

function parseArgs(argv) {
  const options = {
    rpcUrl: DEFAULT_RPC_URL,
    contract: DEFAULT_CONTRACT,
    fromBlock: DEFAULT_FROM_BLOCK,
    toBlock: null,
    chunkSize: 10000,
    requestTimeoutMs: 15000,
    retries: 3,
    jsonOut: null,
    markdownOut: null
  };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i + 1];
    switch (argv[i]) {
      case "--rpc-url": options.rpcUrl = value; i += 1; break;
      case "--contract": options.contract = value; i += 1; break;
      case "--from-block": options.fromBlock = Number(value); i += 1; break;
      case "--to-block": options.toBlock = Number(value); i += 1; break;
      case "--chunk-size": options.chunkSize = Number(value); i += 1; break;
      case "--request-timeout-ms": options.requestTimeoutMs = Number(value); i += 1; break;
      case "--retries": options.retries = Number(value); i += 1; break;
      case "--json-out": options.jsonOut = resolve(value); i += 1; break;
      case "--markdown-out": options.markdownOut = resolve(value); i += 1; break;
      case "--help": options.help = true; break;
      default: throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return options;
}

function help() {
  return [
    "Usage: node tools/arc_payment_receipt_monitor.mjs [options]",
    "",
    "Options:",
    "  --rpc-url URL",
    "  --contract ADDRESS",
    "  --from-block NUMBER",
    "  --to-block NUMBER",
    "  --chunk-size NUMBER",
    "  --request-timeout-ms NUMBER",
    "  --retries NUMBER",
    "  --json-out PATH",
    "  --markdown-out PATH"
  ].join("\n");
}

function wait(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function createRpc(url, requestTimeoutMs, retries) {
  let id = 0;
  return async function rpc(method, params = []) {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`${method} HTTP ${response.status}`);
        const body = await response.json();
        if (body.error) throw new Error(`${method}: ${body.error.message}`);
        return body.result;
      } catch (error) {
        lastError = error;
        if (attempt < retries) await wait(500 * attempt);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new Error(`${method} failed after ${retries} attempts: ${lastError?.message || lastError}`);
  };
}

async function collectLogs(rpc, contract, fromBlock, toBlock, chunkSize) {
  const logs = [];
  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = Math.min(toBlock, start + chunkSize - 1);
    const chunk = await rpc("eth_getLogs", [{
      fromBlock: quantity(start),
      toBlock: quantity(end),
      address: contract,
      topics: [PAYMENT_TOPIC]
    }]);
    logs.push(...chunk);
  }
  return logs.sort((a, b) => Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)) || Number(BigInt(a.logIndex) - BigInt(b.logIndex)));
}

function eventMatchesReceipt(event, receipt) {
  return event.payer === receipt.payer
    && event.amount_wei === receipt.amount_wei
    && event.metadata_hash === receipt.metadata_hash
    && event.block_number === receipt.block_number;
}

function renderMarkdown(report) {
  const lines = [
    "# Arc PaymentReceipt Event Monitor",
    "",
    `Generated: \`${report.generated_at}\``,
    "",
    `Contract: \`${report.contract}\``,
    `Blocks: \`${report.range.from}\` to \`${report.range.to}\``,
    `Events: \`${report.event_count}\``,
    `Contract balance: \`${report.contract_balance_usdc} test USDC\``,
    "",
    "## Checks",
    "",
    `- Unique order IDs: \`${report.checks.unique_order_ids}\``,
    `- All transaction receipts succeeded: \`${report.checks.all_transactions_succeeded}\``,
    `- All events match receipt storage: \`${report.checks.all_events_match_storage}\``,
    `- Contract retains no funds: \`${report.checks.contract_balance_zero}\``,
    "",
    "## Events",
    "",
    "| Block | Transaction | Order ID | Payer | Merchant | Amount | Gas | Storage match |",
    "| ---: | --- | --- | --- | --- | ---: | ---: | --- |"
  ];
  for (const item of report.events) {
    lines.push(`| ${item.block_number} | \`${item.transaction_hash}\` | \`${item.order_id}\` | \`${item.payer}\` | \`${item.merchant}\` | ${item.amount_usdc} | ${item.gas_cost_usdc} | ${item.storage_matches_event} |`);
  }
  lines.push("", "This is a read-only evidence artifact. It does not authorize or send wallet transactions.", "");
  return lines.join("\n");
}

async function writeOutput(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

export async function run(options) {
  const rpc = createRpc(options.rpcUrl, options.requestTimeoutMs, options.retries);
  const chainId = Number(BigInt(await rpc("eth_chainId")));
  const latestBlock = Number(BigInt(await rpc("eth_blockNumber")));
  const toBlock = options.toBlock ?? latestBlock;
  const rawLogs = await collectLogs(rpc, options.contract, options.fromBlock, toBlock, options.chunkSize);
  const events = [];

  for (const rawLog of rawLogs) {
    const event = decodePaymentLog(rawLog);
    const [transactionReceipt, block, storedData] = await Promise.all([
      rpc("eth_getTransactionReceipt", [event.transaction_hash]),
      rpc("eth_getBlockByNumber", [quantity(event.block_number), false]),
      rpc("eth_call", [{ to: options.contract, data: encodeReceiptCall(event.order_id) }, quantity(event.block_number)])
    ]);
    const storedReceipt = decodeReceiptResult(storedData);
    const gasUsed = BigInt(transactionReceipt.gasUsed);
    const gasPrice = BigInt(transactionReceipt.effectiveGasPrice);
    events.push({
      ...event,
      timestamp: new Date(Number(BigInt(block.timestamp)) * 1000).toISOString(),
      transaction_status: Number(BigInt(transactionReceipt.status)),
      gas_used: gasUsed.toString(),
      effective_gas_price_wei: gasPrice.toString(),
      gas_cost_usdc: decimal(gasUsed * gasPrice),
      stored_receipt: storedReceipt,
      storage_matches_event: eventMatchesReceipt(event, storedReceipt)
    });
  }

  const contractBalanceWei = BigInt(await rpc("eth_getBalance", [options.contract, quantity(toBlock)]));
  const orderIds = events.map((event) => event.order_id);
  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    network: { name: "Arc Testnet", chain_id: chainId, rpc_url: options.rpcUrl },
    contract: options.contract,
    range: { from: options.fromBlock, to: toBlock, latest_at_start: latestBlock },
    event_count: events.length,
    contract_balance_wei: contractBalanceWei.toString(),
    contract_balance_usdc: decimal(contractBalanceWei),
    checks: {
      unique_order_ids: new Set(orderIds).size === orderIds.length,
      all_transactions_succeeded: events.every((event) => event.transaction_status === 1),
      all_events_match_storage: events.every((event) => event.storage_matches_event),
      contract_balance_zero: contractBalanceWei === 0n
    },
    events
  };

  if (options.jsonOut) await writeOutput(options.jsonOut, `${JSON.stringify(report, null, 2)}\n`);
  if (options.markdownOut) await writeOutput(options.markdownOut, renderMarkdown(report));
  return report;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${help()}\n`);
    return;
  }
  const report = await run(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (typeof process !== "undefined" && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
