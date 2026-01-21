import {
  JsonRpcProvider,
  Wallet,
  ContractFactory,
  formatEther,
  formatUnits,
} from 'ethers';
import { config } from 'dotenv';
import readline from 'readline';
import fs from 'fs/promises';
import path from 'path';

config();

const RPC_URL = 'https://ethereum.publicnode.com';
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error('❌ Error: Set PRIVATE_KEY in .env');
  process.exit(1);
}

const CONTRACT_FILE = path.join(process.cwd(), 'contract.json');

async function loadContractData() {
  try {
    const rawData = await fs.readFile(CONTRACT_FILE, 'utf-8');
    const data = JSON.parse(rawData);

    if (!data.abi || !Array.isArray(data.abi)) {
      throw new Error('contract.json file is missing or has invalid "abi" array');
    }
    if (!data.bytecode || typeof data.bytecode !== 'string' || !data.bytecode.startsWith('0x')) {
      throw new Error('contract.json file is missing or has invalid "bytecode"');
    }

    return {
      abi: data.abi,
      bytecode: data.bytecode,
    };
  } catch (err) {
    console.error('❌ Failed to load contract.json:', err.message);
    process.exit(1);
  }
}

function askConfirmation(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

async function deployContract() {
  try {
    console.log('🚀 Loading ABI and bytecode from contract.json...\n');

    const { abi, bytecode } = await loadContractData();

    console.log('✅ Contract data loaded successfully');
    console.log(`   ABI: ${abi.length} items`);
    console.log(`   Bytecode: ${bytecode.length} characters\n`);

    const provider = new JsonRpcProvider(RPC_URL);
    const network = await provider.getNetwork();
    console.log(`🌐 Network: ${network.name} (chainId: ${network.chainId})`);

    const wallet = new Wallet(PRIVATE_KEY, provider);
    console.log(`👤 Deployer: ${wallet.address}`);

    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Balance: ${formatEther(balance)} ETH\n`);

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas;

    if (gasPrice) {
      console.log(`⛽ Gas price: ${formatUnits(gasPrice, 'gwei')} gwei`);
    } else {
      console.log('⛽ Gas price: no data from node, using default 1 gwei');
    }

    const factory = new ContractFactory(abi, bytecode, wallet);

    const ok = await askConfirmation('\n🚨 Deploy contract? (y/n): ');
    if (!ok) {
      console.log('❌ Deployment cancelled');
      process.exit(0);
    }

    console.log('\n🚀 Sending deployment transaction (node will estimate gasLimit)...');

    const overrides = gasPrice ? { gasPrice } : {};
    const contract = await factory.deploy(overrides);

    const deployTx = await contract.deploymentTransaction();
    if (deployTx) {
      console.log(`📝 Tx hash: ${deployTx.hash}`);
      console.log(`🔍 Etherscan: https://etherscan.io/tx/${deployTx.hash}`);
    }

    await contract.waitForDeployment();
    const deployedAddress = await contract.getAddress();

    console.log(`\n🎉 Contract deployed at address: ${deployedAddress}`);
    console.log(`🔍 Contract: https://etherscan.io/address/${deployedAddress}`);
  } catch (error) {
    console.error('❌ Deployment error:');
    if (error.reason) console.error('   Revert reason:', error.reason);
    if (error.data) console.error('   Error data:', error.data);
    console.error(error);
    process.exit(1);
  }
}

deployContract();