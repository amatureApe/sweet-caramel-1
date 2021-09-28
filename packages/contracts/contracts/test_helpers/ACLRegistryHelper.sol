pragma solidity >=0.7.0 <0.8.0;

import "../Interfaces/IACLRegistry.sol";

contract ACLRegistryHelper {
  IACLRegistry public aclRegistry;

  constructor(IACLRegistry _aclRegistry) {
    aclRegistry = _aclRegistry;
  }

  function senderProtected(bytes32 role) public {
    require(
      aclRegistry.hasRole(role, msg.sender),
      "you dont have the required role"
    );
  }
}
