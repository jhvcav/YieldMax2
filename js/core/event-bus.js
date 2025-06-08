// ===== Event Bus - Communication Inter-Modules =====

class EventBus {
    constructor() {
        this.events = new Map();
        this.onceEvents = new Map();
        this.debugMode = false;
        
        console.log('🚌 EventBus initialisé');
    }

    /**
     * S'abonner à un événement
     * @param {string} eventName - Nom de l'événement
     * @param {function} callback - Fonction de callback
     * @param {object} context - Contexte d'exécution (optionnel)
     */
    on(eventName, callback, context = null) {
        if (!this.events.has(eventName)) {
            this.events.set(eventName, []);
        }
        
        const listener = {
            callback,
            context,
            id: Date.now() + Math.random()
        };
        
        this.events.get(eventName).push(listener);
        
        if (this.debugMode) {
            console.log(`📢 Abonnement à l'événement: ${eventName}`);
        }
        
        // Retourner une fonction pour se désabonner
        return () => this.off(eventName, listener.id);
    }

    /**
     * S'abonner à un événement (une seule fois)
     * @param {string} eventName - Nom de l'événement
     * @param {function} callback - Fonction de callback
     * @param {object} context - Contexte d'exécution (optionnel)
     */
    once(eventName, callback, context = null) {
        if (!this.onceEvents.has(eventName)) {
            this.onceEvents.set(eventName, []);
        }
        
        const listener = {
            callback,
            context,
            id: Date.now() + Math.random()
        };
        
        this.onceEvents.get(eventName).push(listener);
        
        if (this.debugMode) {
            console.log(`📢 Abonnement unique à l'événement: ${eventName}`);
        }
        
        return () => this.offOnce(eventName, listener.id);
    }

    /**
     * Émettre un événement
     * @param {string} eventName - Nom de l'événement
     * @param {any} data - Données à transmettre
     */
    emit(eventName, data = null) {
        if (this.debugMode) {
            console.log(`🔔 Émission événement: ${eventName}`, data);
        }
        
        // Traiter les abonnements permanents
        if (this.events.has(eventName)) {
            const listeners = this.events.get(eventName);
            
            for (const listener of listeners) {
                try {
                    if (listener.context) {
                        listener.callback.call(listener.context, data);
                    } else {
                        listener.callback(data);
                    }
                } catch (error) {
                    console.error(`❌ Erreur dans le listener pour ${eventName}:`, error);
                }
            }
        }
        
        // Traiter les abonnements uniques
        if (this.onceEvents.has(eventName)) {
            const listeners = this.onceEvents.get(eventName);
            
            for (const listener of listeners) {
                try {
                    if (listener.context) {
                        listener.callback.call(listener.context, data);
                    } else {
                        listener.callback(data);
                    }
                } catch (error) {
                    console.error(`❌ Erreur dans le listener unique pour ${eventName}:`, error);
                }
            }
            
            // Supprimer après exécution
            this.onceEvents.delete(eventName);
        }
    }

    /**
     * Se désabonner d'un événement
     * @param {string} eventName - Nom de l'événement
     * @param {string} listenerId - ID du listener (optionnel)
     */
    off(eventName, listenerId = null) {
        if (!this.events.has(eventName)) return;
        
        if (listenerId) {
            // Supprimer un listener spécifique
            const listeners = this.events.get(eventName);
            const filteredListeners = listeners.filter(l => l.id !== listenerId);
            this.events.set(eventName, filteredListeners);
        } else {
            // Supprimer tous les listeners pour cet événement
            this.events.delete(eventName);
        }
        
        if (this.debugMode) {
            console.log(`🔇 Désabonnement de l'événement: ${eventName}`);
        }
    }

    /**
     * Se désabonner d'un événement unique
     * @param {string} eventName - Nom de l'événement
     * @param {string} listenerId - ID du listener (optionnel)
     */
    offOnce(eventName, listenerId = null) {
        if (!this.onceEvents.has(eventName)) return;
        
        if (listenerId) {
            const listeners = this.onceEvents.get(eventName);
            const filteredListeners = listeners.filter(l => l.id !== listenerId);
            this.onceEvents.set(eventName, filteredListeners);
        } else {
            this.onceEvents.delete(eventName);
        }
    }

    /**
     * Supprimer tous les événements
     */
    clear() {
        this.events.clear();
        this.onceEvents.clear();
        console.log('🧹 EventBus nettoyé');
    }

