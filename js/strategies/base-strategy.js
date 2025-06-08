// ===== Base Strategy - Classe de Base pour les Stratégies =====

import { getEventBus, EVENTS, EventHelpers } from '../core/event-bus.js';
import { getWalletManager } from '../core/wallet-manager-new.js';
import { getNotificationSystem } from '../core/notification-system.js';
import { SETTINGS } from '../config.js';

class BaseStrategy {
    constructor(app, config = {}) {
        this.app = app;
        this.config = config;
        
        // Propriétés de base
        this.name = config.name || 'Stratégie Inconnue';
        this.slug = config.slug || 'unknown';
        this.isActive = false;
        this.isLoading = false;
        this.hasError = false;
        
        // Données de la stratégie
        this.positions = [];
        this.metrics = {};
        this.balances = {};
        this.history = [];
        
        // Services
        this.eventBus = getEventBus();
        this.walletManager = getWalletManager();
        this.notificationSystem = getNotificationSystem();
        
        // Container UI
        this.container = null;
        this.isUIRendered = false;
        
        console.log(`🎯 BaseStrategy initialisée: ${this.name}`);
        this.init();
    }

    /**
     * Initialisation de la stratégie
     */
    async init() {
        try {
            await this.loadConfiguration();
            this.setupEventListeners();
            console.log(`✅ Stratégie ${this.name} initialisée`);
        } catch (error) {
            console.error(`❌ Erreur initialisation ${this.name}:`, error);
            this.hasError = true;
        }
    }

    /**
     * Charger la configuration spécifique
     * À surcharger dans les stratégies filles
     */
    async loadConfiguration() {
        // Configuration par défaut
        this.config = {
            ...this.config,
            refreshInterval: SETTINGS.BALANCE_REFRESH_INTERVAL,
            gasLimit: SETTINGS.DEFAULT_GAS_LIMIT
        };
    }

    /**
     * Configurer les événements
     */
    setupEventListeners() {
        // Réagir aux changements de wallet
        this.eventBus.on(EVENTS.WALLET_CONNECTED, (data) => {
            this.onWalletConnected(data);
        });

        this.eventBus.on(EVENTS.WALLET_DISCONNECTED, () => {
            this.onWalletDisconnected();
        });

        this.eventBus.on(EVENTS.WALLET_NETWORK_CHANGED, (data) => {
            this.onNetworkChanged(data);
        });

        // Réagir aux événements de transaction
        this.eventBus.on(EVENTS.TRANSACTION_CONFIRMED, (data) => {
            this.onTransactionConfirmed(data);
        });
    }

    /**
     * Méthodes à implémenter dans les stratégies filles
     */
    
    /**
     * Déployer la stratégie
     * @param {object} params - Paramètres de déploiement
     */
    async deploy(params) {
        throw new Error(`Méthode deploy() non implémentée pour ${this.name}`);
    }

    /**
     * Récupérer les positions
     */
    async getPositions() {
        throw new Error(`Méthode getPositions() non implémentée pour ${this.name}`);
    }

    /**
     * Calculer les métriques
     */
    async calculateMetrics() {
        throw new Error(`Méthode calculateMetrics() non implémentée pour ${this.name}`);
    }

    /**
     * Fermer une position
     * @param {string} positionId - ID de la position
     */
    async closePosition(positionId) {
        throw new Error(`Méthode closePosition() non implémentée pour ${this.name}`);
    }

    /**
     * Rendre l'interface utilisateur
     */
    renderUI() {
        throw new Error(`Méthode renderUI() non implémentée pour ${this.name}`);
    }

    /**
     * Méthodes communes implémentées
     */

    /**
     * Activer la stratégie
     */
    async activate() {
        if (this.isActive) return;
        
        try {
            this.isLoading = true;
            this.updateUI();
            
            // Vérifier que le wallet est connecté
            if (!this.walletManager.isConnected) {
                throw new Error('Wallet non connecté');
            }
            
            // Charger les données initiales
            await this.loadInitialData();
            
            // Rendre l'interface si pas déjà fait
            if (!this.isUIRendered) {
                this.renderUI();
                this.isUIRendered = true;
            }
            
            this.isActive = true;
            this.isLoading = false;
            
            this.eventBus.emit(EVENTS.STRATEGY_ACTIVATED, 
                EventHelpers.createStrategyEvent(this.slug, 'activated')
            );
            
            console.log(`🎯 Stratégie ${this.name} activée`);
            
        } catch (error) {
            this.isLoading = false;
            this.hasError = true;
            console.error(`❌ Erreur activation ${this.name}:`, error);
            this.notificationSystem.error(`Erreur activation ${this.name}: ${error.message}`);
        }
        
        this.updateUI();
    }

