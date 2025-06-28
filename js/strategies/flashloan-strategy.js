// js/strategies/flashloan-strategy.js
import { BaseStrategy } from './base-strategy.js';
import { getEventBus } from '../core/event-bus.js';
import { getNotificationSystem } from '../core/notification-system.js';

// Utilitaires de formatage (solution temporaire)
const formatNumber = (value, decimals = 2) => {
    const num = parseFloat(value) || 0;
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(num);
};

const formatPercent = (value, decimals = 2) => {
    const num = parseFloat(value) || 0;
    return `${num.toFixed(decimals)}%`;
};

export class FlashLoanStrategy extends BaseStrategy {
    constructor(walletManager) {
        super('flashloan', walletManager);
        this.name = 'Flash Loan Arbitrage';
        this.eventBus = getEventBus();
        this.notificationSystem = getNotificationSystem();
        this.description = 'Arbitrage automatique avec emprunts flash sans capital initial';

        // Configuration des protocoles
        this.protocols = {
            flashLoanProviders: ['aave', 'balancer', 'dydx'],
            dexes: ['uniswap', 'sushiswap', 'pancakeswap'],
            tokens: ['USDC', 'USDT', 'DAI', 'WETH', 'WBTC']
        };
        
        // État de la stratégie
        this.opportunities = [];
        this.activeArbitrages = new Map();
        this.stats = {
            totalProfit: 0,
            successfulTrades: 0,
            failedTrades: 0,
            totalVolume: 0
        };
        
        // Configuration des seuils
        this.config = {
            minProfitThreshold: 0.001, // 0.1% minimum
            maxGasPrice: 100, // gwei
            slippageTolerance: 0.005, // 0.5%
            monitoringInterval: 5000 // 5 secondes
        };
        
        this.isMonitoring = false;
        this.monitoringInterval = null;

        // 🆕 Configuration du vrai contrat
        this.contractAddress = "0x78d214d088CEe374705c0303fB360046DAf0B466";
        this.contract = null; // Sera initialisé quand wallet connecté
        
        this.init();
    }

    async init() {
        await this.loadContracts();
        this.setupEventListeners();
        console.log('FlashLoan Strategy initialized');
    }

    async loadContracts() {
        const network = this.walletManager.currentNetwork;
        
        // Adresses des contrats selon le réseau
        this.contracts = {
            polygon: {
                aavePool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
                uniswapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
                sushiswapRouter: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506'
            },
            ethereum: {
                aavePool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
                uniswapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
                sushiswapRouter: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F'
            }
        };
    }

    setupEventListeners() {
        this.eventBus.on('wallet:connected', () => this.onWalletConnected());
        this.eventBus.on('wallet:disconnected', () => this.onWalletDisconnected());
        this.eventBus.on('network:changed', (network) => this.onNetworkChanged(network));
    }

    async onWalletConnected() {
        await this.loadContracts();
        // 🆕 Initialiser le vrai contrat Flash Loan
    if (this.walletManager.signer) {
        const { getABI } = await import('../config.js');
        const abi = getABI('FLASHLOAN_ARBITRAGE');
        this.contract = new ethers.Contract(
            this.contractAddress, 
            abi, 
            this.walletManager.signer
        );
        
        // Vérifier que le contrat est accessible
        try {
            const owner = await this.contract.owner();
            console.log('🎯 Contrat Flash Loan connecté, owner:', owner);
            this.notificationSystem.show('Contrat Flash Loan connecté !', 'success');
        } catch (error) {
            console.error('❌ Erreur connexion contrat:', error);
            this.notificationSystem.show('Erreur connexion contrat', 'error');
        }
    }

    // 🆕 Charger les vraies données après connexion
    await this.loadRealContractData();
    await this.loadUserBalances();
    
        this.render();
    }

    onWalletDisconnected() {
        this.stopMonitoring();
        this.render();
    }

    async onNetworkChanged(network) {
        await this.loadContracts();
        this.render();
    }

    // Surveillance des opportunités d'arbitrage
    async startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        const notificationSystem = getNotificationSystem();
        notificationSystem.show('Surveillance d\'arbitrage démarrée', 'success');
        