    /**
     * Obtenir la liste des événements actifs
     */
    getActiveEvents() {
        const regularEvents = Array.from(this.events.keys());
        const onceEvents = Array.from(this.onceEvents.keys());
        
        return {
            regular: regularEvents,
            once: onceEvents,
            total: regularEvents.length + onceEvents.length
        };
    }

    /**
     * Activer/désactiver le mode debug
     * @param {boolean} enabled - Activer le debug
     */
    setDebugMode(enabled = true) {
        this.debugMode = enabled;
        console.log(`🐛 Mode debug EventBus: ${enabled ? 'activé' : 'désactivé'}`);
    }

    /**
     * Émettre un événement avec délai
     * @param {string} eventName - Nom de l'événement
     * @param {any} data - Données à transmettre
     * @param {number} delay - Délai en millisecondes
     */
    emitDelayed(eventName, data = null, delay = 0) {
        setTimeout(() => {
            this.emit(eventName, data);
        }, delay);
    }

    /**
     * Émettre un événement de manière asynchrone
     * @param {string} eventName - Nom de l'événement
     * @param {any} data - Données à transmettre
     */
    async emitAsync(eventName, data = null) {
        return new Promise((resolve) => {
            setTimeout(() => {
                this.emit(eventName, data);
                resolve();
            }, 0);
        });
    }
}

// ===== Événements Prédéfinis =====
export const EVENTS = {
    // Wallet
    WALLET_CONNECTED: 'wallet:connected',
    WALLET_DISCONNECTED: 'wallet:disconnected',
    WALLET_ACCOUNT_CHANGED: 'wallet:account-changed',
    WALLET_NETWORK_CHANGED: 'wallet:network-changed',
    
    // Balances
    BALANCES_LOADING: 'balances:loading',
    BALANCES_LOADED: 'balances:loaded',
    BALANCES_ERROR: 'balances:error',
    BALANCE_UPDATED: 'balance:updated',
    
    // Stratégies
    STRATEGY_ACTIVATED: 'strategy:activated',
    STRATEGY_DEACTIVATED: 'strategy:deactivated',
    STRATEGY_DEPLOYED: 'strategy:deployed',
    STRATEGY_CLOSED: 'strategy:closed',
    STRATEGY_ERROR: 'strategy:error',
    
    // Positions
    POSITION_CREATED: 'position:created',
    POSITION_UPDATED: 'position:updated',
    POSITION_CLOSED: 'position:closed',
    POSITIONS_LOADED: 'positions:loaded',
    
    // Transactions
    TRANSACTION_STARTED: 'transaction:started',
    TRANSACTION_CONFIRMED: 'transaction:confirmed',
    TRANSACTION_FAILED: 'transaction:failed',
    TRANSACTION_PENDING: 'transaction:pending',
    
    // Interface
    UI_LOADING: 'ui:loading',
    UI_LOADED: 'ui:loaded',
    UI_ERROR: 'ui:error',
    UI_NOTIFICATION: 'ui:notification',
    
    // Données
    DATA_LOADED: 'data:loaded',
    DATA_ERROR: 'data:error',
    DATA_REFRESHED: 'data:refreshed',
    
    // Flash Loans
    FLASHLOAN_OPPORTUNITY: 'flashloan:opportunity',
    FLASHLOAN_EXECUTED: 'flashloan:executed',
    FLASHLOAN_PROFIT: 'flashloan:profit'
};

// ===== Helpers pour Types d'Événements Courants =====
export class EventHelpers {
    static createWalletEvent(type, data) {
        return {
            type,
            timestamp: Date.now(),
            data
        };
    }
    
    static createTransactionEvent(hash, status, data = {}) {
        return {
            hash,
            status,
            timestamp: Date.now(),
            ...data
        };
    }
    
    static createStrategyEvent(strategyName, action, data = {}) {
        return {
            strategy: strategyName,
            action,
            timestamp: Date.now(),
            ...data
        };
    }
    
    static createPositionEvent(positionId, action, data = {}) {
        return {
            positionId,
            action,
            timestamp: Date.now(),
            ...data
        };
    }
}

// Instance globale
let eventBusInstance = null;

export function getEventBus() {
    if (!eventBusInstance) {
        eventBusInstance = new EventBus();
    }
    return eventBusInstance;
}

// Export de la classe et de l'instance
export { EventBus };
export default getEventBus();