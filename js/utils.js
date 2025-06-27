// ===== YieldMax2 - Utilitaires =====

/**
 * Utilitaires pour les calculs financiers
 */
export class FinanceUtils {
    /**
     * Calculer l'APY composé
     * @param {number} principal - Montant principal
     * @param {number} rate - Taux annuel (%)
     * @param {number} periods - Nombre de périodes de composition par an
     * @param {number} years - Nombre d'années
     */
    static calculateCompoundInterest(principal, rate, periods = 365, years = 1) {
        const r = rate / 100;
        const amount = principal * Math.pow((1 + r / periods), periods * years);
        return amount - principal;
    }

    /**
     * Calculer l'APY à partir d'un APR
     * @param {number} apr - Taux annuel simple (%)
     * @param {number} periods - Périodes de composition par an
     */
    static aprToApy(apr, periods = 365) {
        const r = apr / 100;
        return (Math.pow(1 + r / periods, periods) - 1) * 100;
    }

    /**
     * Calculer le rendement quotidien
     * @param {number} principal - Montant principal
     * @param {number} apy - APY (%)
     */
    static calculateDailyYield(principal, apy) {
        return (principal * apy / 100) / 365;
    }

    /**
     * Calculer le temps pour doubler l'investissement
     * @param {number} rate - Taux de rendement annuel (%)
     */
    static ruleOf72(rate) {
        return 72 / rate;
    }

    /**
     * Calculer la perte impermanente
     * @param {number} priceRatio - Ratio de changement de prix (price_new / price_old)
     */
    static calculateImpermanentLoss(priceRatio) {
        const k = priceRatio;
        const il = (2 * Math.sqrt(k)) / (1 + k) - 1;
        return il * 100; // En pourcentage
    }

    /**
     * Calculer les frais de gas en USD
     * @param {number} gasUsed - Gas utilisé
     * @param {number} gasPrice - Prix du gas en gwei
     * @param {number} ethPrice - Prix ETH/MATIC en USD
     */
    static calculateGasCostUSD(gasUsed, gasPrice, ethPrice) {
        const gasCostEth = (gasUsed * gasPrice) / 1e9; // Convert gwei to ETH
        return gasCostEth * ethPrice;
    }
}

/**
 * Utilitaires pour les tokens et montants
 */
export class TokenUtils {
    /**
     * Formater un montant de token
     * @param {string|number} amount - Montant
     * @param {number} decimals - Nombre de décimales
     * @param {string} symbol - Symbole du token
     * @param {number} displayDecimals - Décimales à afficher
     */
    static formatTokenAmount(amount, decimals = 18, symbol = '', displayDecimals = 6) {
        const num = parseFloat(amount);
        if (isNaN(num)) return `0.${'0'.repeat(displayDecimals)} ${symbol}`.trim();
        
        const formatted = num.toFixed(displayDecimals);
        return symbol ? `${formatted} ${symbol}` : formatted;
    }

    /**
     * Convertir un montant en Wei
     * @param {string|number} amount - Montant
     * @param {number} decimals - Décimales du token
     */
    static toWei(amount, decimals = 18) {
        if (typeof ethers !== 'undefined') {
            return ethers.parseUnits(amount.toString(), decimals);
        }
        
        // Fallback sans ethers
        const factor = Math.pow(10, decimals);
        return Math.floor(parseFloat(amount) * factor).toString();
    }

    /**
     * Convertir depuis Wei
     * @param {string|number} wei - Montant en wei
     * @param {number} decimals - Décimales du token
     */
    static fromWei(wei, decimals = 18) {
        if (typeof ethers !== 'undefined') {
            return ethers.formatUnits(wei.toString(), decimals);
        }
        
        // Fallback sans ethers
        const factor = Math.pow(10, decimals);
        return (parseFloat(wei) / factor).toString();
    }

    /**
     * Valider une adresse de token
     * @param {string} address - Adresse à valider
     */
    static isValidAddress(address) {
        if (typeof ethers !== 'undefined') {
            return ethers.isAddress(address);
        }
        
        // Validation basique
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }

    /**
     * Raccourcir une adresse
     * @param {string} address - Adresse complète
     * @param {number} start - Caractères au début
     * @param {number} end - Caractères à la fin
     */
    static shortenAddress(address, start = 6, end = 4) {
        if (!address) return '';
        if (address.length <= start + end) return address;
        
        return `${address.slice(0, start)}...${address.slice(-end)}`;
    }