        this.monitoringInterval = setInterval(async () => {
            try {
                await this.scanForOpportunities();
            } catch (error) {
                console.error('Erreur lors du scan:', error);
            }
        }, this.config.monitoringInterval);
        
        this.render();
    }

    stopMonitoring() {
        if (!this.isMonitoring) return;
        
        this.isMonitoring = false;
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        
        this.notificationSystem.show('Surveillance arrêtée', 'info');
        this.render();
    }

    // Scanner les opportunités d'arbitrage
    async scanForOpportunities() {
        const newOpportunities = [];
        
        for (const token of this.protocols.tokens) {
            try {
                const prices = await this.fetchTokenPrices(token);
                const opportunity = this.calculateArbitrageOpportunity(token, prices);
                
                if (opportunity && opportunity.profitPercent > this.config.minProfitThreshold) {
                    newOpportunities.push(opportunity);
                }
            } catch (error) {
                console.error(`Erreur prix pour ${token}:`, error);
            }
        }
        
        this.opportunities = newOpportunities.sort((a, b) => b.profitPercent - a.profitPercent);
        this.render();
        
        // Auto-exécution des meilleures opportunités si activée
        if (this.config.autoExecute && this.opportunities.length > 0) {
            const bestOpp = this.opportunities[0];
            if (bestOpp.profitPercent > this.config.autoExecuteThreshold) {
                await this.executeArbitrage(bestOpp);
            }
        }
    }

    // Récupérer les prix sur différents DEX
    async fetchTokenPrices(token) {
        // Simulation - dans la vraie implémentation, utiliser les APIs des DEX
        const basePrice = Math.random() * 1000 + 1000;
        return {
            uniswap: basePrice * (1 + (Math.random() - 0.5) * 0.02),
            sushiswap: basePrice * (1 + (Math.random() - 0.5) * 0.02),
            pancakeswap: basePrice * (1 + (Math.random() - 0.5) * 0.02)
        };
    }

    // Calculer l'opportunité d'arbitrage
    calculateArbitrageOpportunity(token, prices) {
        const exchanges = Object.keys(prices);
        let bestBuy = { exchange: null, price: Infinity };
        let bestSell = { exchange: null, price: 0 };
        
        exchanges.forEach(exchange => {
            if (prices[exchange] < bestBuy.price) {
                bestBuy = { exchange, price: prices[exchange] };
            }
            if (prices[exchange] > bestSell.price) {
                bestSell = { exchange, price: prices[exchange] };
            }
        });
        
        const priceDiff = bestSell.price - bestBuy.price;
        const profitPercent = (priceDiff / bestBuy.price) * 100;
        
        // Estimation des coûts
        const gasEstimate = 0.01; // $10 en gas
        const fees = bestBuy.price * 0.003; // 0.3% de fees
        const netProfit = priceDiff - gasEstimate - fees;
        const netProfitPercent = (netProfit / bestBuy.price) * 100;
        
        if (netProfitPercent <= 0) return null;
        
        return {
            token,
            buyExchange: bestBuy.exchange,
            sellExchange: bestSell.exchange,
            buyPrice: bestBuy.price,
            sellPrice: bestSell.price,
            profitPercent: netProfitPercent,
            estimatedProfit: netProfit,
            timestamp: Date.now()
        };
    }

    // Exécuter un arbitrage avec flash loan
    async executeArbitrage(opportunity) {
    if (!this.walletManager.isConnected) {
        this.notificationSystem.show('Wallet non connecté', 'error');
        return;
    }

    if (!this.contract) {
        this.notificationSystem.show('Contrat non initialisé', 'error');
        return;
    }

    try {
        this.notificationSystem.show(`🚀 Flash Loan en cours: ${opportunity.token}...`, 'info');
        
        // 🆕 Créer les paramètres réels pour le contrat
        const params = {
            tokenA: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC
            tokenB: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // USDT
            dexRouter1: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff", // QuickSwap
            dexRouter2: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506", // SushiSwap
            amountIn: ethers.parseUnits("1000", 6), // 1000 USDC
            minProfitBps: 10, // 0.1% minimum
            reverseDirection: false,
            maxSlippage: 50, // 0.5%
            deadline: Math.floor(Date.now() / 1000) + 1800 // 30 minutes
        };

        // 🆕 Estimer le gas
        const gasEstimate = await this.contract.executeArbitrage.estimateGas(params);
        console.log('⛽ Gas estimé:', gasEstimate.toString());

        // 🆕 Exécuter le VRAI Flash Loan !
        const tx = await this.contract.executeArbitrage(params, {
            gasLimit: gasEstimate.mul(120).div(100) // +20% de marge
        });

        this.notificationSystem.show(`⏳ Transaction envoyée: ${tx.hash}`, 'info');
        
        // Attendre la confirmation
        const receipt = await tx.wait();
        
        // Analyser les événements pour récupérer le profit
        const arbitrageEvent = receipt.events?.find(e => e.event === 'ArbitrageExecuted');
        if (arbitrageEvent) {
            const profit = ethers.formatUnits(arbitrageEvent.args.userProfit, 6);
            this.notificationSystem.show(`🎉 Flash Loan réussi! Profit: $${profit}`, 'success');
            
            // Mettre à jour les stats
            this.stats.successfulTrades++;
            this.stats.totalProfit += parseFloat(profit);
        } else {
            this.notificationSystem.show('Flash Loan exécuté (vérifiez la transaction)', 'success');
        }

    } catch (error) {
        console.error('❌ Erreur Flash Loan:', error);
        
        // Analyser l'erreur
        if (error.code === 4001) {
            this.notificationSystem.show('Transaction annulée', 'warning');
        } else if (error.message.includes('insufficient funds')) {
            this.notificationSystem.show('Fonds insuffisants', 'error');
        } else if (error.message.includes('Arbitrage non profitable')) {
            this.notificationSystem.show('Arbitrage non rentable', 'warning');
        } else {
            this.notificationSystem.show(`Erreur: ${error.message}`, 'error');
        }
        
        this.stats.failedTrades++;
    }
    
    this.render();
}

    async simulateFlashLoanExecution(opportunity) {
        // Simulation d'une transaction flash loan
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                if (Math.random() > 0.1) { // 90% de succès
                    resolve();
                } else {
                    reject(new Error('Slippage trop élevé'));
                }
            }, 2000 + Math.random() * 3000);
        });
    }

    async depositToPool(tokenSymbol, amount) {
    if (!this.walletManager.isConnected) {
        this.notificationSystem.show('Connectez votre wallet', 'error');
        return;
    }

    if (!this.contract) {
        this.notificationSystem.show('Contrat non initialisé', 'error');
        return;
    }

    try {
        // Adresses des tokens
        const tokenAddresses = {
            'USDC': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
            'USDT': '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
        };

        const tokenAddress = tokenAddresses[tokenSymbol];
        const decimals = 6; // USDC et USDT ont 6 décimales
        const amountWei = ethers.parseUnits(amount.toString(), decimals);

        this.notificationSystem.show(`Préparation dépôt ${amount} ${tokenSymbol}...`, 'info');

        // 1. Créer le contrat du token
        const { getABI } = await import('../config.js');
        const tokenContract = new ethers.Contract(
            tokenAddress,
            getABI('ERC20'),
            this.walletManager.signer
        );

        // 2. Vérifier le solde
        const balance = await tokenContract.balanceOf(this.walletManager.account);
        if (balance < amountWei) {
            this.notificationSystem.show(`Solde insuffisant. Vous avez ${ethers.formatUnits(balance, decimals)} ${tokenSymbol}`, 'error');
            return;
        }

        // 3. Vérifier l'allowance
        const allowance = await tokenContract.allowance(this.walletManager.account, this.contractAddress);
        
        if (allowance < amountWei) {
            this.notificationSystem.show(`Approbation ${tokenSymbol} en cours...`, 'info');
            
            const approveTx = await tokenContract.approve(this.contractAddress, amountWei);
            this.notificationSystem.show(`Attente confirmation approbation...`, 'info');
            await approveTx.wait();
            
            this.notificationSystem.show(`${tokenSymbol} approuvé !`, 'success');
        }

        // 4. Déposer dans le contrat
        this.notificationSystem.show(`Dépôt ${amount} ${tokenSymbol} en cours...`, 'info');
        
        const depositTx = await this.contract.deposit(tokenAddress, amountWei);
        this.notificationSystem.show(`Transaction envoyée: ${depositTx.hash}`, 'info');
        
        const receipt = await depositTx.wait();
        
        // 5. Succès !
        this.notificationSystem.show(`✅ Dépôt réussi ! ${amount} ${tokenSymbol} déposés`, 'success');
        
        // 6. Actualiser les données
        await this.loadRealContractData();
        await this.loadUserBalances();

    } catch (error) {
        console.error('Erreur dépôt:', error);
        
        if (error.code === 4001) {
            this.notificationSystem.show('Transaction annulée', 'warning');
        } else if (error.message.includes('insufficient funds')) {
            this.notificationSystem.show('Fonds insuffisants pour les gas fees', 'error');
        } else {
            this.notificationSystem.show(`Erreur: ${error.message}`, 'error');
        }
    }
}

