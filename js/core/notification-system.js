// ===== Notification System - Système de Notifications =====

import { SETTINGS } from '../config.js';
import { getEventBus, EVENTS } from './event-bus.js';

class NotificationSystem {
    constructor() {
        this.container = null;
        this.notifications = new Map();
        this.queue = [];
        this.maxNotifications = 5;
        this.eventBus = getEventBus();
        
        console.log('🔔 NotificationSystem initialisé');
        this.init();
    }

    init() {
        this.createContainer();
        this.setupEventListeners();
    }

    /**
     * Créer le conteneur de notifications
     */
    createContainer() {
        this.container = document.getElementById('notificationContainer');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'notificationContainer';
            this.container.className = 'notification-container';
            document.body.appendChild(this.container);
        }
    }

    /**
     * Configurer les événements
     */
    setupEventListeners() {
        // Écouter les événements de notification
        this.eventBus.on(EVENTS.UI_NOTIFICATION, (data) => {
            this.show(data.message, data.type, data.options);
        });

        // Écouter les événements de transaction pour notifications automatiques
        this.eventBus.on(EVENTS.TRANSACTION_STARTED, (data) => {
            this.show('🔄 Transaction initiée...', 'info', {
                id: `tx-${data.hash}`,
                persistent: true
            });
        });

        this.eventBus.on(EVENTS.TRANSACTION_CONFIRMED, (data) => {
            this.update(`tx-${data.hash}`, '✅ Transaction confirmée!', 'success');
            setTimeout(() => this.hide(`tx-${data.hash}`), 3000);
        });

        this.eventBus.on(EVENTS.TRANSACTION_FAILED, (data) => {
            this.update(`tx-${data.hash}`, '❌ Transaction échouée', 'error');
        });

        // Écouter les événements wallet
        this.eventBus.on(EVENTS.WALLET_CONNECTED, () => {
            this.show('🔐 Wallet connecté avec succès', 'success');
        });

        this.eventBus.on(EVENTS.WALLET_DISCONNECTED, () => {
            this.show('🔓 Wallet déconnecté', 'info');
        });

        this.eventBus.on(EVENTS.WALLET_NETWORK_CHANGED, (data) => {
            this.show(`🌐 Réseau changé vers ${data.newNetwork}`, 'info');
        });
    }

    /**
     * Afficher une notification
     * @param {string} message - Message à afficher
     * @param {string} type - Type: success, error, warning, info
     * @param {object} options - Options supplémentaires
     */
    show(message, type = 'info', options = {}) {
        const config = {
            id: options.id || this.generateId(),
            message,
            type,
            duration: options.duration || SETTINGS.NOTIFICATION_DURATION,
            persistent: options.persistent || false,
            actions: options.actions || [],
            ...options
        };

        // Si on a atteint la limite, supprimer la plus ancienne
        if (this.notifications.size >= this.maxNotifications) {
            const oldestId = this.notifications.keys().next().value;
            this.hide(oldestId);
        }

        const notification = this.createNotificationElement(config);
        this.container.appendChild(notification);
        this.notifications.set(config.id, { element: notification, config });

        // Animation d'entrée
        requestAnimationFrame(() => {
            notification.classList.add('show');
        });

        // Auto-suppression si pas persistante
        if (!config.persistent && config.duration > 0) {
            setTimeout(() => {
                this.hide(config.id);
            }, config.duration);
        }

        console.log(`🔔 Notification affichée: ${type} - ${message}`);
        return config.id;
    }

    /**
     * Créer l'élément de notification
     */
    createNotificationElement(config) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${config.type}`;
        notification.dataset.id = config.id;

        // Icône selon le type
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-times-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };

        // Contenu principal
        const content = document.createElement('div');
        content.className = 'notification-content';
        content.innerHTML = `
            <i class="${icons[config.type]}"></i>
            <span class="notification-message">${config.message}</span>
        `;

        notification.appendChild(content);

        // Actions personnalisées
        if (config.actions && config.actions.length > 0) {
            const actionsContainer = document.createElement('div');
            actionsContainer.className = 'notification-actions';
            
            config.actions.forEach(action => {
                const button = document.createElement('button');
                button.className = 'notification-action-btn';
                button.textContent = action.label;
                button.onclick = () => {
                    action.handler();
                    if (action.closeAfter !== false) {
                        this.hide(config.id);
                    }
                };
                actionsContainer.appendChild(button);
            });
            
            notification.appendChild(actionsContainer);
        }

        // Bouton de fermeture
        if (!config.persistent) {
            const closeButton = document.createElement('button');
            closeButton.className = 'notification-close';
            closeButton.innerHTML = '<i class="fas fa-times"></i>';
            closeButton.onclick = () => this.hide(config.id);
            notification.appendChild(closeButton);
        }

        // Barre de progression pour les notifications temporaires
        if (!config.persistent && config.duration > 0 && config.showProgress !== false) {
            const progressBar = document.createElement('div');
            progressBar.className = 'notification-progress';
            progressBar.innerHTML = '<div class="notification-progress-bar"></div>';
            notification.appendChild(progressBar);
            
            // Animation de la barre de progression
            const bar = progressBar.querySelector('.notification-progress-bar');
            bar.style.animationDuration = `${config.duration}ms`;
        }

        return notification;
    }

    /**
     * Mettre à jour une notification existante
     */
    update(id, message, type = null) {
        const notification = this.notifications.get(id);
        if (!notification) return false;

        const messageElement = notification.element.querySelector('.notification-message');
        if (messageElement) {
            messageElement.textContent = message;
        }

        if (type && type !== notification.config.type) {
            notification.element.className = `notification notification-${type}`;
            notification.config.type = type;
            
            // Mettre à jour l'icône
            const icons = {
                success: 'fas fa-check-circle',
                error: 'fas fa-times-circle',
                warning: 'fas fa-exclamation-triangle',
                info: 'fas fa-info-circle'
            };
            
            const iconElement = notification.element.querySelector('i');
            if (iconElement) {
                iconElement.className = icons[type];
            }
        }

        console.log(`🔄 Notification mise à jour: ${id}`);
        return true;
    }

    /**
     * Masquer une notification
     */
    hide(id) {
        const notification = this.notifications.get(id);
        if (!notification) return false;

        notification.element.classList.add('hiding');
        
        setTimeout(() => {
            if (notification.element.parentNode) {
                notification.element.parentNode.removeChild(notification.element);
            }
            this.notifications.delete(id);
        }, 300);

        console.log(`🔇 Notification masquée: ${id}`);
        return true;
    }

    /**
     * Masquer toutes les notifications
     */
    hideAll() {
        const ids = Array.from(this.notifications.keys());
        ids.forEach(id => this.hide(id));
        console.log('🧹 Toutes les notifications masquées');
    }

    /**
     * Notification de succès
     */
    success(message, options = {}) {
        return this.show(message, 'success', options);
    }

    /**
     * Notification d'erreur
     */
    error(message, options = {}) {
        return this.show(message, 'error', { 
            duration: 0, // Persistante par défaut pour les erreurs
            ...options 
        });
    }

    /**
     * Notification d'avertissement
     */
    warning(message, options = {}) {
        return this.show(message, 'warning', options);
    }

    /**
     * Notification d'information
     */
    info(message, options = {}) {
        return this.show(message, 'info', options);
    }

    /**
     * Notification de chargement
     */
    loading(message, options = {}) {
        return this.show(message, 'info', {
            persistent: true,
            showProgress: false,
            ...options
        });
    }

    /**
     * Notification de confirmation avec actions
     */
    confirm(message, confirmCallback, cancelCallback = null, options = {}) {
        const actions = [
            {
                label: 'Confirmer',
                handler: confirmCallback,
                closeAfter: true
            }
        ];

        if (cancelCallback) {
            actions.push({
                label: 'Annuler',
                handler: cancelCallback,
                closeAfter: true
            });
        }

        return this.show(message, 'warning', {
            persistent: true,
            actions,
            ...options
        });
    }

    /**
     * Notification de transaction avec lien vers l'explorateur
     */
    transaction(hash, network = 'polygon', message = 'Transaction envoyée') {
        const explorerUrls = {
            polygon: 'https://polygonscan.com/tx/',
            ethereum: 'https://etherscan.io/tx/',
            arbitrum: 'https://arbiscan.io/tx/'
        };

        const explorerUrl = explorerUrls[network] + hash;
        
        const actions = [{
            label: 'Voir sur Explorer',
            handler: () => window.open(explorerUrl, '_blank'),
            closeAfter: false
        }];

        return this.show(`${message}: ${hash.slice(0, 10)}...`, 'info', {
            actions,
            duration: 10000
        });
    }

    /**
     * Générer un ID unique
     */
    generateId() {
        return `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Obtenir le nombre de notifications actives
     */
    getActiveCount() {
        return this.notifications.size;
    }

    /**
     * Obtenir toutes les notifications actives
     */
    getActive() {
        return Array.from(this.notifications.values());
    }

    /**
     * Vérifier si une notification existe
     */
    exists(id) {
        return this.notifications.has(id);
    }

    /**
     * Définir la limite max de notifications
     */
    setMaxNotifications(max) {
        this.maxNotifications = max;
    }

    /**
     * Nettoyer toutes les notifications
     */
    clear() {
        this.hideAll();
        this.queue = [];
        console.log('🧹 NotificationSystem nettoyé');
    }
}

// Instance globale
let notificationSystemInstance = null;

export function getNotificationSystem() {
    if (!notificationSystemInstance) {
        notificationSystemInstance = new NotificationSystem();
    }
    return notificationSystemInstance;
}

export { NotificationSystem };
export default getNotificationSystem();