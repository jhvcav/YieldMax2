// js/strategies/flashloan-strategy.js
import { BaseStrategy } from './base-strategy.js';
import { getEventBus } from '../core/event-bus.js';
import { getNotificationSystem } from '../core/notification-system.js';

// 🔧 CORRECTION CORS: Images locales ou données base64
const TOKEN_ICONS = {
    USDC: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiMyNzc1Q0EiLz4KPHN2ZyB4PSI0IiB5PSI0IiB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSI+CjxwYXRoIGQ9Ik0xMiAyNEMxOC42Mjc0IDI0IDI0IDE4LjYyNzQgMjQgMTJDMjQgNS4zNzI1OCAxOC42Mjc0IDAgMTIgMEM1LjM3MjU4IDAgMCA1LjM3MjU4IDAgMTJDMCAxOC42Mjc0IDUuMzcyNTggMjQgMTIgMjRaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMTIuMDAwMiAxNi43NUMxNS4wMzc2IDE2Ljc1IDE3LjUwMDIgMTQuNjI1NiAxNy41MDAyIDEyQzE3LjUwMDIgOS4zNzQ0NCAxNS4wMzc2IDcuMjUgMTIuMDAwMiA3LjI1QzguOTYyNjMgNy4yNSA2LjUwMDIgOS4zNzQ0NCA2LjUwMDIgMTJDNi41MDAyIDE0LjYyNTYgOC45NjI2MyAxNi43NSAxMi4wMDAyIDE2Ljc1WiIgZmlsbD0iIzI3NzVDQSIvPgo8L3N2Zz4KPC9zdmc+',
    USDT: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiMyNkE2OUEiLz4KPHN2ZyB4PSI0IiB5PSI0IiB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSI+CjxwYXRoIGQ9Ik0xMiAyNEMxOC42Mjc0IDI0IDI0IDE4LjYyNzQgMjQgMTJDMjQgNS4zNzI1OCAxOC42Mjc0IDAgMTIgMEM1LjM3MjU4IDAgMCA1LjM3MjU4IDAgMTJDMCAxOC42Mjc0IDUuMzcyNTggMjQgMTIgMjRaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMTMuNSA5SDEwLjVWNy41SDE2LjVWOUgxMy41VjEySDEwLjVWMTAuNUgxNi41VjEySDEzLjVWMTZIMTAuNVYxMi4zSDE2LjVWMTZIMTMuNVoiIGZpbGw9IiMyNkE2OUEiLz4KPC9zdmc+CjwhL3N2Zz4='
};

// 🔧 CORRECTION: Utiliser des icônes CSS au lieu d'images externes
const getTokenIcon = (symbol) => {
    // Retourner une icône CSS stylée au lieu d'une image externe
    const colors = {
        USDC: '#2775CA',
        USDT: '#26A69A',
        DAI: '#F5AC37',
        WETH: '#627EEA',
        WBTC: '#F7931A'
    };
    
    return `<div class="token-icon-css" style="
        width: 32px; 
        height: 32px; 
        border-radius: 50%; 
        background: ${colors[symbol] || '#6c757d'}; 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        color: white; 
        font-weight: bold; 
        font-size: 12px;
    ">${symbol}</div>`;
};

// Utilitaires de formatage 
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

