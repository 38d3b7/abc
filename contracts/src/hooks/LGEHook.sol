// SPDX-License-Identifier: MIT
pragma solidity =0.8.26;

import {BaseHook} from "v4-periphery/src/utils/BaseHook.sol";
import {IPositionManager} from "v4-periphery/src/interfaces/IPositionManager.sol";
import {IPoolManager, ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {StateLibrary} from "@uniswap/v4-periphery/lib/v4-core/src/libraries/StateLibrary.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/lib/v4-core/test/utils/LiquidityAmounts.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {IPoolInitializer_v4} from "@uniswap/v4-periphery/src/interfaces/IPoolInitializer_v4.sol";
import {SafeCast} from "@uniswap/v4-core/src/libraries/SafeCast.sol";

import {LGEToken} from "../LGEToken.sol";
import {LGECalculationsLibrary} from "../libraries/LGECalculationsLibrary.sol";
import {VestingVault} from "../VestingVault.sol";
import {InferenceEscrow} from "../InferenceEscrow.sol";
import {SafeNativeSender} from "../utils/SafeNativeSender.sol";

/// @title LGEHook (v2)
/// @notice Uniswap v4 hook running a Liquidity Generation Event for one agent token.
///
/// Sale: fixed supply sold over `streamBlocks` at a rising tokens-per-USDC rate
/// (Dutch auction; the USDC price per token falls). All-or-nothing: if the cap
/// does not fill by the end of the window every depositor withdraws a full refund.
///
/// Success: half of the raise pairs with the full supply into a single
/// hook-custodied full-range position; the pool opens at the raise's clearing
/// rate. The other half (treasury) buys 5% of supply from the new pool, vested
/// 12 months to the agent; the remainder credits the agent's inference escrow.
///
/// Fees: the pool LP fee is 0; the hook takes `feeBps` on the USDC leg of every
/// swap, booked 25% to LGE participants / 50% to the agent / 25% to the
/// protocol. Claims are pull-based. Once participant-booked fees equal the total
/// USDC raised, every participant's LP locks forever. Before that, a participant
/// may exit with both legs of their share while 30-day fee volume is below
/// `exitThreshold` (0 disables exits).
///
/// @dev Native currency0 is Arc's 18-decimal USDC. Hook fees are collected by
///      calling `poolManager.take` inside the swap callback (the manager is
///      unlocked at that moment) and returning the same amount as the hook
///      delta, so the swapper's settlement nets to zero. Swaps initiated by the
///      hook itself (the treasury buy) skip these callbacks entirely
///      (v4-core: `msg.sender == address(self)`), so the treasury is never
///      charged the hook fee.
contract LGEHook is BaseHook, SafeNativeSender {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;
    using CurrencyLibrary for Currency;
    using SafeCast for int256;
    using SafeCast for uint256;

    error CannotDirectlyInitialize();
    error CannotWithdrawUSDC();
    error CannotClaimLiquidity();
    error NoUSDCDeposited();
    error WithdrawTooEarly();
    error LGEFinished();
    error WrongPool();
    error InvalidPrice();
    error InvalidAmount();
    error AlreadyClaimed();
    error TooManyTokens();
    error SwapsNotOpen();
    error ExactOutputSellUnsupported();
    error PartialFill();
    error NothingToClaim();
    error LpLockedForever();
    error ExitDisabled();
    error ExitThresholdNotMet();
    error NoLpShare();
    error NotAgent();
    error NotProtocol();
    error BelowMinSweep();
    error TimelockNotElapsed();
    error NoPendingSplits();
    error SplitsMismatch();
    error InvalidSplits();
    error FeeTooHigh();
    error Unauthorized();
    error NoPendingBuy();
    error LGENotSuccessful();

    event Deposited(
        address indexed user,
        uint256 amountOfTokens,
        uint256 amountOfUSDC,
        uint256 usdcContractBalance
    );
    event LGESuccessful(
        PoolKey poolKey,
        uint256 usdcContractBalance,
        uint256 initialSqrtPriceX96,
        uint256 totalUsdcToLiquidity,
        uint128 liquidity
    );
    event LGEFailed();
    event Withdrawn(address indexed user, uint256 amountOfUsdc);
    event FeeCharged(
        uint256 fee,
        uint256 participantShare,
        uint256 agentShare,
        uint256 protocolShare
    );
    event LpShareClaimed(address indexed user, uint256 share);
    event LpLocked(uint256 participantFeesBooked);
    event Exited(
        address indexed user,
        uint256 lpShare,
        uint256 usdcOut,
        uint256 tokensOut,
        uint256 feesPaid
    );
    event ParticipantFeesClaimed(address indexed user, uint256 amount);
    event AgentFeesClaimed(address indexed agent, uint256 amount);
    event ProtocolFeesSwept(uint256 amount);
    event AgentRotated(address indexed oldAgent, address indexed newAgent);
    event TreasuryBuyExecuted(uint256 tokensBought, uint256 usdcSpent, uint256 remaining);
    event TreasuryEscrowed(uint256 amount);
    event SplitsProposed(bytes32 indexed splitsHash, uint64 effectiveAt);
    event SplitsApplied();

    struct UserState {
        uint256 usdcToLiquidityDeposited; // fee weight + LP share basis (zeroed on exit)
        uint256 remainingUsdcDeposited; // treasury-half record (refund path)
        uint256 tokensToLiquidity; // informational
        uint256 accruedFees; // settled-but-unclaimed participant fees
        uint256 userIndexPaid; // participant fee index checkpoint
        bool hasClaimedLp;
        bool exited;
    }

    struct HookParams {
        address poolManager;
        address positionManager;
        address permit2;
        address token;
        address agent;
        address protocol;
        address vestingVault;
        address inferenceEscrow;
        uint256 startBlock;
        uint256 streamBlocks;
        uint256 minTokenPrice; // tokens per USDC at start (both legs 18-dec)
        uint256 maxTokenPrice; // tokens per USDC at end of the window
        uint256 exitThreshold; // 30-day fee volume below which exits open; 0 disables
        uint24 feeBps; // hook fee on the USDC leg, <= MAX_TOTAL_FEE_BPS
        uint64 vestingCliff; // seconds before the agent's tranche starts vesting
        uint64 vestingDuration; // seconds over which the tranche vests
    }

    struct Split {
        address to;
        uint16 bps;
    }

    uint24 public constant FEE = 0; // pool LP fee; the hook fee is separate
    uint24 public constant MAX_TOTAL_FEE_BPS = 300;
    uint256 public constant BPS = 10_000;
    uint256 public constant BUY_BPS = 500; // treasury buys 5% of supply
    uint256 public constant MIN_SWEEP = 25e18; // 25 USDC (18-dec) protocol sweep floor
    uint256 public constant SCALE = 1e18; // participant fee index precision
    uint64 public constant SPLITS_TIMELOCK = 48 hours;

    int24 public constant TICK_SPACING = 1;
    int24 public constant MIN_TICK = TickMath.MIN_TICK;
    int24 public constant MAX_TICK = TickMath.MAX_TICK;

    IPositionManager public immutable positionManager;
    IAllowanceTransfer public immutable permit2;
    LGEToken public immutable token;
    VestingVault public immutable vestingVault;
    InferenceEscrow public immutable inferenceEscrow;

    address public immutable protocol;
    uint256 public immutable startBlock;
    uint256 public immutable streamBlocks;
    uint256 public immutable minTokenPrice;
    uint256 public immutable maxTokenPrice;
    uint256 public immutable exitThreshold;
    uint24 public immutable feeBps;
    uint64 public immutable vestingCliff;
    uint64 public immutable vestingDuration;

    address public agent;

    PoolKey public poolKey;
    mapping(address => UserState) public userStates;

    uint256 public totalEthToLiquidity; // USDC half seeded into the pool (name kept for compat)
    uint256 public totalLiquidity;
    uint256 public totalTokensClaimed;
    uint256 public totalDeposits;
    uint256 public totalUsdcRaised; // 2 * totalEthToLiquidity, fixed at success
    uint160 initialSqrtPriceX96;

    uint256 public positionTokenId;

    bool public isLgeFinished;
    bool public isLgeSuccessful;

    // ---- fee ledgers ----
    uint256 public participantFeesBooked; // cumulative participant share (lock counter)
    uint256 public agentAccrued;
    uint256 public protocolAccrued;
    uint256 public feeIndex; // cumulative participant fees per unit of weight, * SCALE
    uint256 public totalActiveWeight; // USDC weight of non-exited participants

    // ---- LP custody ----
    mapping(address => uint256) public lpShares;
    bool public lpLocked;

    // ---- 30-day fee volume ring ----
    uint64[30] public feeBucketDay;
    uint256[30] public feeBucketAmt;

    // ---- treasury ----
    uint256 public treasuryUsdc; // treasury half not yet spent/escrowed
    uint256 public pendingBuy; // tokens still owed to the vesting schedule

    // ---- protocol splits ----
    Split[] public splits;
    bytes32 public pendingSplitsHash;
    uint64 public splitsEffectiveAt;

    // ---- reentrancy-scoped flag: hook-initiated pool operations ----
    bool private inHookOp;

    constructor(HookParams memory p) BaseHook(IPoolManager(p.poolManager)) {
        if (p.feeBps > MAX_TOTAL_FEE_BPS) revert FeeTooHigh();
        token = LGEToken(p.token);
        positionManager = IPositionManager(p.positionManager);
        permit2 = IAllowanceTransfer(p.permit2);
        vestingVault = VestingVault(p.vestingVault);
        inferenceEscrow = InferenceEscrow(p.inferenceEscrow);
        agent = p.agent;
        protocol = p.protocol;
        startBlock = p.startBlock;
        streamBlocks = p.streamBlocks;
        minTokenPrice = p.minTokenPrice;
        maxTokenPrice = p.maxTokenPrice;
        exitThreshold = p.exitThreshold;
        feeBps = p.feeBps;
        vestingCliff = p.vestingCliff;
        vestingDuration = p.vestingDuration;

        splits.push(Split({to: p.protocol, bps: uint16(BPS)}));
    }

    function getHookPermissions()
        public
        pure
        override
        returns (Hooks.Permissions memory)
    {
        return
            Hooks.Permissions({
                beforeInitialize: true,
                afterInitialize: false,
                beforeAddLiquidity: true,
                afterAddLiquidity: false,
                beforeRemoveLiquidity: true,
                afterRemoveLiquidity: false,
                beforeSwap: true,
                afterSwap: true,
                beforeDonate: false,
                afterDonate: false,
                beforeSwapReturnDelta: true,
                afterSwapReturnDelta: true,
                afterAddLiquidityReturnDelta: false,
                afterRemoveLiquidityReturnDelta: false
            });
    }

    function getPoolId() external view returns (PoolId) {
        return poolKey.toId();
    }

    // ------------------------------------------------------------------
    // Sale
    // ------------------------------------------------------------------

    function currentTokenPrice() public view returns (uint256) {
        return
            LGECalculationsLibrary.calculateCurrentTokenPrice(
                block.number,
                startBlock,
                streamBlocks,
                minTokenPrice,
                maxTokenPrice
            );
    }

    function deposit(uint256 amountOfTokens) external payable {
        _deposit(amountOfTokens);
    }

    /// @notice Deposit with buyer protection: reverts after `deadline` and when
    ///         the current USDC price per token exceeds `maxUsdcPerToken`
    ///         (usdc-wei per whole token; price is the raw token-wei/usdc-wei
    ///         ratio, so per-token cost is 1e18/price usdc-wei).
    function deposit(
        uint256 amountOfTokens,
        uint256 maxUsdcPerToken,
        uint256 deadline
    ) external payable {
        if (block.timestamp > deadline) revert LGEFinished();
        uint256 price = currentTokenPrice(); // token-wei per usdc-wei
        uint256 usdcPerToken = (1e18 + price - 1) / price; // ceil
        if (usdcPerToken > maxUsdcPerToken) revert InvalidPrice();
        _deposit(amountOfTokens);
    }

    function _deposit(uint256 amountOfTokens) internal {
        if (isLgeFinished) revert LGEFinished();
        if (block.number > startBlock + streamBlocks) revert LGEFinished();

        uint256 cap = token.cap();
        uint256 usdcExpected = LGECalculationsLibrary.calculateUsdcNeeded(
            block.number,
            startBlock,
            streamBlocks,
            minTokenPrice,
            maxTokenPrice,
            amountOfTokens
        );

        if (totalTokensClaimed + amountOfTokens > cap) revert TooManyTokens();

        if (msg.value < usdcExpected) revert InvalidPrice();
        if (msg.value > usdcExpected) {
            _sendNative(msg.sender, msg.value - usdcExpected);
        }

        uint256 usdcPortion = usdcExpected / 2;
        totalTokensClaimed += amountOfTokens;
        totalDeposits += 1;

        userStates[msg.sender].usdcToLiquidityDeposited += usdcPortion;
        userStates[msg.sender].remainingUsdcDeposited += usdcPortion;
        userStates[msg.sender].tokensToLiquidity += amountOfTokens;

        emit Deposited(
            msg.sender,
            amountOfTokens,
            usdcPortion,
            address(this).balance
        );

        if (
            block.number >= (startBlock + streamBlocks) ||
            totalTokensClaimed == cap
        ) {
            isLgeFinished = true;
            if (totalTokensClaimed == cap) {
                _finalizeSuccess(cap);
            } else {
                emit LGEFailed();
            }
        }
    }

    function _finalizeSuccess(uint256 cap) internal {
        isLgeSuccessful = true;

        poolKey = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(address(token)),
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(this))
        });

        uint256 balance = address(this).balance;
        totalEthToLiquidity = balance / 2;
        totalUsdcRaised = balance;
        treasuryUsdc = balance - totalEthToLiquidity;
        totalActiveWeight = totalEthToLiquidity;

        // The pool opens at the raise's clearing rate: the full supply paired
        // against the liquidity half of the raise.
        uint256 averagePrice = cap / totalEthToLiquidity; // tokens per USDC
        if (averagePrice == 0) revert InvalidPrice();
        initialSqrtPriceX96 = LGECalculationsLibrary.getSqrtPrice(averagePrice);

        token.mint(address(this), cap);

        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            initialSqrtPriceX96,
            TickMath.getSqrtPriceAtTick(MIN_TICK),
            TickMath.getSqrtPriceAtTick(MAX_TICK),
            totalEthToLiquidity,
            cap
        );

        positionTokenId = positionManager.nextTokenId();

        bytes[] memory params = new bytes[](2);
        bytes[] memory mintParams = new bytes[](3);

        params[0] = abi.encodeWithSelector(
            IPoolInitializer_v4.initializePool.selector,
            poolKey,
            initialSqrtPriceX96
        );

        bytes memory actions = abi.encodePacked(
            uint8(Actions.MINT_POSITION),
            uint8(Actions.SETTLE_PAIR),
            uint8(Actions.SWEEP)
        );
        mintParams[0] = abi.encode(
            poolKey,
            MIN_TICK,
            MAX_TICK,
            liquidity,
            totalEthToLiquidity,
            cap,
            address(this),
            new bytes(0)
        );
        mintParams[1] = abi.encode(poolKey.currency0, poolKey.currency1);
        // Recover any native dust left over from liquidity rounding.
        mintParams[2] = abi.encode(poolKey.currency0, address(this));

        params[1] = abi.encodeWithSelector(
            positionManager.modifyLiquidities.selector,
            abi.encode(actions, mintParams),
            block.timestamp + 60
        );

        _approveTokensForLiquidity();

        inHookOp = true;
        positionManager.multicall{value: totalEthToLiquidity}(params);
        inHookOp = false;

        totalLiquidity = liquidity;

        emit LGESuccessful(
            poolKey,
            address(this).balance,
            initialSqrtPriceX96,
            totalEthToLiquidity,
            liquidity
        );

        // Treasury half: buy 5% of supply from the new pool for the agent's
        // vesting grant; the remainder credits the agent's inference escrow.
        // Must never revert the success path.
        try this.treasuryBuy() {} catch {
            pendingBuy = cap / 20;
        }
    }

    // ------------------------------------------------------------------
    // Treasury buy (5% of supply -> vesting; remainder -> inference escrow)
    // ------------------------------------------------------------------

    /// @notice Executes the treasury buy. Self-called at success; callable by
    ///         anyone to complete a pending buy after a shortfall.
    function treasuryBuy() external {
        uint256 target;
        if (msg.sender == address(this)) {
            target = token.cap() / 20;
        } else {
            if (!isLgeSuccessful) revert LGENotSuccessful();
            if (pendingBuy == 0) revert NoPendingBuy();
            target = pendingBuy;
        }
        _treasuryBuy(target);
    }

    function _treasuryBuy(uint256 target) internal {
        if (target == 0) {
            _escrowTreasuryRemainder();
            return;
        }
        inHookOp = true;
        (uint256 usdcIn, uint256 tokensOut) = abi.decode(
            poolManager.unlock(abi.encode(target)),
            (uint256, uint256)
        );
        inHookOp = false;

        treasuryUsdc -= usdcIn;
        if (tokensOut > 0) {
            token.approve(address(vestingVault), tokensOut);
            vestingVault.create(
                address(token),
                agent,
                uint128(tokensOut),
                vestingCliff,
                vestingDuration
            );
        }
        pendingBuy = target - tokensOut;
        emit TreasuryBuyExecuted(tokensOut, usdcIn, pendingBuy);

        if (pendingBuy == 0) {
            _escrowTreasuryRemainder();
        }
    }

    function _escrowTreasuryRemainder() internal {
        uint256 amount = treasuryUsdc;
        if (amount == 0) return;
        treasuryUsdc = 0;
        inferenceEscrow.creditAgent{value: amount}(agent);
        emit TreasuryEscrowed(amount);
    }

    /// @dev Runs inside the PoolManager's unlock, with the hook as the swap
    ///      caller — hook callbacks are skipped for self-initiated swaps, so the
    ///      treasury is never charged the hook fee.
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        if (!inHookOp) revert Unauthorized();

        uint256 target = abi.decode(data, (uint256));

        BalanceDelta delta = poolManager.swap(
            poolKey,
            SwapParams({
                zeroForOne: true, // USDC in, token out: price moves down
                amountSpecified: int256(target), // exact output
                // Buys push the token's USDC price up (pool price down); allow
                // up to a 4x rise from the clearing rate as a sanity bound.
                sqrtPriceLimitX96: initialSqrtPriceX96 / 2
            }),
            ""
        );

        uint256 usdcIn = uint256(int256(-delta.amount0()));
        uint256 tokensOut = uint256(int256(delta.amount1()));

        poolManager.settle{value: usdcIn}();
        poolManager.take(poolKey.currency1, address(this), tokensOut);

        return abi.encode(usdcIn, tokensOut);
    }

    // ------------------------------------------------------------------
    // Failure path
    // ------------------------------------------------------------------

    function withdraw() external {
        if (isLgeSuccessful) revert CannotWithdrawUSDC();
        if (userStates[msg.sender].usdcToLiquidityDeposited == 0)
            revert NoUSDCDeposited();
        if (block.number < startBlock + streamBlocks) {
            revert WithdrawTooEarly();
        }

        uint256 usdcToWithdraw = userStates[msg.sender].usdcToLiquidityDeposited +
            userStates[msg.sender].remainingUsdcDeposited;

        userStates[msg.sender].usdcToLiquidityDeposited = 0;
        userStates[msg.sender].remainingUsdcDeposited = 0;

        _sendNative(msg.sender, usdcToWithdraw);

        emit Withdrawn(msg.sender, usdcToWithdraw);
    }

    // ------------------------------------------------------------------
    // LP custody: shares, lock, exit
    // ------------------------------------------------------------------

    /// @notice Record the caller's pro rata share of the hook-custodied LP
    ///         position. The position NFT never leaves the hook.
    function claimLiquidity() external returns (uint256 share) {
        if (!isLgeSuccessful) revert CannotClaimLiquidity();

        UserState storage u = userStates[msg.sender];
        if (u.hasClaimedLp) revert AlreadyClaimed();
        if (u.usdcToLiquidityDeposited == 0) revert NoUSDCDeposited();

        u.hasClaimedLp = true;
        share = (u.usdcToLiquidityDeposited * totalLiquidity) / totalEthToLiquidity;
        lpShares[msg.sender] += share;

        emit LpShareClaimed(msg.sender, share);
    }

    /// @notice Exit with both legs of the caller's LP share. Open only until the
    ///         LP locks forever (participant-booked fees >= total USDC raised)
    ///         and while 30-day fee volume is below `exitThreshold`. The exiting
    ///         participant forfeits future fee shares; accrued fees are paid.
    function exitLiquidity() external {
        if (!isLgeSuccessful) revert LGENotSuccessful();
        if (lpLocked) revert LpLockedForever();
        if (exitThreshold == 0) revert ExitDisabled();
        if (feeVolume30d() >= exitThreshold) revert ExitThresholdNotMet();

        UserState storage u = userStates[msg.sender];
        uint256 share = lpShares[msg.sender];
        if (share == 0) revert NoLpShare();

        uint256 weight = u.usdcToLiquidityDeposited;
        uint256 feesOwed = u.accruedFees +
            (weight * (feeIndex - u.userIndexPaid)) /
            SCALE;

        lpShares[msg.sender] = 0;
        u.usdcToLiquidityDeposited = 0;
        u.accruedFees = 0;
        u.userIndexPaid = feeIndex;
        u.exited = true;
        totalActiveWeight -= weight;

        uint256 usdcBefore = address(this).balance;
        uint256 tokenBefore = token.balanceOf(address(this));

        inHookOp = true;
        bytes memory decreaseActions = abi.encodePacked(
            uint8(Actions.DECREASE_LIQUIDITY),
            uint8(Actions.TAKE_PAIR)
        );
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(positionTokenId, share, 0, 0, new bytes(0));
        params[1] = abi.encode(poolKey.currency0, poolKey.currency1, address(this));
        positionManager.modifyLiquidities(
            abi.encode(decreaseActions, params),
            block.timestamp + 60
        );
        inHookOp = false;

        uint256 usdcOut = address(this).balance - usdcBefore;
        uint256 tokensOut = token.balanceOf(address(this)) - tokenBefore;

        if (tokensOut > 0) token.transfer(msg.sender, tokensOut);
        _sendNative(msg.sender, usdcOut + feesOwed);

        emit Exited(msg.sender, share, usdcOut, tokensOut, feesOwed);
    }

    // ------------------------------------------------------------------
    // Fee claims (pull)
    // ------------------------------------------------------------------

    /// @notice Participant claim: pro rata on the caller's liquidity-half
    ///         deposit against all non-exited deposits.
    function claimParticipant() external {
        UserState storage u = userStates[msg.sender];
        if (u.exited) revert NothingToClaim();
        uint256 weight = u.usdcToLiquidityDeposited;
        uint256 pending = u.accruedFees +
            (weight * (feeIndex - u.userIndexPaid)) /
            SCALE;
        if (pending == 0) revert NothingToClaim();

        u.accruedFees = 0;
        u.userIndexPaid = feeIndex;
        _sendNative(msg.sender, pending);

        emit ParticipantFeesClaimed(msg.sender, pending);
    }

    /// @notice Agent claim. Pays the current agent address; anyone may trigger.
    function claimAgent() external {
        uint256 amount = agentAccrued;
        if (amount == 0) revert NothingToClaim();
        agentAccrued = 0;
        _sendNative(agent, amount);
        emit AgentFeesClaimed(agent, amount);
    }

    /// @notice Rotate the agent fee/vesting/escrow beneficiary. Agent-only.
    function setAgent(address newAgent) external {
        if (msg.sender != agent) revert NotAgent();
        emit AgentRotated(agent, newAgent);
        agent = newAgent;
    }

    /// @notice Sweep protocol fees to the splits table. Permissionless keeper
    ///         entry point; sends never revert (failed sends park as credits).
    function claimProtocol() external {
        uint256 amount = protocolAccrued;
        if (amount < MIN_SWEEP) revert BelowMinSweep();
        protocolAccrued = 0;

        uint256 n = splits.length;
        uint256 sent;
        for (uint256 i; i < n; ++i) {
            uint256 portion = i == n - 1 ? amount - sent : (amount * splits[i].bps) / BPS;
            sent += portion;
            _sendNative(splits[i].to, portion);
        }
        emit ProtocolFeesSwept(amount);
    }

    function proposeSplits(Split[] calldata newSplits) external {
        if (msg.sender != protocol) revert NotProtocol();
        pendingSplitsHash = keccak256(abi.encode(newSplits));
        splitsEffectiveAt = uint64(block.timestamp) + SPLITS_TIMELOCK;
        emit SplitsProposed(pendingSplitsHash, splitsEffectiveAt);
    }

    function applySplits(Split[] calldata newSplits) external {
        if (msg.sender != protocol) revert NotProtocol();
        if (pendingSplitsHash == bytes32(0)) revert NoPendingSplits();
        if (block.timestamp < splitsEffectiveAt) revert TimelockNotElapsed();
        if (keccak256(abi.encode(newSplits)) != pendingSplitsHash)
            revert SplitsMismatch();

        uint256 total;
        for (uint256 i; i < newSplits.length; ++i) total += newSplits[i].bps;
        if (total != BPS) revert InvalidSplits();

        delete splits;
        for (uint256 i; i < newSplits.length; ++i) splits.push(newSplits[i]);
        pendingSplitsHash = bytes32(0);
        emit SplitsApplied();
    }

    function splitsLength() external view returns (uint256) {
        return splits.length;
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    /// @notice Fees booked over the trailing 30 days.
    function feeVolume30d() public view returns (uint256 sum) {
        uint64 today = uint64(block.timestamp / 1 days);
        for (uint256 i; i < 30; ++i) {
            if (feeBucketDay[i] + 30 > today) sum += feeBucketAmt[i];
        }
    }

    function participantClaimable(address user) external view returns (uint256) {
        UserState memory u = userStates[user];
        if (u.exited) return 0;
        return
            u.accruedFees +
            (u.usdcToLiquidityDeposited * (feeIndex - u.userIndexPaid)) /
            SCALE;
    }

    // ------------------------------------------------------------------
    // Hook callbacks
    // ------------------------------------------------------------------

    function _beforeInitialize(
        address sender,
        PoolKey calldata key,
        uint160
    ) internal view override returns (bytes4) {
        if (sender == address(positionManager) && isLgeSuccessful) {
            require(
                key.currency0 == Currency.wrap(address(0)) &&
                    key.currency1 == Currency.wrap(address(token)) &&
                    key.hooks == IHooks(address(this)),
                "Wrong pool configuration"
            );
            return this.beforeInitialize.selector;
        }
        revert CannotDirectlyInitialize();
    }

    function _beforeSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        if (PoolId.unwrap(poolKey.toId()) != PoolId.unwrap(key.toId())) {
            revert WrongPool();
        }
        if (!isLgeSuccessful) revert SwapsNotOpen();

        // Exact-input buy (USDC in, token out): the specified leg is the USDC
        // input, so the fee comes off the input here. The swapper's total cost
        // is unchanged; the pool swaps the input net of fee.
        if (params.zeroForOne && params.amountSpecified < 0) {
            uint256 input = uint256(-params.amountSpecified);
            uint256 fee = (input * feeBps) / BPS;
            if (fee > 0) {
                poolManager.take(key.currency0, address(this), fee);
                _bookFee(fee);
                return (
                    BaseHook.beforeSwap.selector,
                    toBeforeSwapDelta(fee.toInt128(), 0),
                    0
                );
            }
        }

        return (
            BaseHook.beforeSwap.selector,
            BeforeSwapDeltaLibrary.ZERO_DELTA,
            0
        );
    }

    function _afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) internal override returns (bytes4, int128) {
        // An exact-output sell specifies the USDC output; the hook fee cannot
        // come out of a specified leg in afterSwap, and charging the pool would
        // tax LPs. Refused instead.
        if (!params.zeroForOne && params.amountSpecified > 0) {
            revert ExactOutputSellUnsupported();
        }

        // Refuse partial fills: the specified leg must be fully consumed.
        int128 specifiedDelta = (params.amountSpecified < 0) == params.zeroForOne
            ? delta.amount0()
            : delta.amount1();
        if (params.zeroForOne && params.amountSpecified < 0) {
            // beforeSwap took `inputFee` from the input; the pool's consumed
            // input is amountSpecified + inputFee. Anything else is a partial fill.
            uint256 input = uint256(-params.amountSpecified);
            uint256 inputFee = (input * feeBps) / BPS;
            int256 expected = params.amountSpecified + int256(inputFee);
            if (specifiedDelta != expected) revert PartialFill();
            return (BaseHook.afterSwap.selector, 0);
        }
        if (specifiedDelta != params.amountSpecified) revert PartialFill();

        // Remaining paths: exact-output buy (USDC in is unspecified) and
        // exact-input sell (USDC out is unspecified). Fee on the USDC leg.
        int128 amount0 = delta.amount0();
        uint256 usdcLeg = amount0 < 0
            ? uint256(int256(-amount0))
            : uint256(int256(amount0));
        uint256 fee = (usdcLeg * feeBps) / BPS;
        if (fee == 0) return (BaseHook.afterSwap.selector, 0);

        poolManager.take(key.currency0, address(this), fee);
        _bookFee(fee);

        // Positive hook delta on the unspecified (USDC) leg: exact-output
        // buyers pay the fee on top; exact-input sellers receive less.
        return (BaseHook.afterSwap.selector, fee.toInt128());
    }

    function _bookFee(uint256 fee) internal {
        uint256 participantShare = fee / 4;
        uint256 agentShare = fee / 2;
        uint256 protocolShare = fee - participantShare - agentShare; // dust to protocol

        participantFeesBooked += participantShare;
        agentAccrued += agentShare;
        protocolAccrued += protocolShare;

        uint256 weight = totalActiveWeight;
        if (weight > 0) {
            feeIndex += (participantShare * SCALE) / weight;
        } else {
            // every participant has exited; the participant share has no
            // claimants and goes to the protocol
            protocolAccrued += participantShare;
        }

        uint64 day = uint64(block.timestamp / 1 days);
        uint256 i = day % 30;
        if (feeBucketDay[i] != day) {
            feeBucketDay[i] = day;
            feeBucketAmt[i] = 0;
        }
        feeBucketAmt[i] += fee;

        if (!lpLocked && participantFeesBooked >= totalUsdcRaised) {
            lpLocked = true;
            emit LpLocked(participantFeesBooked);
        }

        emit FeeCharged(fee, participantShare, agentShare, protocolShare);
    }

    /// @dev Liquidity is hook-managed: only operations the hook itself
    ///      initiates (success-path mint, exit decreases) are allowed. With the
    ///      LP fee at 0, third-party liquidity would earn nothing and could
    ///      never be removed; both directions are gated.
    function _beforeAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        bytes calldata
    ) internal view override returns (bytes4) {
        if (!inHookOp) revert Unauthorized();
        return this.beforeAddLiquidity.selector;
    }

    function _beforeRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        bytes calldata
    ) internal view override returns (bytes4) {
        if (!inHookOp) revert Unauthorized();
        return this.beforeRemoveLiquidity.selector;
    }

    function _approveTokensForLiquidity() internal {
        token.approve(address(permit2), type(uint256).max);
        IAllowanceTransfer(address(permit2)).approve(
            address(token),
            address(positionManager),
            type(uint160).max,
            type(uint48).max
        );
    }

    receive() external payable {}

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
