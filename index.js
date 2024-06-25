const {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  Keypair,
} = require('@solana/web3.js');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const bs58 = require('bs58');
require('dotenv').config();

const DEVNET_URL = 'https://devnet.sonic.game/';
const connection = new Connection(DEVNET_URL, 'confirmed');
const keypairs = [];

async function kirimSol(dariKeypair, kePublicKey, jumlah) {
  const transaksi = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: dariKeypair.publicKey,
      toPubkey: kePublicKey,
      lamports: jumlah * LAMPORTS_PER_SOL,
    })
  );

  const tandaTangan = await sendAndConfirmTransaction(connection, transaksi, [dariKeypair]);

  console.log('Transaksi dikonfirmasi dengan tanda tangan:', tandaTangan);
}

async function pastikanAkunBebasSewa(kePublicKey) {
  const infoAkun = await connection.getAccountInfo(kePublicKey);
  if (infoAkun === null) {
    const jumlahBebasSewa = await connection.getMinimumBalanceForRentExemption(0);
    const transaksi = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypairs[0].publicKey,
        toPubkey: kePublicKey,
        lamports: jumlahBebasSewa,
      })
    );

    await sendAndConfirmTransaction(connection, transaksi, [keypairs[0]]);
    console.log(`Memastikan saldo bebas sewa untuk akun: ${kePublicKey.toString()}`);
  }
}

function buatAlamatAcak(jumlah) {
  const alamat = [];
  for (let i = 0; i < jumlah; i++) {
    const keypair = Keypair.generate();
    alamat.push(keypair.publicKey.toString());
  }
  return alamat;
}

async function getKeypairFromSeed(seedPhrase) {
  const seed = await bip39.mnemonicToSeed(seedPhrase);
  const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
  return Keypair.fromSeed(derivedSeed.slice(0, 32));
}

function getKeypairFromPrivateKey(privateKey) {
  const decoded = bs58.decode(privateKey);
  return Keypair.fromSecretKey(decoded);
}

function parseEnvArray(envVar) {
  try {
    return JSON.parse(envVar);
  } catch (e) {
    console.error('Gagal mengurai variabel lingkungan:', envVar, e);
    return [];
  }
}

async function getSolanaBalance(dariKeypair) {
  return connection.getBalance(dariKeypair.publicKey);
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  const seedPhrases = parseEnvArray(process.env.SEED_PHRASES);
  const privateKeys = parseEnvArray(process.env.PRIVATE_KEYS);

  for (const seedPhrase of seedPhrases) {
    keypairs.push(await getKeypairFromSeed(seedPhrase));
  }

  for (const privateKey of privateKeys) {
    keypairs.push(getKeypairFromPrivateKey(privateKey));
  }

  if (keypairs.length === 0) {
    throw new Error('Tidak ada SEED_PHRASES atau PRIVATE_KEYS yang valid ditemukan dalam file .env');
  }

  const jumlahTransaksi = 100; // Set jumlah transaksi maksimal menjadi 100
  const alamatAcak = buatAlamatAcak(jumlahTransaksi);
  console.log(`Menghasilkan ${jumlahTransaksi} alamat acak:`, alamatAcak);

  const jumlahUntukDikirim = 0.0002; // Diubah menjadi 0.0002 SOL
  let indeksKeypairSaatIni = 0;
  const jedaAntaraPermintaan = 5000; // Ubah jika jaringan sedang sibuk

  const saldoSol = (await getSolanaBalance(keypairs[indeksKeypairSaatIni])) / LAMPORTS_PER_SOL;
  if (saldoSol <= 0) {
    console.log(`Saldo tidak mencukupi: ${saldoSol} SOL`);
    return;
  }
  if (saldoSol < jumlahUntukDikirim * jumlahTransaksi) {
    console.log(`Saldo tidak mencukupi: ${saldoSol} SOL`);
    return;
  }

  for (let i = 0; i < jumlahTransaksi; i++) {
    const kePublicKey = new PublicKey(alamatAcak[i]);

    try {
      await pastikanAkunBebasSewa(kePublicKey);
      await kirimSol(keypairs[indeksKeypairSaatIni], kePublicKey, jumlahUntukDikirim);
      console.log(`Berhasil mengirim ${jumlahUntukDikirim} SOL ke ${alamatAcak[i]}`);
    } catch (error) {
      console.error(`Gagal mengirim SOL ke ${alamatAcak[i]}:`, error);
    }
    indeksKeypairSaatIni = (indeksKeypairSaatIni + 1) % keypairs.length;
    await delay(jedaAntaraPermintaan);
  }
})();
