// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface INativeFiatToken {
    function allowance(address owner, address spender) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount6) external returns (bool);
}

/// @notice Reference implementation for local verification. No deployment is included in this repository.
contract PolicySettlementV1 {
    error Unauthorized(address caller);
    error InvalidPolicy(bytes32 policyId);
    // Solidity places custom errors and events in one identifier namespace.
    // The frozen spec names both "PolicyCancelled"; retain that exact event
    // name and use this unambiguous fail-closed error for the same condition.
    error PolicyAlreadyCancelled(bytes32 policyId);
    error PolicyExpired(bytes32 policyId);
    error InvalidTTL();
    error InvalidAttestation();
    error ApprovalExpired(bytes32 transferId);
    error AllowanceNotExact(uint256 expected, uint256 actual);
    error CapExceeded(uint256 cap6, uint256 attempted6);
    error Replay(bytes32 transferId);
    error Reentrancy();
    error TransferFailed();

    struct Policy {
        address payer;
        address recipient;
        address reviewer;
        uint256 cap6;
        uint256 cumulativeSettled6;
        bytes32 milestoneId;
        bytes32 policyVersion;
        uint64 policyExpiry;
        uint64 maxAttestationTtl;
        uint64 policyNonce;
        bool cancelled;
    }

    struct Approval {
        bytes32 transferId;
        bytes32 policyId;
        bytes32 attestationDigest;
        uint64 attestationNonce;
        uint256 amount6;
        uint64 approvalExpiry;
        uint64 approvalNonce;
    }

    struct MilestoneAttestationV1 {
        bytes32 policyId;
        bytes32 policyVersion;
        bytes32 milestoneId;
        bytes32 deliverableHash;
        uint64 observedAt;
        uint64 validUntil;
        uint64 attestationNonce;
        uint256 chainId;
        address verifyingContract;
    }

    event PolicyCreated(bytes32 indexed policyId, address indexed payer, address indexed recipient, address reviewer, uint256 cap6, bytes32 milestoneId, bytes32 policyVersion, uint64 policyExpiry, uint64 maxAttestationTtl);
    event TransferApproved(bytes32 indexed transferId, bytes32 indexed policyId, bytes32 indexed attestationDigest, uint256 amount6, uint64 approvalExpiry, uint64 approvalNonce);
    event PolicyCancelled(bytes32 indexed policyId);
    event SettlementExecuted(bytes32 indexed transferId, bytes32 indexed policyId, address indexed token, address payer, address recipient, uint256 amount6, bytes32 attestationDigest, uint64 attestationNonce);

    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant ATTESTATION_TYPEHASH = keccak256("MilestoneAttestationV1(bytes32 policyId,bytes32 policyVersion,bytes32 milestoneId,bytes32 deliverableHash,uint64 observedAt,uint64 validUntil,uint64 attestationNonce,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("ArcMilestoneSettlement");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant SECP256K1N_HALF = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    INativeFiatToken public immutable token;
    mapping(bytes32 => Policy) private policies;
    mapping(bytes32 => Approval) private approvals;
    mapping(address => uint64) public nextPolicyNonce;
    mapping(bytes32 => mapping(uint64 => bytes32)) private nonceTransferIds;
    mapping(bytes32 => bool) public usedTransferId;
    uint256 private lockState = 1;

    constructor(address token_) {
        if (token_ == address(0)) revert InvalidAttestation();
        token = INativeFiatToken(token_);
    }

    function createPolicy(address recipient, address reviewer, uint256 cap6, bytes32 milestoneId, bytes32 policyVersion, uint64 policyExpiry, uint64 maxAttestationTtl) external returns (bytes32 policyId) {
        if (recipient == address(0) || reviewer == address(0) || recipient == reviewer || cap6 == 0 || policyExpiry <= block.timestamp || maxAttestationTtl == 0) revert InvalidAttestation();
        uint64 nonce = ++nextPolicyNonce[msg.sender];
        policyId = keccak256(abi.encode(block.chainid, address(this), msg.sender, recipient, reviewer, cap6, milestoneId, policyVersion, policyExpiry, nonce));
        policies[policyId] = Policy(msg.sender, recipient, reviewer, cap6, 0, milestoneId, policyVersion, policyExpiry, maxAttestationTtl, nonce, false);
        emit PolicyCreated(policyId, msg.sender, recipient, reviewer, cap6, milestoneId, policyVersion, policyExpiry, maxAttestationTtl);
    }

    function approveTransfer(bytes32 policyId, MilestoneAttestationV1 calldata attestation, bytes calldata reviewerSignature, uint256 amount6, uint64 approvalExpiry, uint64 approvalNonce) external returns (bytes32 transferId) {
        Policy storage policy = _activePolicy(policyId);
        if (msg.sender != policy.payer || amount6 == 0 || approvalExpiry < block.timestamp) revert Unauthorized(msg.sender);
        bytes32 digest = _verifyAttestation(policy, attestation, reviewerSignature);
        if (nonceTransferIds[policyId][attestation.attestationNonce] != bytes32(0)) revert Replay(nonceTransferIds[policyId][attestation.attestationNonce]);
        if (policy.cumulativeSettled6 + amount6 > policy.cap6) revert CapExceeded(policy.cap6, policy.cumulativeSettled6 + amount6);
        uint256 actualAllowance = token.allowance(policy.payer, address(this));
        if (actualAllowance != amount6) revert AllowanceNotExact(amount6, actualAllowance);
        transferId = keccak256(abi.encode(block.chainid, address(this), policyId, policy.payer, policy.recipient, policy.policyVersion, digest, amount6, approvalNonce));
        approvals[transferId] = Approval(transferId, policyId, digest, attestation.attestationNonce, amount6, approvalExpiry, approvalNonce);
        nonceTransferIds[policyId][attestation.attestationNonce] = transferId;
        emit TransferApproved(transferId, policyId, digest, amount6, approvalExpiry, approvalNonce);
    }

    function cancelPolicy(bytes32 policyId) external {
        Policy storage policy = policies[policyId];
        if (policy.payer == address(0)) revert InvalidPolicy(policyId);
        if (msg.sender != policy.payer) revert Unauthorized(msg.sender);
        if (policy.cancelled) revert PolicyAlreadyCancelled(policyId);
        policy.cancelled = true;
        emit PolicyCancelled(policyId);
    }

    function settle(bytes32 policyId, MilestoneAttestationV1 calldata attestation, bytes calldata reviewerSignature) external {
        if (lockState != 1) revert Reentrancy();
        lockState = 2;
        Policy storage policy = _activePolicy(policyId);
        bytes32 digest = _verifyAttestation(policy, attestation, reviewerSignature);
        bytes32 transferId = nonceTransferIds[policyId][attestation.attestationNonce];
        Approval storage approval = approvals[transferId];
        if (transferId == bytes32(0) || approval.policyId != policyId || approval.attestationDigest != digest) revert InvalidAttestation();
        if (approval.approvalExpiry < block.timestamp) revert ApprovalExpired(transferId);
        if (usedTransferId[transferId]) revert Replay(transferId);
        uint256 actualAllowance = token.allowance(policy.payer, address(this));
        if (actualAllowance != approval.amount6) revert AllowanceNotExact(approval.amount6, actualAllowance);
        if (policy.cumulativeSettled6 + approval.amount6 > policy.cap6) revert CapExceeded(policy.cap6, policy.cumulativeSettled6 + approval.amount6);
        usedTransferId[transferId] = true;
        policy.cumulativeSettled6 += approval.amount6;
        if (!token.transferFrom(policy.payer, policy.recipient, approval.amount6)) revert TransferFailed();
        emit SettlementExecuted(transferId, policyId, address(token), policy.payer, policy.recipient, approval.amount6, digest, attestation.attestationNonce);
        lockState = 1;
    }

    function getPolicy(bytes32 policyId) external view returns (Policy memory) { return policies[policyId]; }
    function getApproval(bytes32 transferId) external view returns (Approval memory) { return approvals[transferId]; }
    function attestationNonceTransferId(bytes32 policyId, uint64 nonce) external view returns (bytes32) { return nonceTransferIds[policyId][nonce]; }
    function isAttestationNonceUsed(bytes32 policyId, uint64 nonce) external view returns (bool) { return nonceTransferIds[policyId][nonce] != bytes32(0); }

    function _activePolicy(bytes32 policyId) private view returns (Policy storage policy) {
        policy = policies[policyId];
        if (policy.payer == address(0)) revert InvalidPolicy(policyId);
        if (policy.cancelled) revert PolicyAlreadyCancelled(policyId);
        if (policy.policyExpiry < block.timestamp) revert PolicyExpired(policyId);
    }

    function _verifyAttestation(Policy storage policy, MilestoneAttestationV1 calldata attestation, bytes calldata signature) private view returns (bytes32 digest) {
        if (attestation.policyId == bytes32(0) || attestation.policyId != _policyIdFromStorage(policy) || attestation.policyVersion != policy.policyVersion || attestation.milestoneId != policy.milestoneId || attestation.chainId != block.chainid || attestation.verifyingContract != address(this)) revert InvalidAttestation();
        if (attestation.validUntil <= attestation.observedAt || attestation.observedAt > block.timestamp || attestation.validUntil < block.timestamp || attestation.validUntil - attestation.observedAt > policy.maxAttestationTtl) revert InvalidTTL();
        digest = _attestationDigest(attestation);
        if (_recover(digest, signature) != policy.reviewer) revert InvalidAttestation();
    }

    // The policy id is committed in the signed payload; this lookup avoids accepting a cross-policy signature.
    function _policyIdFromStorage(Policy storage policy) private view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), policy.payer, policy.recipient, policy.reviewer, policy.cap6, policy.milestoneId, policy.policyVersion, policy.policyExpiry, policy.policyNonce));
    }

    function _attestationDigest(MilestoneAttestationV1 calldata a) private view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(ATTESTATION_TYPEHASH, a.policyId, a.policyVersion, a.milestoneId, a.deliverableHash, a.observedAt, a.validUntil, a.attestationNonce, a.chainId, a.verifyingContract));
        bytes32 domainSeparator = keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r; bytes32 s; uint8 v;
        assembly { r := calldataload(sig.offset) s := calldataload(add(sig.offset, 32)) v := byte(0, calldataload(add(sig.offset, 64))) }
        if (uint256(s) > SECP256K1N_HALF || (v != 27 && v != 28)) return address(0);
        return ecrecover(digest, v, r, s);
    }
}