// Gestionnaire d'erreurs intégré
class FlashLoanErrorHandler {
    static handleContractError(error, notificationSystem) {
        console.error('Flash Loan Error:', error);
        
        if (error.code === 4001) {
            notificationSystem.show('Transaction annulée par l\'utilisateur', 'warning');
        } else if (error.code === -32603) {
            notificationSystem.show('Erreur interne du réseau', 'error');
        } else if (error.message?.includes('insufficient funds')) {
            notificationSystem.show('Fonds insuffisants pour les gas fees', 'error');
        } else if (error.message?.includes('execution reverted')) {
            const reason = error.message.split('execution reverted: ')[1] || 'Raison inconnue';
            notificationSystem.show(`Transaction rejetée: ${reason}`, 'error');
        } else if (error.message?.includes('network')) {
            notificationSystem.show('Problème de connexion réseau', 'error');
        } else {
            notificationSystem.show(`Erreur: ${error.message || 'Erreur inconnue'}`, 'error');
        }
    }
}

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
            dexes: ['uniswap', 'sushiswap', 'quickswap'],
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

        // Configuration du contrat
        this.contractAddress = "0x78d214d088CEe374705c0303fB360046DAf0B466";
        this.contract = null;
        
        // Données utilisateur
        this.userBalances = {
            USDC: 0,
            USDT: 0
        };
        
        // Données du contrat
        this.contractData = {
            totalUSDCDeposits: 0,
            totalUSDTDeposits: 0,
            userUsdcShares: 0,
            userUsdtShares: 0,
            userTotalProfits: 0
        };
        
        this.init();
    }

    async init() {
        await this.loadContracts();
        this.setupEventListeners();
        console.log('FlashLoan Strategy initialized');
    }

    async loadContracts() {
        const network = this.walletManager.currentNetwork || 'polygon';
        
        // Adresses des contrats selon le réseau
        this.contracts = {
            polygon: {
                aavePool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
                uniswapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
                sushiswapRouter: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
                quickswapRouter: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff'
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
        
        // Vérifier que ethers est disponible globalement
        if (typeof window.ethers === 'undefined') {
            console.error('❌ Ethers.js non disponible');
            this.notificationSystem.show('Erreur: Ethers.js non chargé', 'error');
            return;
        }

        // Utiliser window.ethers pour la compatibilité
        const ethers = window.ethers;

        if (this.walletManager.signer) {
            try {
                const { getABI } = await import('../config.js');
                const abi = getABI('FLASHLOAN_ARBITRAGE');
                
                this.contract = new ethers.Contract(
                    this.contractAddress, 
                    abi, 
                    this.walletManager.signer
                );
                
                // Vérifier que le contrat est accessible
                const owner = await this.contract.owner();
                console.log('🎯 Contrat Flash Loan connecté, owner:', owner);
                this.notificationSystem.show('Contrat Flash Loan connecté !', 'success');
                
                // Charger les données
                await this.loadRealContractData();
                await this.loadUserBalances();
                
            } catch (error) {
                console.error('❌ Erreur connexion contrat:', error);
                this.notificationSystem.show('Contrat non accessible (réseau de test)', 'warning');
                this.contract = null;
            }
        }
        
        this.render();
    }

    onWalletDisconnected() {
        this.stopMonitoring();
        this.contract = null;
        this.render();
    }

    async onNetworkChanged(network) {
        await this.loadContracts();
        if (this.walletManager.isConnected) {
            await this.onWalletConnected();
        }
        this.render();
    }

    // Surveillance des opportunités d'arbitrage
    async startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        this.notificationSystem.show('🔍 Surveillance d\'arbitrage démarrée', 'success');
        
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
        
        this.notificationSystem.show('⏹️ Surveillance arrêtée', 'info');
        this.render();
    }

    // 🔧 CORRECTION CORS: Scanner les opportunités sans déclencher de requêtes images
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
        
        // 🔧 CORRECTION: Mettre à jour uniquement les opportunités, pas tout le render
        this.updateOpportunitiesDisplay();
    }

    // Récupérer les prix sur différents DEX (simulation)
    async fetchTokenPrices(token) {
        const basePrice = Math.random() * 1000 + 1000;
        return {
            uniswap: basePrice * (1 + (Math.random() - 0.5) * 0.02),
            sushiswap: basePrice * (1 + (Math.random() - 0.5) * 0.02),
            quickswap: basePrice * (1 + (Math.random() - 0.5) * 0.02)
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
            timestamp: Date.now(),
            id: Date.now().toString()
        };
    }

    // Exécuter un arbitrage avec gestion d'erreur améliorée
    async executeArbitrage(opportunity) {
        if (!this.walletManager.isConnected) {
            this.notificationSystem.show('Wallet non connecté', 'error');
            return;
        }

        if (!this.contract) {
            this.notificationSystem.show('Contrat non disponible (mode simulation)', 'warning');
            return this.simulateArbitrage(opportunity);
        }

        const ethers = window.ethers;
        const arbitrageId = Date.now().toString();

        try {
            // Ajouter à la liste des arbitrages actifs
            this.activeArbitrages.set(arbitrageId, {
                ...opportunity,
                status: 'executing',
                startTime: Date.now()
            });
            this.updateActiveArbitragesDisplay();

            this.notificationSystem.show(`🚀 Flash Loan ${opportunity.token}: ${opportunity.buyExchange} → ${opportunity.sellExchange}`, 'info');
            
            // Préparer les paramètres
            let amountIn;
            try {
                amountIn = ethers.parseUnits("1000", 6);
            } catch (error) {
                amountIn = ethers.utils.parseUnits("1000", 6);
            }
            
            const params = {
                tokenA: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC
                tokenB: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // USDT
                dexRouter1: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff", // QuickSwap
                dexRouter2: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506", // SushiSwap
                amountIn: amountIn,
                minProfitBps: 10,
                reverseDirection: false,
                maxSlippage: 50,
                deadline: Math.floor(Date.now() / 1000) + 1800
            };

            // Estimer le gas
            let gasEstimate;
            try {
                gasEstimate = await this.contract.executeArbitrage.estimateGas(params);
            } catch (error) {
                console.warn('Impossible d\'estimer le gas');
                gasEstimate = 500000;
            }

            // Exécuter la transaction
            const tx = await this.contract.executeArbitrage(params, {
                gasLimit: parseInt(gasEstimate * 1.2)
            });

            this.notificationSystem.show(`⏳ Transaction: ${tx.hash.substring(0, 10)}...`, 'info');
            
            const receipt = await tx.wait();
            
            // Analyser les événements
            let profit = 0;
            if (receipt.events) {
                const arbitrageEvent = receipt.events.find(e => e.event === 'ArbitrageExecuted');
                if (arbitrageEvent && arbitrageEvent.args) {
                    try {
                        const userProfitWei = arbitrageEvent.args.userProfit;
                        profit = ethers.formatUnits ? 
                            ethers.formatUnits(userProfitWei, 6) : 
                            ethers.utils.formatUnits(userProfitWei, 6);
                    } catch (formatError) {
                        profit = "0";
                    }
                }
            }
            
            // Mettre à jour les stats
            this.stats.successfulTrades++;
            this.stats.totalProfit += parseFloat(profit);
            
            // Marquer comme terminé
            this.activeArbitrages.set(arbitrageId, {
                ...this.activeArbitrages.get(arbitrageId),
                status: 'completed',
                actualProfit: parseFloat(profit),
                endTime: Date.now()
            });
            
            this.notificationSystem.show(`🎉 Flash Loan réussi! Profit: $${profit}`, 'success');

        } catch (error) {
            console.error('❌ Erreur Flash Loan:', error);
            
            this.stats.failedTrades++;
            
            // Marquer comme échoué
            this.activeArbitrages.set(arbitrageId, {
                ...this.activeArbitrages.get(arbitrageId),
                status: 'failed',
                error: error.message,
                endTime: Date.now()
            });
            
            FlashLoanErrorHandler.handleContractError(error, this.notificationSystem);
        }
        
        // Nettoyer après 5 secondes
        setTimeout(() => {
            this.activeArbitrages.delete(arbitrageId);
            this.updateActiveArbitragesDisplay();
        }, 5000);
        
        await this.loadRealContractData();
        await this.loadUserBalances();
        this.updateStatsDisplay();
    }

    // Simulation d'arbitrage pour le mode démo
    async simulateArbitrage(opportunity) {
        const arbitrageId = Date.now().toString();
        
        this.activeArbitrages.set(arbitrageId, {
            ...opportunity,
            status: 'executing',
            startTime: Date.now()
        });
        this.updateActiveArbitragesDisplay();

        this.notificationSystem.show(`🎮 Simulation: ${opportunity.token} arbitrage`, 'info');

        try {
            // Simulation de délai d'exécution
            await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
            
            if (Math.random() > 0.15) { // 85% de succès
                const actualProfit = opportunity.estimatedProfit * (0.8 + Math.random() * 0.4);
                
                this.stats.successfulTrades++;
                this.stats.totalProfit += actualProfit;
                
                this.activeArbitrages.set(arbitrageId, {
                    ...this.activeArbitrages.get(arbitrageId),
                    status: 'completed',
                    actualProfit: actualProfit,
                    endTime: Date.now()
                });
                
                this.notificationSystem.show(`🎉 Simulation réussie! Profit: $${actualProfit.toFixed(2)}`, 'success');
            } else {
                throw new Error('Slippage trop élevé');
            }
            
        } catch (error) {
            this.stats.failedTrades++;
            
            this.activeArbitrages.set(arbitrageId, {
                ...this.activeArbitrages.get(arbitrageId),
                status: 'failed',
                error: error.message,
                endTime: Date.now()
            });
            
            this.notificationSystem.show(`❌ Simulation échouée: ${error.message}`, 'error');
        }
        
        // Nettoyer après 3 secondes
        setTimeout(() => {
            this.activeArbitrages.delete(arbitrageId);
            this.updateActiveArbitragesDisplay();
        }, 3000);
        
        this.updateStatsDisplay();
    }

    // Fonction de dépôt
    async depositToPool(tokenSymbol, amount) {
        if (!this.walletManager.isConnected) {
            this.notificationSystem.show('Connectez votre wallet', 'error');
            return;
        }

        if (!this.contract) {
            this.notificationSystem.show('Mode simulation - dépôt non disponible', 'warning');
            return;
        }

        const ethers = window.ethers;

        try {
            const tokenAddresses = {
                'USDC': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
                'USDT': '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
            };

            const tokenAddress = tokenAddresses[tokenSymbol];
            const decimals = 6;
            
            let amountWei;
            try {
                amountWei = ethers.parseUnits(amount.toString(), decimals);
            } catch (error) {
                amountWei = ethers.utils.parseUnits(amount.toString(), decimals);
            }

            this.notificationSystem.show(`💰 Dépôt ${amount} ${tokenSymbol}...`, 'info');

            // Import ABI et création du contrat token
            const { getABI } = await import('../config.js');
            const tokenContract = new ethers.Contract(
                tokenAddress,
                getABI('ERC20'),
                this.walletManager.signer
            );

            // Vérifier le solde
            const balance = await tokenContract.balanceOf(this.walletManager.account);
            if (balance < amountWei) {
                let formattedBalance;
                try {
                    formattedBalance = ethers.formatUnits(balance, decimals);
                } catch (error) {
                    formattedBalance = ethers.utils.formatUnits(balance, decimals);
                }
                this.notificationSystem.show(`Solde insuffisant: ${formattedBalance} ${tokenSymbol}`, 'error');
                return;
            }

            // Vérifier l'allowance et approuver si nécessaire
            const allowance = await tokenContract.allowance(this.walletManager.account, this.contractAddress);
            
            if (allowance < amountWei) {
                this.notificationSystem.show(`🔓 Approbation ${tokenSymbol}...`, 'info');
                const approveTx = await tokenContract.approve(this.contractAddress, amountWei);
                await approveTx.wait();
                this.notificationSystem.show(`✅ ${tokenSymbol} approuvé`, 'success');
            }

            // Déposer
            const depositTx = await this.contract.deposit(tokenAddress, amountWei);
            this.notificationSystem.show(`⏳ Dépôt en cours...`, 'info');
            
            await depositTx.wait();
            this.notificationSystem.show(`✅ Dépôt réussi: ${amount} ${tokenSymbol}`, 'success');
            
            // Recharger les données
            await this.loadRealContractData();
            await this.loadUserBalances();

        } catch (error) {
            console.error('Erreur dépôt:', error);
            FlashLoanErrorHandler.handleContractError(error, this.notificationSystem);
        }
    }

    // Charger les données du contrat
    async loadRealContractData() {
        if (!this.contract || !this.walletManager.isConnected) return;

        const ethers = window.ethers;

        try {
            const poolMetrics = await this.contract.getPoolMetrics();
            const userPosition = await this.contract.getUserPosition(this.walletManager.account);
            
            const formatUnits = ethers.formatUnits || ethers.utils.formatUnits;
            
            this.contractData = {
                totalUSDCDeposits: parseFloat(formatUnits(poolMetrics.totalUSDCDeposits, 6)),
                totalUSDTDeposits: parseFloat(formatUnits(poolMetrics.totalUSDTDeposits, 6)),
                totalProfits: parseFloat(formatUnits(poolMetrics.totalProfits, 6)),
                successfulTrades: parseInt(poolMetrics.successfulTrades.toString()),
                failedTrades: parseInt(poolMetrics.failedTrades.toString()),
                totalVolume: parseFloat(formatUnits(poolMetrics.totalVolume, 6)),
                userUsdcShares: parseFloat(formatUnits(userPosition.usdcShares, 6)),
                userUsdtShares: parseFloat(formatUnits(userPosition.usdtShares, 6)),
                userTotalProfits: parseFloat(formatUnits(userPosition.totalProfits, 6))
            };

            this.stats = {
                totalProfit: this.contractData.totalProfits,
                successfulTrades: this.contractData.successfulTrades,
                failedTrades: this.contractData.failedTrades,
                totalVolume: this.contractData.totalVolume
            };

        } catch (error) {
            console.error('Erreur chargement données contrat:', error);
        }
    }

    // Charger les soldes utilisateur
    async loadUserBalances() {
        if (!this.walletManager.isConnected) return;

        const ethers = window.ethers;

        try {
            const { getABI } = await import('../config.js');
            const erc20ABI = getABI('ERC20');

            const tokens = {
                USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
                USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
            };

            const formatUnits = ethers.formatUnits || ethers.utils.formatUnits;

            for (const [symbol, address] of Object.entries(tokens)) {
                try {
                    const contract = new ethers.Contract(address, erc20ABI, this.walletManager.provider);
                    const balance = await contract.balanceOf(this.walletManager.account);
                    const formattedBalance = formatUnits(balance, 6);
                    this.userBalances[symbol] = parseFloat(formattedBalance);
                } catch (tokenError) {
                    this.userBalances[symbol] = 0;
                }
            }

        } catch (error) {
            console.error('Erreur chargement soldes:', error);
        }
    }

    // 🔧 CORRECTION CORS: Interface utilisateur sans images externes
    render() {
        const container = document.getElementById('flashloanStrategyContainer');
        if (!container) return;

        const isConnected = this.walletManager.isConnected;
        const hasContract = !!this.contract;

        container.innerHTML = `
            <div class="flashloan-strategy">
                <!-- Contrôles principaux -->
                <div class="strategy-controls">
                    <div class="control-group">
                        <button id="toggleMonitoring" class="btn ${this.isMonitoring ? 'btn-danger' : 'btn-primary'}">
                            <i class="fas ${this.isMonitoring ? 'fa-stop' : 'fa-play'}"></i>
                            ${this.isMonitoring ? 'Arrêter' : 'Démarrer'} Surveillance
                        </button>
                        <button id="refreshOpportunities" class="btn btn-secondary">
                            <i class="fas fa-refresh"></i>
                            Actualiser
                        </button>
                    </div>
                    <div class="monitoring-status">
                        <div class="status-dot ${this.isMonitoring ? 'active' : ''}"></div>
                        <span>${this.isMonitoring ? 'Surveillance Active' : 'Surveillance Inactive'}</span>
                    </div>
                </div>

                <!-- Stats -->
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-label">Valeur Totale</span>
                        <span class="stat-value" id="totalValue">$${(this.contractData.totalUSDCDeposits + this.contractData.totalUSDTDeposits).toFixed(2)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Trades Réussis</span>
                        <span class="stat-value">${this.stats.successfulTrades}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Taux de Succès</span>
                        <span class="stat-value">${this.getSuccessRate()}%</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label profit">Profits Totaux</span>
                        <span class="stat-value profit">$${this.stats.totalProfit.toFixed(2)}</span>
                    </div>
                </div>

                ${isConnected ? this.renderDepositSection() : this.renderConnectionPrompt()}

                <!-- Opportunités -->
                <div class="opportunities-section">
                    <h3><i class="fas fa-chart-line"></i> Opportunités Détectées</h3>
                    <div id="opportunitiesList" class="opportunities-list">
                        ${this.renderOpportunities()}
                    </div>
                </div>

                <!-- Arbitrages actifs -->
                <div class="active-arbitrages-section">
                    <h3><i class="fas fa-clock"></i> Arbitrages en Cours</h3>
                    <div id="arbitragesList" class="arbitrages-list">
                        ${this.renderActiveArbitrages()}
                    </div>
                </div>

                <!-- Configuration -->
                <div class="config-section">
                    <h3><i class="fas fa-cog"></i> Configuration</h3>
                    <div class="config-grid">
                        <div class="config-item">
                            <label for="minProfitThreshold">Profit Minimum (%)</label>
                            <input type="number" id="minProfitThreshold" 
                                   value="${(this.config.minProfitThreshold * 100).toFixed(2)}" 
                                   min="0.01" max="5" step="0.01">
                        </div>
                        <div class="config-item">
                            <label for="maxGasPrice">Gas Max (Gwei)</label>
                            <input type="number" id="maxGasPrice" 
                                   value="${this.config.maxGasPrice}" 
                                   min="1" max="500" step="1">
                        </div>
                        <div class="config-item">
                            <label for="slippageTolerance">Slippage (%)</label>
                            <input type="number" id="slippageTolerance" 
                                   value="${(this.config.slippageTolerance * 100).toFixed(2)}" 
                                   min="0.1" max="5" step="0.1">
                        </div>
                        <div class="config-item">
                            <label for="monitoringInterval">Intervalle (sec)</label>
                            <input type="number" id="monitoringInterval" 
                                   value="${this.config.monitoringInterval / 1000}" 
                                   min="1" max="60" step="1">
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.attachEventListeners();
    }

    // 🔧 CORRECTION CORS: Section de dépôt sans images externes
    renderDepositSection() {
        if (!this.contract) {
            return `
                <div class="config-section">
                    <h3><i class="fas fa-info-circle"></i> Mode Simulation</h3>
                    <div style="text-align: center; padding: 2rem; background: #fff3cd; border-radius: 10px; color: #856404;">
                        <i class="fas fa-gamepad" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                        <p><strong>Contrat non disponible sur ce réseau</strong></p>
                        <p>Vous pouvez tester la surveillance et l'exécution d'arbitrages en mode simulation.</p>
                        <p>Soldes simulés: USDC: ${this.userBalances.USDC.toFixed(2)} | USDT: ${this.userBalances.USDT.toFixed(2)}</p>
                    </div>
                </div>
            `;
        }

        return `
            <div class="config-section">
                <h3><i class="fas fa-piggy-bank"></i> Déposer dans le Pool</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem;">
                    <div style="padding: 1.5rem; border: 2px solid #e0e0e0; border-radius: 12px; transition: all 0.3s ease;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 1rem;">
                            ${getTokenIcon('USDC')}
                            <span style="font-weight: bold; font-size: 1.1em;">USDC</span>
                        </div>
                        <input type="number" id="usdcDepositAmount" placeholder="Montant USDC" min="100" step="10"
                               style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 15px;">
                        <button id="depositUSDC" class="btn btn-primary" style="width: 100%; margin-bottom: 10px;">
                            <i class="fas fa-plus"></i>
                            Déposer USDC
                        </button>
                        <div style="text-align: center; color: #666; font-size: 0.9em;">
                            Solde: <span id="usdcBalance">${this.userBalances.USDC.toFixed(2)}</span> USDC
                        </div>
                    </div>
                    
                    <div style="padding: 1.5rem; border: 2px solid #e0e0e0; border-radius: 12px; transition: all 0.3s ease;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 1rem;">
                            ${getTokenIcon('USDT')}
                            <span style="font-weight: bold; font-size: 1.1em;">USDT</span>
                        </div>
                        <input type="number" id="usdtDepositAmount" placeholder="Montant USDT" min="100" step="10"
                               style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 15px;">
                        <button id="depositUSDT" class="btn btn-primary" style="width: 100%; margin-bottom: 10px;">
                            <i class="fas fa-plus"></i>
                            Déposer USDT
                        </button>
                        <div style="text-align: center; color: #666; font-size: 0.9em;">
                            Solde: <span id="usdtBalance">${this.userBalances.USDT.toFixed(2)}</span> USDT
                        </div>
                    </div>
                </div>
                
                <!-- Position utilisateur -->
                <div style="margin-top: 2rem; padding: 1.5rem; background: #f8f9fa; border-radius: 10px;">
                    <h4 style="margin: 0 0 1rem 0; color: #333;">📊 Votre Position</h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                        <div style="display: flex; justify-content: space-between; padding: 10px; background: white; border-radius: 8px;">
                            <span>Parts USDC:</span>
                            <span id="userUsdcShares">${this.contractData.userUsdcShares.toFixed(2)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 10px; background: white; border-radius: 8px;">
                            <span>Parts USDT:</span>
                            <span id="userUsdtShares">${this.contractData.userUsdtShares.toFixed(2)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 10px; background: white; border-radius: 8px;">
                            <span>Profits totaux:</span>
                            <span id="userTotalProfits" style="color: #28a745; font-weight: bold;">$${this.contractData.userTotalProfits.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderConnectionPrompt() {
        return `
            <div style="display: flex; justify-content: center; align-items: center; min-height: 200px; background: white; border-radius: 15px; margin-bottom: 30px;">
                <div style="text-align: center; padding: 40px;">
                    <i class="fas fa-wallet" style="font-size: 3rem; margin-bottom: 20px; color: #666;"></i>
                    <h3>Connectez votre Wallet</h3>
                    <p>Vous devez connecter votre wallet pour utiliser cette stratégie</p>
                    <button class="btn btn-primary" onclick="document.getElementById('connectWallet').click()">
                        <i class="fas fa-plug"></i>
                        Connecter Wallet
                    </button>
                </div>
            </div>
        `;
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
                        Profit Estimé: $${formatNumber(opp.estimatedProfit)}
                    </div>
                    <div style="font-size: 0.8em; color: #666; text-align: center;">
                        Il y a ${Math.round((Date.now() - opp.timestamp) / 1000)}s
                    </div>
                </div>
                <button class="execute-btn" data-opportunity-id="${opp.id}"
                        ${!this.walletManager.isConnected ? 'disabled' : ''}>
                    <i class="fas fa-play"></i>
                    ${!this.walletManager.isConnected ? 'Connecter Wallet' : 'Exécuter Flash Loan'}
                </button>
            </div>
        `).join('');
    }

    renderActiveArbitrages() {
        const activeArbitrages = Array.from(this.activeArbitrages.values())
            .filter(arb => arb.status === 'executing')
            .slice(0, 5);

        if (activeArbitrages.length === 0) {
            return `
                <div class="empty-state">
                    <i class="fas fa-clock"></i>
                    <p>Aucun arbitrage en cours</p>
                    <span>Les arbitrages actifs apparaîtront ici</span>
                </div>
            `;
        }

        return activeArbitrages.map(arb => `
            <div class="arbitrage-card">
                <div class="arbitrage-header">
                    <span class="token">${arb.token}</span>
                    <span class="status ${arb.status}">
                        <i class="fas fa-spinner fa-spin"></i>
                        ${arb.status === 'executing' ? 'En cours...' : arb.status}
                    </span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 5px; margin-bottom: 15px; font-size: 0.9em; color: #666;">
                    <span>Profit attendu: $${arb.estimatedProfit.toFixed(2)}</span>
                    <span>Démarré: ${new Date(arb.startTime).toLocaleTimeString()}</span>
                    <span>${arb.buyExchange} → ${arb.sellExchange}</span>
                </div>
                <div class="arbitrage-progress">
                    <div class="progress-bar">
                        <div class="progress-fill"></div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // 🔧 CORRECTION CORS: Méthodes de mise à jour séparées pour éviter les re-renders complets
    updateOpportunitiesDisplay() {
        const container = document.getElementById('opportunitiesList');
        if (container) {
            container.innerHTML = this.renderOpportunities();
        }
    }

    updateActiveArbitragesDisplay() {
        const container = document.getElementById('arbitragesList');
        if (container) {
            container.innerHTML = this.renderActiveArbitrages();
        }
    }

    updateStatsDisplay() {
        // Mettre à jour les valeurs des stats sans re-render complet
        const totalValueEl = document.getElementById('totalValue');
        if (totalValueEl) {
            totalValueEl.textContent = `$${(this.contractData.totalUSDCDeposits + this.contractData.totalUSDTDeposits).toFixed(2)}`;
        }

        // Mettre à jour les balances
        const usdcBalanceEl = document.getElementById('usdcBalance');
        if (usdcBalanceEl) {
            usdcBalanceEl.textContent = this.userBalances.USDC.toFixed(2);
        }

        const usdtBalanceEl = document.getElementById('usdtBalance');
        if (usdtBalanceEl) {
            usdtBalanceEl.textContent = this.userBalances.USDT.toFixed(2);
        }

        // Mettre à jour la position utilisateur
        const userUsdcSharesEl = document.getElementById('userUsdcShares');
        if (userUsdcSharesEl) {
            userUsdcSharesEl.textContent = this.contractData.userUsdcShares.toFixed(2);
        }

        const userUsdtSharesEl = document.getElementById('userUsdtShares');
        if (userUsdtSharesEl) {
            userUsdtSharesEl.textContent = this.contractData.userUsdtShares.toFixed(2);
        }

        const userTotalProfitsEl = document.getElementById('userTotalProfits');
        if (userTotalProfitsEl) {
            userTotalProfitsEl.textContent = `$${this.contractData.userTotalProfits.toFixed(2)}`;
        }
    }

    getSuccessRate() {
        const total = this.stats.successfulTrades + this.stats.failedTrades;
        return total === 0 ? 0 : Math.round((this.stats.successfulTrades / total) * 100);
    }

    // Event listeners adaptés à l'architecture
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
                this.notificationSystem.show('🔄 Opportunités actualisées', 'info');
            });
        }

        // Configuration inputs
        const configInputs = {
            minProfitThreshold: (value) => {
                this.config.minProfitThreshold = parseFloat(value) / 100;
                this.notificationSystem.show('✅ Profit minimum mis à jour', 'success');
            },
            maxGasPrice: (value) => {
                this.config.maxGasPrice = parseInt(value);
                this.notificationSystem.show('✅ Gas maximum mis à jour', 'success');
            },
            slippageTolerance: (value) => {
                this.config.slippageTolerance = parseFloat(value) / 100;
                this.notificationSystem.show('✅ Slippage mis à jour', 'success');
            },
            monitoringInterval: (value) => {
                this.config.monitoringInterval = parseInt(value) * 1000;
                if (this.isMonitoring) {
                    this.stopMonitoring();
                    setTimeout(() => this.startMonitoring(), 100);
                }
                this.notificationSystem.show('✅ Intervalle mis à jour', 'success');
            }
        };

        Object.entries(configInputs).forEach(([inputId, handler]) => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('change', (e) => handler(e.target.value));
            }
        });

        // Event listeners pour exécution d'arbitrage
        document.addEventListener('click', (e) => {
            if (e.target.closest('.execute-btn')) {
                const button = e.target.closest('.execute-btn');
                if (button.disabled) return;
                
                const opportunityId = button.getAttribute('data-opportunity-id');
                const opportunity = this.opportunities.find(opp => opp.id === opportunityId);
                
                if (opportunity) {
                    this.executeArbitrage(opportunity);
                }
            }
        });

        // Event listeners pour les dépôts
        const depositUSDCBtn = document.getElementById('depositUSDC');
        if (depositUSDCBtn) {
            depositUSDCBtn.addEventListener('click', async () => {
                const amountInput = document.getElementById('usdcDepositAmount');
                const amount = amountInput?.value;
                
                if (!amount || parseFloat(amount) < 100) {
                    this.notificationSystem.show('⚠️ Montant minimum: 100 USDC', 'warning');
                    return;
                }
                
                if (parseFloat(amount) > this.userBalances.USDC) {
                    this.notificationSystem.show('❌ Solde insuffisant', 'error');
                    return;
                }
                
                await this.depositToPool('USDC', amount);
                if (amountInput) amountInput.value = '';
            });
        }

        const depositUSDTBtn = document.getElementById('depositUSDT');
        if (depositUSDTBtn) {
            depositUSDTBtn.addEventListener('click', async () => {
                const amountInput = document.getElementById('usdtDepositAmount');
                const amount = amountInput?.value;
                
                if (!amount || parseFloat(amount) < 100) {
                    this.notificationSystem.show('⚠️ Montant minimum: 100 USDT', 'warning');
                    return;
                }
                
                if (parseFloat(amount) > this.userBalances.USDT) {
                    this.notificationSystem.show('❌ Solde insuffisant', 'error');
                    return;
                }
                
                await this.depositToPool('USDT', amount);
                if (amountInput) amountInput.value = '';
            });
        }
    }

    // Méthodes héritées de BaseStrategy
    async activate() {
        this.isActive = true;
        if (this.walletManager.isConnected) {
            await this.loadRealContractData();
            await this.loadUserBalances();
        }
        this.render();
        console.log('✅ Flash Loan Strategy activée');
    }

    async deactivate() {
        this.isActive = false;
        this.stopMonitoring();
        this.render();
        console.log('⏹️ Flash Loan Strategy désactivée');
    }

    getBalance() {
        return this.stats.totalProfit || 0;
    }

    getAPR() {
        if (this.stats.totalVolume > 0 && this.stats.totalProfit > 0) {
            const profitRate = this.stats.totalProfit / this.stats.totalVolume;
            return (profitRate * 365 * 100).toFixed(2);
        }
        return "0.00";
    }

    // Méthodes de debug et monitoring
    getDebugInfo() {
        return {
            isActive: this.isActive,
            isMonitoring: this.isMonitoring,
            isConnected: this.walletManager.isConnected,
            hasContract: !!this.contract,
            contractAddress: this.contractAddress,
            opportunities: this.opportunities.length,
            activeArbitrages: this.activeArbitrages.size,
            stats: this.stats,
            config: this.config,
            userBalances: this.userBalances,
            contractData: this.contractData
        };
    }

    async testContractConnection() {
        if (!this.contract) {
            console.log('❌ Contrat non initialisé');
            return false;
        }

        try {
            const owner = await this.contract.owner();
            console.log('✅ Test contrat réussi - Owner:', owner);
            this.notificationSystem.show('✅ Contrat accessible', 'success');
            return true;
        } catch (error) {
            console.log('❌ Test contrat échoué:', error.message);
            this.notificationSystem.show('❌ Contrat inaccessible', 'error');
            return false;
        }
    }

    // Nettoyage des ressources
    destroy() {
        this.stopMonitoring();
        
        // Nettoyer les event listeners
        this.eventBus.off('wallet:connected');
        this.eventBus.off('wallet:disconnected');
        this.eventBus.off('network:changed');
        
        // Reset des données
        this.opportunities = [];
        this.activeArbitrages.clear();
        this.contract = null;
        
        console.log('🗑️ Flash Loan Strategy détruite');
    }

    // Méthodes utilitaires pour l'intégration avec le dashboard
    getPositionSummary() {
        return {
            strategy: 'Flash Loan Arbitrage',
            totalValue: this.contractData.totalUSDCDeposits + this.contractData.totalUSDTDeposits,
            profit: this.stats.totalProfit,
            apr: this.getAPR(),
            isActive: this.isActive,
            status: this.isMonitoring ? 'Monitoring' : 'Inactive',
            positions: [
                {
                    token: 'USDC',
                    amount: this.contractData.userUsdcShares,
                    value: this.contractData.userUsdcShares
                },
                {
                    token: 'USDT', 
                    amount: this.contractData.userUsdtShares,
                    value: this.contractData.userUsdtShares
                }
            ]
        };
    }

    getRecentActivity() {
        const activities = [];
        
        // Ajouter les arbitrages récents
        this.activeArbitrages.forEach((arb, id) => {
            activities.push({
                type: arb.status === 'completed' ? 'success' : arb.status === 'failed' ? 'error' : 'pending',
                message: `Flash Loan ${arb.token}: ${arb.buyExchange} → ${arb.sellExchange}`,
                amount: arb.actualProfit || arb.estimatedProfit,
                timestamp: arb.startTime,
                txHash: arb.txHash || null
            });
        });
        
        return activities.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
    }

    // Méthodes pour l'auto-trading (futures)
    enableAutoTrading(config = {}) {
        this.config.autoExecute = true;
        this.config.autoExecuteThreshold = config.minProfitPercent || 0.5;
        this.config.maxConcurrentTrades = config.maxConcurrent || 3;
        
        this.notificationSystem.show('🤖 Auto-trading activé', 'success');
        console.log('🤖 Auto-trading activé avec config:', config);
    }

    disableAutoTrading() {
        this.config.autoExecute = false;
        this.notificationSystem.show('⏹️ Auto-trading désactivé', 'info');
        console.log('⏹️ Auto-trading désactivé');
    }
}

// Export et initialisation pour votre architecture
export { FlashLoanStrategy };

// Fonction d'initialisation spécifique à votre setup
export function initializeFlashLoanStrategy(walletManager) {
    try {
        const strategy = new FlashLoanStrategy(walletManager);
        
        // Exposer globalement pour debug
        if (typeof window !== 'undefined') {
            window.flashLoanStrategy = strategy;
            window.debugFlashLoan = () => {
                console.log('🔍 Flash Loan Debug Info:');
                console.table(strategy.getDebugInfo());
                return strategy.getDebugInfo();
            };
            window.testFlashLoanContract = () => strategy.testContractConnection();
        }
        
        console.log('🚀 Flash Loan Strategy initialisée - Version CORS-Safe');
        return strategy;
    } catch (error) {
        console.error('❌ Erreur initialisation Flash Loan Strategy:', error);
        throw error;
    }
}

// Export par défaut pour votre architecture modulaire
export default FlashLoanStrategy;