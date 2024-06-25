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

async function sendSol(fromKeypair, toPublicKey, amount) {
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey: toPublicKey,
      lamports: amount * LAMPORTS_PER_SOL,
    })
  );

  const signature = await sendAndConfirmTransaction(connection, transaction, [fromKeypair]);

  console.log('Transaction confirmed with signature:', signature);
}

async function ensureRentExemptAccount(toPublicKey) {
  const accountInfo = await connection.getAccountInfo(toPublicKey);
  if (accountInfo === null) {
    const rentExemptAmount = await connection.getMinimumBalanceForRentExemption(0);
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypairs[0].publicKey,
        toPubkey: toPublicKey,
        lamports: rentExemptAmount,
      })
    );

    await sendAndConfirmTransaction(connection, transaction, [keypairs[0]]);
    console.log(`Ensuring rent-exempt balance for account: ${toPublicKey.toString()}`);
  }
}

function generateRandomAddresses(count) {
  const addresses = [];
  for (let i = 0; i < count; i++) {
    const keypair = Keypair.generate();
    addresses.push(keypair.publicKey.toString());
  }
  return addresses;
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
    console.error('Failed to parse environment variable:', envVar, e);
    return [];
  }
}

async function getSolanaBalance(fromKeypair) {
  return connection.getBalance(fromKeypair.publicKey);
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
    throw new Error('No valid SEED_PHRASES or PRIVATE_KEYS found in .env file');
  }

  const transactionCount = 100; // Set maximum transaction count to 100
  const randomAddresses = generateRandomAddresses(transactionCount);
  console.log(`Generated ${transactionCount} random addresses:`, randomAddresses);

  const amountToSend = 0.0002; // Changed to 0.0002 SOL
  let currentKeypairIndex = 0;
  const delayBetweenRequests = 5000; // Adjust if the network is busy

  const solBalance = (await getSolanaBalance(keypairs[currentKeypairIndex])) / LAMPORTS_PER_SOL;
  if (solBalance <= 0) {
    console.log(`Insufficient balance: ${solBalance} SOL`);
    return;
  }
  if (solBalance < amountToSend * transactionCount) {
    console.log(`Insufficient balance: ${solBalance} SOL`);
    return;
  }

  let successfulTransactions = 0; // Add a counter for successful transactions

  for (let i = 0; i < transactionCount; i++) {
    const toPublicKey = new PublicKey(randomAddresses[i]);

    try {
      await ensureRentExemptAccount(toPublicKey);
      await sendSol(keypairs[currentKeypairIndex], toPublicKey, amountToSend);
      console.log(`Successfully sent ${amountToSend} SOL to ${randomAddresses[i]}`);
      successfulTransactions++; // Increment the counter for each successful transaction
    } catch (error) {
      console.error(`Failed to send SOL to ${randomAddresses[i]}:`, error);
    }
    currentKeypairIndex = (currentKeypairIndex + 1) % keypairs.length;
    await delay(delayBetweenRequests);

    if (successfulTransactions >= 100) { // Check if the number of successful transactions has reached 100
      console.log('Reached 100 transactions, script stopping.');
      break; // Exit the loop if 100 transactions are reached
    }
  }
})();