    /**
     * Désactiver la stratégie
     */
    deactivate() {
        this.isActive = false;
        
        this.eventBus.emit(EVENTS.STRATEGY_DEACTIVATED, 
            EventHelpers.createStrategyEvent(this.slug, 'deactivated')
        );
        
        console.log(`🎯 Stratégie ${this.name} désactivée`);
    }

    /**
     * Charger les données initiales
     */
    async loadInitialData() {
        try {
            // Charger en parallèle
            await Promise.all([
                this.loadBalances(),
                this.loadPositions(),
                this.loadHistory()
            ]);
            
            // Calculer les métriques
            await this.calculateMetrics();
            
            console.log(`📊 Données initiales chargées pour ${this.name}`);
            
        } catch (error) {
            console.error(`❌ Erreur chargement données ${this.name}:`, error);
            throw error;
        }
    }

    /**
     * Charger les soldes
     */
    async loadBalances() {
        // Implémentation par défaut - à surcharger si nécessaire
        this.balances = {};
    }

    /**
     * Charger les positions
     */
    async loadPositions() {
        try {
            this.positions = await this.getPositions();
            
            this.eventBus.emit(EVENTS.POSITIONS_LOADED, {
                strategy: this.slug,
                positions: this.positions
            });
            
        } catch (error) {
            console.error(`❌ Erreur chargement positions ${this.name}:`, error);
            this.positions = [];
        }
    }

    /**
     * Charger l'historique
     */
    async loadHistory() {
        try {
            const storageKey = `${SETTINGS.STORAGE_PREFIX}${this.slug}_history`;
            const saved = localStorage.getItem(storageKey);
            this.history = saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error(`❌ Erreur chargement historique ${this.name}:`, error);
            this.history = [];
        }
    }

    /**
     * Sauvegarder l'historique
     */
    saveHistory() {
        try {
            const storageKey = `${SETTINGS.STORAGE_PREFIX}${this.slug}_history`;
            localStorage.setItem(storageKey, JSON.stringify(this.history));
        } catch (error) {
            console.error(`❌ Erreur sauvegarde historique ${this.name}:`, error);
        }
    }

    /**
     * Ajouter une entrée à l'historique
     */
    addToHistory(entry) {
        const historyEntry = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            strategy: this.slug,
            ...entry
        };
        
        this.history.unshift(historyEntry);
        
        // Limiter la taille de l'historique
        if (this.history.length > 100) {
            this.history = this.history.slice(0, 100);
        }
        
