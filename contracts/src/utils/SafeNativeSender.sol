// SPDX-License-Identifier: MIT
pragma solidity =0.8.26;

/// @title SafeNativeSender
/// @notice Native-token (on Arc: 18-decimal USDC) sends that never wedge the caller.
///         A failed send (SCA wallet without a payable receive, blocklisted
///         recipient) is parked as a pending credit the recipient can pull later.
abstract contract SafeNativeSender {
    mapping(address => uint256) public pendingNative;

    event NativeSendParked(address indexed to, uint256 amount);
    event PendingNativeClaimed(address indexed to, uint256 amount);

    error NothingPending();

    /// @dev Send `amount` of native token to `to`; on failure park it as a credit.
    function _sendNative(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) {
            pendingNative[to] += amount;
            emit NativeSendParked(to, amount);
        }
    }

    /// @notice Pull a native balance that a earlier send failed to deliver.
    function claimPendingNative() external {
        uint256 amount = pendingNative[msg.sender];
        if (amount == 0) revert NothingPending();
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert(); // stays claimable
        pendingNative[msg.sender] = 0;
        emit PendingNativeClaimed(msg.sender, amount);
    }
}
