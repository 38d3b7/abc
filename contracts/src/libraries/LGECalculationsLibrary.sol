// SPDX-License-Identifier: MIT
pragma solidity =0.8.26;

import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Price-curve and liquidity math for the LGE.
/// @dev All price/schedule parameters are passed in (hook v2 stores them per
///      launch); the library itself is stateless. Prices are denominated in
///      tokens per USDC, both legs 18 decimals (Arc native USDC is 18-dec).
library LGECalculationsLibrary {
    /// @notice Tokens-per-USDC rate at `currentBlock`; rises linearly from
    ///         `minTokenPrice` to `maxTokenPrice` over `streamBlocks`.
    function calculateCurrentTokenPrice(
        uint256 currentBlock,
        uint256 startBlock,
        uint256 streamBlocks,
        uint256 minTokenPrice,
        uint256 maxTokenPrice
    ) public pure returns (uint256) {
        if (currentBlock >= startBlock + streamBlocks) {
            return maxTokenPrice;
        }
        return
            minTokenPrice +
            (((maxTokenPrice - minTokenPrice) * (currentBlock - startBlock)) /
                streamBlocks);
    }

    /// @notice Native USDC (wei) required to buy `amountOfTokens` at the current
    ///         rate, doubled: half pairs into the pool, half is the treasury.
    function calculateUsdcNeeded(
        uint256 currentBlock,
        uint256 startBlock,
        uint256 streamBlocks,
        uint256 minTokenPrice,
        uint256 maxTokenPrice,
        uint256 amountOfTokens
    ) external pure returns (uint256 usdcExpected) {
        uint256 tokensPerUsdc = calculateCurrentTokenPrice(
            currentBlock,
            startBlock,
            streamBlocks,
            minTokenPrice,
            maxTokenPrice
        );
        uint256 usdcForTokenAmount = amountOfTokens / tokensPerUsdc;
        usdcExpected = usdcForTokenAmount * 2;
    }

    function getSqrtPrice(
        uint256 averagePrice
    ) external pure returns (uint160) {
        return uint160(Math.sqrt(averagePrice) * 2 ** 96);
    }

    function getAmountsForLiquidity(
        uint160 sqrtPriceX96, // current sqrt price
        int24 tickLower,
        int24 tickUpper,
        int24 currentTick,
        uint256 tokenAmount
    ) external pure returns (uint256 ethNeeded, uint128 liquidity) {
        uint160 sqrtRatioAX96 = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtRatioBX96 = TickMath.getSqrtPriceAtTick(tickUpper);

        if (currentTick < tickLower) {
            revert("Cannot add token-only liquidity below range");
        } else if (currentTick >= tickUpper) {
            liquidity = LiquidityAmounts.getLiquidityForAmount1(
                sqrtRatioAX96,
                sqrtRatioBX96,
                tokenAmount
            );
            ethNeeded = 0;
        } else {
            liquidity = LiquidityAmounts.getLiquidityForAmount1(
                sqrtRatioAX96,
                sqrtPriceX96,
                tokenAmount
            );

            ethNeeded = LiquidityAmounts.getAmount0ForLiquidity(
                sqrtPriceX96,
                sqrtRatioBX96,
                liquidity
            );
        }

        if (ethNeeded > 0) {
            ethNeeded += 1;
        }
    }
}
