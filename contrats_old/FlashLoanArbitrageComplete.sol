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
 * @notice Contrat complet pour Flash Loan avec gestion de dépôts, retraits et arbitrages
 * @dev Supporte les dépôts USDC/USDT, multiple flash loans, et gestion complète des fonds
 */
contract FlashLoanArbitrageComplete is FlashLoanSimpleReceiverBase, Ownable, ReentrancyGuard, Pausable {
    
    // ========== ÉVÉNEMENTS ==========
    
    // Événements de gestion des fonds
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
    
    event EmergencyWithdrawal(
        address indexed token,
        uint256 amount,
        address indexed to,
        string reason,
        uint256 timestamp
    );
    
    // Événements d'arbitrage
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
    
    event MultipleFlashLoanExecuted(
        address[] assets,
        uint256[] amounts,
        uint256[] premiums,
        uint256 totalProfit,
        uint256 timestamp
    );
    
    // Événements d'administration
    event TrustedWalletSet(address indexed oldWallet, address indexed newWallet);
    event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);
    event MaxDepositUpdated(address indexed token, uint256 oldMax, uint256 newMax);
    event TokenAuthorized(address indexed token, bool authorized);
    event DEXAuthorized(address indexed dex, bool authorized);
    
    // Événements de monitoring
    event ProfitDistributed(
        uint256 totalProfit,
        uint256 platformShare,
        uint256 userShare,
        uint256 timestamp
    );
    
    event PerformanceReport(
        uint256 period,
        uint256 totalVolume,
        uint256 totalProfit,
        uint256 successfulTrades,
        uint256 failedTrades,
        uint256 averageAPR
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

    // ========== VARIABLES D'ÉTAT ==========
    
    address public immutable USDC;
    address public immutable USDT;
    
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

    // ========== CONSTRUCTEUR ==========
    
    constructor(
        address _addressProvider,
        address _usdc,
        address _usdt,
        address _trustedWallet
    ) FlashLoanSimpleReceiverBase(IPoolAddressesProvider(_addressProvider)) Ownable(msg.sender) {
        USDC = _usdc;
        USDT = _usdt;
        trustedWallet = _trustedWallet;
        
        authorizedTokens[_usdc] = true;
        authorizedTokens[_usdt] = true;
        
        maxDepositAmounts[_usdc] = 10000000 * 1e6;
        maxDepositAmounts[_usdt] = 10000000 * 1e6;
        
        authorizedDEXs[0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff] = true; // QuickSwap
        authorizedDEXs[0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506] = true; // SushiSwap
        
        poolMetrics.lastUpdateTime = block.timestamp;
        lastReportTime = block.timestamp;
    }

    // ========== FONCTIONS DE DÉPÔT ==========
    
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

    // ========== FONCTIONS DE RETRAIT ==========
    
    function withdraw(address token, uint256 shares)
        external
        nonReentrant
        onlyAuthorizedToken(token)
        validAmount(shares)
    {
        UserPosition storage position = userPositions[msg.sender];
        
        uint256 userShares;
        uint256 totalShares;
        
        if (token == USDC) {
            userShares = position.usdcShares;
            totalShares = poolMetrics.totalUSDCShares;
        } else if (token == USDT) {
            userShares = position.usdtShares;
            totalShares = poolMetrics.totalUSDTShares;
        } else {
            revert("Token non supporte");
        }
        
        require(shares <= userShares, "Parts insuffisantes");
        require(totalShares > 0, "Aucune part en circulation");
        
        uint256 currentBalance = IERC20(token).balanceOf(address(this));
        uint256 withdrawAmount = (shares * currentBalance) / totalShares;
        
        require(withdrawAmount > 0, "Montant de retrait nul");
        require(withdrawAmount <= currentBalance, "Liquidite insuffisante");
        
        if (token == USDC) {
            position.usdcShares -= shares;
            poolMetrics.totalUSDCShares -= shares;
            poolMetrics.totalUSDCDeposits = poolMetrics.totalUSDCDeposits > withdrawAmount 
                ? poolMetrics.totalUSDCDeposits - withdrawAmount : 0;
        } else {
            position.usdtShares -= shares;
            poolMetrics.totalUSDTShares -= shares;
            poolMetrics.totalUSDTDeposits = poolMetrics.totalUSDTDeposits > withdrawAmount 
                ? poolMetrics.totalUSDTDeposits - withdrawAmount : 0;
        }
        
        position.totalWithdrawn += withdrawAmount;
        position.withdrawalCount++;
        
        require(IERC20(token).transfer(msg.sender, withdrawAmount), "Transfert echoue");
        
        emit Withdrawal(msg.sender, token, withdrawAmount, shares, block.timestamp);
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
    
    function trustedWalletWithdraw(address token, uint256 amount)
        external
        validAmount(amount)
    {
        require(msg.sender == trustedWallet, "Seul le wallet de confiance");
        require(trustedWallet != address(0), "Wallet de confiance non defini");
        
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(amount <= balance, "Solde insuffisant");
        
        require(IERC20(token).transfer(trustedWallet, amount), "Transfert echoue");
        
        emit EmergencyWithdrawal(token, amount, trustedWallet, "Trusted wallet withdrawal", block.timestamp);
    }

    // ========== FONCTIONS FLASH LOAN ==========
    
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
        
        uint256 profit;
        if (flashData.flashLoanType == 0) {
            profit = _performArbitrage(flashData.params, amount);
        }
        
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
        emit ProfitDistributed(profit, platformFee + trustedWalletFee, userProfit, block.timestamp);
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
        emit TokenAuthorized(token, authorized);
    }
    
    function setDEXAuthorization(address dex, bool authorized) external onlyOwner {
        authorizedDEXs[dex] = authorized;
        emit DEXAuthorized(dex, authorized);
    }
    
    function toggleEmergencyStop() external onlyOwner {
        emergencyStop = !emergencyStop;
        if (emergencyStop) {
            _pause();
        } else {
            _unpause();
        }
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