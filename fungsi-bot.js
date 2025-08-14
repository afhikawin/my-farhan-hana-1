const web3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const bs58 = require('bs58');
const axios = require("axios");

// Connection RPC Fogo Chain Testnet
const connection = new web3.Connection('https://testnet.fogo.io', 'confirmed');

// generate wallet
function createSolanaWallet() {
    // Membuat keypair baru
    const keypair = web3.Keypair.generate();

    // Public key dalam bentuk string
    const publicKey = keypair.publicKey.toBase58();

    // Secret key (Uint8Array) → biasanya untuk program
    const secretKey = keypair.secretKey;

    // Secret key versi base58 (lebih gampang simpan/share)
    const secretKeyBase58 = bs58.encode(secretKey);

    return {
        publicKey,
        secretKey,
        secretKeyBase58
    };
}

// Get Valid PrivateKey
function isValidPrivateKey(privateKey) {
    try {
        const decoded = bs58.decode(privateKey);
        if (decoded.length !== 64) return false;
        web3.Keypair.fromSecretKey(decoded);
        return true;
    } catch (e) {
        return false;
    }
}

// Get Address
async function getAddress(privateKey) {
    try {
        const keys = web3.Keypair.fromSecretKey(bs58.decode(privateKey));
        const address = keys.publicKey.toBase58();
        return address;
    } catch (error) {
        throw new Error("Private key tidak valid");
    }
}

// Get All Balance (FOGO, WFOGO, FUSD)
async function getAllBalance(privateKey) {
    const keys = web3.Keypair.fromSecretKey(bs58.decode(privateKey));
    const publicKey = keys.publicKey.toBase58();
    const result = {};

    try {
        // ===== Native FOGO Balance =====
        const balance_fogo = await connection.getBalance(keys.publicKey);
        const fogo = balance_fogo / web3.LAMPORTS_PER_SOL;

        // ===== Token Balances =====
        async function getTokenBalance(mintAddress) {
            try {
                const mint = new web3.PublicKey(mintAddress);
                const ata = await splToken.getAssociatedTokenAddress(mint, keys.publicKey);
                const accountInfo = await connection.getTokenAccountBalance(ata);
                return accountInfo.value.uiAmount || 0;
            } catch (err) {
                return 0; // Kalau ATA belum ada atau error
            }
        }

        const wfogo = await getTokenBalance("So11111111111111111111111111111111111111112");
        const fusd = await getTokenBalance("fUSDNGgHkZfwckbr5RLLvRbvqvRcTLdH9hcHJiq4jry");

        result.address = publicKey;
        result.fogo = fogo;
        result.wfogo = wfogo;
        result.fusd = fusd;

    } catch (err) {
        // Kalau koneksi atau decoding gagal
        result.address = publicKey;
        result.fogo = 0;
        result.wfogo = 0;
        result.fusd = 0;
    }

    return result;
}

// Get SendTransaction
async function sendtx(privateKey, coin, amount, toaddress) {
    const senderKeypair = web3.Keypair.fromSecretKey(bs58.decode(privateKey));
    const receiver = new web3.PublicKey(toaddress);
    const result = {};

    try {
        // === Kirim native FOGO (SOL) ===
        async function sendBalanceFogo() {
            const tx = new web3.Transaction().add(
                web3.SystemProgram.transfer({
                    fromPubkey: senderKeypair.publicKey,
                    toPubkey: receiver,
                    lamports: Math.floor(amount * web3.LAMPORTS_PER_SOL),
                })
            );
            return await web3.sendAndConfirmTransaction(connection, tx, [senderKeypair]);
        }

        // === Kirim token SPL ===
        async function sendBalanceToken(mintAddress) {
            const mintPubkey = new web3.PublicKey(mintAddress);
            const senderATA = await splToken.getAssociatedTokenAddress(
                mintPubkey,
                senderKeypair.publicKey,
                false // allow owner off curve
            );
            const receiverATA = await splToken.getAssociatedTokenAddress(
                mintPubkey,
                receiver,
                false
            );

            const instructions = [];
            const receiverInfo = await connection.getAccountInfo(receiverATA);

            if (!receiverInfo) {
                // Buat ATA untuk penerima
                instructions.push(
                    splToken.createAssociatedTokenAccountInstruction(
                        senderKeypair.publicKey, // payer
                        receiverATA,              // ata account
                        receiver,                 // owner
                        mintPubkey                 // mint
                    )
                );
            }

            // Ambil decimals token
            const mintInfo = await splToken.getMint(connection, mintPubkey);
            const tokenAmount = BigInt(Math.floor(amount * 10 ** mintInfo.decimals));

            // Transfer token
            instructions.push(
                splToken.createTransferInstruction(
                    senderATA,
                    receiverATA,
                    senderKeypair.publicKey,
                    tokenAmount
                )
            );

            const tx = new web3.Transaction().add(...instructions);
            return await web3.sendAndConfirmTransaction(connection, tx, [senderKeypair]);
        }

        // Pilihan coin
        if (coin === "fogo") {
            result.txid = await sendBalanceFogo();
        } else if (coin === "wfogo") {
            result.txid = await sendBalanceToken("So11111111111111111111111111111111111111112");
        } else if (coin === "fusd") {
            result.txid = await sendBalanceToken("fUSDNGgHkZfwckbr5RLLvRbvqvRcTLdH9hcHJiq4jry");
        } else {
            throw new Error("Invalid coin type");
        }

        result.status = 200;

    } catch (err) {
        result.status = 500;
        result.error = err.message;
    }

    return result;
}

