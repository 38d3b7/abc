// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SafeNativeSender} from "./utils/SafeNativeSender.sol";

/// @title InferenceEscrow
/// @notice Per-agent USDC credits funding the agent's inference. Funded by the
///         LGE treasury half at success. The agent can spend its credit only to
///         the protocol-set inference `provider`, or to its own wallet for gas
///         within a per-transaction cap. The provider is settable once, behind
///         a 48h timelock.
contract InferenceEscrow is SafeNativeSender {
    address public immutable owner;

    address public provider;
    address public proposedProvider;
    uint64 public providerEffectiveAt;

    uint256 public gasCap;

    /// @dev agent => native USDC credit (18 decimals)
    mapping(address => uint256) public creditOf;

    uint64 public constant PROVIDER_TIMELOCK = 48 hours;

    event Credited(address indexed agent, uint256 amount);
    event ProviderPaid(address indexed agent, uint256 amount);
    event GasFunded(address indexed agent, uint256 amount);
    event ProviderProposed(address indexed provider, uint64 effectiveAt);
    event ProviderSet(address indexed provider);
    event GasCapSet(uint256 cap);

    error NotOwner();
    error ProviderAlreadySet();
    error ProviderNotSet();
    error TimelockNotElapsed();
    error NoProposal();
    error InsufficientCredit();
    error GasCapExceeded();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address owner_) {
        owner = owner_;
    }

    /// @notice Credit an agent. Called by the LGE hook with the treasury remainder.
    function creditAgent(address agent) external payable {
        creditOf[agent] += msg.value;
        emit Credited(agent, msg.value);
    }

    /// @notice Pay the inference provider from the caller's credit.
    function payProvider(uint256 amount) external {
        if (provider == address(0)) revert ProviderNotSet();
        _spend(msg.sender, amount);
        _sendNative(provider, amount);
        emit ProviderPaid(msg.sender, amount);
    }

    /// @notice Draw from the caller's credit to its own wallet for gas, within the cap.
    function fundGas(uint256 amount) external {
        if (amount > gasCap) revert GasCapExceeded();
        _spend(msg.sender, amount);
        _sendNative(msg.sender, amount);
        emit GasFunded(msg.sender, amount);
    }

    function _spend(address agent, uint256 amount) internal {
        if (creditOf[agent] < amount) revert InsufficientCredit();
        creditOf[agent] -= amount;
    }

    /// @notice Propose the inference provider. Applies after a 48h timelock, once.
    function proposeProvider(address provider_) external onlyOwner {
        if (provider != address(0)) revert ProviderAlreadySet();
        proposedProvider = provider_;
        providerEffectiveAt = uint64(block.timestamp) + PROVIDER_TIMELOCK;
        emit ProviderProposed(provider_, providerEffectiveAt);
    }

    function applyProvider() external onlyOwner {
        if (provider != address(0)) revert ProviderAlreadySet();
        if (proposedProvider == address(0)) revert NoProposal();
        if (block.timestamp < providerEffectiveAt) revert TimelockNotElapsed();
        provider = proposedProvider;
        proposedProvider = address(0);
        emit ProviderSet(provider);
    }

    function setGasCap(uint256 cap) external onlyOwner {
        gasCap = cap;
        emit GasCapSet(cap);
    }
}
