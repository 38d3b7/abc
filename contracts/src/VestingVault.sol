// SPDX-License-Identifier: MIT
pragma solidity =0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ILGETokenHook {
    function hook() external view returns (address);
}

/// @title VestingVault
/// @notice Holds the agent's purchased token tranche (5% of supply, bought with
///         the treasury half at LGE success) and releases it linearly to the
///         agent's wallet. One grant per (token, beneficiary); a second deposit
///         for the same pair tops up the grant without changing the schedule.
///         Only a token's own LGE hook can create or move that token's grants,
///         so nobody can pre-create a grant with a schedule of their choosing.
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
    event GrantMigrated(
        address indexed token,
        address indexed oldBeneficiary,
        address indexed newBeneficiary
    );

    error NoGrant();
    error NothingVested();
    error ZeroAmount();
    error NotHook();
    error InvalidBeneficiary();

    modifier onlyTokenHook(address token) {
        if (msg.sender != ILGETokenHook(token).hook()) revert NotHook();
        _;
    }

    /// @notice Create (or top up) a vesting grant. Pulls `total` tokens from the
    ///         caller, which must be the token's LGE hook (at success, or on a
    ///         later `treasuryBuy` that completes a pending buy).
    function create(
        address token,
        address beneficiary,
        uint128 total,
        uint64 cliffSeconds,
        uint64 durationSeconds
    ) external onlyTokenHook(token) {
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

    /// @notice Move a grant, schedule and claimed amount included, to a new
    ///         beneficiary. Called by the token's hook when the agent rotates.
    ///         A no-op when there is no grant yet (rotation before success, or
    ///         while a treasury buy is pending).
    function migrateBeneficiary(
        address token,
        address oldBeneficiary,
        address newBeneficiary
    ) external onlyTokenHook(token) {
        if (newBeneficiary == address(0) || newBeneficiary == oldBeneficiary) {
            revert InvalidBeneficiary();
        }
        Grant memory g = grants[token][oldBeneficiary];
        if (g.total == 0) return;
        if (grants[token][newBeneficiary].total != 0) revert InvalidBeneficiary();

        grants[token][newBeneficiary] = g;
        delete grants[token][oldBeneficiary];
        emit GrantMigrated(token, oldBeneficiary, newBeneficiary);
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
