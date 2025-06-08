// ===== Wallet Manager - Gestion Wallet & Réseau =====

import { NETWORKS, SETTINGS } from '../config.js';
import { getEventBus, EVENTS, EventHelpers } from './event-bus.js';

class WalletManager {
    constructor() {
        this.isConnected = false;
        this.currentAccount = null;
        this.currentNetwork = 'polygon';
        this.provider = null;
        this.signer = null;
        this.eventBus = getEventBus();
        
        console.log('🔐 WalletManager initialisé');
        this.init();
    }

    async init() {
        await this.checkWalletConnection();
        this.setupEventListeners();
    }

    /**
     * Configurer les événements MetaMask
     */
    setupEventListeners() {
        if (!window.ethereum) return;

        // Changement de compte
        window.ethereum.on('accountsChanged', (accounts) => {
            console.log('👤 Comptes changés:', accounts);
            
            if (accounts.length === 0) {
                // Déconnexion
                this.disconnectWallet();
            } else if (accounts[0] !== this.currentAccount) {
                // Changement de compte
                const oldAccount = this.currentAccount;
                this.currentAccount = accounts[0];
                
                this.eventBus.emit(EVENTS.WALLET_ACCOUNT_CHANGED, {
                    oldAccount,
                    newAccount: this.currentAccount
                });
                
                console.log(`👤 Compte changé: ${oldAccount} → ${this.currentAccount}`);
            }
        });

        // Changement de réseau
        window.ethereum.on('chainChanged', (chainId) => {
            console.log('🌐 Réseau changé:', chainId);
            this.checkNetwork();
        });

        // Connexion/déconnexion
        window.ethereum.on('connect', (connectInfo) => {
            console.log('🔗 MetaMask connecté:', connectInfo);
        });

        window.ethereum.on('disconnect', (error) => {
            console.log('🔌 MetaMask déconnecté:', error);
            this.disconnectWallet();
        });
    }

    /**
     * Signer une transaction
     */
    async signTransaction(transaction) {
        if (!this.signer) {
            throw new Error('Signer non disponible');
        }

        try {
            const tx = await this.signer.sendTransaction(transaction);
            
            this.eventBus.emit(EVENTS.TRANSACTION_STARTED, 
                EventHelpers.createTransactionEvent(tx.hash, 'pending', {
                    from: this.currentAccount,
                    to: transaction.to,
                    value: transaction.value || '0'
                })
            );
            
            return tx;
            
        } catch (error) {
            console.error('❌ Erreur signature transaction:', error);
            
            this.eventBus.emit(EVENTS.TRANSACTION_FAILED, 
                EventHelpers.createTransactionEvent(null, 'failed', {
                    error: error.message
                })
            );
            
            throw error;
        }
    }

    /**
     * Attendre la confirmation d'une transaction
     */
    async waitForTransaction(txHash, confirmations = 1) {
        if (!this.provider) {
            throw new Error('Provider non disponible');
        }

        try {
            console.log(`⏳ Attente confirmation transaction: ${txHash}`);
            
            this.eventBus.emit(EVENTS.TRANSACTION_PENDING, 
                EventHelpers.createTransactionEvent(txHash, 'pending')
            );
            
            const receipt = await this.provider.waitForTransaction(
                txHash, 
                confirmations, 
                SETTINGS.TRANSACTION_TIMEOUT
            );
            
            if (receipt.status === 1) {
                this.eventBus.emit(EVENTS.TRANSACTION_CONFIRMED, 
                    EventHelpers.createTransactionEvent(txHash, 'confirmed', {
                        gasUsed: receipt.gasUsed.toString(),
                        blockNumber: receipt.blockNumber
                    })
                );
                
                console.log(`✅ Transaction confirmée: ${txHash}`);
            } else {
                this.eventBus.emit(EVENTS.TRANSACTION_FAILED, 
                    EventHelpers.createTransactionEvent(txHash, 'failed', {
                        reason: 'Transaction échouée'
                    })
                );
                
                console.error(`❌ Transaction échouée: ${txHash}`);
            }
            
            return receipt;
            
        } catch (error) {
            console.error('❌ Erreur attente transaction:', error);
            
            this.eventBus.emit(EVENTS.TRANSACTION_FAILED, 
                EventHelpers.createTransactionEvent(txHash, 'failed', {
                    error: error.message
                })
            );
            
            throw error;
        }
    }

    /**
     * Estimer les frais de gas
     */
    async estimateGas(transaction) {
        if (!this.provider) {
            throw new Error('Provider non disponible');
        }

        try {
            const gasEstimate = await this.provider.estimateGas(transaction);
            const gasPrice = await this.provider.getFeeData();
            
            return {
                gasLimit: gasEstimate,
                gasPrice: gasPrice.gasPrice,
                maxFeePerGas: gasPrice.maxFeePerGas,
                maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
                estimatedCost: gasEstimate * (gasPrice.gasPrice || gasPrice.maxFeePerGas)
            };
            
        } catch (error) {
            console.error('❌ Erreur estimation gas:', error);
            throw error;
        }
    }

