// Aave Strategy - Migration de votre code fonctionnel

import BaseStrategy from './base-strategy.js';
import { getContractConfig, getABI, TOKENS, SETTINGS } from '../config.js';

class AaveStrategy extends BaseStrategy {
    constructor(app) {
        super(app, {
            name: 'Aave Lending',
            slug: 'aave'
        });
        
        // Configuration Aave spécifique
        this.aaveConfig = null;
        this.tokenBalances = {};
        this.depositHistory = [];
        this.provider = null;
        this.contracts = {};
        
        console.log('🏦 AaveStrategy initialisée');
    }

    
    //Charger la configuration Aave
    async loadConfiguration() {
        await super.loadConfiguration();
        
        // Configuration Aave V3 Polygon (votre configuration existante)
        this.aaveConfig = {
            POOL: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
            PRICE_ORACLE: "0xb023e699F5a33916Ea823A16485e259257cA8Bd1",
            DATA_PROVIDER: "0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654",
            ASSETS: {
                USDC: {
                    address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e
                    aToken: "0x625E7708f30cA75bfd92586e17077590C60eb4cD",
                    decimals: 6,
                    symbol: "USDC"
                },
                USDC_NATIVE: {
                    address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC Native
                    aToken: "0x625E7708f30cA75bfd92586e17077590C60eb4cD",
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
        };
        
        // Initialiser les contrats
        this.initializeContracts();
    }

    /**
     * Initialiser les contrats Aave
     */
    initializeContracts() {
        if (!this.walletManager.provider) return;
        
        this.provider = this.walletManager.provider;
        
        // Contrats Aave
        this.contracts.pool = new ethers.Contract(
            this.aaveConfig.POOL,
            getABI('AAVE_POOL'),
            this.provider
        );
        
        this.contracts.dataProvider = new ethers.Contract(
            this.aaveConfig.DATA_PROVIDER,
            getABI('AAVE_DATA_PROVIDER'),
            this.provider
        );
    }

    /**
     * Charger les soldes des tokens (votre logique existante)
     */
    async loadBalances() {
        if (!this.walletManager.isConnected) return;

        try {
            console.log('🔍 Chargement des soldes Aave...');
            
            // Charger le solde MATIC natif
            const nativeBalance = await this.walletManager.getNativeBalance();
            this.tokenBalances.NATIVE = nativeBalance;
            
            console.log(`💰 MATIC Natif: ${nativeBalance}`);
            
            // Charger les soldes des tokens ERC20
            for (const [key, asset] of Object.entries(this.aaveConfig.ASSETS)) {
                try {
                    const tokenContract = new ethers.Contract(
                        asset.address, 
                        getABI('ERC20'), 
                        this.provider
                    );
                    
                    const balance = await tokenContract.balanceOf(this.walletManager.currentAccount);
                    const formattedBalance = ethers.formatUnits(balance, asset.decimals);
                    this.tokenBalances[key] = formattedBalance;
                    
                    console.log(`💰 ${asset.symbol}: ${formattedBalance}`);
                    
                    await this.delay(100); // Anti rate-limit
                } catch (error) {
                    console.error(`❌ Erreur chargement solde ${asset.symbol}:`, error);
                    this.tokenBalances[key] = "0.0";
                }
            }
            
            // Vérifier USDC Native séparément
            try {
                const usdcNativeContract = new ethers.Contract(
                    TOKENS.polygon.USDC, 
                    getABI('ERC20'), 
                    this.provider
                );
                
                const usdcNativeBalance = await usdcNativeContract.balanceOf(
                    this.walletManager.currentAccount
                );
                const formattedUsdcNative = ethers.formatUnits(usdcNativeBalance, 6);
                this.tokenBalances.USDC_NATIVE = formattedUsdcNative;
                
                console.log(`💰 USDC Native: ${formattedUsdcNative}`);
            } catch (error) {
                console.error('❌ Erreur chargement USDC Native:', error);
                this.tokenBalances.USDC_NATIVE = "0.0";
            }
            
            this.balances = { ...this.tokenBalances };
            console.log('✅ Tous les soldes Aave chargés');
            
        } catch (error) {
            console.error('❌ Erreur lors du chargement des soldes Aave:', error);
            this.notificationSystem.error('Erreur lors du chargement des soldes');
        }
    }

    /**
     * Obtenir le meilleur solde USDC (votre logique existante)
     */
    getBestUSDCBalance() {
        const usdcBalance = parseFloat(this.tokenBalances.USDC || "0");
        const usdcNativeBalance = parseFloat(this.tokenBalances.USDC_NATIVE || "0");
        
        console.log('🔍 Comparaison soldes USDC:');
        console.log(`USDC.e: ${usdcBalance}`);
        console.log(`USDC Native: ${usdcNativeBalance}`);
        
        if (usdcNativeBalance > 0) {
            return { 
                balance: usdcNativeBalance, 
                type: 'NATIVE', 
                address: TOKENS.polygon.USDC 
            };
        } else if (usdcBalance > 0) {
            return { 
                balance: usdcBalance, 
                type: 'BRIDGED', 
                address: this.aaveConfig.ASSETS.USDC.address 
            };
        } else {
            return { balance: 0, type: 'NONE', address: null };
        }
    }

    /**
     * Déployer la stratégie Aave (votre logique existante adaptée)
     */
    async deploy(params) {
        const { asset, amount } = params;
        
        return await this.executeTransaction(async () => {
            console.log(`🏦 Déploiement Aave: ${amount} ${asset}`);
            
            // Valider les paramètres
            if (!amount || parseFloat(amount) <= 0) {
                throw new Error('Montant invalide');
            }
            
            // Obtenir la configuration de l'asset
            let assetInfo, tokenAddress, availableBalance;
            
            if (asset === 'usdc') {
                const usdcInfo = this.getBestUSDCBalance();
                availableBalance = usdcInfo.balance;
                tokenAddress = usdcInfo.address;
                
                if (!tokenAddress) {
                    throw new Error('Aucun USDC trouvé! Transférez de l\'USDC vers votre wallet.');
                }
                
                assetInfo = usdcInfo.type === 'NATIVE' ? 
                    { address: tokenAddress, symbol: 'USDC', decimals: 6, aToken: this.aaveConfig.ASSETS.USDC.aToken } :
                    this.aaveConfig.ASSETS.USDC;
            } else {
                availableBalance = parseFloat(this.tokenBalances[asset.toUpperCase()] || "0");
                assetInfo = this.aaveConfig.ASSETS[asset.toUpperCase()];
                tokenAddress = assetInfo.address;
            }
            
            // Vérifier le solde
            if (parseFloat(amount) > availableBalance) {
                throw new Error(`Solde insuffisant! Disponible: ${availableBalance.toFixed(6)} ${assetInfo.symbol}`);
            }
            
            const signer = await this.provider.getSigner();
            const amountInWei = ethers.parseUnits(amount, assetInfo.decimals);
            
            let tx;
            
            if (asset === 'weth') {
                // Logique WETH spéciale (conversion MATIC si nécessaire)
                const wethBalance = parseFloat(this.tokenBalances.WETH || "0");
                
                if (wethBalance >= parseFloat(amount)) {
                    // Utiliser WETH existant
                    const wethContract = new ethers.Contract(assetInfo.address, getABI('ERC20'), signer);
                    
                    const approveTx = await wethContract.approve(this.aaveConfig.POOL, amountInWei);
                    await approveTx.wait();
                    
                    const poolContract = new ethers.Contract(this.aaveConfig.POOL, getABI('AAVE_POOL'), signer);
                    tx = await poolContract.supply(assetInfo.address, amountInWei, this.walletManager.currentAccount, 0);
                } else {
                    // Convertir MATIC -> WETH
                    const WETH_ABI = [
                        "function deposit() payable",
                        "function approve(address spender, uint256 amount) returns (bool)"
                    ];
                    
                    const wethContract = new ethers.Contract(assetInfo.address, WETH_ABI, signer);
                    
                    // Convertir
                    const depositTx = await wethContract.deposit({ value: amountInWei });
                    await depositTx.wait();
                    
                    // Approuver
                    const approveTx = await wethContract.approve(this.aaveConfig.POOL, amountInWei);
                    await approveTx.wait();
                    
                    // Déposer
                    const poolContract = new ethers.Contract(this.aaveConfig.POOL, getABI('AAVE_POOL'), signer);
                    tx = await poolContract.supply(assetInfo.address, amountInWei, this.walletManager.currentAccount, 0);
                }
            } else {
                // Autres tokens
                const tokenContract = new ethers.Contract(tokenAddress, getABI('ERC20'), signer);
                
                // Approuver
                const approveTx = await tokenContract.approve(this.aaveConfig.POOL, amountInWei);
                await approveTx.wait();
                
                await this.delay(2000); // Délai entre approve et supply
                
                // Déposer
                const poolContract = new ethers.Contract(this.aaveConfig.POOL, getABI('AAVE_POOL'), signer);
                tx = await poolContract.supply(tokenAddress, amountInWei, this.walletManager.currentAccount, 0, {
                    gasLimit: SETTINGS.AAVE_GAS_LIMIT
                });
            }
            
            console.log('📤 Transaction Aave envoyée:', tx.hash);
            
            const receipt = await this.walletManager.waitForTransaction(tx.hash);
            
            // Enregistrer le dépôt
            this.captureNewDeposit(asset, amount, tx.hash);
            
            // Ajouter à l'historique
            this.addToHistory({
                type: 'deposit',
                action: 'aave_deposit',
                asset: assetInfo.symbol,
                amount: parseFloat(amount),
                hash: tx.hash
            });
            
            console.log('✅ Dépôt Aave confirmé!', receipt.hash);
            return receipt;
            
        }, `Dépôt ${amount} ${asset.toUpperCase()} sur Aave`);
    }

    /**
     * Récupérer les positions Aave (votre logique existante)
     */
    async getPositions() {
        if (!this.walletManager.isConnected) return [];
        
        try {
            console.log('📡 Récupération des positions Aave...');
            
            // Vérifier le réseau
            const network = await this.provider.getNetwork();
            const currentChainId = Number(network.chainId);
            
            if (currentChainId !== 137) { // Polygon
                console.log('⚠️ Mauvais réseau pour Aave');
                this.notificationSystem.warning('Changez vers le réseau Polygon');
                return [];
            }
            
            // Récupérer les données du compte
            const accountData = await this.contracts.pool.getUserAccountData(
                this.walletManager.currentAccount
            );
            
            console.log('📊 Données compte Aave:', {
                totalCollateralBase: accountData.totalCollateralBase.toString(),
                totalDebtBase: accountData.totalDebtBase.toString()
            });
            
            // Convertir en USD (8 décimales)
            const totalCollateralUSD = ethers.formatUnits(accountData.totalCollateralBase, 8);
            const currentValue = parseFloat(totalCollateralUSD);
            
            if (currentValue === 0) {
                console.log('ℹ️ Aucune position Aave trouvée');
                return [];
            }
            
            // Charger l'historique des dépôts
            await this.loadDepositHistory();
            
            // Calculer les gains
            const totalInitialDeposit = this.depositHistory.reduce((sum, entry) => sum + entry.amount, 0);
            const earnings = currentValue - totalInitialDeposit;
            const earningsPercentage = (earnings / totalInitialDeposit) * 100;
            
            // Créer la position
            const position = {
                id: 'aave-main-position',
                strategy: 'Aave Lending',
                asset: 'USDC Supply',
                amount: currentValue.toFixed(6),
                initialAmount: totalInitialDeposit.toFixed(6),
                earnings: earnings.toFixed(6),
                earningsPercentage: earningsPercentage.toFixed(2),
                apr: await this.getCurrentAPY(),
                status: 'active',
                aToken: this.aaveConfig.ASSETS.USDC.aToken,
                lastUpdate: new Date().toISOString()
            };
            
            console.log('✅ Position Aave récupérée:', position);
            return [position];
            
        } catch (error) {
            console.error('❌ Erreur récupération positions Aave:', error);
            return [];
        }
    }

    /**
     * Charger l'historique des dépôts (votre logique existante)
     */
    async loadDepositHistory() {
        try {
            const saved = localStorage.getItem('aaveDepositHistory');
            if (saved) {
                this.depositHistory = JSON.parse(saved);
            } else {
                this.depositHistory = [];
            }
        } catch (error) {
            console.error('❌ Erreur chargement historique dépôts:', error);
            this.depositHistory = [];
        }
    }

    /**
     * Capturer un nouveau dépôt (votre logique existante)
     */
    captureNewDeposit(asset, amount, txHash) {
        const newDeposit = {
            id: Date.now(),
            date: new Date().toISOString(),
            asset: asset.toUpperCase(),
            amount: parseFloat(amount),
            apy: 3.71, // APY par défaut
            txHash: txHash,
            notes: 'Dépôt via YieldMax2'
        };
        
        this.depositHistory.push(newDeposit);
        localStorage.setItem('aaveDepositHistory', JSON.stringify(this.depositHistory));
        
        console.log('💾 Nouveau dépôt Aave enregistré:', newDeposit);
    }

    //Obtenir l'APY actuel
    async getCurrentAPY() {
        try {
            const reserveData = await this.contracts.dataProvider.getReserveData(
                this.aaveConfig.ASSETS.USDC.address
            );
            
            if (reserveData && reserveData.liquidityRate) {
                const apyRaw = reserveData.liquidityRate;
                const currentAPY = parseFloat(ethers.formatUnits(apyRaw, 27)) * 100;
                return currentAPY.toFixed(2);
            }
            
            return '3.71'; // Valeur par défaut
        } catch (error) {
            console.warn('⚠️ Impossible de récupérer l\'APY:', error);
            return '3.71';
        }
    }

    /**
     * Calculer les métriques
     */
    async calculateMetrics() {
        try {
            const positions = await this.getPositions();
            
            if (positions.length === 0) {
                this.metrics = {
                    totalValue: 0,
                    totalPnL: 0,
                    averageAPR: 0,
                    positionsCount: 0,
                    lastUpdate: new Date().toISOString()
                };
                return;
            }
            
            const position = positions[0];
            
            this.metrics = {
                totalValue: parseFloat(position.amount),
                totalPnL: parseFloat(position.earnings),
                averageAPR: parseFloat(position.apr),
                positionsCount: 1,
                dailyYield: (parseFloat(position.amount) * parseFloat(position.apr) / 100 / 365).toFixed(6),
                monthlyYield: (parseFloat(position.amount) * parseFloat(position.apr) / 100 / 12).toFixed(4),
                lastUpdate: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('❌ Erreur calcul métriques Aave:', error);
            this.metrics = {};
        }
    }

    //Fermer une position (retrait complet)
    async closePosition(positionId) {
        return await this.executeTransaction(async () => {
            console.log('🔄 Fermeture position Aave...');
            
            // Récupérer la valeur actuelle
            const accountData = await this.contracts.pool.getUserAccountData(
                this.walletManager.currentAccount
            );
            
            const totalCollateralUSD = ethers.formatUnits(accountData.totalCollateralBase, 8);
            const currentValue = parseFloat(totalCollateralUSD);
            
            if (currentValue <= 0) {
                throw new Error('Aucune position à retirer');
            }
            
            const signer = await this.provider.getSigner();
            const poolContract = new ethers.Contract(this.aaveConfig.POOL, getABI('AAVE_POOL'), signer);
            
            // Retrait complet (uint256.max)
            const tx = await poolContract.withdraw(
                this.aaveConfig.ASSETS.USDC.address,
                ethers.MaxUint256,
                this.walletManager.currentAccount
            );
            
            const receipt = await this.walletManager.waitForTransaction(tx.hash);
            
            // Enregistrer le retrait
            const withdrawalEntry = {
                id: Date.now(),
                date: new Date().toISOString(),
                asset: 'USDC',
                amount: -currentValue,
                apy: 0,
                txHash: receipt.hash,
                notes: 'Retrait complet de la position'
            };
            
            this.depositHistory.push(withdrawalEntry);
            localStorage.setItem('aaveDepositHistory', JSON.stringify(this.depositHistory));
            
            // Ajouter à l'historique
            this.addToHistory({
                type: 'withdrawal',
                action: 'aave_withdrawal_complete',
                amount: currentValue,
                hash: tx.hash
            });
            
            console.log('✅ Position Aave fermée:', receipt.hash);
            return receipt;
            
        }, 'Retrait complet de la position Aave');
    }

    /**
     * Retirer seulement les gains
     */
    async withdrawEarnings() {
        return await this.executeTransaction(async () => {
            console.log('🔄 Retrait des gains Aave...');
            
            // Calculer les gains
            const accountData = await this.contracts.pool.getUserAccountData(
                this.walletManager.currentAccount
            );
            
            const totalCollateralUSD = ethers.formatUnits(accountData.totalCollateralBase, 8);
            const currentValue = parseFloat(totalCollateralUSD);
            
            await this.loadDepositHistory();
            const totalInitialDeposit = this.depositHistory.reduce((sum, entry) => sum + entry.amount, 0);
            const earnings = currentValue - totalInitialDeposit;
            
            if (earnings <= 0) {
                throw new Error('Aucun gain à récupérer');
            }
            
            const signer = await this.provider.getSigner();
            const poolContract = new ethers.Contract(this.aaveConfig.POOL, getABI('AAVE_POOL'), signer);
            
            // Retirer seulement les gains
            const earningsWithDecimals = ethers.parseUnits(earnings.toFixed(6), 6);
            
            const tx = await poolContract.withdraw(
                this.aaveConfig.ASSETS.USDC.address,
                earningsWithDecimals,
                this.walletManager.currentAccount
            );
            
            const receipt = await this.walletManager.waitForTransaction(tx.hash);
            
            // Enregistrer le retrait des gains
            const withdrawalEntry = {
                id: Date.now(),
                date: new Date().toISOString(),
                asset: 'USDC',
                amount: -earnings,
                apy: 0,
                txHash: receipt.hash,
                notes: 'Retrait des rendements accumulés'
            };
            
            this.depositHistory.push(withdrawalEntry);
            localStorage.setItem('aaveDepositHistory', JSON.stringify(this.depositHistory));
            
            this.addToHistory({
                type: 'withdrawal',
                action: 'aave_withdrawal_earnings',
                amount: earnings,
                hash: tx.hash
            });
            
            console.log('✅ Gains Aave retirés:', receipt.hash);
            return receipt;
            
        }, `Retrait des gains (${this.formatUSD(earnings)})`);
    }

    /**
     * Rendre l'interface utilisateur
     */
    renderUI() {
        if (!this.container) {
            console.error('❌ Container non défini pour Aave UI');
            return;
        }
        
        this.container.innerHTML = `
            <div class="aave-strategy-container">
                <!-- Header avec métriques -->
                <div class="strategy-metrics">
                    <div class="metrics-grid">
                        <div class="metric-card">
                            <div class="metric-icon">
                                <i class="fas fa-wallet"></i>
                            </div>
                            <div class="metric-content">
                                <span class="metric-label">Valeur Totale</span>
                                <span class="metric-value" id="aaveTotalValue">$0.00</span>
                            </div>
                        </div>
                        
                        <div class="metric-card">
                            <div class="metric-icon">
                                <i class="fas fa-chart-line"></i>
                            </div>
                            <div class="metric-content">
                                <span class="metric-label">Gains/Pertes</span>
                                <span class="metric-value" id="aavePnL">$0.00</span>
                            </div>
                        </div>
                        
                        <div class="metric-card">
                            <div class="metric-icon">
                                <i class="fas fa-percentage"></i>
                            </div>
                            <div class="metric-content">
                                <span class="metric-label">APY Actuel</span>
                                <span class="metric-value" id="aaveAPY">0.00%</span>
                            </div>
                        </div>
                        
                        <div class="metric-card">
                            <div class="metric-icon">
                                <i class="fas fa-coins"></i>
                            </div>
                            <div class="metric-content">
                                <span class="metric-label">Rendement/Jour</span>
                                <span class="metric-value" id="aaveDailyYield">$0.00</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Interface de dépôt -->
                <div class="deposit-section">
                    <h3><i class="fas fa-plus-circle"></i> Nouveau Dépôt</h3>
                    
                    <div class="deposit-form">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="aaveAssetSelect">Asset</label>
                                <select id="aaveAssetSelect" class="form-control">
                                    <option value="usdc">USDC</option>
                                    <option value="weth">WETH</option>
                                    <option value="wmatic">WMATIC</option>
                                    <option value="wbtc">WBTC</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="aaveAmount">Montant</label>
                                <div class="input-with-button">
                                    <input type="number" id="aaveAmount" class="form-control" 
                                           placeholder="0.000000" step="0.000001" min="0">
                                    <button id="aaveMaxBtn" class="max-btn">MAX</button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="balance-display" id="aaveBalanceDisplay">
                            <span class="balance-label">Solde disponible:</span>
                            <span class="balance-value">Connectez votre wallet</span>
                        </div>
                        
                        <div class="balance-error" id="aaveBalanceError">
                            <i class="fas fa-exclamation-triangle"></i>
                            <span>Message d'erreur</span>
                        </div>
                        
                        <button id="aaveDepositBtn" class="action-btn primary" disabled>
                            <i class="fas fa-plus-circle"></i>
                            Déposer sur Aave
                        </button>
                    </div>
                </div>
                
                <!-- Positions actuelles -->
                <div class="positions-section" id="aavePositionsSection" style="display: none;">
                    <div class="section-header">
                        <h3><i class="fas fa-layer-group"></i> Positions Actives</h3>
                        <div class="section-actions">
                            <button id="aaveRefreshBtn" class="action-btn secondary">
                                <i class="fas fa-sync-alt"></i>
                                Actualiser
                            </button>
                        </div>
                    </div>
                    
                    <div id="aavePositionsList" class="positions-list">
                        <!-- Les positions seront chargées dynamiquement -->
                    </div>
                </div>
            </div>
        `;
        
        // Initialiser les événements
        this.setupUIEvents();
        
        // Charger les données si wallet connecté
        if (this.walletManager.isConnected) {
            this.updateUI();
        }
        
        console.log('🎨 Interface Aave rendue');
    }

    /**
     * Configurer les événements UI
     */
    setupUIEvents() {
        // Bouton dépôt
        const depositBtn = document.getElementById('aaveDepositBtn');
        if (depositBtn) {
            depositBtn.addEventListener('click', async () => {
                const asset = document.getElementById('aaveAssetSelect')?.value;
                const amount = document.getElementById('aaveAmount')?.value;
                
                if (!asset || !amount || parseFloat(amount) <= 0) {
                    this.notificationSystem.warning('Veuillez saisir un montant valide');
                    return;
                }
                
                try {
                    await this.deploy({ asset, amount });
                    
                    // Vider le formulaire
                    document.getElementById('aaveAmount').value = '';
                    
                } catch (error) {
                    console.error('❌ Erreur dépôt:', error);
                }
            });
        }
        
        // Bouton MAX
        const maxBtn = document.getElementById('aaveMaxBtn');
        if (maxBtn) {
            maxBtn.addEventListener('click', () => {
                this.setMaxAmount();
            });
        }
        
        // Changement d'asset
        const assetSelect = document.getElementById('aaveAssetSelect');
        if (assetSelect) {
            assetSelect.addEventListener('change', () => {
                this.updateBalanceDisplay();
                this.validateForm();
            });
        }
        
        // Changement de montant
        const amountInput = document.getElementById('aaveAmount');
        if (amountInput) {
            amountInput.addEventListener('input', () => {
                this.validateForm();
            });
        }
        
        // Bouton actualiser
        const refreshBtn = document.getElementById('aaveRefreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refresh();
            });
        }
    }

    /**
     * Définir le montant maximum
     */
    setMaxAmount() {
        if (!this.walletManager.isConnected) {
            this.notificationSystem.warning('Veuillez d\'abord connecter votre wallet');
            return;
        }
        
        const selectedAsset = document.getElementById('aaveAssetSelect')?.value;
        const amountInput = document.getElementById('aaveAmount');
        
        let maxBalance = 0;
        
        if (selectedAsset === 'usdc') {
            const usdcInfo = this.getBestUSDCBalance();
            maxBalance = usdcInfo.balance;
        } else if (selectedAsset === 'weth') {
            maxBalance = parseFloat(this.tokenBalances.WETH || "0");
        } else if (selectedAsset === 'wmatic') {
            maxBalance = parseFloat(this.tokenBalances.WMATIC || "0");
        } else {
            maxBalance = parseFloat(this.tokenBalances[selectedAsset.toUpperCase()] || "0");
        }
        
        if (maxBalance > 0) {
            const maxAmount = maxBalance * 0.999; // Marge de sécurité
            amountInput.value = maxAmount.toFixed(8);
            this.validateForm();
            this.notificationSystem.success(`Montant maximum défini: ${maxAmount.toFixed(6)} ${selectedAsset.toUpperCase()}`);
        } else {
            this.notificationSystem.warning(`Aucun solde ${selectedAsset.toUpperCase()} disponible`);
        }
    }

    /**
     * Mettre à jour l'affichage du solde
     */
    updateBalanceDisplay() {
        const selectedAsset = document.getElementById('aaveAssetSelect')?.value;
        const balanceElement = document.getElementById('aaveBalanceDisplay');
        
        if (!balanceElement || !selectedAsset) return;
        
        let balance = 0;
        let symbol = '';
        let balanceType = '';
        
        if (selectedAsset === 'usdc') {
            const usdcInfo = this.getBestUSDCBalance();
            balance = usdcInfo.balance;
            symbol = 'USDC';
            balanceType = usdcInfo.type === 'NATIVE' ? '(USDC Native)' : 
                         usdcInfo.type === 'BRIDGED' ? '(USDC.e)' : '';
        } else {
            balance = parseFloat(this.tokenBalances[selectedAsset.toUpperCase()] || "0");
            symbol = selectedAsset.toUpperCase();
        }
        
        if (balance > 0) {
            balanceElement.innerHTML = `
                <span class="balance-label">Solde disponible:</span>
                <span class="balance-value">${balance.toFixed(6)} ${symbol}</span>
                <span class="balance-type">${balanceType}</span>
            `;
        } else {
            balanceElement.innerHTML = `
                <span class="balance-label">Solde disponible:</span>
                <span class="balance-value balance-zero">0.000000 ${symbol}</span>
                <span class="balance-warning">
                    <i class="fas fa-exclamation-triangle"></i>
                    Aucun ${symbol} trouvé
                </span>
            `;
        }
    }

    /**
     * Valider le formulaire
     */
    validateForm() {
        const amount = parseFloat(document.getElementById('aaveAmount')?.value || "0");
        const selectedAsset = document.getElementById('aaveAssetSelect')?.value;
        const depositBtn = document.getElementById('aaveDepositBtn');
        const errorElement = document.getElementById('aaveBalanceError');
        
        if (!depositBtn || !errorElement) return;
        
        let availableBalance = 0;
        let canDeposit = false;
        
        if (selectedAsset === 'usdc') {
            const usdcInfo = this.getBestUSDCBalance();
            availableBalance = usdcInfo.balance;
            canDeposit = availableBalance > 0;
        } else {
            availableBalance = parseFloat(this.tokenBalances[selectedAsset.toUpperCase()] || "0");
            canDeposit = availableBalance > 0;
        }
        
        if (amount > 0 && amount > availableBalance) {
            depositBtn.disabled = true;
            depositBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Solde Insuffisant';
            depositBtn.classList.add('disabled');
            
            errorElement.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                <span>Solde insuffisant. Disponible: ${availableBalance.toFixed(6)} ${selectedAsset.toUpperCase()}</span>
            `;
            errorElement.classList.add('show');
        } else if (amount > 0 && canDeposit) {
            depositBtn.disabled = false;
            depositBtn.innerHTML = `<i class="fas fa-plus-circle"></i> Déposer ${amount.toFixed(4)} ${selectedAsset.toUpperCase()}`;
            depositBtn.classList.remove('disabled');
            errorElement.classList.remove('show');
        } else {
            depositBtn.disabled = !canDeposit;
            depositBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Déposer sur Aave';
            depositBtn.classList.toggle('disabled', !canDeposit);
            errorElement.classList.remove('show');
        }
    }

    /**
     * Mettre à jour l'interface complète
     */
    async updateUI() {
        await super.updateUI();
        
        // Mettre à jour les métriques affichées
        if (this.metrics) {
            const totalValueEl = document.getElementById('aaveTotalValue');
            const pnlEl = document.getElementById('aavePnL');
            const apyEl = document.getElementById('aaveAPY');
            const dailyYieldEl = document.getElementById('aaveDailyYield');
            
            if (totalValueEl) totalValueEl.textContent = this.formatUSD(this.metrics.totalValue || 0);
            if (pnlEl) {
                const pnl = this.metrics.totalPnL || 0;
                pnlEl.textContent = this.formatUSD(pnl);
                pnlEl.className = `metric-value ${pnl >= 0 ? 'text-success' : 'text-danger'}`;
            }
            if (apyEl) apyEl.textContent = this.formatPercentage(this.metrics.averageAPR || 0);
            if (dailyYieldEl) dailyYieldEl.textContent = this.formatUSD(this.metrics.dailyYield || 0);
        }
        
        // Mettre à jour l'affichage des soldes
        this.updateBalanceDisplay();
        this.validateForm();
        
        // Afficher/masquer la section positions
        const positionsSection = document.getElementById('aavePositionsSection');
        if (positionsSection) {
            if (this.positions.length > 0) {
                positionsSection.style.display = 'block';
                this.renderPositions();
            } else {
                positionsSection.style.display = 'none';
            }
        }
    }

    /**
     * Rendre les positions
     */
    renderPositions() {
        const positionsList = document.getElementById('aavePositionsList');
        if (!positionsList) return;
        
        if (this.positions.length === 0) {
            positionsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-seedling"></i>
                    <p>Aucune position Aave</p>
                    <span>Effectuez un dépôt pour commencer</span>
                </div>
            `;
            return;
        }
        
        positionsList.innerHTML = this.positions.map(position => `
            <div class="position-card">
                <div class="position-header">
                    <div class="position-info">
                        <span class="position-asset">${position.asset}</span>
                        <span class="position-amount">${position.amount} USDC</span>
                    </div>
                    <div class="position-status">
                        <span class="status-badge active">Actif</span>
                    </div>
                </div>
                
                <div class="position-metrics">
                    <div class="metric-item">
                        <span class="metric-label">APY</span>
                        <span class="metric-value">${position.apr}%</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Gains</span>
                        <span class="metric-value ${parseFloat(position.earnings) >= 0 ? 'text-success' : 'text-danger'}">
                            ${parseFloat(position.earnings) >= 0 ? '+' : ''}${position.earnings} USDC
                        </span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Performance</span>
                        <span class="metric-value ${parseFloat(position.earningsPercentage) >= 0 ? 'text-success' : 'text-danger'}">
                            ${parseFloat(position.earningsPercentage) >= 0 ? '+' : ''}${position.earningsPercentage}%
                        </span>
                    </div>
                </div>
                
                <div class="position-actions">
                    <button class="action-btn secondary" onclick="window.app.strategies.get('aave').withdrawEarnings()">
                        <i class="fas fa-coins"></i>
                        Retirer Gains
                    </button>
                    <button class="action-btn danger" onclick="window.app.strategies.get('aave').closePosition('${position.id}')">
                        <i class="fas fa-wallet"></i>
                        Retirer Tout
                    </button>
                    <a href="https://app.aave.com/dashboard" target="_blank" class="action-btn info">
                        <i class="fas fa-external-link-alt"></i>
                        Voir sur Aave
                    </a>
                </div>
            </div>
        `).join('');
    }

    /**
     * Gestionnaires d'événements wallet spécifiques
     */
    async onWalletConnected(data) {
        await super.onWalletConnected(data);
        this.initializeContracts();
        this.updateBalanceDisplay();
    }

    onWalletDisconnected() {
        super.onWalletDisconnected();
        this.tokenBalances = {};
        this.updateBalanceDisplay();
    }

    async onNetworkChanged(data) {
        await super.onNetworkChanged(data);
        this.initializeContracts();
    }
}

// Instance globale pour les callbacks UI
window.aaveStrategy = null;

export { AaveStrategy };
export default AaveStrategy;