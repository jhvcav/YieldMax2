// js/strategies/flashloan-strategy.js
import { BaseStrategy } from './base-strategy.js';
import { getEventBus } from '../core/event-bus.js';
import { getNotificationSystem } from '../core/notification-system.js';


// ======================================
// CLASSE PROVIDER DE PRIX RÉELS - DÉFINIE EN PREMIER
// ======================================
class RealPriceProvider {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 10000; // 10 secondes pour les vrais prix
        this.rateLimiter = new Map();
        this.maxRequestsPerMinute = 60;
    }

    async getRealTokenPrices(tokenA, tokenB) {
        const cacheKey = `${tokenA}-${tokenB}`;
        
        // Vérifier le cache
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                console.log('💾 Prix récupérés depuis le cache');
                return cached.prices;
            }
        }

        try {
            console.log(`🔍 Récupération VRAIS prix pour ${tokenA}/${tokenB}`);
            
            // Récupérer les vrais prix depuis plusieurs sources
            const prices = await this.fetchRealPricesFromMultipleSources(tokenA, tokenB);
            
            // Mettre en cache
            this.cache.set(cacheKey, {
                prices: prices,
                timestamp: Date.now()
            });
            
            console.log('💰 VRAIS prix obtenus:', prices);
            return prices;
            
        } catch (error) {
            console.error('❌ Erreur récupération VRAIS prix:', error);
            // En cas d'erreur, retourner des prix null plutôt que simulés
            return {
                quickswap: null,
                sushiswap: null,
                uniswap: null
            };
        }
    }

    async fetchRealPricesFromMultipleSources(tokenA, tokenB) {
        const promises = [];
        
        // 1. Prix depuis 1inch pour QuickSwap
        promises.push(this.get1inchPrice(tokenA, tokenB, 'quickswap'));
        
        // 2. Prix depuis 1inch pour SushiSwap  
        promises.push(this.get1inchPrice(tokenA, tokenB, 'sushiswap'));
        
        // 3. Prix depuis CoinGecko comme fallback
        promises.push(this.getCoinGeckoPrice(tokenA, tokenB));
        
        // 4. Prix depuis ParaSwap
        promises.push(this.getParaSwapPrice(tokenA, tokenB));

        const results = await Promise.allSettled(promises);
        
        return {
            quickswap: results[0].status === 'fulfilled' ? results[0].value : null,
            sushiswap: results[1].status === 'fulfilled' ? results[1].value : null,
            uniswap: results[2].status === 'fulfilled' ? results[2].value : null // CoinGecko comme proxy
        };
    }

    async get1inchPrice(tokenA, tokenB, dex) {
        try {
            // 1inch API v5 pour Polygon
            const amount = '1000000'; // 1 USDC (6 decimals)
            const url = `https://api.1inch.io/v5.0/137/quote?fromTokenAddress=${tokenA}&toTokenAddress=${tokenB}&amount=${amount}`;
            
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                }
            });
            
            if (!response.ok) {
                throw new Error(`1inch API error: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Calculer le prix (toTokenAmount / fromTokenAmount)
            const price = parseFloat(data.toTokenAmount) / parseFloat(amount);
            
            console.log(`📊 1inch prix ${dex}:`, price);
            return price;
            
        } catch (error) {
            console.error(`❌ Erreur 1inch ${dex}:`, error);
            return null;
        }
    }

    async getCoinGeckoPrice(tokenA, tokenB) {
        try {
            // CoinGecko API gratuite
            const response = await fetch(
                'https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,tether&vs_currencies=usd',
                {
                    headers: {
                        'Accept': 'application/json',
                    }
                }
            );
            
            if (!response.ok) {
                throw new Error(`CoinGecko API error: ${response.status}`);
            }
            
            const data = await response.json();
            
            // USDC/USDT ratio
            const usdcPrice = data['usd-coin']?.usd || 1;
            const usdtPrice = data['tether']?.usd || 1;
            const price = usdcPrice / usdtPrice;
            
            console.log('📊 CoinGecko prix:', price);
            return price;
            
        } catch (error) {
            console.error('❌ Erreur CoinGecko:', error);
            return null;
        }
    }

    async getParaSwapPrice(tokenA, tokenB) {
        try {
            // ParaSwap API v5
            const amount = '1000000'; // 1 USDC
            const url = `https://apiv5.paraswap.io/prices?srcToken=${tokenA}&destToken=${tokenB}&amount=${amount}&srcDecimals=6&destDecimals=6&network=137`;
            
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                }
            });
            
            if (!response.ok) {
                throw new Error(`ParaSwap API error: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Calculer le prix
            const price = parseFloat(data.destAmount) / parseFloat(amount);
            
            console.log('📊 ParaSwap prix:', price);
            return price;
            
        } catch (error) {
            console.error('❌ Erreur ParaSwap:', error);
            return null;
        }
    }

    // Méthode pour obtenir des prix de plusieurs DEX via 0x API
    async get0xPrices(tokenA, tokenB) {
        try {
            const amount = '1000000'; // 1 USDC
            const url = `https://polygon.api.0x.org/swap/v1/price?sellToken=${tokenA}&buyToken=${tokenB}&sellAmount=${amount}`;
            
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`0x API error: ${response.status}`);
            }
            
            const data = await response.json();
            
            // 0x agrège plusieurs DEX, on peut utiliser ça comme prix de référence
            const price = parseFloat(data.buyAmount) / parseFloat(amount);
            
            console.log('📊 0x prix agregé:', price);
            return price;
            
        } catch (error) {
            console.error('❌ Erreur 0x API:', error);
            return null;
        }
    }

    // Méthode pour comparer et détecter les vraies opportunités
    detectRealArbitrageOpportunities(prices) {
        const validPrices = Object.entries(prices)
            .filter(([dex, price]) => price !== null && price > 0)
            .reduce((obj, [dex, price]) => {
                obj[dex] = price;
                return obj;
            }, {});

        if (Object.keys(validPrices).length < 2) {
            return null;
        }

        // Trouver min et max
        let minDex = null, maxDex = null;
        let minPrice = Infinity, maxPrice = 0;

        Object.entries(validPrices).forEach(([dex, price]) => {
            if (price < minPrice) {
                minPrice = price;
                minDex = dex;
            }
            if (price > maxPrice) {
                maxPrice = price;
                maxDex = dex;
            }
        });

        if (minDex === maxDex) return null;

        const priceDiff = maxPrice - minPrice;
        const profitPercent = (priceDiff / minPrice) * 100;

        // Seuil minimum réaliste pour couvrir les frais
        const minProfitThreshold = 0.1; // 0.1%

        if (profitPercent < minProfitThreshold) {
            return null;
        }

        return {
            buyExchange: minDex,
            sellExchange: maxDex,
            buyPrice: minPrice,
            sellPrice: maxPrice,
            profitPercent: profitPercent,
            estimatedProfit: priceDiff * 1000, // Pour 1000 USDC
            allPrices: validPrices,
            timestamp: Date.now()
        };
    }
}

