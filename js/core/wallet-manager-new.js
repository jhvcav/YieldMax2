// Wallet Manager - Gestion Wallet et Reseau

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
        
        console.log('WalletManager initialise');
        this.init();
    }

    async init() {
        await this.checkWalletConnection();
        this.setupEventListeners();
    }

    isMetaMaskInstalled() {
        return typeof window.ethereum !== 'undefined';
    }

    async connectWallet() {
        try {
            if (!this.isMetaMaskInstalled()) {
                throw new Error('MetaMask non detecte. Veuillez installer MetaMask.');
            }

            console.log('Tentative de connexion wallet...');
            
            const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts'
            });

            if (accounts.length === 0) {
                throw new Error('Aucun compte disponible');
            }

            this.currentAccount = accounts[0];
            this.isConnected = true;
            
            this.provider = new ethers.BrowserProvider(window.ethereum);
            this.signer = await this.provider.getSigner();
            
            await this.checkNetwork();
            
            this.eventBus.emit(EVENTS.WALLET_CONNECTED, 
                EventHelpers.createWalletEvent('connected', {
                    account: this.currentAccount,
                    network: this.currentNetwork
                })
            );
            
            console.log('Wallet connecte:', this.currentAccount);
            return true;
            
        } catch (error) {
            console.error('Erreur connexion wallet:', error);
            this.eventBus.emit(EVENTS.UI_NOTIFICATION, {
                type: 'error',
                message: error.message || 'Erreur de connexion au wallet'
            });
            return false;
        }
    }

    async disconnectWallet() {
        this.isConnected = false;
        this.currentAccount = null;
        this.provider = null;
        this.signer = null;
        
        this.eventBus.emit(EVENTS.WALLET_DISCONNECTED, 
            EventHelpers.createWalletEvent('disconnected', {})
        );
        
        console.log('Wallet deconnecte');
    }

    async checkWalletConnection() {
        if (!this.isMetaMaskInstalled()) {
            console.log('MetaMask non installe');
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
                
                console.log('Wallet reconnecte automatiquement:', this.currentAccount);
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error('Erreur verification connexion:', error);
            return false;
        }
    }

    async checkNetwork() {
        try {
            const network = await this.provider.getNetwork();
            const chainId = Number(network.chainId);
            
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
                
                console.log('Reseau change:', oldNetwork, 'vers', networkName, '(' + chainId + ')');
            }
            
            return networkName;
            
        } catch (error) {
            console.error('Erreur verification reseau:', error);
            return 'unknown';
        }
    }

    async switchNetwork(networkName) {
        if (!this.isConnected) {
            throw new Error('Wallet non connecte');
        }

        const networkConfig = NETWORKS[networkName];
        if (!networkConfig) {
            throw new Error('Reseau ' + networkName + ' non supporte');
        }

        try {
            console.log('Changement vers le reseau: ' + networkName);
            
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: networkConfig.hex }]
            });
            
            this.currentNetwork = networkName;
            
            this.eventBus.emit(EVENTS.WALLET_NETWORK_CHANGED, {
                newNetwork: networkName,
                chainId: networkConfig.chainId
            });
            
            console.log('Bascule sur ' + networkName);
            return true;
            
        } catch (error) {
            console.error('Erreur changement reseau:', error);
            
            if (error.code === 4902) {
                return await this.addNetwork(networkName);
            }
            
            throw error;
        }
    }

    async addNetwork(networkName) {
        const networkConfig = NETWORKS[networkName];
        if (!networkConfig) {
            throw new Error('Configuration reseau ' + networkName + ' introuvable');
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
            
            console.log('Reseau ' + networkName + ' ajoute avec succes');
            return true;
            
        } catch (error) {
            console.error('Erreur ajout reseau ' + networkName + ':', error);
            throw error;
        }
    }

    async getNativeBalance(address = null) {
        if (!this.provider) {
            throw new Error('Provider non initialise');
        }

        const targetAddress = address || this.currentAccount;
        if (!targetAddress) {
            throw new Error('Aucune adresse specifiee');
        }

        try {
            const balance = await this.provider.getBalance(targetAddress);
            return ethers.formatEther(balance);
        } catch (error) {
            console.error('Erreur recuperation solde natif:', error);
            throw error;
        }
    }

    getCurrentNetworkConfig() {
        return NETWORKS[this.currentNetwork] || null;
    }

    isOnCorrectNetwork(requiredNetwork = 'polygon') {
        return this.currentNetwork === requiredNetwork;
    }

    formatAddress(address, length = 4) {
        if (!address) return '';
        return address.slice(0, 2 + length) + '...' + address.slice(-length);
    }

    setupEventListeners() {
        if (!window.ethereum) return;

        window.ethereum.on('accountsChanged', (accounts) => {
            console.log('Comptes changes:', accounts);
            
            if (accounts.length === 0) {
                this.disconnectWallet();
            } else if (accounts[0] !== this.currentAccount) {
                const oldAccount = this.currentAccount;
                this.currentAccount = accounts[0];
                
                this.eventBus.emit(EVENTS.WALLET_ACCOUNT_CHANGED, {
                    oldAccount,
                    newAccount: this.currentAccount
                });
                
                console.log('Compte change de', oldAccount, 'vers', this.currentAccount);
            }
        });

        window.ethereum.on('chainChanged', (chainId) => {
            console.log('Reseau change:', chainId);
            this.checkNetwork();
        });

        window.ethereum.on('connect', (connectInfo) => {
            console.log('MetaMask connecte:', connectInfo);
        });

        window.ethereum.on('disconnect', (error) => {
            console.log('MetaMask deconnecte:', error);
            this.disconnectWallet();
        });
    }

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
            console.error('Erreur signature transaction:', error);
            
            this.eventBus.emit(EVENTS.TRANSACTION_FAILED, 
                EventHelpers.createTransactionEvent(null, 'failed', {
                    error: error.message
                })
            );
            
            throw error;
        }
    }

    async waitForTransaction(txHash, confirmations = 1) {
        if (!this.provider) {
            throw new Error('Provider non disponible');
        }

        try {
            console.log('Attente confirmation transaction: ' + txHash);
            
            this.eventBus.emit(EVENTS.TRANSACTION_PENDING, 
                EventHelpers.createTransactionEvent(txHash, 'pending')
            );
            
            const receipt = await this.provider.waitForTransaction(
                txHash, 
                confirmations, 
                SETTINGS.TRANSACTION_TIMEOUT
            );
            
            if (receipt && receipt.status === 1) {
                this.eventBus.emit(EVENTS.TRANSACTION_CONFIRMED, 
                    EventHelpers.createTransactionEvent(txHash, 'confirmed', {
                        gasUsed: receipt.gasUsed.toString(),
                        blockNumber: receipt.blockNumber
                    })
                );
                
                console.log('Transaction confirmee: ' + txHash);
            } else {
                this.eventBus.emit(EVENTS.TRANSACTION_FAILED, 
                    EventHelpers.createTransactionEvent(txHash, 'failed', {
                        reason: 'Transaction echouee'
                    })
                );
                
                console.error('Transaction echouee: ' + txHash);
            }
            
            return receipt;
            
        } catch (error) {
            console.error('Erreur attente transaction:', error);
            
            this.eventBus.emit(EVENTS.TRANSACTION_FAILED, 
                EventHelpers.createTransactionEvent(txHash, 'failed', {
                    error: error.message
                })
            );
            
            throw error;
        }
    }

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
            console.error('Erreur estimation gas:', error);
            throw error;
        }
    }

    async getNonce(address = null) {
        if (!this.provider) {
            throw new Error('Provider non disponible');
        }

        const targetAddress = address || this.currentAccount;
        return await this.provider.getTransactionCount(targetAddress, 'pending');
    }

    isValidAddress(address) {
        try {
            return ethers.isAddress(address);
        } catch {
            return false;
        }
    }

    getExplorerUrl(txHash, type = 'tx') {
        const networkConfig = this.getCurrentNetworkConfig();
        if (!networkConfig) return null;
        
        return networkConfig.explorer + '/' + type + '/' + txHash;
    }

    getTransactionHash(transaction) {
        return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(transaction)));
    }

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

    reset() {
        this.disconnectWallet();
        this.currentNetwork = 'polygon';
        console.log('WalletManager reinitialise');
    }

    validateTransactionPrerequisites() {
        const errors = [];
        
        if (!this.isConnected) {
            errors.push('Wallet non connecte');
        }
        
        if (!this.currentAccount) {
            errors.push('Aucun compte disponible');
        }
        
        if (!this.provider) {
            errors.push('Provider non initialise');
        }
        
        if (!this.signer) {
            errors.push('Signer non disponible');
        }
        
        if (this.currentNetwork === 'unknown') {
            errors.push('Reseau non reconnu');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

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
            console.error('Erreur recuperation stats wallet:', error);
            return null;
        }
    }
}

let walletManagerInstance = null;

export function getWalletManager() {
    if (!walletManagerInstance) {
        walletManagerInstance = new WalletManager();
    }
    return walletManagerInstance;
}

export { WalletManager };
export default getWalletManager();