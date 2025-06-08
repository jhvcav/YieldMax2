// ===== YieldMax2 - Application Principale =====

import { validateConfig } from './config.js';
import { getEventBus, EVENTS } from './core/event-bus.js';
import { getWalletManager } from './core/wallet-manager-new.js';
import { getNotificationSystem } from './core/notification-system.js';
import AaveStrategy from './strategies/aave-strategy.js';

class YieldMax2App {
    constructor() {
        // Version et info
        this.version = '2.0.0';
        this.name = 'YieldMax2';
        
        // Services
        this.eventBus = getEventBus();
        this.walletManager = getWalletManager();
        this.notificationSystem = getNotificationSystem();
        
        // Stratégies
        this.strategies = new Map();
        this.activeStrategy = 'overview';
        
        // État de l'application
        this.isInitialized = false;
        this.isLoading = false;
        
        // Éléments UI
        this.elements = {};
        
        console.log(`🚀 ${this.name} v${this.version} - Initialisation...`);
    }

    /**
     * Initialiser l'application
     */
    async init() {
        try {
            this.isLoading = true;
            
            // Valider la configuration
            if (!validateConfig()) {
                throw new Error('Configuration invalide');
            }
            
            // Initialiser les éléments UI
            this.initializeElements();
            
            // Charger les stratégies
            await this.loadStrategies();
            
            // Configurer les événements
            this.setupEventListeners();
            
            // Initialiser l'interface
            this.renderDashboard();
            
            // Vérifier la connexion wallet existante
            await this.walletManager.checkWalletConnection();
            
            this.isInitialized = true;
            this.isLoading = false;
            
            console.log(`✅ ${this.name} initialisé avec succès`);
            this.notificationSystem.success(`🎉 ${this.name} prêt à l'emploi!`);
            
        } catch (error) {
            this.isLoading = false;
            console.error(`❌ Erreur initialisation ${this.name}:`, error);
            this.notificationSystem.error(`Erreur initialisation: ${error.message}`);
        }
    }

    /**
     * Initialiser les références aux éléments DOM
     */
    initializeElements() {
        this.elements = {
            // Header
            connectWallet: document.getElementById('connectWallet'),
            networkSelect: document.getElementById('networkSelect'),
            
            // Stats Dashboard
            totalValue: document.getElementById('totalValue'),
            dailyYield: document.getElementById('dailyYield'),
            averageAPR: document.getElementById('averageAPR'),
            activePositions: document.getElementById('activePositions'),
            
            // Navigation
            strategyTabs: document.querySelectorAll('[data-strategy]'),
            contentPanels: document.querySelectorAll('.content-panel'),
            
            // Contenu
            overviewContent: document.getElementById('overview-content'),
            aaveContent: document.getElementById('aave-content'),
            flashloanContent: document.getElementById('flashloan-content'),
            
            // Containers
            positionsOverview: document.getElementById('positionsOverview'),
            recentActivity: document.getElementById('recentActivity'),
            aaveStrategyContainer: document.getElementById('aaveStrategyContainer'),
            flashloanStrategyContainer: document.getElementById('flashloanStrategyContainer')
        };
        
        console.log('🎨 Éléments DOM initialisés');
    }

    /**
     * Charger les stratégies
     */
    async loadStrategies() {
        try {
            console.log('📦 Chargement des stratégies...');
            
            // Stratégie Aave (fonctionnelle)
            const aaveStrategy = new AaveStrategy(this);
            aaveStrategy.setContainer(this.elements.aaveStrategyContainer);
            this.strategies.set('aave', aaveStrategy);
            
            // Stratégie Flash Loan (à implémenter)
            // const flashloanStrategy = new FlashLoanStrategy(this);
            // flashloanStrategy.setContainer(this.elements.flashloanStrategyContainer);
            // this.strategies.set('flashloan', flashloanStrategy);
            
            console.log(`✅ ${this.strategies.size} stratégies chargées`);
            
        } catch (error) {
            console.error('❌ Erreur chargement stratégies:', error);
            throw error;
        }
    }