// Export pour utilisation
if (typeof window !== 'undefined') {
    window.RealPriceProvider = RealPriceProvider;
    
    // Test avec vrais prix
    window.testRealPrices = async () => {
        const provider = new RealPriceProvider();
        const prices = await provider.getRealTokenPrices(
            '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // USDC
            '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'  // USDT
        );
        console.log('🔥 VRAIS prix du marché:', prices);
        
        const opportunity = provider.detectRealArbitrageOpportunities(prices);
        if (opportunity) {
            console.log('🎯 VRAIE opportunité détectée:', opportunity);
        } else {
            console.log('❌ Aucune opportunité rentable trouvée');
        }
        
        return { prices, opportunity };
    };
}

console.log('🎯 RealPriceProvider avec VRAIS prix implémenté');


// 🔧 CORRECTION CORS: Images locales ou données base64
const TOKEN_ICONS = {
    USDC: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiMyNzc1Q0EiLz4KPHN2ZyB4PSI0IiB5PSI0IiB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSI+CjxwYXRoIGQ9Ik0xMiAyNEMxOC42Mjc0IDI0IDI0IDE4LjYyNzQgMjQgMTJDMjQgNS4zNzI1OCAxOC42Mjc0IDAgMTIgMEM1LjM3MjU4IDAgMCA1LjM3MjU4IDAgMTJDMCAxOC42Mjc0IDUuMzcyNTggMjQgMTIgMjRaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMTIuMDAwMiAxNi43NUMxNS4wMzc2IDE2Ljc1IDE3LjUwMDIgMTQuNjI1NiAxNy41MDAyIDEyQzE3LjUwMDIgOS4zNzQ0NCAxNS4wMzc2IDcuMjUgMTIuMDAwMiA3LjI1QzguOTYyNjMgNy4yNSA2LjUwMDIgOS4zNzQ0NCA2LjUwMDIgMTJDNi41MDAyIDE0LjYyNTYgOC45NjI2MyAxNi43NSAxMi4wMDAyIDE2Ljc1WiIgZmlsbD0iIzI3NzVDQSIvPgo8L3N2Zz4KPC9zdmc+',
    USDT: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiMyNkE2OUEiLz4KPHN2ZyB4PSI0IiB5PSI0IiB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSI+CjxwYXRoIGQ9Ik0xMiAyNEMxOC42Mjc0IDI0IDI0IDE4LjYyNzQgMjQgMTJDMjQgNS4zNzI1OCAxOC42Mjc0IDAgMTIgMEM1LjM3MjU4IDAgMCA1LjM3MjU4IDAgMTJDMCAxOC42Mjc0IDUuMzcyNTggMjQgMTIgMjRaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMTMuNSA5SDEwLjVWNy41SDE2LjVWOUgxMy41VjEySDEwLjVWMTAuNUgxNi41VjEySDEzLjVWMTZIMTAuNVYxMi4zSDE2LjVWMTZIMTMuNVoiIGZpbGw9IiMyNkE2OUEiLz4KPC9zdmc+CjwhL3N2Zz4='
};

// 🔧 CORRECTION: Utiliser des icônes CSS au lieu d'images externes
const getTokenIcon = (symbol) => {
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
        
        // Erreurs spécifiques au contrat
        if (error.message?.includes('Token non autorise')) {
            notificationSystem.show('❌ Token non autorisé dans le contrat. Vérifiez la configuration.', 'error');
        } else if (error.message?.includes('insufficient allowance')) {
            notificationSystem.show('❌ Allowance insuffisante. Réessayez l\'approbation.', 'error');
        } else if (error.message?.includes('transfer amount exceeds balance')) {
            notificationSystem.show('❌ Solde insuffisant pour cette transaction', 'error');
        } else if (error.code === 4001) {
            notificationSystem.show('Transaction annulée par l\'utilisateur', 'warning');
        } else if (error.code === -32603) {
            notificationSystem.show('Erreur interne du réseau', 'error');
        } else if (error.message?.includes('insufficient funds')) {
            notificationSystem.show('Fonds insuffisants pour les gas fees', 'error');
        } else if (error.message?.includes('execution reverted')) {
            const reason = error.message.split('execution reverted: ')[1]?.split('"')[1] || 'Raison inconnue';
            notificationSystem.show(`Transaction rejetée: ${reason}`, 'error');
        } else if (error.message?.includes('network')) {
            notificationSystem.show('Problème de connexion réseau', 'error');
        } else {
            notificationSystem.show(`Erreur: ${error.message || 'Erreur inconnue'}`, 'error');
        }
    }
}

