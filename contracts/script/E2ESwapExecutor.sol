// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";

/// @notice Minimal exact-input swap executor for driving the LGE pool on a
///         live network from the e2e script (PoolSwapTest is a test util and
///         is not deployed on Arc testnet). Not part of the product surface.
contract E2ESwapExecutor {
    IPoolManager public immutable manager;

    error NotPoolManager();

    constructor(IPoolManager manager_) {
        manager = manager_;
    }

    /// @dev Exact-input buy: pay `amountIn` native USDC (msg.value), receive
    ///      tokens to `to`. The hook's fee is taken inside beforeSwap; the
    ///      caller-facing delta still settles to exactly -amountIn.
    function swapBuy(
        PoolKey calldata key,
        uint256 amountIn,
        uint160 sqrtPriceLimitX96,
        address to
    ) external payable returns (uint256 paid, uint256 out) {
        bytes memory result = manager.unlock(
            abi.encode(key, amountIn, sqrtPriceLimitX96, to)
        );
        (paid, out) = abi.decode(result, (uint256, uint256));
        // refund any unspent native
        uint256 leftover = address(this).balance;
        if (leftover > 0) {
            (bool ok, ) = msg.sender.call{value: leftover}("");
            require(ok, "refund failed");
        }
    }

    function unlockCallback(
        bytes calldata data
    ) external returns (bytes memory) {
        if (msg.sender != address(manager)) revert NotPoolManager();
        (
            PoolKey memory key,
            uint256 amountIn,
            uint160 limit,
            address to
        ) = abi.decode(data, (PoolKey, uint256, uint160, address));

        BalanceDelta delta = manager.swap(
            key,
            SwapParams({
                zeroForOne: true,
                amountSpecified: -int256(amountIn),
                sqrtPriceLimitX96: limit
            }),
            ""
        );

        uint256 paid = uint256(int256(-delta.amount0()));
        uint256 out = uint256(int256(delta.amount1()));

        manager.settle{value: paid}();
        manager.take(key.currency1, to, out);

        return abi.encode(paid, out);
    }

    /// @dev Exact-input sell path is covered by forge tests; the e2e only
    ///      needs buys to drive fee volume.

    receive() external payable {}
}
