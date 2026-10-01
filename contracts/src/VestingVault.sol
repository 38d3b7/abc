// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title VestingVault
/// @notice Holds the agent's purchased token tranche (5% of supply, bought with
///         the treasury half at LGE success) and releases it linearly to the
///         agent's wallet. One grant per (token, beneficiary); a second deposit
///         for the same pair tops up the grant without changing the schedule.
contract VestingVault {
    using SafeERC20 for IERC20;

    struct Grant {
        uint128 total;
        uint128 claimed;
        uint64 start;
        uint64 cliff; // absolute timestamp; first claimable at/after this
        uint64 duration; // seconds from start to fully vested
    }

    /// @dev token => beneficiary => grant
    mapping(address => mapping(address => Grant)) public grants;

    event GrantCreated(
        address indexed token,
        address indexed beneficiary,
        uint128 total,
        uint64 cliff,
        uint64 duration
    );
    event GrantToppedUp(
        address indexed token,
        address indexed beneficiary,
        uint128 added
    );
    event Claimed(address indexed token, address indexed beneficiary, uint128 amount);

    error NoGrant();
    error NothingVested();
    error ZeroAmount();

    /// @notice Create (or top up) a vesting grant. Pulls `total` tokens from the
    ///         caller. Called by the LGE hook at success (and by
    ///         `completeTreasuryBuy` if the buy completes later).
    function create(
        address token,
        address beneficiary,
        uint128 total,
        uint64 cliffSeconds,
        uint64 durationSeconds
    ) external {
        if (total == 0) revert ZeroAmount();
        IERC20(token).safeTransferFrom(msg.sender, address(this), total);

        Grant storage g = grants[token][beneficiary];
        if (g.total == 0) {
            uint64 start = uint64(block.timestamp);
            grants[token][beneficiary] = Grant({
                total: total,
                claimed: 0,
                start: start,
                cliff: start + cliffSeconds,
                duration: durationSeconds
            });
            emit GrantCreated(token, beneficiary, total, start + cliffSeconds, durationSeconds);
        } else {
            g.total += total;
            emit GrantToppedUp(token, beneficiary, total);
        }
    }

    function vested(address token, address beneficiary) public view returns (uint128) {
        Grant memory g = grants[token][beneficiary];
        if (g.total == 0) return 0;
        if (block.timestamp < g.cliff) return 0;
        uint64 elapsed = uint64(block.timestamp) - g.start;
        if (elapsed >= g.duration) return g.total;
        return uint128((uint256(g.total) * elapsed) / g.duration);
    }

    function claimable(address token, address beneficiary) external view returns (uint128) {
        Grant memory g = grants[token][beneficiary];
        uint128 v = vested(token, beneficiary);
        return v > g.claimed ? v - g.claimed : 0;
    }

    /// @notice Claim the vested, unclaimed balance to the beneficiary's wallet.
    function claim(address token) external {
        Grant storage g = grants[token][msg.sender];
        if (g.total == 0) revert NoGrant();
        uint128 v = vested(token, msg.sender);
        if (v <= g.claimed) revert NothingVested();
        uint128 amount = v - g.claimed;
        g.claimed = v;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Claimed(token, msg.sender, amount);
    }
}