class FlashLoanStrategy extends BaseStrategy {
    constructor(walletManager) {
        super('flashloan', walletManager);
        this.name = 'Flash Loan Arbitrage';
        this.eventBus = getEventBus();
        this.notificationSystem = getNotificationSystem();
        this.description = 'Arbitrage automatique avec emprunts flash sans capital initial';
        this.priceProvider = null;

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
        this.contractAddress = "0xEaF562F5E0b313ed4E47D10D04a4bf4A411b9681";
        this.contract = null;
        
        // 🆕 CORRECTION: Adresses des tokens configurables
        this.contractTokenAddresses = null;
        
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

        // 🆕 EXPOSITION DES FONCTIONS DE DEBUG
        if (typeof window !== 'undefined') {
            window.flashLoanStrategy = this;
            
            window.debugFlashLoanContract = async () => {
                return await this.debugContractConfiguration();
            };
            
            window.getContractTokens = async () => {
                return await this.loadContractTokenAddresses();
            };
            
            window.checkTokenAllowed = async (tokenAddress) => {
                return await this.isTokenAllowed(tokenAddress);
            };
        }
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

    // 🆕 NOUVELLE MÉTHODE: Récupérer les adresses du contrat
    async loadContractTokenAddresses() {
        if (!this.contract) {
            console.warn('Contract non disponible');
            return null;
        }

        try {
            // Utiliser les nouvelles fonctions du contrat
            const [usdcAddress, usdtAddress] = await this.contract.getTokenAddresses();
            
            console.log('🔍 Adresses tokens du contrat:');
            console.log('USDC:', usdcAddress);
            console.log('USDT:', usdtAddress);
            
            // Mettre à jour les adresses dans votre classe
            this.contractTokenAddresses = {
                USDC: usdcAddress,
                USDT: usdtAddress
            };

            return this.contractTokenAddresses;
        } catch (error) {
            console.error('❌ Erreur récupération adresses tokens:', error);
            return null;
        }
    }

    // 🆕 NOUVELLE MÉTHODE: Vérifier si un token est autorisé
    async isTokenAllowed(tokenAddress) {
        if (!this.contract) return false;
        
        try {
            const isAllowed = await this.contract.authorizedTokens(tokenAddress);
            console.log(`Token ${tokenAddress} autorisé:`, isAllowed);
            return isAllowed;
        } catch (error) {
            console.error('Erreur vérification token:', error);
            return false;
        }
    }

    // 🆕 NOUVELLE MÉTHODE: Debug de la configuration du contrat
    async debugContractConfiguration() {
        if (!this.contract) {
            console.log('❌ Contrat non initialisé');
            return false;
        }

        try {
            console.log('🔍 === DEBUG CONFIGURATION CONTRAT ===');
            
            // Vérifier le owner
            const owner = await this.contract.owner();
            console.log('Owner du contrat:', owner);
            
            // Récupérer les adresses des tokens
            const [usdcAddress, usdtAddress] = await this.contract.getTokenAddresses();
            console.log('Adresses tokens dans le contrat:');
            console.log('  USDC:', usdcAddress);
            console.log('  USDT:', usdtAddress);
            
            // Vérifier les autorisations
            const usdcAllowed = await this.contract.authorizedTokens(usdcAddress);
            const usdtAllowed = await this.contract.authorizedTokens(usdtAddress);
            console.log('Autorisations tokens:');
            console.log('  USDC autorisé:', usdcAllowed);
            console.log('  USDT autorisé:', usdtAllowed);
            
            try {
                // Récupérer les infos détaillées
                const tokenInfo = await this.contract.getTokenInfo();
                console.log('Informations détaillées tokens:');
                console.log('  USDC:', {
                    symbol: tokenInfo.usdcSymbol,
                    decimals: tokenInfo.usdcDecimals.toString(),
                    address: tokenInfo.usdcAddress
                });
                console.log('  USDT:', {
                    symbol: tokenInfo.usdtSymbol,
                    decimals: tokenInfo.usdtDecimals.toString(),
                    address: tokenInfo.usdtAddress
                });
            } catch (infoError) {
                console.warn('Impossible de récupérer getTokenInfo (peut-être pas implémenté)');
            }
            
            // Vérifier les pools metrics
            const poolMetrics = await this.contract.getPoolMetrics();
            console.log('Pool Metrics:');
            console.log('  Total USDC Deposits:', window.ethers.formatUnits(poolMetrics.totalUSDCDeposits, 6));
            console.log('  Total USDT Deposits:', window.ethers.formatUnits(poolMetrics.totalUSDTDeposits, 6));
            
            return true;
        } catch (error) {
            console.error('Erreur debug contrat:', error);
            return false;
        }
    }

    async onWalletConnected() {
        await this.loadContracts();
        
        // 🔧 CORRECTION: Forcer la récupération de l'account
        console.log('🔍 Debug account avant:', this.walletManager.account);
        console.log('🔍 Debug app account:', window.app?.walletManager?.account);
        
        // Essayer plusieurs méthodes pour récupérer l'account
        if (!this.walletManager.account) {
            // Méthode 1: Depuis l'app principale
            if (window.app?.walletManager?.account) {
                this.walletManager.account = window.app.walletManager.account;
                console.log('✅ Account récupéré depuis app:', this.walletManager.account);
            }
            // Méthode 2: Depuis le signer
            else if (this.walletManager.signer && this.walletManager.signer.address) {
                this.walletManager.account = this.walletManager.signer.address;
                console.log('✅ Account récupéré depuis signer:', this.walletManager.account);
            }
            // Méthode 3: Appel direct à getAccount
            else if (this.walletManager.getAccount) {
                try {
                    this.walletManager.account = await this.walletManager.getAccount();
                    console.log('✅ Account récupéré via getAccount:', this.walletManager.account);
                } catch (error) {
                    console.warn('⚠️ getAccount failed:', error);
                }
            }
        }
        
        console.log('🔍 Debug account après:', this.walletManager.account);
        
        // Vérifier que ethers est disponible globalement
        if (typeof window.ethers === 'undefined') {
            console.error('❌ Ethers.js non disponible');
            this.notificationSystem.show('Erreur: Ethers.js non chargé', 'error');
            return;
        }

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
                
                const owner = await this.contract.owner();
                console.log('🎯 Contrat Flash Loan connecté, owner:', owner);
                
                // 🆕 CHARGER LES ADRESSES DES TOKENS DU CONTRAT
                const contractTokens = await this.loadContractTokenAddresses();
                if (contractTokens) {
                    console.log('✅ Adresses tokens récupérées du contrat:', contractTokens);
                    this.notificationSystem.show('Contrat Flash Loan connecté !', 'success');
                } else {
                    this.notificationSystem.show('Contrat connecté mais erreur config tokens', 'warning');
                }
                
                // Charger les données SEULEMENT si account existe
                if (this.walletManager.account) {
                    console.log('✅ Chargement des données pour:', this.walletManager.account);
                    await this.loadRealContractData();
                    await this.loadUserBalances();
                } else {
                    console.error('❌ Account toujours manquant après tentatives de récupération');
                }
                
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
        if (!this.priceProvider) {
            this.priceProvider = new RealPriceProvider();
        }

        const newOpportunities = [];
        
        // Paires à analyser
        const pairs = [
            {
                tokenA: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // USDC
                tokenB: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // USDT
                symbolA: 'USDC',
                symbolB: 'USDT'
            }
        ];

        for (const pair of pairs) {
            try {
                console.log(`🔍 Analyse de la paire ${pair.symbolA}/${pair.symbolB}...`);
                
                const prices = await this.priceProvider.getRealTokenPrices(pair.tokenA, pair.tokenB);
                
                // Vérifier que nous avons au moins 2 prix valides
                const validPrices = Object.entries(prices).filter(([dex, price]) => price !== null);
                
                if (validPrices.length < 2) {
                    console.log(`⚠️ Pas assez de prix pour ${pair.symbolA}/${pair.symbolB}`);
                    continue;
                }

                const opportunity = this.calculateRealArbitrageOpportunity(pair, prices);
                
                if (opportunity && opportunity.profitPercent > this.config.minProfitThreshold) {
                    console.log(`✅ Opportunité trouvée:`, opportunity);
                    newOpportunities.push(opportunity);
                } else if (opportunity) {
                    console.log(`❌ Opportunité insuffisante: ${opportunity.profitPercent.toFixed(4)}%`);
                }
                
            } catch (error) {
                console.error(`Erreur analyse ${pair.symbolA}/${pair.symbolB}:`, error);
            }
        }
        
        this.opportunities = newOpportunities.sort((a, b) => b.profitPercent - a.profitPercent);
        
        console.log(`🎯 ${newOpportunities.length} opportunités réelles trouvées`);
        this.updateOpportunitiesDisplay();
    }

    //Nouvelle méthode pour calculer les opportunités d'arbitrage réelles
    calculateRealArbitrageOpportunity(pair, prices) {
        const validPrices = {};
        
        // Filtrer les prix valides
        Object.entries(prices).forEach(([dex, price]) => {
            if (price !== null && price > 0) {
                validPrices[dex] = price;
            }
        });

        if (Object.keys(validPrices).length < 2) {
            return null;
        }

        // Trouver le meilleur prix d'achat (le plus bas) et de vente (le plus haut)
        let bestBuy = { exchange: null, price: Infinity };
        let bestSell = { exchange: null, price: 0 };
        
        Object.entries(validPrices).forEach(([exchange, price]) => {
            if (price < bestBuy.price) {
                bestBuy = { exchange, price };
            }
            if (price > bestSell.price) {
                bestSell = { exchange, price };
            }
        });

        // Vérifier qu'on a des échanges différents
        if (bestBuy.exchange === bestSell.exchange) {
            return null;
        }

        const priceDiff = bestSell.price - bestBuy.price;
        const profitPercent = (priceDiff / bestBuy.price) * 100;
        
        // Estimation des coûts RÉELS
        const gasEstimate = 0.015; // ~$15 en gas
        const fees = bestBuy.price * 0.006; // 0.6% de fees
        const slippageEstimate = bestBuy.price * 0.005; // 0.5% de slippage
        
        const totalCosts = gasEstimate + fees + slippageEstimate;
        const netProfit = priceDiff - totalCosts;
        const netProfitPercent = (netProfit / bestBuy.price) * 100;
        
        // Seuil de rentabilité plus strict
        if (netProfitPercent <= 0.05) { // Au moins 0.05%
            return null;
        }
        
        return {
            token: pair.symbolA,
            tokenA: pair.tokenA,
            tokenB: pair.tokenB,
            buyExchange: bestBuy.exchange,
            sellExchange: bestSell.exchange,
            buyPrice: bestBuy.price,
            sellPrice: bestSell.price,
            profitPercent: netProfitPercent,
            estimatedProfit: netProfit,
            grossProfit: priceDiff,
            estimatedCosts: totalCosts,
            allPrices: validPrices,
            timestamp: Date.now(),
            id: Date.now().toString(),
            isReal: true
        };
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

    // Execution arbitrage réelle pour de vraie opportunités
    async executeRealArbitrage(opportunity) {
        if (!this.walletManager.isConnected) {
            this.notificationSystem.show('Wallet non connecté', 'error');
            return;
        }

        if (!this.contract) {
            this.notificationSystem.show('Contrat non disponible', 'error');
            return;
        }

        // Vérifier que c'est une vraie opportunité
        if (!opportunity.isReal) {
            this.notificationSystem.show('❌ Opportunité non réelle détectée', 'error');
            return;
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

            this.notificationSystem.show(`🚀 VRAI Flash Loan ${opportunity.token}: ${opportunity.buyExchange} → ${opportunity.sellExchange}`, 'info');
            
            // Montant d'arbitrage (commencer petit pour tester)
            let amountIn;
            try {
                amountIn = ethers.parseUnits("50", 6); // 50 USDC pour commencer
            } catch (error) {
                amountIn = ethers.utils.parseUnits("50", 6);
            }
            
            // Mapping des noms vers adresses
            const dexRouters = {
                'quickswap': '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
                'sushiswap': '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
                'uniswap': '0xE592427A0AEce92De3Edee1F18E0157C05861564'
            };
            
            const params = {
                tokenA: opportunity.tokenA,
                tokenB: opportunity.tokenB,
                dexRouter1: dexRouters[opportunity.buyExchange],
                dexRouter2: dexRouters[opportunity.sellExchange],
                amountIn: amountIn,
                minProfitBps: 3,  // 0.03% minimum
                reverseDirection: false,
                maxSlippage: 100, // 1%
                deadline: Math.floor(Date.now() / 1000) + 1800
            };

            console.log('🔍 Paramètres arbitrage réel:', params);
            console.log('🔍 Opportunité détaillée:', opportunity);

            // Vérifier les autorisations des DEX
            const dex1Authorized = await this.contract.authorizedDEXs(params.dexRouter1);
            const dex2Authorized = await this.contract.authorizedDEXs(params.dexRouter2);
            
            if (!dex1Authorized || !dex2Authorized) {
                throw new Error(`DEX non autorisés: ${opportunity.buyExchange}=${dex1Authorized}, ${opportunity.sellExchange}=${dex2Authorized}`);
            }

            // Estimation du gas
            let gasEstimate;
            try {
                gasEstimate = await this.contract.executeArbitrage.estimateGas(params);
                console.log('✅ Gas estimé:', gasEstimate.toString());
            } catch (gasError) {
                console.error('❌ Échec estimation gas:', gasError);
                throw new Error('Arbitrage non viable - échec estimation gas');
            }

            // Demander confirmation
            const confirmMessage = `🚀 ARBITRAGE RÉEL DÉTECTÉ !

💰 Montant: ${ethers.formatUnits(amountIn, 6)} USDC
🔄 Route: ${opportunity.buyExchange} (${opportunity.buyPrice.toFixed(6)}) → ${opportunity.sellExchange} (${opportunity.sellPrice.toFixed(6)})
📈 Profit brut: $${opportunity.grossProfit.toFixed(4)}
💸 Coûts estimés: $${opportunity.estimatedCosts.toFixed(4)}
🎯 Profit net estimé: $${opportunity.estimatedProfit.toFixed(4)} (${opportunity.profitPercent.toFixed(3)}%)
⛽ Gas: ${gasEstimate.toString()}

⚠️ ATTENTION: Ceci est un vrai trade avec de l'argent réel !

Voulez-vous continuer ?`;
            
            if (!confirm(confirmMessage)) {
                this.notificationSystem.show('Arbitrage annulé par l\'utilisateur', 'info');
                this.activeArbitrages.delete(arbitrageId);
                this.updateActiveArbitragesDisplay();
                return;
            }

            // Exécuter la transaction
            const tx = await this.contract.executeArbitrage(params, {
                gasLimit: Math.floor(Number(gasEstimate) * 1.2)
            });

            this.notificationSystem.show(`⏳ Transaction réelle envoyée: ${tx.hash.substring(0, 10)}...`, 'info');
            
            const receipt = await tx.wait();
            
            if (receipt.status === 0) {
                throw new Error('Transaction échouée - opportunité disparue');
            }
            
            // Analyser les événements pour le profit réel
            let realProfit = 0;
            if (receipt.logs && receipt.logs.length > 0) {
                try {
                    const arbitrageEventInterface = new ethers.Interface([
                        "event ArbitrageExecuted(address indexed user, address indexed asset, uint256 flashAmount, uint256 profit, uint256 userProfit, uint256 platformFee, uint256 gasUsed, uint256 timestamp)"
                    ]);
                    
                    for (const log of receipt.logs) {
                        try {
                            const parsedLog = arbitrageEventInterface.parseLog(log);
                            if (parsedLog.name === 'ArbitrageExecuted') {
                                realProfit = ethers.formatUnits(parsedLog.args.userProfit, 6);
                                console.log('✅ Profit réel obtenu:', realProfit, 'USDC');
                                break;
                            }
                        } catch (parseError) {
                            // Log non compatible, continuer
                        }
                    }
                } catch (eventError) {
                    console.warn('⚠️ Impossible de parser les événements:', eventError.message);
                }
            }
            
            // Mettre à jour les stats avec le profit réel
            this.stats.successfulTrades++;
            this.stats.totalProfit += parseFloat(realProfit);
            
            // Marquer comme terminé
            this.activeArbitrages.set(arbitrageId, {
                ...this.activeArbitrages.get(arbitrageId),
                status: 'completed',
                actualProfit: parseFloat(realProfit),
                txHash: tx.hash,
                endTime: Date.now()
            });
            
            this.notificationSystem.show(`🎉 ARBITRAGE RÉEL RÉUSSI! Profit: ${realProfit} USDC`, 'success');

        } catch (error) {
            console.error('❌ Erreur arbitrage réel:', error);
            
            this.stats.failedTrades++;
            
            let errorMessage = 'Erreur arbitrage réel';
            if (error.message.includes('user rejected')) {
                errorMessage = 'Transaction annulée';
            } else if (error.message.includes('insufficient funds')) {
                errorMessage = 'Fonds insuffisants';
            } else if (error.message.includes('execution reverted')) {
                errorMessage = 'Arbitrage non rentable (opportunité disparue)';
            } else if (error.message.includes('non viable')) {
                errorMessage = error.message;
            }
            
            this.activeArbitrages.set(arbitrageId, {
                ...this.activeArbitrages.get(arbitrageId),
                status: 'failed',
                error: errorMessage,
                endTime: Date.now()
            });
            
            this.notificationSystem.show(`❌ ${errorMessage}`, 'error');
        }
        
        // Nettoyer après 10 secondes pour les vrais trades
        setTimeout(() => {
            this.activeArbitrages.delete(arbitrageId);
            this.updateActiveArbitragesDisplay();
        }, 10000);
        
        await this.loadRealContractData();
        await this.loadUserBalances();
        this.updateStatsDisplay();
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
            
            // 🔧 CORRECTION: Paramètres réalistes
            let amountIn;
            try {
                // Utiliser un montant plus petit et réaliste
                amountIn = ethers.parseUnits("100", 6); // 100 USDC au lieu de 1000
            } catch (error) {
                amountIn = ethers.utils.parseUnits("100", 6);
            }
            
            // 🔧 CORRECTION: Adresses correctes et vérifiées
            const params = {
                tokenA: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC bridged (votre contrat)
                tokenB: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // USDT
                dexRouter1: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff", // QuickSwap
                dexRouter2: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506", // SushiSwap
                amountIn: amountIn,
                minProfitBps: 5,  // 🔧 CORRECTION: Réduire à 0.05% (plus réaliste)
                reverseDirection: false,
                maxSlippage: 100, // 🔧 CORRECTION: Augmenter à 1% (plus tolérant)
                deadline: Math.floor(Date.now() / 1000) + 3600 // 1 heure au lieu de 30 min
            };

            // 🔧 CORRECTION: Vérification préalable des conditions
            console.log('🔍 Paramètres Flash Loan:', params);
            
            // Vérifier que les DEX sont autorisés
            try {
                const dex1Authorized = await this.contract.authorizedDEXs(params.dexRouter1);
                const dex2Authorized = await this.contract.authorizedDEXs(params.dexRouter2);
                
                if (!dex1Authorized || !dex2Authorized) {
                    throw new Error(`DEX non autorisés: QS=${dex1Authorized}, Sushi=${dex2Authorized}`);
                }
                
                console.log('✅ DEX autorisés:', { quickswap: dex1Authorized, sushiswap: dex2Authorized });
            } catch (authError) {
                console.warn('⚠️ Impossible de vérifier les DEX autorisés:', authError.message);
            }

            // 🔧 CORRECTION: Estimation de gas plus conservatrice
            let gasEstimate;
            try {
                gasEstimate = await this.contract.executeArbitrage.estimateGas(params);
                console.log('✅ Gas estimé:', gasEstimate.toString());
            } catch (gasError) {
                console.warn('⚠️ Impossible d\'estimer le gas:', gasError.message);
                
                // 🔧 CORRECTION: Vérifier si c'est un problème de liquidité
                if (gasError.message.includes('revert') || gasError.message.includes('execution reverted')) {
                    this.notificationSystem.show('❌ Arbitrage non rentable ou liquidité insuffisante', 'error');
                    
                    // Marquer comme échoué
                    this.activeArbitrages.set(arbitrageId, {
                        ...this.activeArbitrages.get(arbitrageId),
                        status: 'failed',
                        error: 'Liquidité insuffisante ou arbitrage non rentable',
                        endTime: Date.now()
                    });
                    
                    // Nettoyer après 3 secondes
                    setTimeout(() => {
                        this.activeArbitrages.delete(arbitrageId);
                        this.updateActiveArbitragesDisplay();
                    }, 3000);
                    
                    return;
                }
                
                gasEstimate = 800000; // Gas plus élevé par sécurité
            }

            // 🔧 CORRECTION: Demander confirmation à l'utilisateur
            const confirmMessage = `
🚀 Flash Loan Arbitrage
💰 Montant: ${ethers.formatUnits(amountIn, 6)} USDC
🔄 Route: ${opportunity.buyExchange} → ${opportunity.sellExchange}
⛽ Gas estimé: ${gasEstimate.toString()}
💸 Profit attendu: ~$${opportunity.estimatedProfit.toFixed(2)}

Voulez-vous continuer ?
            `;
            
            if (!confirm(confirmMessage.trim())) {
                this.notificationSystem.show('Transaction annulée par l\'utilisateur', 'info');
                this.activeArbitrages.delete(arbitrageId);
                this.updateActiveArbitragesDisplay();
                return;
            }

            // Exécuter la transaction avec paramètres optimisés
            const tx = await this.contract.executeArbitrage(params, {
                gasLimit: Math.floor(Number(gasEstimate) * 1.3), // 30% de marge
                // Pas de gasPrice pour laisser MetaMask gérer
            });

            this.notificationSystem.show(`⏳ Transaction envoyée: ${tx.hash.substring(0, 10)}...`, 'info');
            
            // Attendre la confirmation avec timeout
            const receipt = await Promise.race([
                tx.wait(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout')), 120000) // 2 minutes max
                )
            ]);
            
            console.log('📄 Receipt:', receipt);
            
            // 🔧 CORRECTION: Vérifier explicitement le status
            if (receipt.status === 0) {
                throw new Error('Transaction échouée - status 0 (revert)');
            }
            
            // Analyser les événements pour récupérer le profit
            let profit = 0;
            if (receipt.logs && receipt.logs.length > 0) {
                // Chercher l'événement ArbitrageExecuted
                try {
                    const arbitrageEventInterface = new ethers.Interface([
                        "event ArbitrageExecuted(address indexed user, address indexed asset, uint256 flashAmount, uint256 profit, uint256 userProfit, uint256 platformFee, uint256 gasUsed, uint256 timestamp)"
                    ]);
                    
                    for (const log of receipt.logs) {
                        try {
                            const parsedLog = arbitrageEventInterface.parseLog(log);
                            if (parsedLog.name === 'ArbitrageExecuted') {
                                profit = ethers.formatUnits(parsedLog.args.userProfit, 6);
                                console.log('✅ Profit récupéré:', profit, 'USDC');
                                break;
                            }
                        } catch (parseError) {
                            // Log non compatible, continuer
                        }
                    }
                } catch (eventError) {
                    console.warn('⚠️ Impossible de parser les événements:', eventError.message);
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
                txHash: tx.hash,
                endTime: Date.now()
            });
            
            this.notificationSystem.show(`🎉 Flash Loan réussi! Profit: ${profit} USDC`, 'success');

        } catch (error) {
            console.error('❌ Erreur Flash Loan détaillée:', error);
            
            this.stats.failedTrades++;
            
            // Analyser l'erreur pour donner un message plus précis
            let errorMessage = 'Erreur inconnue';
            
            if (error.message.includes('user rejected')) {
                errorMessage = 'Transaction annulée par l\'utilisateur';
            } else if (error.message.includes('insufficient funds')) {
                errorMessage = 'Fonds insuffisants pour les gas fees';
            } else if (error.message.includes('execution reverted')) {
                errorMessage = 'Transaction rejetée par le contrat (arbitrage non rentable)';
            } else if (error.message.includes('status 0')) {
                errorMessage = 'Transaction échouée - conditions d\'arbitrage non remplies';
            } else if (error.message.includes('Timeout')) {
                errorMessage = 'Transaction timeout - réseau congestionné';
            }
            
            // Marquer comme échoué
            this.activeArbitrages.set(arbitrageId, {
                ...this.activeArbitrages.get(arbitrageId),
                status: 'failed',
                error: errorMessage,
                endTime: Date.now()
            });
            
            this.notificationSystem.show(`❌ Flash Loan échoué: ${errorMessage}`, 'error');
        }
        
        // Nettoyer après 5 secondes
        setTimeout(() => {
            this.activeArbitrages.delete(arbitrageId);
            this.updateActiveArbitragesDisplay();
        }, 5000);
        
        // Recharger les données
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

    // 🔧 FONCTION CORRIGÉE: Dépôt avec adresses dynamiques du contrat
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
            // 🔧 CORRECTION: Récupérer les adresses du contrat
            const contractTokens = await this.loadContractTokenAddresses();
            if (!contractTokens) {
                this.notificationSystem.show('Impossible de récupérer les adresses des tokens', 'error');
                return;
            }

            console.log('🔍 Adresses tokens récupérées:', contractTokens);

            const tokenAddress = contractTokens[tokenSymbol];
            if (!tokenAddress) {
                this.notificationSystem.show(`Token ${tokenSymbol} non configuré dans le contrat`, 'error');
                return;
            }

            // 🔧 VÉRIFICATION: Token autorisé
            const isAllowed = await this.isTokenAllowed(tokenAddress);
            if (!isAllowed) {
                this.notificationSystem.show(`Token ${tokenSymbol} non autorisé dans le contrat`, 'error');
                console.error(`Token ${tokenSymbol} (${tokenAddress}) non autorisé`);
                return;
            }

            console.log(`✅ Token ${tokenSymbol} (${tokenAddress}) autorisé`);

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

            // Vérification du solde
            const balance = await tokenContract.balanceOf(this.walletManager.account);
            if (balance < amountWei) {
                let formattedBalance;
                try {
                    formattedBalance = ethers.formatUnits ? 
                        ethers.formatUnits(balance, decimals) : 
                        ethers.utils.formatUnits(balance, decimals);
                } catch (formatError) {
                    formattedBalance = "0";
                }
                this.notificationSystem.show(`Solde insuffisant: ${formattedBalance} ${tokenSymbol}`, 'error');
                return;
            }

            // Vérification et approbation
            const allowance = await tokenContract.allowance(this.walletManager.account, this.contractAddress);
            
            if (allowance < amountWei) {
                this.notificationSystem.show(`🔓 Approbation ${tokenSymbol}...`, 'info');
                
                const maxApproval = ethers.MaxUint256 || ethers.constants.MaxUint256;
                const approveTx = await tokenContract.approve(this.contractAddress, maxApproval);
                
                this.notificationSystem.show(`⏳ Attente confirmation approbation...`, 'info');
                await approveTx.wait();
                this.notificationSystem.show(`✅ ${tokenSymbol} approuvé`, 'success');
                
                // Attendre la propagation
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // Estimation du gas
            let gasEstimate;
            try {
                gasEstimate = await this.contract.deposit.estimateGas(tokenAddress, amountWei);
                console.log('Gas estimé pour dépôt:', gasEstimate.toString());
            } catch (gasError) {
                console.warn('Impossible d\'estimer le gas:', gasError);
                gasEstimate = 200000;
            }

            // Exécution du dépôt
            const depositTx = await this.contract.deposit(tokenAddress, amountWei, {
                gasLimit: Math.floor(Number(gasEstimate) * 1.2)
            });
            
            this.notificationSystem.show(`⏳ Dépôt en cours...`, 'info');
            
            const receipt = await depositTx.wait();
            console.log('Dépôt réussi:', receipt);
            
            this.notificationSystem.show(`✅ Dépôt réussi: ${amount} ${tokenSymbol}`, 'success');
            
            // Recharger les données
            await this.loadRealContractData();
            await this.loadUserBalances();
            this.updateStatsDisplay();

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
            // 🔧 CORRECTION: Vérifier que l'account existe
            if (!this.walletManager.account) {
                console.warn('⚠️ Account non disponible, skip getUserPosition');
                return;
            }

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

    // 🔧 FONCTION CORRIGÉE: Charger les soldes avec adresses dynamiques
    async loadUserBalances() {
        if (!this.walletManager.isConnected) return;

        const ethers = window.ethers;

        try {
            // Utiliser les adresses du contrat
            const contractTokens = await this.loadContractTokenAddresses();
            if (!contractTokens) {
                console.warn('Impossible de récupérer les adresses des tokens du contrat');
                // Fallback sur les anciennes adresses si pas de contrat
                contractTokens = {
                    USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
                    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
                };
            }

            const { getABI } = await import('../config.js');
            const erc20ABI = getABI('ERC20');

            const formatUnits = ethers.formatUnits || ethers.utils.formatUnits;

            for (const [symbol, address] of Object.entries(contractTokens)) {
                try {
                    const contract = new ethers.Contract(address, erc20ABI, this.walletManager.provider);
                    const balance = await contract.balanceOf(this.walletManager.account);
                    const formattedBalance = formatUnits(balance, 6);
                    this.userBalances[symbol] = parseFloat(formattedBalance);
                    console.log(`Balance ${symbol}:`, formattedBalance);
                } catch (tokenError) {
                    console.error(`Erreur balance ${symbol}:`, tokenError);
                    this.userBalances[symbol] = 0;
                }
            }

        } catch (error) {
            console.error('Erreur chargement soldes:', error);
        }
    }

    // Ajoutez ces méthodes à la classe FlashLoanStrategy
    getPositions() {
        return [
            {
                token: 'USDC',
                amount: this.contractData.userUsdcShares,
                value: this.contractData.userUsdcShares,
                apy: this.getAPR()
            },
            {
                token: 'USDT',
                amount: this.contractData.userUsdtShares,
                value: this.contractData.userUsdtShares,
                apy: this.getAPR()
            }
        ];
    }

    calculateMetrics() {
        return {
            totalValue: this.contractData.totalUSDCDeposits + this.contractData.totalUSDTDeposits,
            totalProfit: this.stats.totalProfit,
            apy: this.getAPR(),
            successRate: this.getSuccessRate()
        };
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
            contractTokenAddresses: this.contractTokenAddresses,
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

    // 🆕 MÉTHODES POUR ADMINISTRATION DU CONTRAT (si vous êtes owner)
    async updateContractTokenAddresses(newUSDC, newUSDT) {
        if (!this.contract) {
            console.log('❌ Contrat non initialisé');
            return false;
        }

        try {
            console.log('🔧 Mise à jour des adresses tokens...');
            console.log('Nouvelle USDC:', newUSDC);
            console.log('Nouvelle USDT:', newUSDT);
            
            const tx = await this.contract.setTokenAddresses(newUSDC, newUSDT);
            console.log('Transaction envoyée:', tx.hash);
            
            const receipt = await tx.wait();
            console.log('✅ Adresses tokens mises à jour!');
            
            // Recharger la configuration
            await this.loadContractTokenAddresses();
            await this.loadUserBalances();
            
            this.notificationSystem.show('✅ Adresses tokens mises à jour', 'success');
            return true;
        } catch (error) {
            console.error('❌ Erreur mise à jour tokens:', error);
            this.notificationSystem.show('❌ Erreur mise à jour tokens', 'error');
            return false;
        }
    }

    async setTokenAuthorization(tokenAddress, authorized) {
        if (!this.contract) {
            console.log('❌ Contrat non initialisé');
            return false;
        }

        try {
            const tx = await this.contract.setTokenAuthorization(tokenAddress, authorized);
            await tx.wait();
            
            console.log(`✅ Token ${tokenAddress} ${authorized ? 'autorisé' : 'désautorisé'}`);
            this.notificationSystem.show(`✅ Token ${authorized ? 'autorisé' : 'désautorisé'}`, 'success');
            return true;
        } catch (error) {
            console.error('❌ Erreur autorisation token:', error);
            this.notificationSystem.show('❌ Erreur autorisation token', 'error');
            return false;
        }
    }

} // FIN DE LA CLASSE FlashLoanStrategy

// ======================================
// FONCTIONS D'EXPORT ET D'INITIALISATION
// ======================================

// Fonction d'initialisation spécifique à votre setup
export function initializeFlashLoanStrategy(walletManager) {
    try {
        const strategy = new FlashLoanStrategy(walletManager);
        
        // Exposer globalement pour debug
        if (typeof window !== 'undefined') {
            window.flashLoanStrategy = strategy;
            
            // 🆕 FONCTIONS DE DEBUG SUPPLÉMENTAIRES
            window.debugFlashLoan = () => {
                console.log('🔍 Flash Loan Debug Info:');
                console.table(strategy.getDebugInfo());
                return strategy.getDebugInfo();
            };
            
            window.testFlashLoanContract = () => strategy.testContractConnection();
            
            // 🆕 FONCTIONS D'ADMINISTRATION (si vous êtes owner)
            window.updateFlashLoanTokens = async (usdc, usdt) => {
                return await strategy.updateContractTokenAddresses(usdc, usdt);
            };
            
            window.authorizeToken = async (tokenAddress, authorized = true) => {
                return await strategy.setTokenAuthorization(tokenAddress, authorized);
            };
            
            // 🆕 FONCTIONS DE TEST RAPIDE
            window.testUSDCNative = async () => {
                const usdcNative = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174";
                return await strategy.isTokenAllowed(usdcNative);
            };
            
            window.testUSDCBridged = async () => {
                const usdcBridged = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359";
                return await strategy.isTokenAllowed(usdcBridged);
            };
        }
        
        console.log('🚀 Flash Loan Strategy initialisée - Version COMPLÈTE CORRIGÉE');
        return strategy;
    } catch (error) {
        console.error('❌ Erreur initialisation Flash Loan Strategy:', error);
        throw error;
    }
}

// Export par défaut pour votre architecture modulaire
export default FlashLoanStrategy;