    /**
     * Obtenir les informations d'un token populaire
     * @param {string} symbol - Symbole du token
     */
    static getTokenInfo(symbol) {
        const tokens = {
            ETH: { decimals: 18, name: 'Ethereum' },
            MATIC: { decimals: 18, name: 'Polygon' },
            USDC: { decimals: 6, name: 'USD Coin' },
            USDT: { decimals: 6, name: 'Tether USD' },
            WETH: { decimals: 18, name: 'Wrapped Ethereum' },
            WMATIC: { decimals: 18, name: 'Wrapped Matic' },
            WBTC: { decimals: 8, name: 'Wrapped Bitcoin' }
        };
        
        return tokens[symbol.toUpperCase()] || { decimals: 18, name: symbol };
    }
}

/**
 * Utilitaires pour les dates et temps
 */
export class TimeUtils {
    /**
     * Formater une date relative
     * @param {Date|string|number} date - Date à formater
     */
    static formatTimeAgo(date) {
        const now = new Date();
        const time = new Date(date);
        const diffMs = now - time;
        
        const seconds = Math.floor(diffMs / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const weeks = Math.floor(days / 7);
        const months = Math.floor(days / 30);
        const years = Math.floor(days / 365);

        if (seconds < 60) return 'À l\'instant';
        if (minutes < 60) return `${minutes}min`;
        if (hours < 24) return `${hours}h`;
        if (days < 7) return `${days}j`;
        if (weeks < 4) return `${weeks}sem`;
        if (months < 12) return `${months}mois`;
        return `${years}an${years > 1 ? 's' : ''}`;
    }

    /**
     * Formater une durée en secondes
     * @param {number} seconds - Durée en secondes
     */
    static formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}h ${minutes}min`;
        } else if (minutes > 0) {
            return `${minutes}min ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }

    /**
     * Obtenir le timestamp Unix actuel
     */
    static getCurrentTimestamp() {
        return Math.floor(Date.now() / 1000);
    }

    /**
     * Convertir un timestamp Unix en date
     * @param {number} timestamp - Timestamp Unix
     */
    static timestampToDate(timestamp) {
        return new Date(timestamp * 1000);
    }

    /**
     * Formater une date pour l'affichage
     * @param {Date|string|number} date - Date à formater
     * @param {string} locale - Locale (fr-FR par défaut)
     */
    static formatDate(date, locale = 'fr-FR') {
        const d = new Date(date);
        return d.toLocaleDateString(locale, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

/**
 * Utilitaires pour le localStorage et la persistance
 */
export class StorageUtils {
    static prefix = 'yieldmax2_';

    /**
     * Sauvegarder des données
     * @param {string} key - Clé de stockage
     * @param {any} data - Données à sauvegarder
     */
    static save(key, data) {
        try {
            const serialized = JSON.stringify(data);
            localStorage.setItem(this.prefix + key, serialized);
            return true;
        } catch (error) {
            console.error('Erreur sauvegarde localStorage:', error);
            return false;
        }
    }

    /**
     * Charger des données
     * @param {string} key - Clé de stockage
     * @param {any} defaultValue - Valeur par défaut
     */
    static load(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(this.prefix + key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error('Erreur lecture localStorage:', error);
            return defaultValue;
        }
    }

    /**
     * Supprimer des données
     * @param {string} key - Clé à supprimer
     */
    static remove(key) {
        try {
            localStorage.removeItem(this.prefix + key);
            return true;
        } catch (error) {
            console.error('Erreur suppression localStorage:', error);
            return false;
        }
    }

    /**
     * Vider tout le stockage de l'application
     */
    static clear() {
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith(this.prefix)) {
                    localStorage.removeItem(key);
                }
            });
            return true;
        } catch (error) {
            console.error('Erreur nettoyage localStorage:', error);
            return false;
        }
    }

    /**
     * Obtenir la taille utilisée par l'application
     */
    static getStorageSize() {
        let totalSize = 0;
        const keys = Object.keys(localStorage);
        
        keys.forEach(key => {
            if (key.startsWith(this.prefix)) {
                totalSize += localStorage.getItem(key).length;
            }
        });
        
        return totalSize; // En caractères
    }

    /**
     * Migrer des données depuis une ancienne version
     * @param {string} oldPrefix - Ancien préfixe
     */
    static migrateFrom(oldPrefix) {
        try {
            const keys = Object.keys(localStorage);
            const migrated = [];
            
            keys.forEach(key => {
                if (key.startsWith(oldPrefix)) {
                    const newKey = key.replace(oldPrefix, this.prefix);
                    const value = localStorage.getItem(key);
                    localStorage.setItem(newKey, value);
                    localStorage.removeItem(key);
                    migrated.push(key);
                }
            });
            
            console.log(`📦 Migration localStorage: ${migrated.length} entrées migrées`);
            return migrated;
        } catch (error) {
            console.error('Erreur migration localStorage:', error);
            return [];
        }
    }
}