// Get Unwarp FOGO
async function unwarp(privateKey) {
    const keypair = web3.Keypair.fromSecretKey(bs58.decode(privateKey));
    const fogo = new web3.PublicKey("So11111111111111111111111111111111111111112");
    const result = {};
    try {
        // Dapatkan address ATA WSOL milik wallet
        const wsolAta = await splToken.getAssociatedTokenAddress(
            fogo,
            keypair.publicKey
        );

        // Buat instruksi close account (unwrap)
        const closeIx = splToken.createCloseAccountInstruction(
            wsolAta,            // account WSOL yang di-close
            keypair.publicKey,  // penerima SOL
            keypair.publicKey   // authority
        );

        const tx = new web3.Transaction().add(closeIx);

        // Ganti blockhash terbaru
        const { blockhash } = await connection.getLatestBlockhash("finalized");
        tx.recentBlockhash = blockhash;
        tx.feePayer = keypair.publicKey;

        // Sign & kirim
        tx.sign(keypair);

        const txid = await connection.sendRawTransaction(tx.serialize(), {
            skipPreflight: false
        });

        await connection.confirmTransaction(txid, "confirmed");
        result.status = 200;
        result.txid = txid;

    } catch (err) {
        result.status = 0;
        result.txid = err.message;
    }

    return result;
}

// ==== Fluxbeam > Action Swap Fluxbeam 
async function fluxbeam_action(privateKey, coin, amount) {
    const keypair = web3.Keypair.fromSecretKey(bs58.decode(privateKey));
    const address = keypair.publicKey.toBase58();
    const url = "https://gateway.fogo.fluxbeam.xyz/bot/actions";

    const sourceMint = coin
        ? "So11111111111111111111111111111111111111112" // FOGO
        : "fUSDNGgHkZfwckbr5RLLvRbvqvRcTLdH9hcHJiq4jry"; // FUSD

    const destMint = coin
        ? "fUSDNGgHkZfwckbr5RLLvRbvqvRcTLdH9hcHJiq4jry" // FUSD
        : "So11111111111111111111111111111111111111112"; // FOGO

    const body = {
        wallet: address,
        action: "swap",
        payload: {
            source: sourceMint,
            dest: destMint,
            aToB: true,
            amount: parseFloat(amount)
        },
        settings: {
            slippage: 0.5, // hati-hati gede
            platforms: 503,
            mevProtect: true,
            validatorTip: "market",
            priorityFee: "market"
        }
    };

    const { data } = await axios.post(url, body, {
        headers: { "Content-Type": "application/json" }
    });

    if (!data || !data.transaction) {
        throw new Error("Action Fluxbeam fetch failed");
    }

    return data.transaction;
};