        this.saveHistory();
    }

    /**
     * Mettre à jour l'interface utilisateur
     */
    updateUI() {
        if (!this.container) return;
        
        // Émettre un événement pour que le dashboard se mette à jour
        this.eventBus.emit(EVENTS.DATA_REFRESHED, {
            strategy: this.slug,
            positions: this.positions,
            metrics: this.metrics,
            isActive: this.isActive,
            isLoading: this.isLoading,
            hasError: this.hasError
        });
    }

    /**
     * Définir le container UI
     */
    setContainer(container) {
        this.container = container;
    }

    /**
     * Valider les prérequis pour une transaction
     */
    validateTransactionPrerequisites() {
        const walletValidation = this.walletManager.validateTransactionPrerequisites();
        
        if (!walletValidation.isValid) {
            throw new Error(`Prérequis wallet non satisfaits: ${walletValidation.errors.join(', ')}`);
        }
        
        if (!this.isActive) {
            throw new Error('Stratégie non active');
        }
        
        return true;
    }

    /**
     * Exécuter une transaction avec gestion d'erreurs
     */
    async executeTransaction(transactionFn, description = 'Transaction') {
        try {
            this.validateTransactionPrerequisites();
            
            this.isLoading = true;
            this.updateUI();
            
            const loadingId = this.notificationSystem.loading(`${description} en cours...`);
            
            const result = await transactionFn();
            
            this.notificationSystem.hide(loadingId);
            this.notificationSystem.success(`${description} réussie!`);
            
            // Recharger les données
            await this.refresh();
            
            return result;
            
        } catch (error) {
            console.error(`❌ Erreur ${description}:`, error);
            
            let errorMessage = error.message;
            if (error.code === 4001) {
                errorMessage = 'Transaction annulée par l\'utilisateur';
            } else if (error.message?.includes('insufficient funds')) {
                errorMessage = 'Fonds insuffisants';
            } else if (error.message?.includes('gas')) {
                errorMessage = 'Erreur de gas - augmentez la limite de gas';
            }
            
            this.notificationSystem.error(`${description} échouée: ${errorMessage}`);
            throw error;
            
        } finally {
            this.isLoading = false;
            this.updateUI();
        }
    }

    /**
     * Rafraîchir les données de la stratégie
     */
    async refresh() {
        if (!this.isActive) return;
        
        try {
            await this.loadInitialData();
            this.updateUI();
            console.log(`🔄 Données rafraîchies pour ${this.name}`);
        } catch (error) {
            console.error(`❌ Erreur rafraîchissement ${this.name}:`, error);
        }
    }

    /**
     * Gestionnaires d'événements
     */
    
    async onWalletConnected(data) {
        console.log(`🔐 Wallet connecté pour ${this.name}`);
        if (this.isActive) {
            await this.refresh();
        }
    }

    onWalletDisconnected() {
        console.log(`🔓 Wallet déconnecté pour ${this.name}`);
        this.positions = [];
        this.balances = {};
        this.updateUI();
    }

    async onNetworkChanged(data) {
        console.log(`🌐 Réseau changé pour ${this.name}:`, data);
        if (this.isActive) {
            await this.refresh();
        }
    }

    onTransactionConfirmed(data) {
        console.log(`✅ Transaction confirmée pour ${this.name}:`, data.hash);
        // Ajouter à l'historique
        this.addToHistory({
            type: 'transaction',
            action: 'confirmed',
            hash: data.hash,
            gasUsed: data.gasUsed
        });
    }

    /**
     * Utilitaires
     */

    /**
     * Formater un montant
     */
    formatAmount(amount, decimals = 6, symbol = '') {
        const num = parseFloat(amount);
        if (isNaN(num)) return '0.000000';
        
        const formatted = num.toFixed(decimals);
        return symbol ? `${formatted} ${symbol}` : formatted;
    }

    /**
     * Formater une valeur en USD
     */
    formatUSD(amount) {
        const num = parseFloat(amount);
        if (isNaN(num)) return '$0.00';
        
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(num);
    }

    /**
     * Formater un pourcentage
     */
    formatPercentage(value, decimals = 2) {
        const num = parseFloat(value);
        if (isNaN(num)) return '0.00%';
        
        return `${num.toFixed(decimals)}%`;
    }

    /**
     * Calculer la différence en pourcentage
     */
    calculatePercentageChange(oldValue, newValue) {
        const old = parseFloat(oldValue);
        const current = parseFloat(newValue);
        
        if (old === 0) return 0;
        return ((current - old) / old) * 100;
    }

    /**
     * Vérifier si un montant est valide
     */
    isValidAmount(amount, minAmount = 0) {
        const num = parseFloat(amount);
        return !isNaN(num) && num > minAmount && isFinite(num);
    }

    /**
     * Obtenir le timestamp actuel
     */
    getCurrentTimestamp() {
        return Math.floor(Date.now() / 1000);
    }

    /**
     * Attendre un délai
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Retry une fonction avec backoff exponentiel
     */
    async retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                if (i === maxRetries - 1) throw error;
                
                const delay = baseDelay * Math.pow(2, i);
                console.log(`⏳ Retry ${i + 1}/${maxRetries} dans ${delay}ms...`);
                await this.delay(delay);
            }
        }
    }

    /**
     * Créer un élément HTML
     */
    createElement(tag, className = '', innerHTML = '') {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (innerHTML) element.innerHTML = innerHTML;
        return element;
    }

    /**
     * Créer un bouton d'action
     */
    createActionButton(text, onclick, className = 'action-btn') {
        const button = this.createElement('button', className, text);
        button.onclick = onclick;
        return button;
    }

    /**
     * Créer un élément de métrique
     */
    createMetricElement(label, value, className = '') {
        const container = this.createElement('div', `metric ${className}`);
        container.innerHTML = `
            <span class="metric-label">${label}</span>
            <span class="metric-value">${value}</span>
        `;
        return container;
    }

    /**
     * Obtenir les statistiques de la stratégie
     */
    getStats() {
        return {
            name: this.name,
            slug: this.slug,
            isActive: this.isActive,
            isLoading: this.isLoading,
            hasError: this.hasError,
            positionsCount: this.positions.length,
            totalValue: this.metrics.totalValue || 0,
            totalPnL: this.metrics.totalPnL || 0,
            averageAPR: this.metrics.averageAPR || 0,
            lastUpdate: this.metrics.lastUpdate || null
        };
    }

    /**
     * Nettoyer les ressources
     */
    cleanup() {
        this.deactivate();
        this.positions = [];
        this.balances = {};
        this.history = [];
        this.metrics = {};
        
        console.log(`🧹 Stratégie ${this.name} nettoyée`);
    }

    /**
     * Obtenir la configuration debug
     */
    getDebugInfo() {
        return {
            name: this.name,
            slug: this.slug,
            config: this.config,
            isActive: this.isActive,
            isLoading: this.isLoading,
            hasError: this.hasError,
            positionsCount: this.positions.length,
            balancesKeys: Object.keys(this.balances),
            historyCount: this.history.length,
            metricsKeys: Object.keys(this.metrics),
            containerExists: !!this.container,
            isUIRendered: this.isUIRendered
        };
    }
}

export { BaseStrategy };
export default BaseStrategy;