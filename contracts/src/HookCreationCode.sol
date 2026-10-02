// SPDX-License-Identifier: MIT
pragma solidity =0.8.26;

import {LGEHook} from "./hooks/LGEHook.sol";

/// @title HookCreationCode
/// @notice Serves LGEHook creation bytecode to LGEManager over a staticcall.
///
/// LGEManager embeds `type(LGEHook).creationCode` when it uses
/// `new LGEHook{salt:}(...)`, and hook v2 outgrew the 24KB deployed-size
/// limit with it embedded. Keeping the bytecode here instead lets the manager
/// stay small while remaining the CREATE2 deployer, so mined salts and hook
/// addresses are unchanged by the split.
contract HookCreationCode {
    function creationCode() external pure returns (bytes memory) {
        return type(LGEHook).creationCode;
    }
}
