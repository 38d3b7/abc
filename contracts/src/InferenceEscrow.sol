// SPDX-License-Identifier: MIT
pragma solidity =0.8.26;

import {SafeNativeSender} from "./utils/SafeNativeSender.sol";

interface IAgentSource {
    function agent() external view returns (address);
}

/// @title InferenceEscrow
/// @notice USDC credits funding an agent's inference. Funded by the LGE
///         treasury half at success. Credit is keyed by the hook that paid it
///         in, and whoever that hook names as `agent()` right now may spend
///         it — so rotating the agent on the hook moves spending rights with
///         no migration. The agent can spend only to the protocol-set inference
///         `provider`, or to its own wallet for gas within a per-call cap and a
///         lifetime budget. The provider is settable once, behind a 48h
///         timelock.
contract InferenceEscrow is SafeNativeSender {
    address public immutable owner;

    address public provider;
    address public proposedProvider;
    uint64 public providerEffectiveAt;

    uint256 public gasCap; // max per fundGas call
    uint256 public gasBudget; // lifetime fundGas ceiling per hook
    bool public gasBudgetSet;

    /// @dev hook => native USDC credit (18 decimals)
    mapping(address => uint256) public creditOf;
    /// @dev hook => cumulative native USDC drawn through fundGas. Keyed by
    ///      hook, not agent, so rotating the agent cannot reset the budget.
    mapping(address => uint256) public totalGasFunded;

    uint64 public constant PROVIDER_TIMELOCK = 48 hours;

    event Credited(address indexed hook, uint256 amount);
    event ProviderPaid(address indexed hook, address indexed agent, uint256 amount);
    event GasFunded(address indexed hook, address indexed agent, uint256 amount);
    event ProviderProposed(address indexed provider, uint64 effectiveAt);
    event ProviderSet(address indexed provider);
    event GasCapSet(uint256 cap);
    event GasBudgetSet(uint256 budget);

    error NotOwner();
    error NotAgent();
    error ProviderAlreadySet();
    error ProviderNotSet();
    error TimelockNotElapsed();
    error NoProposal();
    error InsufficientCredit();
    error GasCapExceeded();
    error GasBudgetExceeded();
    error GasBudgetIncrease();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address owner_) {
        owner = owner_;
    }

    /// @notice Credit the calling hook. Called by the LGE hook with the
    ///         treasury remainder. Anyone may call it, but credit only ever
    ///         lands under the caller's own address.
    function credit() external payable {
        creditOf[msg.sender] += msg.value;
        emit Credited(msg.sender, msg.value);
    }

    /// @notice Pay the inference provider from `hook`'s credit. Caller must be
    ///         that hook's current agent.
    function payProvider(address hook, uint256 amount) external {
        if (provider == address(0)) revert ProviderNotSet();
        _spend(hook, amount);
        _sendNative(provider, amount);
        emit ProviderPaid(hook, msg.sender, amount);
    }

    /// @notice Draw from `hook`'s credit to the caller's wallet for gas. Caller
    ///         must be that hook's current agent. Bounded per call by `gasCap`
    ///         and over the hook's lifetime by `gasBudget`, so the credit cannot
    ///         leave as raw USDC beyond a small operational allowance.
    function fundGas(address hook, uint256 amount) external {
        if (amount > gasCap) revert GasCapExceeded();
        if (totalGasFunded[hook] + amount > gasBudget) revert GasBudgetExceeded();
        totalGasFunded[hook] += amount;
        _spend(hook, amount);
        _sendNative(msg.sender, amount);
        emit GasFunded(hook, msg.sender, amount);
    }

    /// @dev A fake "hook" can only name an agent for credit that was paid in
    ///      under that same fake hook's address.
    function _spend(address hook, uint256 amount) internal {
        if (IAgentSource(hook).agent() != msg.sender) revert NotAgent();
        if (creditOf[hook] < amount) revert InsufficientCredit();
        creditOf[hook] -= amount;
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

    /// @notice Set the per-hook lifetime gas budget. The first call sets any
    ///         value; after that it can only be lowered, so the owner cannot
    ///         reopen the credit as a raw USDC stream.
    function setGasBudget(uint256 budget) external onlyOwner {
        if (gasBudgetSet && budget > gasBudget) revert GasBudgetIncrease();
        gasBudgetSet = true;
        gasBudget = budget;
        emit GasBudgetSet(budget);
    }
}
