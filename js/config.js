// ===== YieldMax2 Configuration =====

export const NETWORKS = {
    polygon: {
        chainId: 137,
        name: 'Polygon',
        currency: 'MATIC',
        rpc: 'https://polygon-rpc.com/',
        explorer: 'https://polygonscan.com/',
        hex: '0x89'
    },
    ethereum: {
        chainId: 1,
        name: 'Ethereum',
        currency: 'ETH',
        rpc: 'https://mainnet.infura.io/v3/',
        explorer: 'https://etherscan.io/',
        hex: '0x1'
    },
    arbitrum: {
        chainId: 42161,
        name: 'Arbitrum One',
        currency: 'ETH',
        rpc: 'https://arb1.arbitrum.io/rpc',
        explorer: 'https://arbiscan.io/',
        hex: '0xa4b1'
    }
};

export const CONTRACTS = {
    aave: {
        polygon: {
            pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
            priceOracle: "0xb023e699F5a33916Ea823A16485e259257cA8Bd1",
            dataProvider: "0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654",
            assets: {
                USDC: {
                    address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e
                    aToken: "0x625E7708f30cA75bfd92586e17077590C60eb4cD",
                    decimals: 6,
                    symbol: "USDC"
                },
                USDC_NATIVE: {
                    address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC Native
                    aToken: "0x625E7708f30cA75bfd92586e17077590C60eb4cD", // Même aToken pour l'instant
                    decimals: 6,
                    symbol: "USDC"
                },
                WETH: {
                    address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
                    aToken: "0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8",
                    decimals: 18,
                    symbol: "WETH"
                },
                WMATIC: {
                    address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
                    aToken: "0x6d80113e533a2C0fe82EaBD35f1875DcEA89Ea97",
                    decimals: 18,
                    symbol: "WMATIC"
                },
                WBTC: {
                    address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",
                    aToken: "0x078f358208685046a11C85e8ad32895DED33A249",
                    decimals: 8,
                    symbol: "WBTC"
                }
            }
        }
    },
    
    // 🆕 CONFIGURATION FLASH LOAN DÉPLOYÉ
    flashloan: {
        polygon: {
            // Contrat principal Flash Loan déployé
            arbitrage: "0x78d214d088CEe374705c0303fB360046DAf0B466",
            
            // Contrats Aave pour Flash Loans
            aaveAddressProvider: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
            aavePool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
            
            // Tokens supportés pour Flash Loans
            supportedTokens: {
                USDC: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
                USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"
            },
            
            // DEX autorisés
            authorizedDEXs: {
                quickswap: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",
                sushiswap: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506"
            },
            
            // Configuration des limites
            limits: {
                maxFlashLoanAmount: "1000000000000", // 1M USDC (6 decimales)
                minDepositAmount: "100000000",       // 100 USDC
                platformFeeBps: 100,                 // 1%
                trustedWalletFeeBps: 50             // 0.5%
            },
            
            // Deployed info
            deployedAt: "2025-01-27",
            deployer: "0x1FF70C1DFc33F5DDdD1AD2b525a07b172182d8eF",
            blockNumber: 65478432,
            verified: true
        }
    }
};

export const TOKENS = {
    polygon: {
        WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
        USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC Native
        USDC_BRIDGED: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e
        USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // USDT
        WMATIC: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
        WBTC: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6"
    }
};

