// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPositionManager} from "v4-periphery/src/interfaces/IPositionManager.sol";
import {HookMiner} from "v4-periphery/src/utils/HookMiner.sol";

import {LGEManager} from "../src/LGEManager.sol";
import {LGEHook} from "../src/hooks/LGEHook.sol";
import {LGEToken} from "../src/LGEToken.sol";
import {LGECalculationsLibrary} from "../src/libraries/LGECalculationsLibrary.sol";

/// @title SmokeLGE
/// @notice Arc testnet smoke driver for the LGE flow. One script, parameterized
///         by env vars; SMOKE_ACTION selects the step:
///           create   — LGE_MANAGER, DEPLOYER, TOKEN_NAME, TOKEN_SYMBOL
///                      [, START_BLOCK, CAP, STREAM_BLOCKS, MIN_PRICE, MAX_PRICE,
///                        EXIT_THRESHOLD, FEE_BPS]
///           deposit  — HOOK, AMOUNT (wei of tokens) or FILL_CAP=1
///           claim    — HOOK (records the caller's LP share; hook-custodied)
///           withdraw — HOOK
///           status   — HOOK (view only, no broadcast)
/// @dev Run with the Arc library link so type(LGEHook).creationCode matches the
///      console bytecode and the mined salt is valid:
///      FOUNDRY_LIBRARIES="src/libraries/LGECalculationsLibrary.sol:LGECalculationsLibrary:<libAddr>" \
///      forge script script/SmokeLGE.s.sol --rpc-url arc_testnet --broadcast \
///        --private-key $PRIVATE_KEY --gas-price 20000000000 --priority-gas-price 1000000000
contract SmokeLGE is Script {
    function run() external {
        string memory action = vm.envString("SMOKE_ACTION");
        bytes32 a = keccak256(bytes(action));
        if (a == keccak256("create")) {
            create();
        } else if (a == keccak256("deposit")) {
            deposit();
        } else if (a == keccak256("claim")) {
            claim();
        } else if (a == keccak256("withdraw")) {
            withdraw();
        } else if (a == keccak256("status")) {
            status();
        } else {
            revert("unknown SMOKE_ACTION");
        }
    }

    function create() internal {
        address deployer = vm.envAddress("DEPLOYER");
        LGEManager manager = LGEManager(vm.envAddress("LGE_MANAGER"));
        string memory name = vm.envString("TOKEN_NAME");
        string memory symbol = vm.envString("TOKEN_SYMBOL");
        uint256 startBlock = vm.envOr("START_BLOCK", block.number + 3);
        uint256 cap = vm.envOr("CAP", uint256(1_000_000e18));
        uint256 streamBlocks = vm.envOr("STREAM_BLOCKS", uint256(172_800)); // 24h at 0.5s blocks
        uint256 minPrice = vm.envOr("MIN_PRICE", uint256(1e18)); // tokens per USDC
        uint256 maxPrice = vm.envOr("MAX_PRICE", uint256(4e18));
        uint256 exitThreshold = vm.envOr("EXIT_THRESHOLD", uint256(0)); // 0 = exits disabled
        uint24 feeBps = uint24(vm.envOr("FEE_BPS", uint256(100)));

        bytes32 tokenSalt = keccak256(abi.encodePacked(deployer, block.timestamp));
        bytes memory tokenArgs = abi.encode(
            name,
            symbol,
            deployer,
            "",
            "",
            address(manager),
            cap
        );
        bytes32 tokenInitHash = keccak256(
            abi.encodePacked(type(LGEToken).creationCode, tokenArgs)
        );
        address tokenAddress = vm.computeCreate2Address(
            tokenSalt,
            tokenInitHash,
            address(manager)
        );

        LGEHook.HookParams memory hp = LGEHook.HookParams({
            poolManager: manager._poolManager(),
            positionManager: manager._positionManager(),
            permit2: manager._permit2(),
            token: tokenAddress,
            agent: deployer,
            protocol: manager._protocol(),
            vestingVault: manager._vestingVault(),
            inferenceEscrow: manager._inferenceEscrow(),
            startBlock: startBlock,
            streamBlocks: streamBlocks,
            minTokenPrice: minPrice,
            maxTokenPrice: maxPrice,
            exitThreshold: exitThreshold,
            feeBps: feeBps,
            vestingCliff: 0,
            vestingDuration: 365 days
        });
        bytes memory hookArgs = abi.encode(hp);
        (address hookAddress, bytes32 hookSalt) = HookMiner.find(
            address(manager),
            uint160(manager.FLAGS()),
            type(LGEHook).creationCode,
            hookArgs
        );

        vm.startBroadcast();
        (address deployedToken, address deployedHook) = manager.deployToken(
            LGEManager.DeploymentConfig({
                tokenConfig: LGEManager.TokenConfig({
                    tokenAdmin: deployer,
                    name: name,
                    symbol: symbol,
                    image: "",
                    metadata: "",
                    cap: cap,
                    tokenSalt: tokenSalt
                }),
                hookConfig: LGEManager.HookConfig({
                    hookSalt: hookSalt,
                    startBlock: startBlock,
                    streamBlocks: streamBlocks,
                    minTokenPrice: minPrice,
                    maxTokenPrice: maxPrice,
                    exitThreshold: exitThreshold,
                    feeBps: feeBps,
                    vestingCliff: 0,
                    vestingDuration: 365 days
                })
            })
        );
        vm.stopBroadcast();

        require(deployedToken == tokenAddress, "token address mismatch");
        require(deployedHook == hookAddress, "hook address mismatch");

        console.log("TOKEN_ADDRESS=%s", deployedToken);
        console.log("HOOK_ADDRESS=%s", deployedHook);
        console.log("START_BLOCK=%s", startBlock);
    }

    function deposit() internal {
        LGEHook hook = LGEHook(payable(vm.envAddress("HOOK")));
        uint256 amount;
        if (vm.envOr("FILL_CAP", false)) {
            amount = hook.token().cap() - hook.totalTokensClaimed();
        } else {
            amount = vm.envUint("AMOUNT");
        }
        uint256 price = hook.currentTokenPrice();
        uint256 nativeNeeded = LGECalculationsLibrary.calculateUsdcNeeded(
            block.number,
            hook.startBlock(),
            hook.streamBlocks(),
            hook.minTokenPrice(),
            hook.maxTokenPrice(),
            amount
        );
        uint256 value = (nativeNeeded * 105) / 100;

        console.log("PRICE=%s", price);
        console.log("AMOUNT=%s", amount);
        console.log("NATIVE_NEEDED=%s", nativeNeeded);

        vm.startBroadcast();
        hook.deposit{value: value}(amount);
        vm.stopBroadcast();

        console.log("IS_FINISHED=%s", hook.isLgeFinished());
        console.log("IS_SUCCESSFUL=%s", hook.isLgeSuccessful());
        console.log("TOTAL_CLAIMED=%s", hook.totalTokensClaimed());
        console.log("POSITION_TOKEN_ID=%s", hook.positionTokenId());
    }

    function claim() internal {
        LGEHook hook = LGEHook(payable(vm.envAddress("HOOK")));
        address deployer = vm.envAddress("DEPLOYER");

        vm.startBroadcast();
        uint256 share = hook.claimLiquidity();
        vm.stopBroadcast();

        console.log("LP_SHARE=%s", share);
        console.log("TOTAL_LIQUIDITY=%s", hook.totalLiquidity());
        console.log("DEPLOYER_SHARE_RECORDED=%s", hook.lpShares(deployer));
    }

    function withdraw() internal {
        LGEHook hook = LGEHook(payable(vm.envAddress("HOOK")));
        address deployer = vm.envAddress("DEPLOYER");
        (uint256 usdcToLiquidity, uint256 remaining, , , , , ) = hook.userStates(
            deployer
        );
        uint256 expectedRefund = usdcToLiquidity + remaining;
        uint256 hookBalBefore = address(hook).balance;

        vm.startBroadcast();
        hook.withdraw();
        vm.stopBroadcast();

        console.log("EXPECTED_REFUND=%s", expectedRefund);
        console.log("HOOK_BALANCE_BEFORE=%s", hookBalBefore);
        console.log("HOOK_BALANCE_AFTER=%s", address(hook).balance);
        require(expectedRefund > 0, "nothing deposited");
        require(
            address(hook).balance == hookBalBefore - expectedRefund,
            "refund mismatch"
        );
    }

    function status() internal view {
        LGEHook hook = LGEHook(payable(vm.envAddress("HOOK")));
        uint256 startBlock = hook.startBlock();
        console.log("BLOCK=%s", block.number);
        console.log("START_BLOCK=%s", startBlock);
        console.log("STREAM_END=%s", startBlock + hook.streamBlocks());
        console.log("PRICE=%s", hook.currentTokenPrice());
        console.log("IS_FINISHED=%s", hook.isLgeFinished());
        console.log("IS_SUCCESSFUL=%s", hook.isLgeSuccessful());
        console.log("TOTAL_CLAIMED=%s", hook.totalTokensClaimed());
        console.log("CAP=%s", hook.token().cap());
        console.log("TOTAL_USDC_TO_LIQ=%s", hook.totalEthToLiquidity());
        console.log("TOTAL_USDC_RAISED=%s", hook.totalUsdcRaised());
        console.log("TOTAL_LIQUIDITY=%s", hook.totalLiquidity());
        console.log("POSITION_TOKEN_ID=%s", hook.positionTokenId());
        console.log("PARTICIPANT_FEES_BOOKED=%s", hook.participantFeesBooked());
        console.log("AGENT_ACCRUED=%s", hook.agentAccrued());
        console.log("PROTOCOL_ACCRUED=%s", hook.protocolAccrued());
        console.log("LP_LOCKED=%s", hook.lpLocked());
        console.log("PENDING_BUY=%s", hook.pendingBuy());
    }
}