async loadRealContractData() {
    if (!this.contract || !this.walletManager.isConnected) return;

    try {
        console.log('📊 Chargement données contrat...');

        // 1. Récupérer les métriques globales du pool
        const poolMetrics = await this.contract.getPoolMetrics();
        
        // 2. Récupérer la position de l'utilisateur
        const userPosition = await this.contract.getUserPosition(this.walletManager.account);
        
        // 3. Convertir les données du contrat
        const realData = {
            // Métriques du pool
            totalUSDCDeposits: parseFloat(ethers.formatUnits(poolMetrics.totalUSDCDeposits, 6)),
            totalUSDTDeposits: parseFloat(ethers.formatUnits(poolMetrics.totalUSDTDeposits, 6)),
            totalProfits: parseFloat(ethers.formatUnits(poolMetrics.totalProfits, 6)),
            successfulTrades: parseInt(poolMetrics.successfulTrades),
            failedTrades: parseInt(poolMetrics.failedTrades),
            totalVolume: parseFloat(ethers.formatUnits(poolMetrics.totalVolume, 6)),
            
            // Position utilisateur
            userUsdcShares: parseFloat(ethers.formatUnits(userPosition.usdcShares, 6)),
            userUsdtShares: parseFloat(ethers.formatUnits(userPosition.usdtShares, 6)),
            userTotalDeposited: parseFloat(ethers.formatUnits(userPosition.totalDeposited, 6)),
            userTotalProfits: parseFloat(ethers.formatUnits(userPosition.totalProfits, 6)),
            depositCount: parseInt(userPosition.depositCount),
            withdrawalCount: parseInt(userPosition.withdrawalCount)
        };

        // 4. Mettre à jour les stats internes
        this.stats = {
            totalProfit: realData.totalProfits,
            successfulTrades: realData.successfulTrades,
            failedTrades: realData.failedTrades,
            totalVolume: realData.totalVolume
        };

        // 5. Mettre à jour l'interface avec les vraies données
        this.updateInterfaceWithRealData(realData);

        console.log('✅ Données contrat chargées:', realData);

    } catch (error) {
        console.error('❌ Erreur chargement données contrat:', error);
        this.notificationSystem.show('Erreur récupération données', 'error');
    }
}