// ==== Fluxbeam > Confirm Swap
async function fluxbeam_swap(privateKey, coin, amount) {
    const base64Tx = await fluxbeam_action(privateKey, coin, amount);
    try {
        const txBuffer = Buffer.from(base64Tx, "base64");
        let transaction = web3.Transaction.from(txBuffer);

        const keypair = web3.Keypair.fromSecretKey(bs58.decode(privateKey));

        // 🔄 Ganti blockhash lama dengan yang baru
        const { blockhash } = await connection.getLatestBlockhash("finalized");
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = keypair.publicKey;

        // Sign & kirim
        transaction.sign(keypair);

        const txid = await connection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: false
        });

        await connection.confirmTransaction(txid, "confirmed");

        return txid;

    } catch (err) {
        console.error("❌ Swap failed:", err.message || err);

        // Kalau error dari @solana/web3.js
        if (err.logs) {
            console.error("🔍 Transaction logs:");
            console.error(err.logs);
        }

        throw err; // lempar lagi biar bisa di-handle di luar function kalau perlu
    }
}

const MINT_A = "So11111111111111111111111111111111111111112"; // FOGO
const MINT_B = "fUSDNGgHkZfwckbr5RLLvRbvqvRcTLdH9hcHJiq4jry"; // FUSD

function toRawAmount(decimalAmount, decimals) {
  return BigInt(Math.floor(decimalAmount * Math.pow(10, decimals)));
}

// ==== Valiant > Get Quote
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

// ==== Valiant > Request Swap
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

// ==== Valiant > isSignaturePresent
function isSignaturePresent(sigUint8Array) {
  if (!sigUint8Array) return false;
  return sigUint8Array.some((b) => b !== 0);
}

// ==== Valiant > tryParseVersionedTxFromBase64
async function tryParseVersionedTxFromBase64(b64) {
  const buf = Buffer.from(b64, "base64");
  try {
    return web3.VersionedTransaction.deserialize(buf);
  } catch {
    return null;
  }
}

// ==== Valiant >  rebuildAndSignThenSendFromSerialized
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
    const programId = new web3.PublicKey(msg.staticAccountKeys[cix.programIdIndex]);
    const keys = cix.accountKeyIndexes.map((ai) => {
      const flags = accountFlags(ai);
      return {
        pubkey: new web3.PublicKey(msg.staticAccountKeys[ai]),
        isSigner: flags.isSigner,
        isWritable: flags.isWritable,
      };
    });
    const dataBuf = cix.data && cix.data.data
      ? Buffer.from(cix.data.data)
      : Buffer.from(cix.data || []);
    return new web3.TransactionInstruction({ programId, keys, data: dataBuf });
  });
  const latest = await connection.getLatestBlockhash("finalized");
  const messageV0 = new web3.TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: latest.blockhash,
    instructions: txInstructions,
  }).compileToV0Message();
  const newTx = new web3.VersionedTransaction(messageV0);
  newTx.sign([keypair]);
  return await connection.sendRawTransaction(newTx.serialize(), { skipPreflight: false });
}

// ==== Valiant > Confirm Swap
async function valiant_swaptofusd(privateKeyBase58, amountDecimal) {
  const secretKeyUint8 = bs58.decode(privateKeyBase58);
  const keypair = web3.Keypair.fromSecretKey(secretKeyUint8);
  const userAddress = keypair.publicKey.toBase58();
  const amountLamports = toRawAmount(amountDecimal, 9); // FOGO decimals = 9
  const quote = await getQuote(amountLamports, userAddress);
  const serialized = await requestSwapSerializedTx(quote, userAddress);
  const txid = await rebuildAndSignThenSendFromSerialized(connection, serialized, keypair);
  return txid;
}
async function valiant_swaptofogo(privateKeyBase58, amountDecimal) {
  const secretKeyUint8 = bs58.decode(privateKeyBase58);
  const keypair = web3.Keypair.fromSecretKey(secretKeyUint8);
  const userAddress = keypair.publicKey.toBase58();
  const amountLamports = toRawAmount(amountDecimal, 6); // FUSD decimals = 6
  const quote = await getQuote1(amountLamports, userAddress);
  const serialized = await requestSwapSerializedTx1(quote, userAddress);
  const txid = await rebuildAndSignThenSendFromSerialized(connection, serialized, keypair);
  return txid;
}

// // ==== Valiant > Action Swap
// async function valiant_action(privateKeyBase58, amountDecimal) {
//     const secretKeyUint8 = bs58.decode(privateKeyBase58);
//     const keypair = web3.Keypair.fromSecretKey(secretKeyUint8);
//     const userAddress = keypair.publicKey.toBase58();