export const ABIS = {
    ERC20: [
        "function balanceOf(address account) view returns (uint256)",
        "function approve(address spender, uint256 amount) returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)",
        "function transfer(address to, uint256 amount) returns (bool)"
    ],
    
    AAVE_POOL: [
        "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
        "function withdraw(address asset, uint256 amount, address to) external returns (uint256)",
        "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)"
    ],
    
    AAVE_DATA_PROVIDER: [
        "function getReserveData(address asset) external view returns (tuple(uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 lastUpdateTimestamp, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint8 id))"
    ],
    
    // 🆕 ABI FLASH LOAN CONTRACT
    FLASHLOAN_ARBITRAGE: [
        // Fonctions de dépôt/retrait
        "function deposit(address token, uint256 amount) external",
        "function withdraw(address token, uint256 shares) external",
        "function calculateShares(address token, uint256 amount) view returns (uint256)",
        
        // Fonctions d'arbitrage
        "function executeArbitrage(tuple(address tokenA, address tokenB, address dexRouter1, address dexRouter2, uint256 amountIn, uint256 minProfitBps, bool reverseDirection, uint256 maxSlippage, uint256 deadline) params) external",
        "function calculateExpectedProfit(tuple(address tokenA, address tokenB, address dexRouter1, address dexRouter2, uint256 amountIn, uint256 minProfitBps, bool reverseDirection, uint256 maxSlippage, uint256 deadline) params) view returns (uint256)",
        
        // Fonctions de vue
        "function getUserPosition(address user) view returns (tuple(uint256 usdcShares, uint256 usdtShares, uint256 totalDeposited, uint256 totalWithdrawn, uint256 totalProfits, uint256 lastDepositTime, uint256 depositCount, uint256 withdrawalCount))",
        "function getPoolMetrics() view returns (tuple(uint256 totalUSDCDeposits, uint256 totalUSDTDeposits, uint256 totalUSDCShares, uint256 totalUSDTShares, uint256 totalProfits, uint256 totalVolume, uint256 successfulTrades, uint256 failedTrades, uint256 lastUpdateTime))",
        "function calculateFees(uint256 profit) view returns (uint256 platformFee, uint256 trustedWalletFee, uint256 userProfit)",
        
        // Fonctions d'administration
        "function owner() view returns (address)",
        "function trustedWallet() view returns (address)",
        "function platformFeeBps() view returns (uint256)",
        "function authorizedTokens(address) view returns (bool)",
        "function authorizedDEXs(address) view returns (bool)",
        
        // Événements
        "event Deposit(address indexed user, address indexed token, uint256 amount, uint256 shares, uint256 timestamp)",
        "event Withdrawal(address indexed user, address indexed token, uint256 amount, uint256 shares, uint256 timestamp)",
        "event ArbitrageExecuted(address indexed user, address indexed asset, uint256 flashAmount, uint256 profit, uint256 userProfit, uint256 platformFee, uint256 gasUsed, uint256 timestamp)"
    ],
    
    FLASHLOAN_RECEIVER: [
        "function ADDRESSES_PROVIDER() external view returns (address)",
        "function POOL() external view returns (address)",
        "function executeOperation(address[] calldata assets, uint256[] calldata amounts, uint256[] calldata premiums, address initiator, bytes calldata params) external returns (bool)"
    ]
};

export const DEX_CONFIGS = {
    polygon: {
        uniswapV3: {
            factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
            router: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
            quoter: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
            fees: [500, 3000, 10000] // 0.05%, 0.3%, 1%
        },
        sushiswap: {
            factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
            router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506"
        },
        quickswap: {
            factory: "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32",
            router: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff"
        }
    }
};

export const SETTINGS = {
    // Délais et timeouts
    TRANSACTION_TIMEOUT: 300000, // 5 minutes
    BALANCE_REFRESH_INTERVAL: 30000, // 30 secondes
    PRICE_UPDATE_INTERVAL: 10000, // 10 secondes
    
    // Gas et frais
    DEFAULT_GAS_LIMIT: 500000,
    AAVE_GAS_LIMIT: 300000,
    FLASHLOAN_GAS_LIMIT: 2000000,
    GAS_PRICE_MULTIPLIER: 1.2,
    
    // 🆕 PARAMÈTRES FLASH LOAN
    FLASHLOAN: {
        // Seuils de profitabilité
        MIN_PROFIT_USD: 10,          // $10 minimum
        MIN_PROFIT_BPS: 10,          // 0.1% minimum
        
        // Slippage et sécurité
        MAX_SLIPPAGE_BPS: 50,        // 0.5% max
        DEFAULT_SLIPPAGE_BPS: 30,    // 0.3% par défaut
        
        // Surveillance
        MONITORING_INTERVAL: 5000,   // 5 secondes
        OPPORTUNITY_CACHE_TTL: 30000, // 30 secondes
        
        // Limites par sécurité
        MAX_TRADE_SIZE_USD: 100000,  // $100k max par trade
        DAILY_TRADE_LIMIT: 10,       // 10 trades par jour max
        
        // Configuration UI
        AUTO_REFRESH_OPPORTUNITIES: true,
        SHOW_ADVANCED_SETTINGS: false,
        ENABLE_NOTIFICATIONS: true
    },
    
    // Seuils et limites
    MIN_FLASHLOAN_PROFIT: 10, // $10 minimum
    MAX_SLIPPAGE: 0.005, // 0.5%
    BALANCE_PRECISION: 6,
    
    // Interface
    NOTIFICATION_DURATION: 5000, // 5 secondes
    ANIMATION_DURATION: 300, // 0.3 secondes
    DEBOUNCE_DELAY: 500, // 0.5 secondes
    
    // LocalStorage
    STORAGE_PREFIX: 'yieldmax2_',
    DATA_VERSION: '2.0.0'
};

