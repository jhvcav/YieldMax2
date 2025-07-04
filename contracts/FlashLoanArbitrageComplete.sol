// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import "@aave/core-v3/contracts/dependencies/openzeppelin/contracts/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IERC20Extended is IERC20 {
    function decimals() external view returns (uint8);
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
}

interface IDEXRouter {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    
    function getAmountsOut(uint amountIn, address[] calldata path)
        external view returns (uint[] memory amounts);
}

/**
 * @title FlashLoanArbitrageComplete
 * @notice Contrat Flash Loan avec tokens configurables et gestion complète
 * @dev Version améliorée avec possibilité de changer les adresses des tokens
 */
contract FlashLoanArbitrageComplete is FlashLoanSimpleReceiverBase, Ownable, ReentrancyGuard, Pausable {
    
    // ========== ÉVÉNEMENTS ==========
    
    // 🆕 Nouveaux événements pour la gestion des tokens
    event TokenAddressUpdated(
        string indexed tokenSymbol,
        address indexed oldAddress,
        address indexed newAddress,
        uint256 timestamp
    );
    
    event TokenConfigurationUpdated(
        address indexed usdc,
        address indexed usdt,
        uint256 timestamp
    );
    
    // Événements existants
    event Deposit(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 shares,
        uint256 timestamp
    );
    
    event Withdrawal(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 shares,
        uint256 timestamp
    );
    
    event ArbitrageExecuted(
        address indexed user,
        address indexed asset,
        uint256 flashAmount,
        uint256 profit,
        uint256 userProfit,
        uint256 platformFee,
        uint256 gasUsed,
        uint256 timestamp
    );
    
    event FlashLoanExecuted(
        address indexed asset,
        uint256 amount,
        uint256 premium,
        address indexed initiator,
        uint256 timestamp
    );
    
    event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);
    event TrustedWalletSet(address indexed oldWallet, address indexed newWallet);
    event EmergencyWithdrawal(
        address indexed token,
        uint256 amount,
        address indexed to,
        string reason,
        uint256 timestamp
    );

    // ========== STRUCTURES ==========
    
    struct UserPosition {
        uint256 usdcShares;
        uint256 usdtShares;
        uint256 totalDeposited;
        uint256 totalWithdrawn;
        uint256 totalProfits;
        uint256 lastDepositTime;
        uint256 depositCount;
        uint256 withdrawalCount;
    }
    
    struct ArbitrageParams {
        address tokenA;
        address tokenB;
        address dexRouter1;
        address dexRouter2;
        uint256 amountIn;
        uint256 minProfitBps;
        bool reverseDirection;
        uint256 maxSlippage;
        uint256 deadline;
    }
    
    struct FlashLoanData {
        ArbitrageParams params;
        address user;
        uint256 expectedProfit;
        uint256 flashLoanType;
        address[] assets;
        uint256[] amounts;
    }
    
    struct PoolMetrics {
        uint256 totalUSDCDeposits;
        uint256 totalUSDTDeposits;
        uint256 totalUSDCShares;
        uint256 totalUSDTShares;
        uint256 totalProfits;
        uint256 totalVolume;
        uint256 successfulTrades;
        uint256 failedTrades;
        uint256 lastUpdateTime;
    }

    // ========== VARIABLES D'ÉTAT MODIFIÉES ==========
    
    // 🆕 Adresses de tokens configurables (plus immutable)
    address public USDC;
    address public USDT;
    
    mapping(address => UserPosition) public userPositions;
    mapping(address => bool) public authorizedTokens;
    mapping(address => bool) public authorizedDEXs;
    mapping(address => uint256) public maxDepositAmounts;
    
    address public trustedWallet;
    PoolMetrics public poolMetrics;
    
    uint256 public platformFeeBps = 100;
    uint256 public trustedWalletFeeBps = 50;
    uint256 public maxFlashLoanAmount = 1000000 * 1e6;
    uint256 public minDepositAmount = 100 * 1e6;
    uint256 public constant MAX_BPS = 10000;
    
    bool public emergencyStop = false;
    uint256 public lastReportTime;
    uint256 public reportingPeriod = 24 hours;

    // ========== MODIFICATEURS ==========
    
    modifier onlyAuthorizedToken(address token) {
        require(authorizedTokens[token], "Token non autorise");
        _;
    }
    
    modifier onlyAuthorizedDEX(address dex) {
        require(authorizedDEXs[dex], "DEX non autorise");
        _;
    }
    
    modifier notInEmergency() {
        require(!emergencyStop, "Mode urgence active");
        _;
    }
    
    modifier onlyOwnerOrTrusted() {
        require(msg.sender == owner() || msg.sender == trustedWallet, "Non autorise");
        _;
    }
    
    modifier validAmount(uint256 amount) {
        require(amount > 0, "Montant invalide");
        _;
    }

    // ========== CONSTRUCTEUR MODIFIÉ ==========
    
    constructor(
        address _addressProvider,
        address _usdc,
        address _usdt,
        address _trustedWallet
    ) FlashLoanSimpleReceiverBase(IPoolAddressesProvider(_addressProvider)) Ownable(msg.sender) {
        // 🆕 Utiliser les fonctions setter pour initialiser
        _setTokenAddresses(_usdc, _usdt);
        trustedWallet = _trustedWallet;
        
        // Configuration par défaut
        maxDepositAmounts[_usdc] = 10000000 * 1e6;
        maxDepositAmounts[_usdt] = 10000000 * 1e6;
        
        // DEX autorisés par défaut
        authorizedDEXs[0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff] = true; // QuickSwap
        authorizedDEXs[0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506] = true; // SushiSwap
        
        poolMetrics.lastUpdateTime = block.timestamp;
        lastReportTime = block.timestamp;
    }

    // ========== 🆕 NOUVELLES FONCTIONS DE GESTION DES TOKENS ==========
    
    /**
     * @notice Met à jour les adresses des tokens USDC et USDT
     * @param _usdc Nouvelle adresse du token USDC
     * @param _usdt Nouvelle adresse du token USDT
     */
    function setTokenAddresses(address _usdc, address _usdt) external onlyOwner {
        _setTokenAddresses(_usdc, _usdt);
        emit TokenConfigurationUpdated(_usdc, _usdt, block.timestamp);
    }
    
    /**
     * @notice Met à jour l'adresse du token USDC uniquement
     * @param _newUSDC Nouvelle adresse du token USDC
     */
    function setUSDCAddress(address _newUSDC) external onlyOwner {
        address oldUSDC = USDC;
        require(_newUSDC != address(0), "Adresse USDC invalide");
        require(_newUSDC != oldUSDC, "Meme adresse USDC");
        
        // Vérifier que c'est bien un token ERC20 valide
        try IERC20Extended(_newUSDC).decimals() returns (uint8 decimals) {
            require(decimals == 6, "USDC doit avoir 6 decimales");
        } catch {
            revert("Adresse USDC invalide");
        }
        
        // Retirer l'autorisation de l'ancienne adresse
        authorizedTokens[oldUSDC] = false;
        
        // Configurer la nouvelle adresse
        USDC = _newUSDC;
        authorizedTokens[_newUSDC] = true;
        maxDepositAmounts[_newUSDC] = maxDepositAmounts[oldUSDC];
        
        emit TokenAddressUpdated("USDC", oldUSDC, _newUSDC, block.timestamp);
    }
    
    /**
     * @notice Met à jour l'adresse du token USDT uniquement
     * @param _newUSDT Nouvelle adresse du token USDT
     */
    function setUSDTAddress(address _newUSDT) external onlyOwner {
        address oldUSDT = USDT;
        require(_newUSDT != address(0), "Adresse USDT invalide");
        require(_newUSDT != oldUSDT, "Meme adresse USDT");
        
        // Vérifier que c'est bien un token ERC20 valide
        try IERC20Extended(_newUSDT).decimals() returns (uint8 decimals) {
            require(decimals == 6, "USDT doit avoir 6 decimales");
        } catch {
            revert("Adresse USDT invalide");
        }
        
        // Retirer l'autorisation de l'ancienne adresse
        authorizedTokens[oldUSDT] = false;
        
        // Configurer la nouvelle adresse
        USDT = _newUSDT;
        authorizedTokens[_newUSDT] = true;
        maxDepositAmounts[_newUSDT] = maxDepositAmounts[oldUSDT];
        
        emit TokenAddressUpdated("USDT", oldUSDT, _newUSDT, block.timestamp);
    }
    
    /**
     * @notice Fonction interne pour configurer les adresses des tokens
     */
    function _setTokenAddresses(address _usdc, address _usdt) internal {
        require(_usdc != address(0), "Adresse USDC invalide");
        require(_usdt != address(0), "Adresse USDT invalide");
        require(_usdc != _usdt, "USDC et USDT doivent etre differents");
        
        // Vérifier que ce sont des tokens ERC20 valides
        try IERC20Extended(_usdc).decimals() returns (uint8 decimalsUSDC) {
            require(decimalsUSDC == 6, "USDC doit avoir 6 decimales");
        } catch {
            revert("Adresse USDC invalide");
        }
        
        try IERC20Extended(_usdt).decimals() returns (uint8 decimalsUSDT) {
            require(decimalsUSDT == 6, "USDT doit avoir 6 decimales");
        } catch {
            revert("Adresse USDT invalide");
        }
        
        USDC = _usdc;
        USDT = _usdt;
        
        authorizedTokens[_usdc] = true;
        authorizedTokens[_usdt] = true;
    }
    
    /**
     * @notice Récupère les adresses actuelles des tokens
     * @return usdcAddress Adresse actuelle du token USDC
     * @return usdtAddress Adresse actuelle du token USDT
     */
    function getTokenAddresses() external view returns (address usdcAddress, address usdtAddress) {
        return (USDC, USDT);
    }
    
    /**
    * @notice Récupère les informations détaillées des tokens
    * @return usdcAddress Adresse du token USDC
    * @return usdcSymbol Symbole du token USDC
    * @return usdcDecimals Nombre de décimales USDC
    * @return usdtAddress Adresse du token USDT
    * @return usdtSymbol Symbole du token USDT
    * @return usdtDecimals Nombre de décimales USDT
    */
    function getTokenInfo() external view returns (
        address usdcAddress,
        string memory usdcSymbol,
        uint8 usdcDecimals,
        address usdtAddress,
        string memory usdtSymbol,
        uint8 usdtDecimals
    ) {
        return (
            USDC,
            IERC20Extended(USDC).symbol(),
            IERC20Extended(USDC).decimals(),
            USDT,
            IERC20Extended(USDT).symbol(),
            IERC20Extended(USDT).decimals()
        );
    }

    // ========== FONCTIONS EXISTANTES (IDENTIQUES) ==========
    
    function deposit(address token, uint256 amount) 
        external 
        nonReentrant 
        whenNotPaused
        notInEmergency
        onlyAuthorizedToken(token)
        validAmount(amount)
    {
        require(amount >= minDepositAmount, "Montant inferieur au minimum");
        require(amount <= maxDepositAmounts[token], "Montant superieur au maximum");
        
        uint8 decimals = IERC20Extended(token).decimals();
        require(decimals == 6, "Token doit avoir 6 decimales");
        
        require(
            IERC20(token).transferFrom(msg.sender, address(this), amount),
            "Transfert echoue"
        );
        
        uint256 shares = calculateShares(token, amount);
        UserPosition storage position = userPositions[msg.sender];
        
        if (token == USDC) {
            position.usdcShares += shares;
            poolMetrics.totalUSDCDeposits += amount;
            poolMetrics.totalUSDCShares += shares;
        } else if (token == USDT) {
            position.usdtShares += shares;
            poolMetrics.totalUSDTDeposits += amount;
            poolMetrics.totalUSDTShares += shares;
        }
        
        position.totalDeposited += amount;
        position.lastDepositTime = block.timestamp;
        position.depositCount++;
        poolMetrics.lastUpdateTime = block.timestamp;
        
        emit Deposit(msg.sender, token, amount, shares, block.timestamp);
    }

    function calculateShares(address token, uint256 amount) public view returns (uint256 shares) {
        if (token == USDC) {
            if (poolMetrics.totalUSDCShares == 0) {
                return amount;
            }
            return (amount * poolMetrics.totalUSDCShares) / poolMetrics.totalUSDCDeposits;
        } else if (token == USDT) {
            if (poolMetrics.totalUSDTShares == 0) {
                return amount;
            }
            return (amount * poolMetrics.totalUSDTShares) / poolMetrics.totalUSDTDeposits;
        }
        revert("Token non supporte");
    }

    function executeArbitrage(ArbitrageParams calldata params) 
        external 
        nonReentrant 
        whenNotPaused
        notInEmergency
        onlyAuthorizedToken(params.tokenA)
        onlyAuthorizedDEX(params.dexRouter1)
        onlyAuthorizedDEX(params.dexRouter2)
    {
        require(params.amountIn <= maxFlashLoanAmount, "Montant trop eleve");
        require(params.minProfitBps >= 10, "Profit minimum trop faible");
        require(params.deadline > block.timestamp, "Deadline expiree");
        
        uint256 expectedProfit = calculateExpectedProfit(params);
        require(expectedProfit > 0, "Arbitrage non profitable");
        
        FlashLoanData memory flashData = FlashLoanData({
            params: params,
            user: msg.sender,
            expectedProfit: expectedProfit,
            flashLoanType: 0,
            assets: new address[](0),
            amounts: new uint256[](0)
        });
        
        bytes memory data = abi.encode(flashData);
        
        POOL.flashLoanSimple(
            address(this),
            params.tokenA,
            params.amountIn,
            data,
            0
        );
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        require(msg.sender == address(POOL), "Appelant non autorise");
        require(initiator == address(this), "Initiateur non autorise");
        
        uint256 gasStart = gasleft();
        FlashLoanData memory flashData = abi.decode(params, (FlashLoanData));
        
        uint256 profit = _performArbitrage(flashData.params, amount);
        _handleProfitDistribution(asset, amount, premium, profit, flashData.user, gasStart);
        
        emit FlashLoanExecuted(asset, amount, premium, flashData.user, block.timestamp);
        
        return true;
    }

    function _handleProfitDistribution(
        address asset,
        uint256 amount,
        uint256 premium,
        uint256 profit,
        address user,
        uint256 gasStart
    ) internal {
        uint256 gasUsed = gasStart - gasleft();
        
        uint256 platformFee = (profit * platformFeeBps) / MAX_BPS;
        uint256 trustedWalletFee = (profit * trustedWalletFeeBps) / MAX_BPS;
        uint256 userProfit = profit - platformFee - trustedWalletFee;
        
        uint256 totalDebt = amount + premium;
        require(
            IERC20(asset).balanceOf(address(this)) >= totalDebt,
            "Fonds insuffisants pour remboursement"
        );
        
        if (userProfit > 0) {
            IERC20(asset).transfer(user, userProfit);
            userPositions[user].totalProfits += userProfit;
        }
        
        if (platformFee > 0) {
            IERC20(asset).transfer(owner(), platformFee);
        }
        
        if (trustedWalletFee > 0 && trustedWallet != address(0)) {
            IERC20(asset).transfer(trustedWallet, trustedWalletFee);
        }
        
        IERC20(asset).approve(address(POOL), totalDebt);
        
        poolMetrics.totalProfits += profit;
        poolMetrics.totalVolume += amount;
        poolMetrics.successfulTrades++;
        poolMetrics.lastUpdateTime = block.timestamp;
        
        emit ArbitrageExecuted(user, asset, amount, profit, userProfit, platformFee + trustedWalletFee, gasUsed, block.timestamp);
    }

    function _performArbitrage(
        ArbitrageParams memory params,
        uint256 amount
    ) internal returns (uint256 profit) {
        uint256 initialBalance = IERC20(params.tokenA).balanceOf(address(this));
        
        try this._executeSwaps(params, amount) {
            uint256 finalBalance = IERC20(params.tokenA).balanceOf(address(this));
            
            if (finalBalance > initialBalance) {
                profit = finalBalance - initialBalance;
                
                uint256 minProfit = (amount * params.minProfitBps) / MAX_BPS;
                require(profit >= minProfit, "Profit insuffisant");
            }
        } catch {
            poolMetrics.failedTrades++;
            revert("Arbitrage echoue");
        }
        
        return profit;
    }
    
    function _executeSwaps(ArbitrageParams memory params, uint256 amount) external {
        require(msg.sender == address(this), "Appelant non autorise");
        
        if (!params.reverseDirection) {
            uint256 tokenBReceived = _swapOnDEX(
                params.dexRouter1,
                params.tokenA,
                params.tokenB,
                amount,
                params.maxSlippage,
                params.deadline
            );
            
            _swapOnDEX(
                params.dexRouter2,
                params.tokenB,
                params.tokenA,
                tokenBReceived,
                params.maxSlippage,
                params.deadline
            );
        } else {
            uint256 tokenBReceived = _swapOnDEX(
                params.dexRouter2,
                params.tokenA,
                params.tokenB,
                amount,
                params.maxSlippage,
                params.deadline
            );
            
            _swapOnDEX(
                params.dexRouter1,
                params.tokenB,
                params.tokenA,
                tokenBReceived,
                params.maxSlippage,
                params.deadline
            );
        }
    }

    function _swapOnDEX(
        address router,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 maxSlippage,
        uint256 deadline
    ) internal returns (uint256 amountOut) {
        IERC20(tokenIn).approve(router, amountIn);
        
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        
        uint256[] memory expectedAmounts = IDEXRouter(router).getAmountsOut(amountIn, path);
        uint256 amountOutMin = expectedAmounts[1] * (MAX_BPS - maxSlippage) / MAX_BPS;
        
        uint256[] memory amounts = IDEXRouter(router).swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            path,
            address(this),
            deadline
        );
        
        return amounts[1];
    }

    function calculateExpectedProfit(ArbitrageParams calldata params) 
        public 
        view 
        returns (uint256 expectedProfit) 
    {
        try this._simulateArbitrage(params) returns (uint256 profit) {
            return profit;
        } catch {
            return 0;
        }
    }

    function _simulateArbitrage(ArbitrageParams calldata params) 
        external 
        view 
        returns (uint256 profit) 
    {
        address[] memory path = new address[](2);
        
        if (!params.reverseDirection) {
            path[0] = params.tokenA;
            path[1] = params.tokenB;
            uint256[] memory amounts1 = IDEXRouter(params.dexRouter1).getAmountsOut(
                params.amountIn, 
                path
            );
            
            uint256 tokenBAmount = amounts1[1] * (MAX_BPS - params.maxSlippage) / MAX_BPS;
            
            path[0] = params.tokenB;
            path[1] = params.tokenA;
            uint256[] memory amounts2 = IDEXRouter(params.dexRouter2).getAmountsOut(
                tokenBAmount, 
                path
            );
            
            uint256 finalAmount = amounts2[1] * (MAX_BPS - params.maxSlippage) / MAX_BPS;
            
            if (finalAmount > params.amountIn) {
                profit = finalAmount - params.amountIn;
            }
        } else {
            path[0] = params.tokenA;
            path[1] = params.tokenB;
            uint256[] memory amounts1 = IDEXRouter(params.dexRouter2).getAmountsOut(
                params.amountIn, 
                path
            );
            
            uint256 tokenBAmount = amounts1[1] * (MAX_BPS - params.maxSlippage) / MAX_BPS;
            
            path[0] = params.tokenB;
            path[1] = params.tokenA;
            uint256[] memory amounts2 = IDEXRouter(params.dexRouter1).getAmountsOut(
                tokenBAmount, 
                path
            );
            
            uint256 finalAmount = amounts2[1] * (MAX_BPS - params.maxSlippage) / MAX_BPS;
            
            if (finalAmount > params.amountIn) {
                profit = finalAmount - params.amountIn;
            }
        }
        
        return profit;
    }

    // ========== FONCTIONS D'ADMINISTRATION ==========
    
    function setTrustedWallet(address _trustedWallet) external onlyOwner {
        require(_trustedWallet != address(0), "Adresse invalide");
        address oldWallet = trustedWallet;
        trustedWallet = _trustedWallet;
        emit TrustedWalletSet(oldWallet, _trustedWallet);
    }
    
    function updateFees(uint256 _platformFeeBps, uint256 _trustedWalletFeeBps) external onlyOwner {
        require(_platformFeeBps + _trustedWalletFeeBps <= 1000, "Frais trop eleves");
        uint256 oldPlatformFee = platformFeeBps;
        platformFeeBps = _platformFeeBps;
        trustedWalletFeeBps = _trustedWalletFeeBps;
        emit PlatformFeeUpdated(oldPlatformFee, _platformFeeBps);
    }
    
    function setTokenAuthorization(address token, bool authorized) external onlyOwner {
        authorizedTokens[token] = authorized;
    }
    
    function setDEXAuthorization(address dex, bool authorized) external onlyOwner {
        authorizedDEXs[dex] = authorized;
    }
    
    function toggleEmergencyStop() external onlyOwner {
        emergencyStop = !emergencyStop;
        if (emergencyStop) {
            _pause();
        } else {
            _unpause();
        }
    }

    function ownerWithdraw(address token, uint256 amount, address to)
        external
        onlyOwner
        validAmount(amount)
    {
        require(to != address(0), "Adresse invalide");
        
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(amount <= balance, "Solde insuffisant");
        
        require(IERC20(token).transfer(to, amount), "Transfert echoue");
        
        emit EmergencyWithdrawal(token, amount, to, "Owner withdrawal", block.timestamp);
    }

    // ========== FONCTIONS UTILITAIRES ==========
    
    function getUserPosition(address user) external view returns (UserPosition memory) {
        return userPositions[user];
    }
    
    function getPoolMetrics() external view returns (PoolMetrics memory) {
        return poolMetrics;
    }
    
    function calculateFees(uint256 profit) external view returns (uint256 platformFee, uint256 trustedWalletFee, uint256 userProfit) {
        platformFee = (profit * platformFeeBps) / MAX_BPS;
        trustedWalletFee = (profit * trustedWalletFeeBps) / MAX_BPS;
        userProfit = profit - platformFee - trustedWalletFee;
        return (platformFee, trustedWalletFee, userProfit);
    }

    // ========== FALLBACK ==========
    
    receive() external payable {}
    
    fallback() external payable {
        revert("Fonction non supportee");
    }
}