//     // Konversi amountDecimal ke lamports (FUSD decimals = 6)
//     const amountLamports = Math.floor(amountDecimal * 10 ** 6);

//     const urlQuote = "https://api.valiant.trade/dex/quote";
//     const paramsQuote = {
//         mintA: "So11111111111111111111111111111111111111112",
//         mintB: "fUSDNGgHkZfwckbr5RLLvRbvqvRcTLdH9hcHJiq4jry",
//         aForB: "true",
//         isExactIn: "true",
//         inputAmount: amountLamports.toString(),
//         feePayer: userAddress
//     };

//     // Ambil quote
//     const { data: quoteData } = await axios.get(urlQuote, { params: paramsQuote });
//     if (!quoteData || !quoteData.quote) {
//         throw new Error("Quote fetch failed");
//     }

//     // Request serialized TX
//     const urlSwap = "https://api.valiant.trade/dex/txs/swap";
//     const paramsSwap = {
//         userAddress,
//         mintA: "So11111111111111111111111111111111111111112",
//         mintB: "fUSDNGgHkZfwckbr5RLLvRbvqvRcTLdH9hcHJiq4jry",
//         aForB: "true",
//         isExactIn: "true",
//         inputAmount: quoteData.quote.tokenIn,
//         outputAmount: quoteData.quote.tokenMinOut,
//         poolAddress: quoteData.quote.poolAddress,
//         feePayer: userAddress,
//         sessionAddress: userAddress
//     };

//     const { data: swapData } = await axios.get(urlSwap, { params: paramsSwap });
//     if (!swapData || !swapData.serializedTx) {
//         throw new Error("Swap endpoint returned no serializedTx");
//     }

//     return swapData.serializedTx; // return base64 serialized tx
// }

// // ==== Valiant > Confirm Swap
// async function valiant_swap(privateKeyBase58, amountDecimal) {
//     const serializedBase64 = await valiant_action(privateKeyBase58, amountDecimal);
//     try {
//         const txBuffer = Buffer.from(serializedBase64, "base64");
//         let transaction = web3.VersionedTransaction.deserialize(txBuffer);

//         const keypair = web3.Keypair.fromSecretKey(bs58.decode(privateKeyBase58));

//         // Ganti blockhash lama dengan yang baru
//         const { blockhash } = await connection.getLatestBlockhash("finalized");
//         transaction.message.recentBlockhash = blockhash;

//         // Pastikan feePayer sesuai wallet kita
//         transaction.message.payerKey = keypair.publicKey;

//         // Sign & kirim
//         transaction.sign([keypair]);

//         const txid = await connection.sendRawTransaction(transaction.serialize(), {
//             skipPreflight: false
//         });

//         await connection.confirmTransaction(txid, "confirmed");
//         return txid;

//     } catch (err) {
//         console.error("❌ Valiant swap failed:", err.message || err);
//         throw err;
//     }
// }


module.exports = {
    createSolanaWallet,
    isValidPrivateKey,
    getAddress,
    getAllBalance,
    sendtx,
    unwarp,
    fluxbeam_swap,
    valiant_swaptofusd,
    valiant_swaptofogo
}

// (async () => {
//     // PrivateKey Kosong 5pdm3mZ8kpKqa5ThSxPHUEDGhg5ku16QBx25htLAevU6aqa6pREHiqwx5VwSp8ZYim5Mddt9Q9x9ZgpNVbhQcpXB
//     // console.log(await getAllBalance("42uHwfHc7upmu25uJ2proTyoENX6DArTFqZeNJp3iCbB9vstRGwvJCDzA5PrbTR8psiXXDqtJWMxJ33Mjkd1yq51"))

//     const privateKey = "42uHwfHc7upmu25uJ2proTyoENX6DArTFqZeNJp3iCbB9vstRGwvJCDzA5PrbTR8psiXXDqtJWMxJ33Mjkd1yq51";
//     const data = await sendtx(privateKey, "fusd", "0.01", "7oKUza3zwJQYEXnvcRzY8QpwAtnAEh3xSWRnTFTKrevV");
//     console.log(data)
// })();