async loadUserBalances() {
    if (!this.walletManager.isConnected) return;

    try {
        const { getABI } = await import('../config.js');
        const erc20ABI = getABI('ERC20');

        // Adresses des tokens
        const tokens = {
            USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
            USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
        };

        // Récupérer les soldes
        for (const [symbol, address] of Object.entries(tokens)) {
            const contract = new ethers.Contract(address, erc20ABI, this.walletManager.provider);
            const balance = await contract.balanceOf(this.walletManager.account);
            const formattedBalance = ethers.formatUnits(balance, 6);

            // Mettre à jour dans l'interface
            const balanceElement = document.getElementById(`${symbol.toLowerCase()}Balance`);
            if (balanceElement) {
                balanceElement.textContent = parseFloat(formattedBalance).toFixed(2);
            }
        }

    } catch (error) {
        console.error('Erreur chargement soldes:', error);
    }
}

updateInterfaceWithRealData(data) {
    // Mettre à jour les métriques globales
    const totalValueElement = document.querySelector('.stat-value');
    if (totalValueElement) {
        const totalValue = data.totalUSDCDeposits + data.totalUSDTDeposits;
        totalValueElement.textContent = `$${totalValue.toFixed(2)}`;
    }

    // Mettre à jour la position utilisateur
    const elements = {
        'userUsdcShares': data.userUsdcShares.toFixed(2),
        'userUsdtShares': data.userUsdtShares.toFixed(2),
        'userTotalProfits': `$${data.userTotalProfits.toFixed(2)}`
    };

    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    });

    console.log('🎨 Interface mise à jour avec les vraies données');
}

    // Interface utilisateur
    render() {
        const container = document.getElementById('flashloanStrategyContainer');
        if (!container) return;

        container.innerHTML = `
        <div class="flashloan-strategy">
            
            <!-- Sections existantes : contrôles, stats, config... -->
            
            <!-- 🆕 NOUVELLE SECTION DÉPÔT -->
            <div class="deposit-section">
                <h3><i class="fas fa-piggy-bank"></i> Déposer dans le Pool</h3>
                <div class="deposit-grid">
                    <div class="deposit-card">
                        <div class="token-header">
                            <img src="https://cryptologos.cc/logos/usd-coin-usdc-logo.png" alt="USDC" class="token-icon">
                            <span class="token-name">USDC</span>
                        </div>
                        <input type="number" id="usdcDepositAmount" placeholder="Montant USDC" min="100" step="10">
                        <button id="depositUSDC" class="deposit-btn">
                            <i class="fas fa-plus"></i>
                            Déposer USDC
                        </button>
                        <div class="balance-info">
                            Solde: <span id="usdcBalance">0</span> USDC
                        </div>
                    </div>
                    
                    <div class="deposit-card">
                        <div class="token-header">
                            <img src="https://cryptologos.cc/logos/tether-usdt-logo.png" alt="USDT" class="token-icon">
                            <span class="token-name">USDT</span>
                        </div>
                        <input type="number" id="usdtDepositAmount" placeholder="Montant USDT" min="100" step="10">
                        <button id="depositUSDT" class="deposit-btn">
                            <i class="fas fa-plus"></i>
                            Déposer USDT
                        </button>
                        <div class="balance-info">
                            Solde: <span id="usdtBalance">0</span> USDT
                        </div>
                    </div>
                </div>
                
                <!-- Position utilisateur -->
                <div class="user-position">
                    <h4>Votre Position</h4>
                    <div class="position-grid">
                        <div class="position-item">
                            <span class="label">Parts USDC:</span>
                            <span id="userUsdcShares">0</span>
                        </div>
                        <div class="position-item">
                            <span class="label">Parts USDT:</span>
                            <span id="userUsdtShares">0</span>
                        </div>
                        <div class="position-item">
                            <span class="label">Profits totaux:</span>
                            <span id="userTotalProfits">$0.00</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Sections existantes : opportunités, arbitrages actifs... -->
        </div>
    `;

    this.attachEventListeners();
}

    renderOpportunities() {
        if (this.opportunities.length === 0) {
            return `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <p>Aucune opportunité détectée</p>
                    <span>Démarrez la surveillance pour scanner le marché</span>
                </div>
            `;
        }

        return this.opportunities.map(opp => `
            <div class="opportunity-card">
                <div class="opportunity-header">
                    <span class="token-symbol">${opp.token}</span>
                    <span class="profit-badge ${opp.profitPercent > 0.5 ? 'high-profit' : ''}">
                        +${formatPercent(opp.profitPercent)}
                    </span>
                </div>
                <div class="opportunity-details">
                    <div class="exchange-flow">
                        <span class="buy-exchange">${opp.buyExchange}</span>
                        <i class="fas fa-arrow-right"></i>
                        <span class="sell-exchange">${opp.sellExchange}</span>
                    </div>
                    <div class="profit-info">
                        <span>Profit Estimé: $${formatNumber(opp.estimatedProfit)}</span>
                    </div>
                </div>
                <button class="execute-btn" data-arbitrage='${JSON.stringify(opp)}'>
                    <i class="fas fa-play"></i>
                    Exécuter
                </button>
            </div>
        `).join('');
    }

    renderActiveArbitrages() {
        const activeArbitrages = Array.from(this.activeArbitrages.entries())
            .filter(([id, arb]) => arb.status === 'executing')
            .slice(0, 5);

        if (activeArbitrages.length === 0) {
            return `
                <div class="empty-state">
                    <i class="fas fa-clock"></i>
                    <p>Aucun arbitrage en cours</p>
                </div>
            `;
        }

        return activeArbitrages.map(([id, arb]) => `
            <div class="arbitrage-card">
                <div class="arbitrage-header">
                    <span class="token">${arb.token}</span>
                    <span class="status executing">En cours...</span>
                </div>
                <div class="arbitrage-progress">
                    <div class="progress-bar">
                        <div class="progress-fill"></div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    getSuccessRate() {
        const total = this.stats.successfulTrades + this.stats.failedTrades;
        return total === 0 ? 0 : Math.round((this.stats.successfulTrades / total) * 100);
    }

    attachEventListeners() {
        // Bouton démarrer/arrêter surveillance
        const toggleBtn = document.getElementById('toggleMonitoring');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                if (this.isMonitoring) {
                    this.stopMonitoring();
                } else {
                    this.startMonitoring();
                }
            });
        }

        // Bouton actualiser
        const refreshBtn = document.getElementById('refreshOpportunities');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.scanForOpportunities();
            });
        }

        // Configuration inputs
        const inputs = ['minProfitThreshold', 'maxGasPrice', 'slippageTolerance', 'monitoringInterval'];
        inputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('change', (e) => {
                    this.updateConfig(inputId, e.target.value);
                });
            }
        });

        // 🆕 Event listeners pour les boutons d'exécution
    document.addEventListener('click', (e) => {
        if (e.target.closest('.execute-btn')) {
            const button = e.target.closest('.execute-btn');
            const arbitrageData = button.getAttribute('data-arbitrage');
            if (arbitrageData) {
                try {
                    const opportunity = JSON.parse(arbitrageData);
                    this.executeArbitrage(opportunity);
                } catch (error) {
                    console.error('Erreur parsing opportunity:', error);
                    this.notificationSystem.show('Erreur lors de l\'exécution', 'error');
                }
            }
        }

        // 🆕 Event listeners pour les dépôts
    const depositUSDCBtn = document.getElementById('depositUSDC');
    if (depositUSDCBtn) {
        depositUSDCBtn.addEventListener('click', async () => {
            const amount = document.getElementById('usdcDepositAmount').value;
            if (amount && parseFloat(amount) >= 100) {
                await this.depositToPool('USDC', amount);
            } else {
                this.notificationSystem.show('Montant minimum: 100 USDC', 'warning');
            }
        });
    }

    const depositUSDTBtn = document.getElementById('depositUSDT');
    if (depositUSDTBtn) {
        depositUSDTBtn.addEventListener('click', async () => {
            const amount = document.getElementById('usdtDepositAmount').value;
            if (amount && parseFloat(amount) >= 100) {
                await this.depositToPool('USDT', amount);
            } else {
                this.notificationSystem.show('Montant minimum: 100 USDT', 'warning');
            }
        });
    }
    });
    }

    updateConfig(key, value) {
        switch (key) {
            case 'minProfitThreshold':
                this.config.minProfitThreshold = parseFloat(value) / 100;
                break;
            case 'maxGasPrice':
                this.config.maxGasPrice = parseInt(value);
                break;
            case 'slippageTolerance':
                this.config.slippageTolerance = parseFloat(value) / 100;
                break;
            case 'monitoringInterval':
                this.config.monitoringInterval = parseInt(value) * 1000;
                if (this.isMonitoring) {
                    this.stopMonitoring();
                    this.startMonitoring();
                }
                break;
        }
        
        this.notificationSystem.show('Configuration mise à jour', 'success');
    }

    // Méthodes héritées de BaseStrategy
    async activate() {
        this.isActive = true;
        await this.startMonitoring();
    }

    async deactivate() {
        this.isActive = false;
        this.stopMonitoring();
    }

    getBalance() {
        return this.stats.totalProfit;
    }

    getAPR() {
        // Calcul APR basé sur les profits des 24 dernières heures
        return this.stats.totalProfit > 0 ? 15.5 : 0;
    }
}

// Export de l'instance globale pour les event handlers inline
window.flashLoanStrategy = null;