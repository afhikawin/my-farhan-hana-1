// swapModule.js
const axios = require("axios");
const bs58 = require("bs58");
const {
  Connection,
  VersionedTransaction,
  TransactionInstruction,
  TransactionMessage,
  Keypair,
  PublicKey,
} = require("@solana/web3.js");

const RPC_URL = "https://testnet.fogo.io";
const MINT_A = "So11111111111111111111111111111111111111112"; // FOGO
const MINT_B = "fUSDNGgHkZfwckbr5RLLvRbvqvRcTLdH9hcHJiq4jry"; // FUSD

// Konversi
function fromRawAmount(rawAmount, decimals) {
  return Number(rawAmount) / Math.pow(10, decimals);
}
function toRawAmount(decimalAmount, decimals) {
  return BigInt(Math.floor(decimalAmount * Math.pow(10, decimals)));
}

async function getQuote(amountLamports, userAddress) {
  const url = "https://api.valiant.trade/dex/quote";
  const params = {
    mintA: MINT_A,
    mintB: MINT_B,
    aForB: "true",
    isExactIn: "true",
    inputAmount: amountLamports.toString(),
    feePayer: userAddress
  };
  const { data } = await axios.get(url, { params });
  if (!data || !data.quote) throw new Error("Quote fetch failed");
  return data.quote;
}

async function getQuote1(amountLamports, userAddress) {
  const url = "https://api.valiant.trade/dex/quote";
  const params = {
    mintA: MINT_A,
    mintB: MINT_B,
    aForB: "false",
    isExactIn: "true",
    inputAmount: amountLamports.toString(),
    feePayer: userAddress
  };
  const { data } = await axios.get(url, { params });
  if (!data || !data.quote) throw new Error("Quote fetch failed");
  return data.quote;
}

async function requestSwapSerializedTx(quote, userAddress) {
  const url = "https://api.valiant.trade/dex/txs/swap";
  const params = {
    userAddress,
    mintA: MINT_A,
    mintB: MINT_B,
    aForB: "true",
    isExactIn: "true",
    inputAmount: quote.tokenIn,
    outputAmount: quote.tokenMinOut,
    poolAddress: quote.poolAddress,
    feePayer: userAddress,
    sessionAddress: userAddress
  };
  const { data } = await axios.get(url, { params });
  if (!data || !data.serializedTx) throw new Error("swap endpoint returned no serializedTx");
  return data.serializedTx;
}

async function requestSwapSerializedTx1(quote, userAddress) {
  const url = "https://api.valiant.trade/dex/txs/swap";
  const params = {
    userAddress,
    mintA: MINT_A,
    mintB: MINT_B,
    aForB: "false",
    isExactIn: "true",
    inputAmount: quote.tokenIn,
    outputAmount: quote.tokenMinOut,
    poolAddress: quote.poolAddress,
    feePayer: userAddress,
    sessionAddress: userAddress
  };
  const { data } = await axios.get(url, { params });
  if (!data || !data.serializedTx) throw new Error("swap endpoint returned no serializedTx");
  return data.serializedTx;
}

function isSignaturePresent(sigUint8Array) {
  if (!sigUint8Array) return false;
  return sigUint8Array.some((b) => b !== 0);
}

async function tryParseVersionedTxFromBase64(b64) {
  const buf = Buffer.from(b64, "base64");
  try {
    return VersionedTransaction.deserialize(buf);
  } catch {
    return null;
  }
}

async function rebuildAndSignThenSendFromSerialized(connection, serializedBase64, keypair) {
  const parsed = await tryParseVersionedTxFromBase64(serializedBase64);
  if (!parsed) throw new Error("Unable to parse provided serialized tx as VersionedTransaction");

  const accountKeys = parsed.message.staticAccountKeys.map((k) => k.toBase58());
  const reqSigners = parsed.message.header.numRequiredSignatures;
  const signerIndexes = accountKeys.slice(0, reqSigners);
  const ourIndex = signerIndexes.indexOf(keypair.publicKey.toBase58());

  if (ourIndex !== -1) {
    if (!isSignaturePresent(parsed.signatures[ourIndex])) {
      parsed.sign([keypair]);
    }
    const raw = parsed.serialize();
    return await connection.sendRawTransaction(raw, { skipPreflight: false });
  }

  // rebuild TX jika bukan signer
  const msg = parsed.message;
  const numReadonlySigned = msg.header.numReadonlySignedAccounts;
  const numReadonlyUnsigned = msg.header.numReadonlyUnsignedAccounts;
  const totalAccounts = msg.staticAccountKeys.length;

  function accountFlags(index) {
    let isSigner = index < msg.header.numRequiredSignatures;
    let isWritable;
    if (isSigner) {
      const firstReadonlySignerIndex = Math.max(0, msg.header.numRequiredSignatures - numReadonlySigned);
      isWritable = index < firstReadonlySignerIndex;
    } else {
      const firstReadonlyUnsignedIndex = totalAccounts - numReadonlyUnsigned;
      isWritable = index < firstReadonlyUnsignedIndex;
    }
    return { isSigner, isWritable };
  }

  const txInstructions = msg.compiledInstructions.map((cix) => {
    const programId = new PublicKey(msg.staticAccountKeys[cix.programIdIndex]);
    const keys = cix.accountKeyIndexes.map((ai) => {
      const flags = accountFlags(ai);
      return {
        pubkey: new PublicKey(msg.staticAccountKeys[ai]),
        isSigner: flags.isSigner,
        isWritable: flags.isWritable,
      };
    });
    const dataBuf = cix.data && cix.data.data
      ? Buffer.from(cix.data.data)
      : Buffer.from(cix.data || []);
    return new TransactionInstruction({ programId, keys, data: dataBuf });
  });

  const latest = await connection.getLatestBlockhash("finalized");
  const messageV0 = new TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: latest.blockhash,
    instructions: txInstructions,
  }).compileToV0Message();

  const newTx = new VersionedTransaction(messageV0);
  newTx.sign([keypair]);

  return await connection.sendRawTransaction(newTx.serialize(), { skipPreflight: false });
}

async function swapFogoToFusd(privateKeyBase58, amountDecimal) {
  const connection = new Connection(RPC_URL, "confirmed");
  const secretKeyUint8 = bs58.decode(privateKeyBase58);
  const keypair = Keypair.fromSecretKey(secretKeyUint8);
  const userAddress = keypair.publicKey.toBase58();

  const amountLamports = toRawAmount(amountDecimal, 9); // FOGO decimals = 9

  const quote = await getQuote(amountLamports, userAddress);
  const serialized = await requestSwapSerializedTx(quote, userAddress);
  const txid = await rebuildAndSignThenSendFromSerialized(connection, serialized, keypair);

  return txid;
}

async function swapFusdToFogo(privateKeyBase58, amountDecimal) {
  const connection = new Connection(RPC_URL, "confirmed");
  const secretKeyUint8 = bs58.decode(privateKeyBase58);
  const keypair = Keypair.fromSecretKey(secretKeyUint8);
  const userAddress = keypair.publicKey.toBase58();

  const amountLamports = toRawAmount(amountDecimal, 6); // FUSD decimals = 6

  const quote = await getQuote1(amountLamports, userAddress);
  const serialized = await requestSwapSerializedTx1(quote, userAddress);
  const txid = await rebuildAndSignThenSendFromSerialized(connection, serialized, keypair);

  console.log(quote);
  console.log(serialized);
  console.log(txid);

  return txid;
}

module.exports = { swapFogoToFusd, swapFusdToFogo };