export const EXTERNAL_APIS = {
    // Prix des tokens
    coingecko: {
        baseUrl: 'https://api.coingecko.com/api/v3',
        endpoints: {
            prices: '/simple/price',
            tokenInfo: '/coins'
        }
    },
    
    // 🆕 APIs pour Flash Loan
    dex: {
        // APIs pour récupérer les prix en temps réel
        quickswap: {
            subgraph: 'https://api.thegraph.com/subgraphs/name/sameepsi/quickswap06'
        },
        sushiswap: {
            subgraph: 'https://api.thegraph.com/subgraphs/name/sushiswap/exchange-polygon'
        },
        uniswapV3: {
            subgraph: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3-polygon'
        }
    },
    
    // Données DeFi
    defipulse: {
        baseUrl: 'https://api.defipulse.com/v1',
        rateLimit: 300 // requests per hour
    },
    
    // Données Aave
    aave: {
        subgraph: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-polygon'
    }
};

// 🆕 HELPER FUNCTIONS POUR FLASH LOAN
export const FLASHLOAN_HELPERS = {
    // Convertir les montants avec décimales
    formatAmount: (amount, decimals = 6) => {
        return (BigInt(amount) * BigInt(10 ** decimals)).toString();
    },
    
    // Parser les montants depuis le contrat
    parseAmount: (amount, decimals = 6) => {
        return Number(BigInt(amount) / BigInt(10 ** decimals));
    },
    
    // Calculer le profit en pourcentage
    calculateProfitPercent: (profit, principal) => {
        return (profit / principal) * 100;
    },
    
    // Vérifier si une opportunité est rentable
    isProfitable: (profit, gasEstimate, gasPrice) => {
        const gasCost = gasEstimate * gasPrice;
        const gasCostUSD = gasCost * 0.8; // Estimation MATIC price
        return profit > (gasCostUSD + SETTINGS.FLASHLOAN.MIN_PROFIT_USD);
    },
    
    // Générer les paramètres d'arbitrage
    createArbitrageParams: (tokenA, tokenB, dex1, dex2, amount, minProfit = 10) => {
        return {
            tokenA,
            tokenB,
            dexRouter1: dex1,
            dexRouter2: dex2,
            amountIn: FLASHLOAN_HELPERS.formatAmount(amount),
            minProfitBps: minProfit,
            reverseDirection: false,
            maxSlippage: SETTINGS.FLASHLOAN.DEFAULT_SLIPPAGE_BPS,
            deadline: Math.floor(Date.now() / 1000) + 1800 // 30 minutes
        };
    }
};

// Utilitaires de configuration
export function getNetworkConfig(networkName) {
    return NETWORKS[networkName] || NETWORKS.polygon;
}

export function getContractConfig(protocol, networkName = 'polygon') {
    return CONTRACTS[protocol]?.[networkName];
}

export function getTokenConfig(networkName = 'polygon') {
    return TOKENS[networkName] || TOKENS.polygon;
}

export function getABI(contractType) {
    return ABIS[contractType] || [];
}

export function getDEXConfig(networkName = 'polygon') {
    return DEX_CONFIGS[networkName] || DEX_CONFIGS.polygon;
}

// 🆕 FONCTION POUR RÉCUPÉRER LA CONFIG FLASH LOAN
export function getFlashLoanConfig(networkName = 'polygon') {
    return CONTRACTS.flashloan[networkName];
}

// 🆕 FONCTION POUR VÉRIFIER SI LE FLASH LOAN EST DISPONIBLE
export function isFlashLoanAvailable(networkName = 'polygon') {
    const config = getFlashLoanConfig(networkName);
    return config && config.arbitrage && config.verified;
}

// Validation de configuration
export function validateConfig() {
    const requiredNetworks = ['polygon'];
    const requiredContracts = ['aave', 'flashloan'];
    
    const errors = [];
    
    // Vérifier les réseaux
    for (const network of requiredNetworks) {
        if (!NETWORKS[network]) {
            errors.push(`Réseau manquant: ${network}`);
        }
    }
    
    // Vérifier les contrats
    for (const contract of requiredContracts) {
        if (!CONTRACTS[contract]) {
            errors.push(`Contrat manquant: ${contract}`);
        }
    }
    
    // 🆕 Vérifier la configuration Flash Loan
    const flashLoanConfig = getFlashLoanConfig();
    if (!flashLoanConfig || !flashLoanConfig.arbitrage) {
        errors.push('Configuration Flash Loan incomplète');
    }
    
    if (errors.length > 0) {
        console.error('Erreurs de configuration:', errors);
        return false;
    }
    
    console.log('✅ Configuration validée avec succès');
    console.log('🚀 Flash Loan disponible:', isFlashLoanAvailable());
    return true;
}

// Export par défaut pour usage simple
export default {
    NETWORKS,
    CONTRACTS,
    TOKENS,
    ABIS,
    DEX_CONFIGS,
    SETTINGS,
    EXTERNAL_APIS,
    FLASHLOAN_HELPERS,
    getNetworkConfig,
    getContractConfig,
    getTokenConfig,
    getABI,
    getDEXConfig,
    getFlashLoanConfig,
    isFlashLoanAvailable,
    validateConfig
};