/**
 * Utilitaires pour les calculs de DeFi
 */
export class DeFiUtils {
    /**
     * Calculer le prix d'impact pour un swap
     * @param {number} amountIn - Montant d'entrée
     * @param {number} reserveIn - Réserve du token d'entrée
     * @param {number} reserveOut - Réserve du token de sortie
     * @param {number} fee - Frais en pourcentage (0.3 pour 0.3%)
     */
    static calculatePriceImpact(amountIn, reserveIn, reserveOut, fee = 0.3) {
        const amountInWithFee = amountIn * (1 - fee / 100);
        const amountOut = (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee);
        
        const priceWithoutImpact = reserveOut / reserveIn;
        const priceWithImpact = amountOut / amountIn;
        
        const priceImpact = ((priceWithoutImpact - priceWithImpact) / priceWithoutImpact) * 100;
        return Math.max(0, priceImpact);
    }

    /**
     * Calculer le montant de sortie pour un swap AMM
     * @param {number} amountIn - Montant d'entrée
     * @param {number} reserveIn - Réserve du token d'entrée
     * @param {number} reserveOut - Réserve du token de sortie
     * @param {number} fee - Frais en pourcentage
     */
    static getAmountOut(amountIn, reserveIn, reserveOut, fee = 0.3) {
        const amountInWithFee = amountIn * (1 - fee / 100);
        return (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee);
    }

    /**
     * Calculer la liquidité optimale pour une position LP
     * @param {number} amount0 - Montant token 0
     * @param {number} amount1 - Montant token 1
     * @param {number} price - Prix current (token1/token0)
     * @param {number} priceLower - Prix inférieur de la range
     * @param {number} priceUpper - Prix supérieur de la range
     */
    static calculateOptimalLiquidity(amount0, amount1, price, priceLower, priceUpper) {
        const sqrtPrice = Math.sqrt(price);
        const sqrtPriceLower = Math.sqrt(priceLower);
        const sqrtPriceUpper = Math.sqrt(priceUpper);
        
        let liquidity0, liquidity1;
        
        if (price < priceLower) {
            liquidity0 = amount0 / (1 / sqrtPriceLower - 1 / sqrtPriceUpper);
            liquidity1 = 0;
        } else if (price > priceUpper) {
            liquidity0 = 0;
            liquidity1 = amount1 / (sqrtPriceUpper - sqrtPriceLower);
        } else {
            liquidity0 = amount0 / (1 / sqrtPrice - 1 / sqrtPriceUpper);
            liquidity1 = amount1 / (sqrtPrice - sqrtPriceLower);
        }
        
        return Math.min(liquidity0 || Infinity, liquidity1 || Infinity);
    }

    /**
     * Calculer les frais accumulés pour une position LP
     * @param {number} liquidity - Liquidité de la position
     * @param {number} feeGrowth - Croissance des frais globale
     * @param {number} feeGrowthPosition - Croissance des frais à l'ouverture
     */
    static calculateAccruedFees(liquidity, feeGrowth, feeGrowthPosition) {
        return liquidity * (feeGrowth - feeGrowthPosition);
    }

    /**
     * Estimer le gas pour différents types de transactions
     * @param {string} txType - Type de transaction
     */
    static estimateGas(txType) {
        const gasEstimates = {
            'erc20_transfer': 21000,
            'erc20_approve': 45000,
            'uniswap_swap': 150000,
            'uniswap_add_liquidity': 200000,
            'uniswap_remove_liquidity': 150000,
            'aave_deposit': 250000,
            'aave_withdraw': 200000,
            'flashloan': 500000,
            'complex_defi': 800000
        };
        
        return gasEstimates[txType] || 200000;
    }
}

/**
 * Utilitaires pour les validations
 */
export class ValidationUtils {
    /**
     * Valider un montant
     * @param {string|number} amount - Montant à valider
     * @param {number} min - Minimum
     * @param {number} max - Maximum
     */
    static validateAmount(amount, min = 0, max = Infinity) {
        const num = parseFloat(amount);
        
        if (isNaN(num)) return { valid: false, error: 'Montant invalide' };
        if (num < min) return { valid: false, error: `Montant minimum: ${min}` };
        if (num > max) return { valid: false, error: `Montant maximum: ${max}` };
        if (!isFinite(num)) return { valid: false, error: 'Montant doit être fini' };
        
        return { valid: true, value: num };
    }