    /**
     * Configurer les événements
     */
    setupEventListeners() {
        // Bouton connexion wallet
        if (this.elements.connectWallet) {
            this.elements.connectWallet.addEventListener('click', () => {
                this.walletManager.connectWallet();
            });
        }
        
        // Sélecteur de réseau
        if (this.elements.networkSelect) {
            this.elements.networkSelect.addEventListener('change', (e) => {
                this.walletManager.switchNetwork(e.target.value);
            });
        }
        
        // Navigation entre stratégies
        this.elements.strategyTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const strategy = e.currentTarget.dataset.strategy;
                this.switchStrategy(strategy);
            });
        });
        
        // Actions rapides
        document.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                this.handleQuickAction(action);
            });
        });
        
        // Événements de l'EventBus
        this.eventBus.on(EVENTS.WALLET_CONNECTED, (data) => {
            this.onWalletConnected(data);
        });
        
        this.eventBus.on(EVENTS.WALLET_DISCONNECTED, () => {
            this.onWalletDisconnected();
        });
        
        this.eventBus.on(EVENTS.WALLET_NETWORK_CHANGED, (data) => {
            this.onNetworkChanged(data);
        });
        
        this.eventBus.on(EVENTS.DATA_REFRESHED, (data) => {
            this.onDataRefreshed(data);
        });
        
        this.eventBus.on(EVENTS.STRATEGY_ACTIVATED, (data) => {
            this.onStrategyActivated(data);
        });
        
        console.log('🔧 Événements configurés');
    }

    /**
     * Changer de stratégie active
     */
    async switchStrategy(strategyName) {
        if (this.activeStrategy === strategyName) return;
        
        console.log(`🔄 Changement vers: ${strategyName}`);
        
        // Désactiver la stratégie précédente
        if (this.activeStrategy !== 'overview' && this.strategies.has(this.activeStrategy)) {
            this.strategies.get(this.activeStrategy).deactivate();
        }
        
        // Mettre à jour la navigation
        this.updateNavigation(strategyName);
        
        // Afficher le contenu approprié
        this.showContent(strategyName);
        
        // Activer la nouvelle stratégie
        if (strategyName !== 'overview' && this.strategies.has(strategyName)) {
            await this.strategies.get(strategyName).activate();
        }
        
        this.activeStrategy = strategyName;
        
        // Mettre à jour le badge de la stratégie
        this.updateStrategyBadge(strategyName);
    }

    /**
     * Mettre à jour la navigation
     */
    updateNavigation(activeStrategy) {
        this.elements.strategyTabs.forEach(tab => {
            const strategy = tab.dataset.strategy;
            tab.classList.toggle('active', strategy === activeStrategy);
        });
    }

   // ===== YieldMax2 - Application Principale (Suite) =====

    /**
     * Afficher le contenu de la stratégie
     */
    showContent(strategyName) {
        this.elements.contentPanels.forEach(panel => {
            panel.classList.remove('active');
        });
        
        const targetPanel = document.getElementById(`${strategyName}-content`);
        if (targetPanel) {
            targetPanel.classList.add('active');
        }
    }

    /**
     * Mettre à jour le badge de la stratégie
     */
    updateStrategyBadge(strategyName) {
        const badge = document.getElementById(`${strategyName}Badge`);
        if (badge && this.strategies.has(strategyName)) {
            const strategy = this.strategies.get(strategyName);
            if (strategy.positions.length > 0) {
                badge.textContent = strategy.positions.length;
                badge.className = 'tab-badge';
            } else {
                badge.textContent = '✅';
            }
        }
    }

    /**
     * Rendre le dashboard principal
     */
    renderDashboard() {
        this.updateDashboardStats();
        this.renderOverviewContent();
        console.log('📊 Dashboard rendu');
    }

    /**
     * Mettre à jour les statistiques du dashboard
     */
    updateDashboardStats() {
        const stats = this.calculateGlobalStats();
        
        if (this.elements.totalValue) {
            this.elements.totalValue.textContent = this.formatUSD(stats.totalValue);
        }
        
        if (this.elements.dailyYield) {
            this.elements.dailyYield.textContent = this.formatUSD(stats.dailyYield);
        }
        
        if (this.elements.averageAPR) {
            this.elements.averageAPR.textContent = this.formatPercentage(stats.averageAPR);
        }
        
        if (this.elements.activePositions) {
            this.elements.activePositions.textContent = stats.activePositions;
        }
    }

    /**
     * Calculer les statistiques globales
     */
    calculateGlobalStats() {
        let totalValue = 0;
        let totalYield = 0;
        let totalAPR = 0;
        let activePositions = 0;
        let strategiesWithPositions = 0;

        this.strategies.forEach(strategy => {
            if (strategy.metrics && strategy.positions) {
                totalValue += parseFloat(strategy.metrics.totalValue || 0);
                totalYield += parseFloat(strategy.metrics.dailyYield || 0);
                activePositions += strategy.positions.length;
                
                if (strategy.positions.length > 0) {
                    totalAPR += parseFloat(strategy.metrics.averageAPR || 0);
                    strategiesWithPositions++;
                }
            }
        });

        const averageAPR = strategiesWithPositions > 0 ? totalAPR / strategiesWithPositions : 0;

        return {
            totalValue,
            dailyYield: totalYield,
            averageAPR,
            activePositions
        };
    }

    /**
     * Rendre le contenu de la vue d'ensemble
     */
    renderOverviewContent() {
        this.renderPositionsOverview();
        this.renderRecentActivity();
    }

    /**
     * Rendre l'aperçu des positions
     */
    renderPositionsOverview() {
        if (!this.elements.positionsOverview) return;

        const allPositions = [];
        this.strategies.forEach((strategy, name) => {
            if (strategy.positions && strategy.positions.length > 0) {
                strategy.positions.forEach(position => {
                    allPositions.push({
                        ...position,
                        strategyName: strategy.name,
                        strategySlug: name
                    });
                });
            }
        });

        if (allPositions.length === 0) {
            this.elements.positionsOverview.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-seedling"></i>
                    <p>Aucune position active</p>
                    <span>Sélectionnez une stratégie pour commencer</span>
                </div>
            `;
            return;
        }

        this.elements.positionsOverview.innerHTML = `
            <div class="positions-grid">
                ${allPositions.map(position => `
                    <div class="position-overview-card" data-strategy="${position.strategySlug}">
                        <div class="position-header">
                            <div class="strategy-badge">${position.strategyName}</div>
                            <div class="position-status ${position.status}">${position.status}</div>
                        </div>
                        
                        <div class="position-main">
                            <div class="position-asset">
                                <span class="asset-name">${position.asset || position.pool}</span>
                                <span class="asset-amount">${position.amount}</span>
                            </div>
                            
                            <div class="position-performance">
                                <span class="apr-label">APR</span>
                                <span class="apr-value">${position.apr || '0.00%'}</span>
                            </div>
                        </div>
                        
                        <div class="position-footer">
                            <div class="pnl ${parseFloat(position.earnings || position.pnl || '0') >= 0 ? 'positive' : 'negative'}">
                                ${parseFloat(position.earnings || position.pnl || '0') >= 0 ? '+' : ''}${position.earnings || position.pnl || '$0.00'}
                            </div>
                            <button class="view-btn" onclick="app.switchStrategy('${position.strategySlug}')">
                                <i class="fas fa-eye"></i>
                                Voir
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    /**
     * Rendre l'activité récente
     */
    renderRecentActivity() {
        if (!this.elements.recentActivity) return;

        const recentActivity = [];
        
        // Collecter l'historique de toutes les stratégies
        this.strategies.forEach(strategy => {
            if (strategy.history && strategy.history.length > 0) {
                strategy.history.forEach(entry => {
                    recentActivity.push({
                        ...entry,
                        strategyName: strategy.name
                    });
                });
            }
        });

        // Trier par timestamp (plus récent en premier)
        recentActivity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Prendre les 10 plus récents
        const recent = recentActivity.slice(0, 10);

        if (recent.length === 0) {
            this.elements.recentActivity.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-clock"></i>
                    <p>Aucune activité récente</p>
                </div>
            `;
            return;
        }

        this.elements.recentActivity.innerHTML = `
            <div class="activity-timeline">
                ${recent.map(activity => `
                    <div class="activity-item">
                        <div class="activity-icon ${activity.type}">
                            <i class="fas fa-${this.getActivityIcon(activity.type)}"></i>
                        </div>
                        
                        <div class="activity-content">
                            <div class="activity-title">
                                ${this.getActivityTitle(activity)}
                            </div>
                            <div class="activity-details">
                                <span class="strategy-name">${activity.strategyName}</span>
                                <span class="activity-time">${this.formatTimeAgo(activity.timestamp)}</span>
                            </div>
                        </div>
                        
                        ${activity.hash ? `
                            <div class="activity-actions">
                                <a href="${this.walletManager.getExplorerUrl(activity.hash)}" 
                                   target="_blank" class="tx-link">
                                    <i class="fas fa-external-link-alt"></i>
                                </a>
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    /**
     * Obtenir l'icône pour un type d'activité
     */
    getActivityIcon(type) {
        const icons = {
            'deposit': 'arrow-down',
            'withdrawal': 'arrow-up',
            'transaction': 'exchange-alt',
            'flashloan': 'bolt',
            'position': 'layer-group'
        };
        return icons[type] || 'circle';
    }

    /**
     * Obtenir le titre pour une activité
     */
    getActivityTitle(activity) {
        switch(activity.type) {
            case 'deposit':
                return `Dépôt de ${activity.amount} ${activity.asset}`;
            case 'withdrawal':
                return `Retrait de ${Math.abs(activity.amount)} ${activity.asset}`;
            case 'transaction':
                return `Transaction ${activity.action}`;
            case 'flashloan':
                return `Flash Loan exécuté`;
            default:
                return activity.action || 'Activité inconnue';
        }
    }

    /**
     * Formater le temps écoulé
     */
    formatTimeAgo(timestamp) {
        const now = new Date();
        const time = new Date(timestamp);
        const diffMs = now - time;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'À l\'instant';
        if (diffMins < 60) return `${diffMins}min`;
        if (diffHours < 24) return `${diffHours}h`;
        if (diffDays < 7) return `${diffDays}j`;
        
        return time.toLocaleDateString('fr-FR');
    }

    /**
     * Gérer les actions rapides
     */
    handleQuickAction(action) {
        switch(action) {
            case 'aave':
                this.switchStrategy('aave');
                break;
            case 'flashloan':
                this.switchStrategy('flashloan');
                break;
            case 'refresh':
                this.refreshAllData();
                break;
            default:
                console.log(`Action rapide inconnue: ${action}`);
        }
    }

    /**
     * Rafraîchir toutes les données
     */
    async refreshAllData() {
        try {
            this.notificationSystem.info('🔄 Actualisation des données...');
            
            const refreshPromises = [];
            
            this.strategies.forEach(strategy => {
                if (strategy.isActive) {
                    refreshPromises.push(strategy.refresh());
                }
            });
            
            await Promise.allSettled(refreshPromises);
            
            this.updateDashboardStats();
            this.renderOverviewContent();
            
            this.notificationSystem.success('✅ Données actualisées');
            
        } catch (error) {
            console.error('❌ Erreur rafraîchissement:', error);
            this.notificationSystem.error('Erreur lors de l\'actualisation');
        }
    }

    /**
     * Gestionnaires d'événements
     */
    
    onWalletConnected(data) {
        console.log('🔐 Wallet connecté dans l\'app:', data.data.account);
        
        // Mettre à jour l'UI du wallet
        if (this.elements.connectWallet) {
            this.elements.connectWallet.innerHTML = `
                <i class="fas fa-check-circle"></i>
                <span>${this.walletManager.formatAddress(data.data.account)}</span>
            `;
            this.elements.connectWallet.classList.add('connected');
        }
        
        // Mettre à jour le sélecteur de réseau
        if (this.elements.networkSelect) {
            this.elements.networkSelect.value = data.data.network;
        }
        
        // Rafraîchir les données
        this.refreshAllData();
    }

    onWalletDisconnected() {
        console.log('🔓 Wallet déconnecté dans l\'app');
        
        // Réinitialiser l'UI du wallet
        if (this.elements.connectWallet) {
            this.elements.connectWallet.innerHTML = `
                <i class="fas fa-wallet"></i>
                <span>Connecter Wallet</span>
            `;
            this.elements.connectWallet.classList.remove('connected');
        }
        
        // Réinitialiser les stats
        this.updateDashboardStats();
        this.renderOverviewContent();
    }

    onNetworkChanged(data) {
        console.log('🌐 Réseau changé dans l\'app:', data);
        
        // Mettre à jour le sélecteur
        if (this.elements.networkSelect) {
            this.elements.networkSelect.value = data.newNetwork;
        }
        
        // Rafraîchir les données
        this.refreshAllData();
    }

    onDataRefreshed(data) {
        console.log('📊 Données rafraîchies:', data.strategy);
        
        // Mettre à jour les stats globales
        this.updateDashboardStats();
        
        // Mettre à jour la vue d'ensemble si active
        if (this.activeStrategy === 'overview') {
            this.renderOverviewContent();
        }
        
        // Mettre à jour le badge de la stratégie
        this.updateStrategyBadge(data.strategy);
    }

    onStrategyActivated(data) {
        console.log('🎯 Stratégie activée:', data.strategy);
        this.updateStrategyBadge(data.strategy);
    }

    /**
     * Utilitaires de formatage
     */
    
    formatUSD(amount) {
        const num = parseFloat(amount) || 0;
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(num);
    }

    formatPercentage(value, decimals = 2) {
        const num = parseFloat(value) || 0;
        return `${num.toFixed(decimals)}%`;
    }

    /**
     * Obtenir les informations de l'application
     */
    getAppInfo() {
        return {
            name: this.name,
            version: this.version,
            isInitialized: this.isInitialized,
            isLoading: this.isLoading,
            activeStrategy: this.activeStrategy,
            strategiesCount: this.strategies.size,
            walletConnected: this.walletManager.isConnected,
            currentNetwork: this.walletManager.currentNetwork
        };
    }

    /**
     * Obtenir les statistiques détaillées
     */
    getDetailedStats() {
        const globalStats = this.calculateGlobalStats();
        const strategyStats = {};
        
        this.strategies.forEach((strategy, name) => {
            strategyStats[name] = strategy.getStats();
        });
        
        return {
            global: globalStats,
            strategies: strategyStats,
            wallet: this.walletManager.getWalletInfo(),
            app: this.getAppInfo()
        };
    }

    /**
     * Mode debug
     */
    enableDebugMode() {
        this.eventBus.setDebugMode(true);
        window.yieldmax2Debug = {
            app: this,
            eventBus: this.eventBus,
            walletManager: this.walletManager,
            notificationSystem: this.notificationSystem,
            strategies: this.strategies,
            getStats: () => this.getDetailedStats()
        };
        console.log('🐛 Mode debug activé - utilisez window.yieldmax2Debug');
    }

    /**
     * Nettoyer l'application
     */
    cleanup() {
        // Nettoyer les stratégies
        this.strategies.forEach(strategy => {
            strategy.cleanup();
        });
        
        // Nettoyer les services
        this.eventBus.clear();
        this.notificationSystem.clear();
        
        console.log('🧹 Application nettoyée');
    }
}

// ===== Initialisation de l'Application =====

// Instance globale
let app = null;

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('🎬 Initialisation YieldMax2...');
        
        app = new YieldMax2App();
        await app.init();
        
        // Exposer l'app globalement pour les callbacks UI
        window.app = app;
        window.yieldmax2 = app;
        
        // Activer le mode debug en développement
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            app.enableDebugMode();
        }
        
        console.log('🎉 YieldMax2 prêt!');
        
    } catch (error) {
        console.error('💥 Erreur fatale initialisation YieldMax2:', error);
        
        // Afficher une erreur à l'utilisateur
        document.body.innerHTML = `
            <div style="
                display: flex; 
                flex-direction: column; 
                align-items: center; 
                justify-content: center; 
                height: 100vh; 
                background: #0f0f23; 
                color: white; 
                font-family: Arial, sans-serif;
                text-align: center;
                padding: 20px;
            ">
                <h1 style="color: #ef4444; margin-bottom: 20px;">
                    ❌ Erreur d'initialisation
                </h1>
                <p style="margin-bottom: 10px;">
                    Une erreur est survenue lors du chargement de l'application.
                </p>
                <p style="color: #a1a1aa; font-size: 14px;">
                    ${error.message}
                </p>
                <button onclick="window.location.reload()" style="
                    margin-top: 20px;
                    padding: 10px 20px;
                    background: #6366f1;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                ">
                    🔄 Recharger la page
                </button>
            </div>
        `;
    }
});

// Gestion des erreurs globales
window.addEventListener('error', (event) => {
    console.error('💥 Erreur globale:', event.error);
    if (app && app.notificationSystem) {
        app.notificationSystem.error('Une erreur inattendue est survenue');
    }
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('💥 Promesse rejetée:', event.reason);
    if (app && app.notificationSystem) {
        app.notificationSystem.error('Erreur de connexion');
    }
});

// Export pour utilisation en module
export { YieldMax2App };
export default YieldMax2App;