    /**
     * Obtenir le nonce pour une adresse
     */
    async getNonce(address = null) {
        if (!this.provider) {
            throw new Error('Provider non disponible');
        }

        const targetAddress = address || this.currentAccount;
        return await this.provider.getTransactionCount(targetAddress, 'pending');
    }

    /**
     * Vérifier si une adresse est valide
     */
    isValidAddress(address) {
        try {
            return ethers.isAddress(address);
        } catch {
            return false;
        }
    }

    /**
     * Obtenir l'URL de l'explorateur pour une transaction
     */
    getExplorerUrl(txHash, type = 'tx') {
        const networkConfig = this.getCurrentNetworkConfig();
        if (!networkConfig) return null;
        
        return `${networkConfig.explorer}/${type}/${txHash}`;
    }

    /**
     * Calculer le hash d'une transaction
     */
    getTransactionHash(transaction) {
        return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(transaction)));
    }

    /**
     * Obtenir les informations détaillées du wallet
     */
    getWalletInfo() {
        return {
            isConnected: this.isConnected,
            account: this.currentAccount,
            network: this.currentNetwork,
            networkConfig: this.getCurrentNetworkConfig(),
            provider: !!this.provider,
            signer: !!this.signer,
            formattedAddress: this.formatAddress(this.currentAccount)
        };
    }

    /**
     * Réinitialiser le wallet manager
     */
    reset() {
        this.disconnectWallet();
        this.currentNetwork = 'polygon';
        console.log('🔄 WalletManager réinitialisé');
    }

    /**
     * Validation de prérequis pour les transactions
     */
    validateTransactionPrerequisites() {
        const errors = [];
        
        if (!this.isConnected) {
            errors.push('Wallet non connecté');
        }
        
        if (!this.currentAccount) {
            errors.push('Aucun compte disponible');
        }
        
        if (!this.provider) {
            errors.push('Provider non initialisé');
        }
        
        if (!this.signer) {
            errors.push('Signer non disponible');
        }
        
        if (this.currentNetwork === 'unknown') {
            errors.push('Réseau non reconnu');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Obtenir les statistiques du wallet
     */
    async getWalletStats() {
        if (!this.isConnected) {
            return null;
        }

        try {
            const nativeBalance = await this.getNativeBalance();
            const networkConfig = this.getCurrentNetworkConfig();
            const nonce = await this.getNonce();
            
            return {
                address: this.currentAccount,
                network: this.currentNetwork,
                networkName: networkConfig?.name || 'Unknown',
                nativeBalance: parseFloat(nativeBalance),
                nativeCurrency: networkConfig?.currency || 'ETH',
                transactionCount: nonce,
                explorerUrl: this.getExplorerUrl(this.currentAccount, 'address')
            };
            
        } catch (error) {
            console.error('❌ Erreur récupération stats wallet:', error);
            return null;
        }
    }
}

// Instance globale
let walletManagerInstance = null;

export function getWalletManager() {
    if (!walletManagerInstance) {
        walletManagerInstance = new WalletManager();
    }
    return walletManagerInstance;
}

export { WalletManager };
export default getWalletManager(); Vérifier si MetaMask est installé
     */
    isMetaMaskInstalled() {
        return typeof window.ethereum !== 'undefined';
    }

    /**
     * Connecter le wallet
     */
    async connectWallet() {
        try {
            if (!this.isMetaMaskInstalled()) {
                throw new Error('MetaMask non détecté. Veuillez installer MetaMask.');
            }

            console.log('🔄 Tentative de connexion wallet...');
            
            const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts'
            });

            if (accounts.length === 0) {
                throw new Error('Aucun compte disponible');
            }

            this.currentAccount = accounts[0];
            this.isConnected = true;
            
            // Initialiser le provider et signer
            this.provider = new ethers.BrowserProvider(window.ethereum);
            this.signer = await this.provider.getSigner();
            
            // Vérifier le réseau
            await this.checkNetwork();
            
            // Émettre l'événement de connexion
            this.eventBus.emit(EVENTS.WALLET_CONNECTED, 
                EventHelpers.createWalletEvent('connected', {
                    account: this.currentAccount,
                    network: this.currentNetwork
                })
            );
            
            console.log('✅ Wallet connecté:', this.currentAccount);
            return true;
            
        } catch (error) {
            console.error('❌ Erreur connexion wallet:', error);
            this.eventBus.emit(EVENTS.UI_NOTIFICATION, {
                type: 'error',
                message: error.message || 'Erreur de connexion au wallet'
            });
            return false;
        }
    }

    /**
     * Déconnecter le wallet
     */
    async disconnectWallet() {
        this.isConnected = false;
        this.currentAccount = null;
        this.provider = null;
        this.signer = null;
        
        this.eventBus.emit(EVENTS.WALLET_DISCONNECTED, 
            EventHelpers.createWalletEvent('disconnected', {})
        );
        
        console.log('🔓 Wallet déconnecté');
    }

    /**
     * Vérifier la connexion existante
     */
    async checkWalletConnection() {
        if (!this.isMetaMaskInstalled()) {
            console.log('❌ MetaMask non installé');
            return false;
        }

        try {
            const accounts = await window.ethereum.request({
                method: 'eth_accounts'
            });

            if (accounts.length > 0) {
                this.currentAccount = accounts[0];
                this.isConnected = true;
                
                this.provider = new ethers.BrowserProvider(window.ethereum);
                this.signer = await this.provider.getSigner();
                
                await this.checkNetwork();
                
                this.eventBus.emit(EVENTS.WALLET_CONNECTED, 
                    EventHelpers.createWalletEvent('reconnected', {
                        account: this.currentAccount,
                        network: this.currentNetwork
                    })
                );
                
                console.log('🔄 Wallet reconnecté automatiquement:', this.currentAccount);
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error('❌ Erreur vérification connexion:', error);
            return false;
        }
    }

    /**
     * Vérifier et obtenir le réseau actuel
     */
    async checkNetwork() {
        try {
            const network = await this.provider.getNetwork();
            const chainId = Number(network.chainId);
            
            // Trouver le réseau correspondant
            let networkName = 'unknown';
            for (const [name, config] of Object.entries(NETWORKS)) {
                if (config.chainId === chainId) {
                    networkName = name;
                    break;
                }
            }
            
            if (networkName !== this.currentNetwork) {
                const oldNetwork = this.currentNetwork;
                this.currentNetwork = networkName;
                
                this.eventBus.emit(EVENTS.WALLET_NETWORK_CHANGED, {
                    oldNetwork,
                    newNetwork: networkName,
                    chainId
                });
                
                console.log(`🌐 Réseau changé: ${oldNetwork} → ${networkName} (${chainId})`);
            }
            
            return networkName;
            
        } catch (error) {
            console.error('❌ Erreur vérification réseau:', error);
            return 'unknown';
        }
    }

    /**
     * Changer de réseau
     */
    async switchNetwork(networkName) {
        if (!this.isConnected) {
            throw new Error('Wallet non connecté');
        }

        const networkConfig = NETWORKS[networkName];
        if (!networkConfig) {
            throw new Error(`Réseau ${networkName} non supporté`);
        }

        try {
            console.log(`🔄 Changement vers le réseau: ${networkName}`);
            
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: networkConfig.hex }]
            });
            
            this.currentNetwork = networkName;
            
            this.eventBus.emit(EVENTS.WALLET_NETWORK_CHANGED, {
                newNetwork: networkName,
                chainId: networkConfig.chainId
            });
            
            console.log(`✅ Basculé sur ${networkName}`);
            return true;
            
        } catch (error) {
            console.error('❌ Erreur changement réseau:', error);
            
            // Si le réseau n'est pas configuré, proposer de l'ajouter
            if (error.code === 4902) {
                return await this.addNetwork(networkName);
            }
            
            throw error;
        }
    }

    /**
     * Ajouter un nouveau réseau
     */
    async addNetwork(networkName) {
        const networkConfig = NETWORKS[networkName];
        if (!networkConfig) {
            throw new Error(`Configuration réseau ${networkName} introuvable`);
        }

        try {
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: networkConfig.hex,
                    chainName: networkConfig.name,
                    rpcUrls: [networkConfig.rpc],
                    nativeCurrency: {
                        name: networkConfig.currency,
                        symbol: networkConfig.currency,
                        decimals: 18
                    },
                    blockExplorerUrls: [networkConfig.explorer]
                }]
            });
            
            console.log(`✅ Réseau ${networkName} ajouté avec succès`);
            return true;
            
        } catch (error) {
            console.error(`❌ Erreur ajout réseau ${networkName}:`, error);
            throw error;
        }
    }

    /**
     * Obtenir le solde ETH/MATIC natif
     */
    async getNativeBalance(address = null) {
        if (!this.provider) {
            throw new Error('Provider non initialisé');
        }

        const targetAddress = address || this.currentAccount;
        if (!targetAddress) {
            throw new Error('Aucune adresse spécifiée');
        }

        try {
            const balance = await this.provider.getBalance(targetAddress);
            return ethers.formatEther(balance);
        } catch (error) {
            console.error('❌ Erreur récupération solde natif:', error);
            throw error;
        }
    }

    /**
     * Obtenir les informations du réseau actuel
     */
    getCurrentNetworkConfig() {
        return NETWORKS[this.currentNetwork] || null;
    }

    /**
     * Vérifier si on est sur le bon réseau
     */
    isOnCorrectNetwork(requiredNetwork = 'polygon') {
        return this.currentNetwork === requiredNetwork;
    }

    /**
     * Formater une adresse
     */
    formatAddress(address, length = 4) {
        if (!address) return '';
        return `${address.slice(0, 2 + length)}...${address.slice(-length)}`;
    }

    /**
     */