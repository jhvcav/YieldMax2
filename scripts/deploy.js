// scripts/deploy.js
const { ethers } = require("hardhat");

async function main() {
    console.log("🚀 Déploiement du contrat FlashLoanArbitrage...");

    // Récupérer le déployeur
    const [deployer] = await ethers.getSigners();
    console.log("Déploiement avec le compte:", deployer.address);
    
    // Utiliser ethers v6 syntax
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Balance du compte:", ethers.formatEther(balance), "POL");

    // Adresses des contrats selon le réseau
    const networkConfig = {
        polygon: {
            aaveAddressProvider: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
            usdc: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC sur Polygon
            usdt: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // USDT sur Polygon
            feeCollector: deployer.address
        },
        ethereum: {
            aaveAddressProvider: "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e",
            usdc: "0xA0b86a33E6417c4c82c2da2Fb58F0cde9b9fCeEF",
            usdt: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
            feeCollector: deployer.address
        },
        arbitrum: {
            aaveAddressProvider: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
            usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
            usdt: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
            feeCollector: deployer.address
        },
        mumbai: {
            aaveAddressProvider: "0x5343b5bA672Ae99d627A1C87866b8E53F47Db2E6",
            usdc: "0x2058A9D7613eEE744279e3856Ef0eAda5FCbaA7e",
            usdt: "0xBD21A10F619BE90d6066c941b04e4B3Fee313Bf0",
            feeCollector: deployer.address
        }
    };

    // Récupérer la configuration du réseau actuel
    const network = await ethers.provider.getNetwork();
    const chainId = Number(network.chainId);
    
    let config;
    if (chainId === 137) {
        config = networkConfig.polygon;
        console.log("📍 Déploiement sur Polygon Mainnet");
    } else if (chainId === 1) {
        config = networkConfig.ethereum;
        console.log("📍 Déploiement sur Ethereum Mainnet");
    } else if (chainId === 42161) {
        config = networkConfig.arbitrum;
        console.log("📍 Déploiement sur Arbitrum One");
    } else if (chainId === 80001) {
        config = networkConfig.mumbai;
        console.log("🧪 Déploiement sur Polygon Mumbai Testnet");
    } else {
        throw new Error(`Réseau non supporté: ${chainId}`);
    }

    // Vérifier que le déployeur a assez de fonds
    const minimumBalance = ethers.parseEther("0.1"); // 0.1 POL minimum
    if (balance < minimumBalance) {
        throw new Error(`Solde insuffisant. Minimum requis: 0.1 POL, actuel: ${ethers.formatEther(balance)} POL`);
    }

    // Obtenir la factory du contrat
    const FlashLoanArbitrage = await ethers.getContractFactory("FlashLoanArbitrageComplete");

    // Estimer le gas
    console.log("📊 Estimation du gas de déploiement...");
    const deployTx = await FlashLoanArbitrage.getDeployTransaction(
        config.aaveAddressProvider,
        config.usdc,
        config.usdt,
        config.feeCollector
    );
    
    const gasEstimate = await ethers.provider.estimateGas(deployTx);
    console.log("⛽ Gas estimé:", gasEstimate.toString());

    // Obtenir le prix du gas actuel
    const feeData = await ethers.provider.getFeeData();
    console.log("💰 Gas Price:", ethers.formatUnits(feeData.gasPrice, "gwei"), "gwei");
    
    // Calculer le coût estimé
    const estimatedCost = gasEstimate * feeData.gasPrice;
    console.log("💸 Coût estimé:", ethers.formatEther(estimatedCost), "POL");

    // Vérifier si le solde est suffisant pour le déploiement
    if (balance < estimatedCost * 2n) { // Marge de sécurité x2
        console.warn("⚠️  Solde potentiellement insuffisant pour le déploiement");
    }

    // Déployer le contrat
    console.log("⏳ Déploiement en cours...");
    const flashLoanArbitrage = await FlashLoanArbitrage.deploy(
        config.aaveAddressProvider,
        config.usdc,
        config.usdt,
        config.feeCollector
    );

    // Attendre la confirmation du déploiement
    console.log("📋 Transaction envoyée:", flashLoanArbitrage.deploymentTransaction().hash);
    console.log("⏳ Attente de la confirmation...");
    
    await flashLoanArbitrage.waitForDeployment();

    const contractAddress = await flashLoanArbitrage.getAddress();
    console.log("✅ Contrat déployé à l'adresse:", contractAddress);
    console.log("🔗 Aave Address Provider:", config.aaveAddressProvider);
    console.log("💰 USDC:", config.usdc);
    console.log("💰 USDT:", config.usdt);
    console.log("👤 Fee Collector:", config.feeCollector);

    // Obtenir les détails de la transaction
    const deployTxReceipt = await flashLoanArbitrage.deploymentTransaction().wait();
    console.log("⛽ Gas utilisé:", deployTxReceipt.gasUsed.toString());
    console.log("💸 Coût réel:", ethers.formatEther(deployTxReceipt.gasUsed * deployTxReceipt.gasPrice), "POL");

    // Attendre quelques confirmations avant la vérification
    console.log("⏳ Attente de 6 confirmations pour la vérification...");
    await flashLoanArbitrage.deploymentTransaction().wait(6);

    // Vérifier le contrat sur l'explorateur
    try {
        console.log("🔍 Tentative de vérification du contrat...");
        await hre.run("verify:verify", {
            address: contractAddress,
            constructorArguments: [
                config.aaveAddressProvider,
                config.usdc,
                config.usdt,
                config.feeCollector
            ],
        });
        console.log("✅ Contrat vérifié avec succès!");
    } catch (error) {
        console.log("⚠️  Erreur lors de la vérification:", error.message);
        console.log("💡 Vous pouvez vérifier manuellement plus tard avec:");
        console.log(`npx hardhat verify --network ${network.name} ${contractAddress} ${config.aaveAddressProvider} ${config.usdc} ${config.usdt} ${config.feeCollector}`);
    }

    // Sauvegarder les informations de déploiement
    const deploymentInfo = {
        network: network.name,
        chainId: chainId,
        contractAddress: contractAddress,
        deployerAddress: deployer.address,
        aaveAddressProvider: config.aaveAddressProvider,
        usdc: config.usdc,
        usdt: config.usdt,
        feeCollector: config.feeCollector,
        blockNumber: deployTxReceipt.blockNumber,
        timestamp: new Date().toISOString(),
        transactionHash: flashLoanArbitrage.deploymentTransaction().hash,
        gasUsed: deployTxReceipt.gasUsed.toString(),
        gasPrice: deployTxReceipt.gasPrice.toString(),
        deploymentCost: ethers.formatEther(deployTxReceipt.gasUsed * deployTxReceipt.gasPrice)
    };

    // Écrire les infos dans un fichier JSON
    const fs = require('fs');
    const deploymentsDir = './deployments';
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir);
    }
    
    const filename = `${deploymentsDir}/${network.name}-${chainId}.json`;
    fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));

    console.log("📄 Informations de déploiement sauvegardées dans:", filename);

    // Afficher un résumé final
    console.log("\n🎉 DÉPLOIEMENT TERMINÉ AVEC SUCCÈS!");
    console.log("=" .repeat(50));
    console.log("📍 Réseau:", network.name);
    console.log("📝 Contrat:", contractAddress);
    console.log("💰 Coût total:", ethers.formatEther(deployTxReceipt.gasUsed * deployTxReceipt.gasPrice), "POL");
    console.log("🔗 Explorer:", getExplorerUrl(contractAddress, chainId));
    console.log("=" .repeat(50));

    return flashLoanArbitrage;
}

// Fonction utilitaire pour obtenir l'URL de l'explorateur
function getExplorerUrl(address, chainId) {
    const explorers = {
        1: `https://etherscan.io/address/${address}`,
        137: `https://polygonscan.com/address/${address}`,
        42161: `https://arbiscan.io/address/${address}`,
        80001: `https://mumbai.polygonscan.com/address/${address}`
    };
    return explorers[chainId] || `Explorer non disponible pour chainId ${chainId}`;
}

// Gestion des erreurs
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Erreur:", error);
        process.exit(1);
    });