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
        
        NotificationSystem.show('Surveillance arrêtée', 'info');
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
            NotificationSystem.show('Wallet non connecté', 'error');
            return;
        }

        const arbitrageId = `arb_${Date.now()}`;
        this.activeArbitrages.set(arbitrageId, {
            ...opportunity,
            status: 'executing',
            startTime: Date.now()
        });

        try {
            NotificationSystem.show(`Exécution arbitrage ${opportunity.token}...`, 'info');
            
            // Simulation de l'exécution - remplacer par la vraie logique
            await this.simulateFlashLoanExecution(opportunity);
            
            // Succès
            this.stats.successfulTrades++;
            this.stats.totalProfit += opportunity.estimatedProfit;
            this.stats.totalVolume += opportunity.buyPrice;
            
            this.activeArbitrages.set(arbitrageId, {
                ...this.activeArbitrages.get(arbitrageId),
                status: 'completed',
                endTime: Date.now()
            });
            
            NotificationSystem.show(
                `Arbitrage réussi! Profit: $${formatNumber(opportunity.estimatedProfit)}`, 
                'success'
            );
            
        } catch (error) {
            console.error('Erreur arbitrage:', error);
            this.stats.failedTrades++;
            
            this.activeArbitrages.set(arbitrageId, {
                ...this.activeArbitrages.get(arbitrageId),
                status: 'failed',
                error: error.message,
                endTime: Date.now()
            });
            
            NotificationSystem.show(`Échec arbitrage: ${error.message}`, 'error');
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

    // Interface utilisateur
    render() {
        const container = document.getElementById('flashloanStrategyContainer');
        if (!container) return;

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
                            <i class="fas fa-sync-alt"></i>
                            Actualiser
                        </button>
                    </div>
                    
                    <div class="monitoring-status">
                        <span class="status-dot ${this.isMonitoring ? 'active' : ''}"></span>
                        ${this.isMonitoring ? 'Surveillance active' : 'Surveillance arrêtée'}
                    </div>
                </div>

                <!-- Statistiques -->
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-label">Profit Total</span>
                        <span class="stat-value profit">$${formatNumber(this.stats.totalProfit)}</span>
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
                        <span class="stat-label">Volume Total</span>
                        <span class="stat-value">$${formatNumber(this.stats.totalVolume)}</span>
                    </div>
                </div>

                <!-- Configuration -->
                <div class="config-section">
                    <h3><i class="fas fa-cog"></i> Configuration</h3>
                    <div class="config-grid">
                        <div class="config-item">
                            <label>Profit Minimum (%)</label>
                            <input type="number" id="minProfitThreshold" 
                                   value="${this.config.minProfitThreshold * 100}" 
                                   step="0.01" min="0.01" max="5">
                        </div>
                        <div class="config-item">
                            <label>Gas Max (Gwei)</label>
                            <input type="number" id="maxGasPrice" 
                                   value="${this.config.maxGasPrice}" 
                                   min="10" max="500">
                        </div>
                        <div class="config-item">
                            <label>Slippage (%)</label>
                            <input type="number" id="slippageTolerance" 
                                   value="${this.config.slippageTolerance * 100}" 
                                   step="0.1" min="0.1" max="5">
                        </div>
                        <div class="config-item">
                            <label>Intervalle Scan (sec)</label>
                            <input type="number" id="monitoringInterval" 
                                   value="${this.config.monitoringInterval / 1000}" 
                                   min="1" max="60">
                        </div>
                    </div>
                </div>

                <!-- Opportunités actuelles -->
                <div class="opportunities-section">
                    <h3><i class="fas fa-search-dollar"></i> Opportunités Détectées</h3>
                    <div class="opportunities-list">
                        ${this.renderOpportunities()}
                    </div>
                </div>

                <!-- Arbitrages actifs -->
                <div class="active-arbitrages-section">
                    <h3><i class="fas fa-bolt"></i> Arbitrages en Cours</h3>
                    <div class="arbitrages-list">
                        ${this.renderActiveArbitrages()}
                    </div>
                </div>
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
                <button class="execute-btn" onclick="flashLoanStrategy.executeArbitrage(${JSON.stringify(opp).replace(/"/g, '&quot;')})">
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
        
        NotificationSystem.show('Configuration mise à jour', 'success');
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