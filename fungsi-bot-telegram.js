const web3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const bs58 = require('bs58');

// Connection RPC Fogo Chain Testnet
const connection = new web3.Connection('https://testnet.fogo.io', 'confirmed');

// Get Valid PrivateKey
function isValidPrivateKey(privateKey) {
  try {
    // decode base58
    const decoded = bs58.decode(privateKey);
    // cek panjang harus 64 bytes
    if (decoded.length !== 64) return false;
    // coba buat keypair, kalau error berarti invalid
    web3.Keypair.fromSecretKey(decoded);
    return true;
  } catch (e) {
    return false;
  }
}

// Get get address
async function getAddress(privateKey) {
  try {
    const keys = web3.Keypair.fromSecretKey(bs58.decode(privateKey));
    const address = keys.publicKey.toBase58(); // Ambil publicKey dari keypair dan ubah ke base58 string
    return address;
  } catch (error) {
    throw new Error("Private key tidak valid");
  }
}

// Get Fogo Native Amount (FOGO)
async function getbalances(address) {
    try {
        const publicKey = new web3.PublicKey(address);
        const balance = await connection.getBalance(publicKey);
        // console.log(`Balance: ${balance / web3.LAMPORTS_PER_SOL} FOGO`);
        // return `${balance / web3.LAMPORTS_PER_SOL} WFOGO (Native)`
        return balance / web3.LAMPORTS_PER_SOL;
    } catch (err) {
        console.error("Gagal koneksi atau ambil data:", err);
        return 0;
    }
};

// Get SPL Token Amount (FOGO)
async function getTokenBalanceFogo(walletAddress) {
    try {
        const tokenFogo = "So11111111111111111111111111111111111111112";
        const owner = new web3.PublicKey(walletAddress);
        const mint = new web3.PublicKey(tokenFogo);
        const ata = await splToken.getAssociatedTokenAddress(mint, owner);
        const accountInfo = await connection.getTokenAccountBalance(ata);
        // console.log(`Balance : ${accountInfo.value.uiAmount} FOGO`);
        // return `${accountInfo.value.uiAmount} FOGO`
        return accountInfo.value.uiAmount;
    } catch (err) {
        console.error("Gagal ambil token balance:", err.message);
        return 0;
    }
};

// Get SPL Token Amount (FUSD)
async function getTokenBalanceFusd(walletAddress) {
    try {
        const tokenFogo = "fUSDNGgHkZfwckbr5RLLvRbvqvRcTLdH9hcHJiq4jry";
        const owner = new web3.PublicKey(walletAddress);
        const mint = new web3.PublicKey(tokenFogo);
        const ata = await splToken.getAssociatedTokenAddress(mint, owner);
        const accountInfo = await connection.getTokenAccountBalance(ata);
        // return `${accountInfo.value.uiAmount} FUSD`
        return accountInfo.value.uiAmount;
    } catch (err) {
        console.error("Gagal ambil token balance:", err.message);
        return 0;
    }
};

// SendTransaction Fogo Native Amount (FOGO)
async function sendFogo(privateKey, toAddress, amount) {
    try {
        const base58PrivateKey = privateKey;
        const senderKeypair = web3.Keypair.fromSecretKey(bs58.decode(base58PrivateKey));
        const receiver = new web3.PublicKey(toAddress);
        const tx = await web3.sendAndConfirmTransaction(
            connection,
            new web3.Transaction().add(
                web3.SystemProgram.transfer({
                    fromPubkey: senderKeypair.publicKey,
                    toPubkey: receiver,
                    lamports: amount * web3.LAMPORTS_PER_SOL,
                })
            ),
            [senderKeypair]
        );
        console.log("✅ Transaksi berhasil:", tx);
    } catch (err) {
        console.error("❌ Gagal kirim:", err.message);
    }
};

// sendTransaction SPL Token Amount (FOGO)
async function sendTokenFogo(privateKey, toAddress, amount) {
    try {
        const base58PrivateKey = privateKey;
        const senderKeypair = web3.Keypair.fromSecretKey(bs58.decode(base58PrivateKey));
        const mintAddress = new web3.PublicKey('So11111111111111111111111111111111111111112');
        const receiver = new web3.PublicKey(toAddress);
        const senderTokenAccount = await splToken.getAssociatedTokenAddress(
            mintAddress,
            senderKeypair.publicKey
        );
        const recipientTokenAccount = await splToken.getAssociatedTokenAddress(
            mintAddress,
            receiver
        );
        const recipientInfo = await connection.getAccountInfo(recipientTokenAccount);
        const instructions = [];
        if (recipientInfo === null) {
            instructions.push(
                splToken.createAssociatedTokenAccountInstruction(
                    senderKeypair.publicKey,
                    receiver,
                    receiver,
                    mintAddress
                )
            );
        }
        instructions.push(
            splToken.createTransferInstruction(
                senderTokenAccount,
                recipientTokenAccount,
                senderKeypair.publicKey,
                amount * 10 ** 9
            )
        );
        const tx = new web3.Transaction().add(...instructions);
        const signature = await web3.sendAndConfirmTransaction(connection, tx, [senderKeypair]);
        console.log('✅ Token berhasil dikirim! Signature:', signature);
    } catch (err) {
        console.error('❌ Gagal kirim token:', err.message);
    }
};

// const address = "";
// const privateKeys = "";
// const receivedAddress = "";
// const amount = 10;

// // == getBalance Fogo Native
// getbalances(address);

// // == getBalance Fogo Token
// getTokenBalanceFogo(address);

// // == send Fogo Native
// sendFogo(privateKeys, receivedAddress, amount);

// // == send Fogo Token
// sendTokenFogo(privateKeys, receivedAddress, amount);

module.exports = {
    isValidPrivateKey,
    getAddress,
    getbalances,
    getTokenBalanceFogo,
    getTokenBalanceFusd
}
