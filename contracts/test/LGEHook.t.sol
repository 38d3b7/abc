// SPDX-License-Identifier: MIT
pragma solidity =0.8.26;

import {Test} from "forge-std/Test.sol";
import {stdStorage, StdStorage} from "forge-std/StdStorage.sol";
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {StateView} from "@uniswap/v4-periphery/src/lens/StateView.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";

import {PosmTestSetup} from "./utils/PosmTestSetup.sol";
import {LGEManager} from "../src/LGEManager.sol";
import {LGEHook} from "../src/hooks/LGEHook.sol";
import {LGEToken} from "../src/LGEToken.sol";
import {LGECalculationsLibrary} from "../src/libraries/LGECalculationsLibrary.sol";
import {HookMiner} from "../src/libraries/HookMiner.sol";
import {VestingVault} from "../src/VestingVault.sol";
import {InferenceEscrow} from "../src/InferenceEscrow.sol";
import {HookCreationCode} from "../src/HookCreationCode.sol";

import {console} from "forge-std/console.sol";

/// @notice Rejects native transfers, to exercise the pending-credit fallback.
contract RejectingReceiver {
    receive() external payable {
        revert("no native");
    }
}

contract LGEHookTest is Test, PosmTestSetup {
    using stdStorage for StdStorage;

    uint160 private immutable FLAGS =
        uint160(
            Hooks.BEFORE_INITIALIZE_FLAG |
                Hooks.BEFORE_ADD_LIQUIDITY_FLAG |
                Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG |
                Hooks.BEFORE_SWAP_FLAG |
                Hooks.AFTER_SWAP_FLAG |
                Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG |
                Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
        );

    LGEManager lgeManager;
    VestingVault vestingVault;
    InferenceEscrow inferenceEscrow;
    HookCreationCode hookCreationCode;

    address owner = address(0xABCD);
    address tokenAdmin = address(0x1234);
    address tokenCreator = address(0x5678);

    address user = address(0x9ABC);
    address user2 = address(0xDEF0);
    address user3 = address(0x1111);
    address user4 = address(0x2222);

    address tokenAddress;
    address hookAddress;

    uint256 startBlock;
    uint256 deployNonce;

    // default "small" config: full raise is well under 1 USDC
    uint256 constant TOKEN_CAP = 1_774_544e18;
    uint256 constant STREAM_BLOCKS = 3600;
    uint256 constant MIN_PRICE = 1e9; // tokens per USDC
    uint256 constant MAX_PRICE = 4e9;
    uint24 constant FEE_BPS = 100;
    uint256 constant EXIT_THRESHOLD = 1_000e18;

    struct DeployParams {
        uint256 cap;
        uint256 minPrice;
        uint256 maxPrice;
        uint24 feeBps;
        uint256 exitThreshold;
    }

    function setUp() public {
        deployFreshManagerAndRouters();
        deployPosm(manager);

        vestingVault = new VestingVault();
        inferenceEscrow = new InferenceEscrow(owner);
        hookCreationCode = new HookCreationCode();
        lgeManager = new LGEManager(
            address(manager),
            address(lpm),
            address(permit2),
            address(vestingVault),
            address(inferenceEscrow),
            owner,
            address(hookCreationCode)
        );

        vm.prank(tokenCreator);
        vm.roll(31160653);
        startBlock = block.number;
        (tokenAddress, hookAddress) = _deployWithConfig(_defaultParams());
    }

    function _defaultParams() internal pure returns (DeployParams memory) {
        return
            DeployParams({
                cap: TOKEN_CAP,
                minPrice: MIN_PRICE,
                maxPrice: MAX_PRICE,
                feeBps: FEE_BPS,
                exitThreshold: EXIT_THRESHOLD
            });
    }

    function _deployWithConfig(
        DeployParams memory p
    ) internal returns (address, address) {
        bytes32 tokenSalt = keccak256(abi.encodePacked(tokenAdmin, deployNonce++));
        address tokenComputed = _computeTokenAddress(p, tokenSalt);
        bytes32 hookSalt = _mineHookSalt(p, tokenComputed);

        LGEManager.DeploymentConfig memory config;
        config.tokenConfig.tokenAdmin = tokenAdmin;
        config.tokenConfig.name = "Test Token";
        config.tokenConfig.symbol = "TEST";
        config.tokenConfig.image = "https://example.com/image.png";
        config.tokenConfig.metadata = "https://example.com/metadata.json";
        config.tokenConfig.cap = p.cap;
        config.tokenConfig.tokenSalt = tokenSalt;

        config.hookConfig.hookSalt = hookSalt;
        config.hookConfig.startBlock = startBlock;
        config.hookConfig.streamBlocks = STREAM_BLOCKS;
        config.hookConfig.minTokenPrice = p.minPrice;
        config.hookConfig.maxTokenPrice = p.maxPrice;
        config.hookConfig.exitThreshold = p.exitThreshold;
        config.hookConfig.feeBps = p.feeBps;
        config.hookConfig.vestingCliff = 0;
        config.hookConfig.vestingDuration = 365 days;

        return lgeManager.deployToken(config);
    }

    function _computeTokenAddress(
        DeployParams memory p,
        bytes32 tokenSalt
    ) internal view returns (address) {
        bytes memory tokenConstructorArgs = abi.encode(
            "Test Token",
            "TEST",
            tokenAdmin,
            "https://example.com/image.png",
            "https://example.com/metadata.json",
            address(lgeManager),
            p.cap
        );

        return
            vm.computeCreate2Address(
                tokenSalt,
                hashInitCode(type(LGEToken).creationCode, tokenConstructorArgs),
                address(lgeManager)
            );
    }

    function _mineHookSalt(
        DeployParams memory p,
        address tokenComputed
    ) internal view returns (bytes32) {
        LGEHook.HookParams memory hp = LGEHook.HookParams({
            poolManager: address(manager),
            positionManager: address(lpm),
            permit2: address(permit2),
            token: tokenComputed,
            agent: tokenAdmin,
            protocol: owner,
            vestingVault: address(vestingVault),
            inferenceEscrow: address(inferenceEscrow),
            startBlock: startBlock,
            streamBlocks: STREAM_BLOCKS,
            minTokenPrice: p.minPrice,
            maxTokenPrice: p.maxPrice,
            exitThreshold: p.exitThreshold,
            feeBps: p.feeBps,
            vestingCliff: 0,
            vestingDuration: 365 days
        });

        (, bytes32 salt) = HookMiner.find(
            address(lgeManager),
            FLAGS,
            type(LGEHook).creationCode,
            abi.encode(hp)
        );
        return salt;
    }

    function _hook() internal view returns (LGEHook) {
        return LGEHook(payable(hookAddress));
    }

    function _poolKey() internal view returns (PoolKey memory key) {
        (Currency c0, Currency c1, uint24 fee, int24 ts, IHooks hk) = _hook()
            .poolKey();
        key = PoolKey(c0, c1, fee, ts, hk);
    }

    /// @dev Deposit as `who`: the quote is computed BEFORE the prank so the
    ///      external staticcalls in calculateUSDCNeeded cannot consume it.
    function _depositAs(address who, uint256 tokenAmount) internal {
        uint256 needed = calculateUSDCNeeded(tokenAmount);
        vm.deal(who, needed);
        vm.prank(who);
        _hook().deposit{value: needed}(tokenAmount);
    }

    /// @dev Reads the curve params from the currently deployed hook.
    function calculateUSDCNeeded(
        uint256 tokenAmount
    ) internal view returns (uint256) {
        LGEHook h = _hook();
        return
            LGECalculationsLibrary.calculateUsdcNeeded(
                block.number,
                h.startBlock(),
                h.streamBlocks(),
                h.minTokenPrice(),
                h.maxTokenPrice(),
                tokenAmount
            );
    }

    // ------------------------------------------------------------------
    // Sale mechanics
    // ------------------------------------------------------------------

    function test_depositSuccess() public {
        uint256 tokenAmount = 549_088e18;
        uint256 usdcNeeded = calculateUSDCNeeded(tokenAmount);
        hoax(user);
        _hook().deposit{value: usdcNeeded}(tokenAmount);

        LGEHook.UserState memory userState = _getUserState(user);

        assertEq(address(_hook()).balance, usdcNeeded);
        assertEq(userState.usdcToLiquidityDeposited, usdcNeeded / 2);
        assertEq(userState.remainingUsdcDeposited, usdcNeeded / 2);
        assertEq(userState.tokensToLiquidity, tokenAmount);
        assertFalse(userState.hasClaimedLp);
    }

    function test_depositInvalidPriceRevert() public {
        uint256 tokenAmount = 549_088e18;
        uint256 usdcNeeded = calculateUSDCNeeded(tokenAmount);
        hoax(user);
        vm.expectRevert(LGEHook.InvalidPrice.selector);
        _hook().deposit{value: usdcNeeded - 1}(tokenAmount);
    }

    function test_depositAfterLGEFinishedRevert() public {
        _reachCapSuccessfully();

        vm.roll(startBlock + 5001);
        uint256 tokenAmount = 100e18;
        uint256 usdcNeeded = calculateUSDCNeeded(tokenAmount);

        hoax(user);
        vm.expectRevert(LGEHook.LGEFinished.selector);
        _hook().deposit{value: usdcNeeded}(tokenAmount);
    }

    function test_depositMultipleUsers() public {
        vm.roll(startBlock + 100);

        uint256 tokenAmount1 = 1000e18;
        _depositAs(user, tokenAmount1);

        vm.roll(startBlock + 200);
        uint256 tokenAmount2 = 2000e18;
        _depositAs(user2, tokenAmount2);

        assertEq(_getUserState(user).tokensToLiquidity, tokenAmount1);
        assertEq(_getUserState(user2).tokensToLiquidity, tokenAmount2);
        assertEq(_hook().totalTokensClaimed(), tokenAmount1 + tokenAmount2);
        assertEq(_hook().totalDeposits(), 2);
    }

    function test_depositPriceChangesOverTime() public {
        uint256 tokenAmount = 1000e18;

        vm.roll(startBlock + 100);
        uint256 earlyPrice = calculateUSDCNeeded(tokenAmount);

        vm.roll(startBlock + 3000);
        uint256 latePrice = calculateUSDCNeeded(tokenAmount);

        assertTrue(latePrice < earlyPrice); // Dutch: USDC cost falls as the rate rises
    }

    function test_depositOverloadGuards() public {
        uint256 tokenAmount = 1000e18;
        uint256 usdcNeeded = calculateUSDCNeeded(tokenAmount);

        // deadline in the past
        hoax(user);
        vm.expectRevert(LGEHook.LGEFinished.selector);
        _hook().deposit{value: usdcNeeded}(
            tokenAmount,
            type(uint256).max,
            block.timestamp - 1
        );

        // maxUsdcPerToken below the current price
        uint256 price = _hook().currentTokenPrice(); // tokens per USDC
        uint256 usdcPerToken = 1e36 / price; // floor; hook computes the ceil
        hoax(user);
        vm.expectRevert(LGEHook.InvalidPrice.selector);
        _hook().deposit{value: usdcNeeded}(
            tokenAmount,
            usdcPerToken - 1,
            block.timestamp + 1
        );

        // happy path
        hoax(user);
        _hook().deposit{value: usdcNeeded}(
            tokenAmount,
            type(uint256).max,
            block.timestamp + 1
        );
        assertEq(_getUserState(user).tokensToLiquidity, tokenAmount);
    }

    function test_depositRefundParksForRejectingWallet() public {
        RejectingReceiver r = new RejectingReceiver();
        uint256 tokenAmount = 1000e18;
        uint256 usdcNeeded = calculateUSDCNeeded(tokenAmount);
        vm.deal(address(r), usdcNeeded + 1e15);

        vm.prank(address(r));
        _hook().deposit{value: usdcNeeded + 1e15}(tokenAmount); // 1e15 overpay

        // the refund could not be pushed; it sits as a pending credit
        assertEq(_hook().pendingNative(address(r)), 1e15);
    }

    // ------------------------------------------------------------------
    // Success / failure
    // ------------------------------------------------------------------

    function test_LGESuccess() public {
        _reachCapSuccessfully();

        assertTrue(_hook().isLgeSuccessful());
        assertTrue(_hook().isLgeFinished());
        assertTrue(_hook().totalLiquidity() > 0);
        assertTrue(_hook().positionTokenId() > 0);

        // no native dust stranded in the position manager (SWEEP runs)
        assertEq(address(lpm).balance, 0);
    }

    function test_treasuryBuyOnSuccess() public {
        _reachCapSuccessfully();

        // 5% of supply vested to the agent
        (uint128 total, , , , ) = vestingVault.grants(tokenAddress, tokenAdmin);
        assertApproxEqAbs(uint256(total), TOKEN_CAP / 20, TOKEN_CAP / 20 / 100 + 2);

        // remainder credited to the agent's inference escrow
        assertGt(inferenceEscrow.creditOf(tokenAdmin), 0);

        // buy completed atomically; nothing pending
        assertEq(_hook().pendingBuy(), 0);
        assertEq(_hook().treasuryUsdc(), 0);

        // no stranded token tranche left in the hook (dust only)
        assertLt(LGEToken(tokenAddress).balanceOf(hookAddress), TOKEN_CAP / 1000);
    }

    function test_completeTreasuryBuyRevertsWhenNonePending() public {
        _reachCapSuccessfully();
        vm.expectRevert(LGEHook.NoPendingBuy.selector);
        _hook().treasuryBuy();
    }

    function test_LGEFailedPartialCapReached() public {
        vm.roll(startBlock + 100);
        uint256 tokenAmount = 1000e18;
        _depositAs(user, tokenAmount);

        vm.roll(startBlock + STREAM_BLOCKS);
        _depositAs(user2, tokenAmount);

        assertFalse(_hook().isLgeSuccessful());
        assertTrue(_hook().isLgeFinished());
    }

    function test_withdrawAfterLGEFailed() public {
        vm.roll(startBlock + 100);
        uint256 tokenAmount = 1000e18;
        uint256 usdcNeeded = calculateUSDCNeeded(tokenAmount);

        hoax(user);
        _hook().deposit{value: usdcNeeded}(tokenAmount);

        vm.roll(startBlock + STREAM_BLOCKS);
        _depositAs(user2, tokenAmount);

        uint256 balanceBefore = user.balance;

        vm.prank(user);
        _hook().withdraw();

        assertEq(user.balance - balanceBefore, usdcNeeded);

        LGEHook.UserState memory userState = _getUserState(user);
        assertEq(userState.usdcToLiquidityDeposited, 0);
        assertEq(userState.remainingUsdcDeposited, 0);
    }

    function test_withdrawTooEarlyRevert() public {
        vm.roll(startBlock + 100);
        uint256 tokenAmount = 1000e18;
        _depositAs(user, tokenAmount);

        vm.roll(startBlock + STREAM_BLOCKS - 1);
        vm.prank(user);
        vm.expectRevert(LGEHook.WithdrawTooEarly.selector);
        _hook().withdraw();
    }

    function test_withdrawAfterSuccessfulLGERevert() public {
        _reachCapSuccessfully();

        vm.prank(user);
        vm.expectRevert(LGEHook.CannotWithdrawUSDC.selector);
        _hook().withdraw();
    }

    function test_withdrawNoDepositRevert() public {
        vm.roll(startBlock + 5001);

        vm.prank(user3);
        vm.expectRevert(LGEHook.NoUSDCDeposited.selector);
        _hook().withdraw();
    }

    // ------------------------------------------------------------------
    // LP shares (hook-custodied)
    // ------------------------------------------------------------------

    function test_claimLiquidityRecordsShare() public {
        _reachCapSuccessfully();

        uint256 weight = _getUserState(user).usdcToLiquidityDeposited;
        uint256 totalLiquidity = _hook().totalLiquidity();
        uint256 totalLiq = _hook().totalEthToLiquidity();

        vm.prank(user);
        uint256 share = _hook().claimLiquidity();
        assertTrue(share > 0);
        assertEq(_hook().lpShares(user), share);
        assertEq(share, (weight * totalLiquidity) / totalLiq);

        // deposit weight is preserved (it is the fee weight)
        assertGt(_getUserState(user).usdcToLiquidityDeposited, 0);
        assertTrue(_getUserState(user).hasClaimedLp);
    }

    function test_claimLiquidityDoubleClaimRevert() public {
        _reachCapSuccessfully();

        vm.prank(user);
        _hook().claimLiquidity();

        vm.prank(user);
        vm.expectRevert(LGEHook.AlreadyClaimed.selector);
        _hook().claimLiquidity();
    }

    // ------------------------------------------------------------------
    // Swap fees
    // ------------------------------------------------------------------

    function _swapBuyExactInput(
        uint256 usdcIn
    ) internal returns (BalanceDelta delta) {
        PoolKey memory key = _poolKey();
        vm.deal(address(this), usdcIn);
        delta = swapRouter.swap{value: usdcIn}(
            key,
            SwapParams({
                zeroForOne: true,
                amountSpecified: -int256(usdcIn),
                sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            PoolSwapTest.TestSettings(false, false),
            ""
        );
    }

    function test_swapExactInputBuyTakesFeeOnInput() public {
        _reachCapSuccessfully();

        uint256 usdcIn = _hook().totalUsdcRaised() / 100;
        uint256 expectedFee = (usdcIn * FEE_BPS) / 10_000;

        uint256 hookBalBefore = hookAddress.balance;
        BalanceDelta delta = _swapBuyExactInput(usdcIn);

        // hook collected the fee in native USDC
        assertEq(hookAddress.balance - hookBalBefore, expectedFee);

        // the swapper settled the full input; the pool saw it net of fee
        assertEq(delta.amount0(), -int256(usdcIn));

        // ledgers: 25 / 50 / 25, dust to protocol
        uint256 participant = expectedFee / 4;
        uint256 agentShare = expectedFee / 2;
        uint256 protocol = expectedFee - participant - agentShare;
        assertEq(_hook().participantFeesBooked(), participant);
        assertEq(_hook().agentAccrued(), agentShare);
        assertEq(_hook().protocolAccrued(), protocol);
    }

    function test_swapExactOutputBuyGrossesUpFee() public {
        _reachCapSuccessfully();

        PoolKey memory key = _poolKey();
        uint256 tokensOut = TOKEN_CAP / 1000;

        uint256 hookBalBefore = hookAddress.balance;

        vm.deal(address(this), 1 ether);
        uint256 balBefore = address(this).balance;
        BalanceDelta delta = swapRouter.swap{value: 1 ether}(
            key,
            SwapParams({
                zeroForOne: true,
                amountSpecified: int256(tokensOut),
                sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            PoolSwapTest.TestSettings(false, false),
            ""
        );

        // caller delta = pool cost + fee on top (grossed up)
        uint256 paid = uint256(int256(-delta.amount0()));
        uint256 hookFee = hookAddress.balance - hookBalBefore;
        // fee = poolCost * 100/10000 and paid = poolCost + fee  =>  fee ≈ paid/101
        assertApproxEqAbs(hookFee, paid / 101, 2);
        assertEq(balBefore - address(this).balance, paid);
        assertEq(uint256(int256(delta.amount1())), tokensOut);
    }

    function test_swapSellExactInputDeductsFee() public {
        _reachCapSuccessfully();

        // buy first to get tokens
        uint256 usdcIn = _hook().totalUsdcRaised() / 100;
        BalanceDelta buyDelta = _swapBuyExactInput(usdcIn);
        uint256 tokensBought = uint256(int256(buyDelta.amount1()));

        LGEToken(tokenAddress).approve(address(swapRouter), type(uint256).max);

        PoolKey memory key = _poolKey();
        uint256 balBefore = address(this).balance;
        uint256 hookBalBefore = hookAddress.balance;

        BalanceDelta delta = swapRouter.swap(
            key,
            SwapParams({
                zeroForOne: false,
                amountSpecified: -int256(tokensBought),
                sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
            }),
            PoolSwapTest.TestSettings(false, false),
            ""
        );

        // caller delta = gross output minus the fee
        uint256 received = uint256(int256(delta.amount0()));
        uint256 hookFee = hookAddress.balance - hookBalBefore;
        // fee = gross/100 and received = gross - fee  =>  fee ≈ received/99
        assertApproxEqAbs(hookFee, received / 99, 2);
        assertEq(address(this).balance - balBefore, received);
    }

    function test_swapExactOutputSellReverts() public {
        _reachCapSuccessfully();

        PoolKey memory key = _poolKey();
        vm.deal(address(this), 1 ether);
        vm.expectRevert(); // ExactOutputSellUnsupported, wrapped by the PoolManager
        swapRouter.swap(
            key,
            SwapParams({
                zeroForOne: false,
                amountSpecified: int256(1e6), // exact USDC out
                sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
            }),
            PoolSwapTest.TestSettings(false, false),
            ""
        );
    }

    function test_swapsOpenIndefinitelyAfterSuccess() public {
        _reachCapSuccessfully();

        // far past the old TOTAL_BLOCKS swap window
        vm.roll(startBlock + 1_000_000);
        uint256 usdcIn = _hook().totalUsdcRaised() / 1000;
        BalanceDelta delta = _swapBuyExactInput(usdcIn);
        assertTrue(delta.amount1() > 0);
    }

    function test_thirdPartyLiquidityReverts() public {
        _reachCapSuccessfully();

        PoolKey memory key = _poolKey();
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(
            key,
            TickMath.MIN_TICK,
            TickMath.MAX_TICK,
            uint256(1000),
            uint256(0.001 ether),
            uint256(1e18),
            user3,
            new bytes(0)
        );
        params[1] = abi.encode(key.currency0, key.currency1);

        vm.deal(user3, 1 ether);
        vm.startPrank(user3);
        vm.expectRevert(); // Unauthorized, wrapped by posm/PoolManager
        lpm.modifyLiquidities{value: 0.001 ether}(
            abi.encode(
                abi.encodePacked(
                    uint8(Actions.MINT_POSITION),
                    uint8(Actions.SETTLE_PAIR)
                ),
                params
            ),
            block.timestamp + 60
        );
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // Fee claims
    // ------------------------------------------------------------------

    function test_claimParticipantProRata() public {
        _reachCapSuccessfully();

        uint256 usdcIn = _hook().totalUsdcRaised() / 100;
        _swapBuyExactInput(usdcIn);

        uint256 booked = _hook().participantFeesBooked();
        assertGt(booked, 0);

        uint256 weight = _getUserState(user).usdcToLiquidityDeposited;
        uint256 totalWeight = _hook().totalActiveWeight();
        uint256 expected = (booked * weight) / totalWeight;
        assertGt(expected, 0);

        uint256 balBefore = user.balance;
        vm.prank(user);
        _hook().claimParticipant();
        assertApproxEqAbs(user.balance - balBefore, expected, 4);

        // second claim reverts: nothing new accrued
        vm.prank(user);
        vm.expectRevert(LGEHook.NothingToClaim.selector);
        _hook().claimParticipant();
    }

    function test_claimAgentAndRotation() public {
        _reachCapSuccessfully();

        uint256 usdcIn = _hook().totalUsdcRaised() / 100;
        _swapBuyExactInput(usdcIn);

        uint256 accrued = _hook().agentAccrued();
        assertGt(accrued, 0);

        uint256 balBefore = tokenAdmin.balance;
        _hook().claimAgent(); // permissionless trigger, pays the agent
        assertEq(tokenAdmin.balance - balBefore, accrued);
        assertEq(_hook().agentAccrued(), 0);

        // rotate the agent
        vm.prank(tokenAdmin);
        _hook().setAgent(user3);
        assertEq(_hook().agent(), user3);

        vm.prank(tokenAdmin);
        vm.expectRevert(LGEHook.NotAgent.selector);
        _hook().setAgent(user4);
    }

    function test_claimProtocolSweepAndSplits() public {
        // bigger raise so protocol fees clear MIN_SWEEP (25 USDC)
        DeployParams memory p = _defaultParams();
        p.cap = 10_000e18;
        p.minPrice = 1; // 1 token per USDC (raw ratio, both legs 18-dec)
        p.maxPrice = 4;
        (tokenAddress, hookAddress) = _deployWithConfig(p);
        _reachCapSuccessfully();

        _swapBuyExactInput(12_000e18);

        uint256 accrued = _hook().protocolAccrued();
        assertGe(accrued, 25e18);

        uint256 balBefore = owner.balance;
        _hook().claimProtocol(); // permissionless
        assertEq(owner.balance - balBefore, accrued); // default split: 100% to protocol
        assertEq(_hook().protocolAccrued(), 0);
    }

    function test_claimProtocolBelowMinSweepReverts() public {
        _reachCapSuccessfully(); // tiny raise -> tiny fees

        uint256 usdcIn = _hook().totalUsdcRaised() / 100;
        _swapBuyExactInput(usdcIn);

        vm.expectRevert(LGEHook.BelowMinSweep.selector);
        _hook().claimProtocol();
    }

    function test_splitsTimelock() public {
        _reachCapSuccessfully();

        LGEHook.Split[] memory newSplits = new LGEHook.Split[](2);
        newSplits[0] = LGEHook.Split({to: owner, bps: 5000});
        newSplits[1] = LGEHook.Split({to: user3, bps: 5000});

        vm.prank(owner);
        _hook().proposeSplits(newSplits);

        vm.prank(owner);
        vm.expectRevert(LGEHook.TimelockNotElapsed.selector);
        _hook().applySplits(newSplits);

        vm.warp(block.timestamp + 48 hours);
        vm.prank(owner);
        _hook().applySplits(newSplits);
        assertEq(_hook().splitsLength(), 2);

        // non-protocol cannot propose
        vm.prank(user3);
        vm.expectRevert(LGEHook.NotProtocol.selector);
        _hook().proposeSplits(newSplits);
    }

    // ------------------------------------------------------------------
    // Lock and exit
    // ------------------------------------------------------------------

    function test_lockTransition() public {
        _reachCapSuccessfully();

        vm.prank(user);
        _hook().claimLiquidity();

        // drive booked fees to just below the raise, then cross with one swap
        uint256 raised = _hook().totalUsdcRaised();
        stdstore
            .target(hookAddress)
            .sig("participantFeesBooked()")
            .checked_write(raised - 1);

        _swapBuyExactInput(raised / 100);

        assertTrue(_hook().lpLocked());

        vm.prank(user);
        vm.expectRevert(LGEHook.LpLockedForever.selector);
        _hook().exitLiquidity();
    }

    function test_exitLiquidityPaysBothLegsAndFees() public {
        _reachCapSuccessfully();

        vm.prank(user);
        uint256 share = _hook().claimLiquidity();
        assertGt(share, 0);

        // book some fees first
        _swapBuyExactInput(_hook().totalUsdcRaised() / 100);

        uint256 claimable = _hook().participantClaimable(user);
        assertGt(claimable, 0);

        uint256 weight = _getUserState(user).usdcToLiquidityDeposited;
        uint256 totalWeightBefore = _hook().totalActiveWeight();

        uint256 usdcBefore = user.balance;
        uint256 tokenBefore = LGEToken(tokenAddress).balanceOf(user);

        vm.prank(user);
        _hook().exitLiquidity();

        // both legs paid out, plus accrued fees
        assertGt(user.balance - usdcBefore, claimable);
        assertGt(LGEToken(tokenAddress).balanceOf(user), tokenBefore);

        // share and weight cleared; future participant claims revert
        assertEq(_hook().lpShares(user), 0);
        assertEq(_getUserState(user).usdcToLiquidityDeposited, 0);
        assertTrue(_getUserState(user).exited);
        assertEq(_hook().totalActiveWeight(), totalWeightBefore - weight);

        vm.prank(user);
        vm.expectRevert(LGEHook.NothingToClaim.selector);
        _hook().claimParticipant();
    }

    function test_exitDisabledWhenThresholdZero() public {
        DeployParams memory p = _defaultParams();
        p.exitThreshold = 0;
        (tokenAddress, hookAddress) = _deployWithConfig(p);
        _reachCapSuccessfully();

        vm.prank(user);
        _hook().claimLiquidity();

        vm.prank(user);
        vm.expectRevert(LGEHook.ExitDisabled.selector);
        _hook().exitLiquidity();
    }

    function test_exitBlockedWhenVolumeAboveThreshold() public {
        DeployParams memory p = _defaultParams();
        p.exitThreshold = 1; // any booked fee blocks the exit
        (tokenAddress, hookAddress) = _deployWithConfig(p);
        _reachCapSuccessfully();

        vm.prank(user);
        _hook().claimLiquidity();

        _swapBuyExactInput(_hook().totalUsdcRaised() / 100);

        vm.prank(user);
        vm.expectRevert(LGEHook.ExitThresholdNotMet.selector);
        _hook().exitLiquidity();
    }

    // ------------------------------------------------------------------
    // Vesting + inference escrow
    // ------------------------------------------------------------------

    function test_vestingSchedule() public {
        _reachCapSuccessfully();

        vm.warp(block.timestamp + 182.5 days);
        uint128 claimable = vestingVault.claimable(tokenAddress, tokenAdmin);
        (uint128 total, , , , ) = vestingVault.grants(tokenAddress, tokenAdmin);
        assertApproxEqAbs(uint256(claimable), uint256(total) / 2, 2);

        uint256 balBefore = LGEToken(tokenAddress).balanceOf(tokenAdmin);
        vm.prank(tokenAdmin);
        vestingVault.claim(tokenAddress);
        assertEq(
            LGEToken(tokenAddress).balanceOf(tokenAdmin) - balBefore,
            claimable
        );
    }

    function test_inferenceEscrow() public {
        _reachCapSuccessfully();

        uint256 credit = inferenceEscrow.creditOf(tokenAdmin);
        assertGt(credit, 0);

        // gas funding within the cap
        uint256 gasAmount = credit / 4;
        vm.prank(owner);
        inferenceEscrow.setGasCap(gasAmount);
        uint256 balBefore = tokenAdmin.balance;
        vm.prank(tokenAdmin);
        inferenceEscrow.fundGas(gasAmount);
        assertEq(tokenAdmin.balance - balBefore, gasAmount);

        // over the cap reverts (within credit, so the cap is what bites)
        vm.prank(tokenAdmin);
        vm.expectRevert(InferenceEscrow.GasCapExceeded.selector);
        inferenceEscrow.fundGas(gasAmount * 2);

        // provider flow: propose, timelock, apply, pay
        vm.prank(owner);
        inferenceEscrow.proposeProvider(user3);
        vm.prank(owner);
        vm.expectRevert(InferenceEscrow.TimelockNotElapsed.selector);
        inferenceEscrow.applyProvider();
        vm.warp(block.timestamp + 48 hours);
        vm.prank(owner);
        inferenceEscrow.applyProvider();

        uint256 providerBefore = user3.balance;
        vm.prank(tokenAdmin);
        inferenceEscrow.payProvider(credit / 8);
        assertEq(user3.balance - providerBefore, credit / 8);

        // provider settable once
        vm.prank(owner);
        vm.expectRevert(InferenceEscrow.ProviderAlreadySet.selector);
        inferenceEscrow.proposeProvider(user4);
    }

    // ------------------------------------------------------------------
    // Treasury buy at several raise sizes (DECISIONS.md open question #7)
    // ------------------------------------------------------------------

    function test_treasuryBuyAcrossRaiseSizes() public {
        uint256[3] memory caps = [
            uint256(1_000e18),
            uint256(1_774_544e18),
            uint256(10_000_000e18)
        ];
        for (uint256 i; i < 3; ++i) {
            startBlock = block.number;
            DeployParams memory p = _defaultParams();
            p.cap = caps[i];
            p.minPrice = 1e18;
            p.maxPrice = 4e18;
            (tokenAddress, hookAddress) = _deployWithConfig(p);
            _reachCapSuccessfully();

            (uint128 total, , , , ) = vestingVault.grants(
                tokenAddress,
                tokenAdmin
            );
            // the 5% buy fills (nearly) completely at every size
            assertApproxEqAbs(
                uint256(total),
                caps[i] / 20,
                caps[i] / 20 / 100 + 2
            );
            assertGt(inferenceEscrow.creditOf(tokenAdmin), 0);
        }
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _getUserState(
        address userState
    ) internal view returns (LGEHook.UserState memory) {
        (
            uint256 usdcToLiquidityDeposited,
            uint256 remainingUsdcDeposited,
            uint256 tokensToLiquidity,
            uint256 accruedFees,
            uint256 userIndexPaid,
            bool hasClaimedLp,
            bool exited
        ) = _hook().userStates(userState);

        return
            LGEHook.UserState({
                usdcToLiquidityDeposited: usdcToLiquidityDeposited,
                remainingUsdcDeposited: remainingUsdcDeposited,
                tokensToLiquidity: tokensToLiquidity,
                accruedFees: accruedFees,
                userIndexPaid: userIndexPaid,
                hasClaimedLp: hasClaimedLp,
                exited: exited
            });
    }

    function _reachCapSuccessfully() internal {
        uint256 cap = LGEToken(tokenAddress).cap();
        uint256 tokensPerUser = cap / 4;

        vm.roll(startBlock + 1000);
        _depositAs(user, tokensPerUser);

        vm.roll(startBlock + 2000);
        _depositAs(user2, tokensPerUser);

        vm.roll(startBlock + 3000);
        _depositAs(user3, tokensPerUser);

        vm.roll(startBlock + STREAM_BLOCKS);
        _depositAs(user4, tokensPerUser);
    }
}
