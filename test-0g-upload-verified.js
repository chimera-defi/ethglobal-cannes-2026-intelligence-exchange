#!/usr/bin/env node
/**
 * Test 0G Storage Upload
 * 
 * This script tests uploading a dossier to 0G storage.
 * 
 * Usage:
 *   export ZERO_G_PRIVATE_KEY=0x...
 *   node test-0g-upload-verified.js
 */

const ZERO_G_RPC_URL = 'https://evmrpc-testnet.0g.ai';
const ZERO_G_INDEXER_RPC = 'https://indexer-storage-testnet-turbo.0g.ai';
const ZERO_G_EXPLORER_BASE_URL = 'https://chainscan-galileo.0g.ai/tx/';

async function testZeroGUpload() {
  const privateKey = process.env.ZERO_G_PRIVATE_KEY;
  
  if (!privateKey) {
    console.error('❌ ZERO_G_PRIVATE_KEY environment variable not set');
    console.log('\nUsage:');
    console.log('  export ZERO_G_PRIVATE_KEY=0x...');
    console.log('  node test-0g-upload-verified.js');
    process.exit(1);
  }

  console.log('🔧 Testing 0G Storage Upload...\n');
  console.log('Configuration:');
  console.log(`  RPC: ${ZERO_G_RPC_URL}`);
  console.log(`  Indexer: ${ZERO_G_INDEXER_RPC}`);
  console.log(`  Private Key: ${privateKey.substring(0, 6)}...${privateKey.substring(privateKey.length - 4)}\n`);

  try {
    // Import 0G SDK
    console.log('📦 Loading 0G SDK...');
    const sdk = await import('@0gfoundation/0g-ts-sdk');
    const ethers = await import('ethers');
    console.log('✅ SDK loaded\n');

    // Create test dossier
    const testDossier = {
      ideaId: 'test-idea-0g',
      briefId: 'test-brief-0g',
      jobId: 'test-job-0g',
      milestoneType: 'test',
      reviewerId: 'test-reviewer',
      workerId: 'test-worker',
      score: 95,
      summary: '0G storage integration test',
      artifactUris: ['https://example.com/artifact.zip'],
      agentMetadata: { type: 'test', version: '1.0' },
      acceptedAt: new Date().toISOString(),
    };

    console.log('📄 Test Dossier:');
    console.log(JSON.stringify(testDossier, null, 2));
    console.log('');

    // Setup provider and signer
    console.log('🔐 Setting up provider and signer...');
    const provider = new ethers.JsonRpcProvider(ZERO_G_RPC_URL);
    const signer = new ethers.Wallet(privateKey, provider);
    const address = await signer.getAddress();
    console.log(`✅ Signer address: ${address}\n`);

    // Create indexer
    console.log('🔗 Connecting to 0G indexer...');
    const indexer = new sdk.Indexer(ZERO_G_INDEXER_RPC);
    console.log('✅ Indexer connected\n');

    // Prepare data
    console.log('📝 Encoding dossier data...');
    const data = new TextEncoder().encode(JSON.stringify(testDossier, null, 2));
    const memData = new sdk.MemData(data);
    console.log(`✅ Data size: ${data.length} bytes\n`);

    // Build merkle tree
    console.log('🌲 Building merkle tree...');
    const [tree, treeError] = await memData.merkleTree();
    if (treeError) {
      throw new Error(`Merkle tree error: ${String(treeError)}`);
    }
    console.log('✅ Merkle tree built\n');

    // Upload to 0G
    console.log('⬆️  Uploading to 0G storage...');
    console.log('   (This may take 30-60 seconds)');
    const [uploadResult, uploadError] = await indexer.upload(memData, ZERO_G_RPC_URL, signer);
    
    // Cleanup
    if (memData.close) {
      await memData.close();
    }

    if (uploadError) {
      throw new Error(`Upload error: ${String(uploadError)}`);
    }

    // Extract results
    const txHash = uploadResult.txHash ?? uploadResult.txHashes?.[0];
    const rootHash = uploadResult.rootHash ?? uploadResult.rootHashes?.[0];

    if (!txHash || !rootHash) {
      throw new Error('Upload completed without tx hash or root hash');
    }

    console.log('\n✅ Upload successful!\n');
    console.log('Results:');
    console.log(`  Transaction Hash: ${txHash}`);
    console.log(`  Root Hash: ${rootHash}`);
    console.log(`  Explorer: ${ZERO_G_EXPLORER_BASE_URL}${txHash}`);
    console.log('');

    return {
      success: true,
      txHash,
      rootHash,
      explorerUrl: `${ZERO_G_EXPLORER_BASE_URL}${txHash}`,
    };
  } catch (error) {
    console.error('\n❌ Upload failed:');
    console.error(error);
    process.exit(1);
  }
}

testZeroGUpload()
  .then((result) => {
    console.log('✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
