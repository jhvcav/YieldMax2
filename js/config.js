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
    flashloan: {
        polygon: {
            // À implémenter - contrats Flash Loan
            aavePool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
            uniswapV3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
            sushiswapFactory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
            quickswapFactory: "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32"
        }
    }
};

export const TOKENS = {
    polygon: {
        WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
        USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC Native
        USDC_BRIDGED: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e
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

// Validation de configuration
export function validateConfig() {
    const requiredNetworks = ['polygon'];
    const requiredContracts = ['aave'];
    
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
    
    if (errors.length > 0) {
        console.error('Erreurs de configuration:', errors);
        return false;
    }
    
    console.log('✅ Configuration validée avec succès');
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
    getNetworkConfig,
    getContractConfig,
    getTokenConfig,
    getABI,
    getDEXConfig,
    validateConfig
};