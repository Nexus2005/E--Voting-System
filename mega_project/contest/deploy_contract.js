const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC_URL = 'http://127.0.0.1:7545';
// Deterministic Account 0 private key from Ganache
const ADMIN_PRIVATE_KEY = '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d';

// Deterministic Account 1 address (Voter)
const VOTER_ADDRESS = '0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0';

async function deploy() {
  console.log('Connecting to Ganache RPC at', RPC_URL, '...');
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const network = await provider.getNetwork();
  console.log('Connected to network:', network.name, 'Chain ID:', network.chainId);

  const wallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
  console.log('Deployer (Admin) address:', wallet.address);

  const balance = await wallet.getBalance();
  console.log('Deployer balance:', ethers.utils.formatEther(balance), 'ETH');

  const artifactPath = path.join(__dirname, 'build', 'contracts', 'Contest.json');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

  console.log('\nDeploying Contest.sol smart contract to the blockchain...');
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy({ gasLimit: 3000000 });
  await contract.deployed();

  console.log('✓ Contest deployed successfully at:', contract.address);
  console.log('Transaction hash:', contract.deployTransaction.hash);

  // Update artifact with network information for both 1337 and 5777 so TruffleContract finds it
  if (!artifact.networks) artifact.networks = {};
  const networkData = {
    events: {},
    links: {},
    address: contract.address,
    transactionHash: contract.deployTransaction.hash
  };

  // Overwrite BOTH current entries and all stale ones (31337, old 1337/5777) with THIS
  // deployment so the frontend can never bind to a dead address from an old chain.
  artifact.networks = {};
  artifact.networks[network.chainId.toString()] = networkData;
  artifact.networks['1337'] = networkData;
  artifact.networks['5777'] = networkData;
  artifact.networks['31337'] = networkData;

  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2), 'utf8');
  console.log('✓ Updated build/contracts/Contest.json with new contract address!');

  // Seed sample candidates on the blockchain
  console.log('\n--- Seeding Initial Candidates on the Blockchain ---');
  let tx = await contract.addContestant('Narendra Modi', 'BJP', 73, 'M.A. Political Science');
  await tx.wait();
  console.log('✓ Added Candidate 1: Narendra Modi (BJP)');

  tx = await contract.addContestant('Rahul Gandhi', 'Congress', 53, 'M.Phil Development Studies');
  await tx.wait();
  console.log('✓ Added Candidate 2: Rahul Gandhi (Congress)');

  tx = await contract.addContestant('Arvind Kejriwal', 'AAP', 55, 'B.Tech Mechanical');
  await tx.wait();
  console.log('✓ Added Candidate 3: Arvind Kejriwal (AAP)');

  // Whitelist sample voter on the blockchain
  console.log('\n--- Whitelisting Voter on the Blockchain ---');
  tx = await contract.voterRegisteration(VOTER_ADDRESS);
  await tx.wait();
  console.log('✓ Whitelisted voter address on blockchain:', VOTER_ADDRESS);

  // Advance state to Phase 1 (Voting Live)
  console.log('\n--- Advancing to Phase 1 (Voting Live) ---');
  tx = await contract.changeState(1);
  await tx.wait();
  console.log('✓ Advanced state to Phase 1 (Voting Live)!');

  const total = await contract.contestantsCount();
  console.log('\nTotal candidates on blockchain:', total.toString());

  const state = await contract.state();
  console.log('Current Phase on blockchain (0 = reg, 1 = voting, 2 = done):', state.toString());

  console.log('\n==============================================');
  console.log('BLOCKCHAIN DEPLOYMENT & SEEDING COMPLETE!');
  console.log('==============================================');
}

deploy().catch(err => {
  console.error('Deployment failed:', err);
  process.exit(1);
});