    /**
     * Valider une adresse Ethereum
     * @param {string} address - Adresse à valider
     */
    static validateAddress(address) {
        if (!address) return { valid: false, error: 'Adresse requise' };
        if (!TokenUtils.isValidAddress(address)) {
            return { valid: false, error: 'Format d\'adresse invalide' };
        }
        return { valid: true, value: address.toLowerCase() };
    }

    /**
     * Valider un pourcentage
     * @param {string|number} percentage - Pourcentage à valider
     * @param {number} min - Minimum
     * @param {number} max - Maximum
     */
    static validatePercentage(percentage, min = 0, max = 100) {
        const validation = this.validateAmount(percentage, min, max);
        if (!validation.valid) return validation;
        
        return { valid: true, value: validation.value };
    }

    /**
     * Valider une configuration de stratégie
     * @param {object} config - Configuration à valider
     * @param {object} schema - Schéma de validation
     */
    static validateStrategyConfig(config, schema) {
        const errors = [];
        
        for (const [key, rules] of Object.entries(schema)) {
            const value = config[key];
            
            if (rules.required && (value === undefined || value === null)) {
                errors.push(`${key} est requis`);
                continue;
            }
            
            if (value !== undefined && value !== null) {
                if (rules.type && typeof value !== rules.type) {
                    errors.push(`${key} doit être de type ${rules.type}`);
                }
                
                if (rules.min && value < rules.min) {
                    errors.push(`${key} doit être >= ${rules.min}`);
                }
                
                if (rules.max && value > rules.max) {
                    errors.push(`${key} doit être <= ${rules.max}`);
                }
                
                if (rules.validator && !rules.validator(value)) {
                    errors.push(rules.message || `${key} invalide`);
                }
            }
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
}

/**
 * Utilitaires pour les performances et optimisations
 */
export class PerformanceUtils {
    /**
     * Debounce une fonction
     * @param {function} func - Fonction à debouncer
     * @param {number} wait - Délai d'attente en ms
     */
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Throttle une fonction
     * @param {function} func - Fonction à throttler
     * @param {number} limit - Limite en ms
     */
    static throttle(func, limit) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    /**
     * Créer un cache simple avec TTL
     * @param {number} ttl - Time to live en ms
     */
    static createCache(ttl = 300000) { // 5 minutes par défaut
        const cache = new Map();
        
        return {
            get(key) {
                const item = cache.get(key);
                if (!item) return null;
                
                if (Date.now() > item.expiry) {
                    cache.delete(key);
                    return null;
                }
                
                return item.value;
            },
            
            set(key, value) {
                cache.set(key, {
                    value,
                    expiry: Date.now() + ttl
                });
            },
            
            delete(key) {
                cache.delete(key);
            },
            
            clear() {
                cache.clear();
            },
            
            size() {
                return cache.size;
            }
        };
    }

    /**
     * Mesurer le temps d'exécution d'une fonction
     * @param {function} func - Fonction à mesurer
     * @param {string} label - Label pour les logs
     */
    static async measureTime(func, label = 'Fonction') {
        const start = performance.now();
        const result = await func();
        const end = performance.now();
        
        console.log(`⏱️ ${label}: ${(end - start).toFixed(2)}ms`);
        return result;
    }

    /**
     * Batch des appels async pour éviter les rate limits
     * @param {Array} items - Items à traiter
     * @param {function} processor - Fonction de traitement
     * @param {number} batchSize - Taille du batch
     * @param {number} delay - Délai entre batches en ms
     */
    static async batchProcess(items, processor, batchSize = 5, delay = 1000) {
        const results = [];
        
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const batchResults = await Promise.allSettled(
                batch.map(item => processor(item))
            );
            
            results.push(...batchResults);
            
            // Délai entre batches (sauf pour le dernier)
            if (i + batchSize < items.length) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        return results;
    }
}

/**
 * Utilitaires pour les erreurs et logs
 */
export class ErrorUtils {
    /**
     * Créer une erreur personnalisée
     * @param {string} message - Message d'erreur
     * @param {string} code - Code d'erreur
     * @param {object} context - Contexte additionnel
     */
    static createError(message, code = 'UNKNOWN_ERROR', context = {}) {
        const error = new Error(message);
        error.code = code;
        error.context = context;
        error.timestamp = new Date().toISOString();
        return error;
    }

    /**
     * Wrapper try-catch avec logging
     * @param {function} func - Fonction à exécuter
     * @param {string} context - Contexte pour les logs
     */
    static async safeExecute(func, context = 'Opération') {
        try {
            return await func();
        } catch (error) {
            console.error(`❌ Erreur ${context}:`, error);
            throw error;
        }
    }

    /**
     * Classifier les erreurs blockchain communes
     * @param {Error} error - Erreur à classifier
     */
    static classifyBlockchainError(error) {
        const message = error.message.toLowerCase();
        
        if (message.includes('user rejected') || error.code === 4001) {
            return {
                type: 'USER_REJECTED',
                userMessage: 'Transaction annulée par l\'utilisateur',
                severity: 'info'
            };
        }
        
        if (message.includes('insufficient funds')) {
            return {
                type: 'INSUFFICIENT_FUNDS',
                userMessage: 'Fonds insuffisants pour cette transaction',
                severity: 'error'
            };
        }
        
        if (message.includes('gas')) {
            return {
                type: 'GAS_ERROR',
                userMessage: 'Erreur de gas - ajustez la limite de gas',
                severity: 'warning'
            };
        }
        
        if (message.includes('slippage')) {
            return {
                type: 'SLIPPAGE_ERROR',
                userMessage: 'Slippage trop élevé - réessayez avec un slippage plus élevé',
                severity: 'warning'
            };
        }
        
        if (message.includes('deadline')) {
            return {
                type: 'DEADLINE_ERROR',
                userMessage: 'Transaction expirée - réessayez',
                severity: 'warning'
            };
        }
        
        return {
            type: 'UNKNOWN_ERROR',
            userMessage: 'Erreur inattendue - contactez le support',
            severity: 'error'
        };
    }

    /**
     * Logger d'erreurs avec contexte
     * @param {Error} error - Erreur
     * @param {object} context - Contexte
     */
    static logError(error, context = {}) {
        const errorLog = {
            message: error.message,
            stack: error.stack,
            code: error.code,
            timestamp: new Date().toISOString(),
            context,
            userAgent: navigator.userAgent,
            url: window.location.href
        };
        
        console.group('🚨 Erreur détaillée');
        console.error('Message:', error.message);
        console.error('Contexte:', context);
        console.error('Stack:', error.stack);
        console.groupEnd();
        
        // En production, envoyer à un service de monitoring
        if (window.location.hostname !== 'localhost' && 
            window.location.hostname !== '127.0.0.1') {
            // Sentry, LogRocket, etc.
        }
        
        return errorLog;
    }
}

/**
 * Utilitaires pour les URL et navigation
 */
export class UrlUtils {
    /**
     * Obtenir les paramètres de l'URL
     */
    static getUrlParams() {
        return Object.fromEntries(new URLSearchParams(window.location.search));
    }

    /**
     * Mettre à jour l'URL sans recharger la page
     * @param {object} params - Nouveaux paramètres
     */
    static updateUrlParams(params) {
        const url = new URL(window.location);
        
        Object.entries(params).forEach(([key, value]) => {
            if (value === null || value === undefined) {
                url.searchParams.delete(key);
            } else {
                url.searchParams.set(key, value);
            }
        });
        
        window.history.replaceState({}, '', url);
    }

    /**
     * Générer une URL d'explorateur blockchain
     * @param {string} hash - Hash de transaction ou adresse
     * @param {string} network - Réseau
     * @param {string} type - Type (tx, address, block)
     */
    static getExplorerUrl(hash, network = 'polygon', type = 'tx') {
        const explorers = {
            ethereum: 'https://etherscan.io',
            polygon: 'https://polygonscan.com',
            arbitrum: 'https://arbiscan.io',
            bsc: 'https://bscscan.com'
        };
        
        const baseUrl = explorers[network] || explorers.polygon;
        return `${baseUrl}/${type}/${hash}`;
    }

    /**
     * Copier dans le presse-papier
     * @param {string} text - Texte à copier
     */
    static async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            // Fallback pour navigateurs plus anciens
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            const success = document.execCommand('copy');
            document.body.removeChild(textArea);
            return success;
        }
    }
}

// Export de toutes les classes utilitaires
export default {
    FinanceUtils,
    TokenUtils,
    TimeUtils,
    StorageUtils,
    DeFiUtils,
    ValidationUtils,
    PerformanceUtils,
    ErrorUtils,
    UrlUtils
};

// Ajoute ces fonctions à ton utils.js existant
export function formatNumber(value, decimals = 2) {
    const num = parseFloat(value) || 0;
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(num);
}

export function formatPercent(value, decimals = 2) {
    const num = parseFloat(value) || 0;
    return `${num.toFixed(decimals)}%`;
}