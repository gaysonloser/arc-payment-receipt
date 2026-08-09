// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/PolicySettlementV1.sol";

interface Vm {
    struct Log { bytes32[] topics; bytes data; address emitter; }
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8, bytes32, bytes32);
    function prank(address sender) external;
    function warp(uint256 newTimestamp) external;
    function chainId(uint256 newChainId) external;
    function recordLogs() external;
    function getRecordedLogs() external returns (Log[] memory);
}

contract MockNativeFiatToken is INativeFiatToken {
    event Transfer(address indexed from, address indexed to, uint256 value);
    mapping(address => mapping(address => uint256)) public allowances;
    mapping(address => uint256) public balances;
    function allowance(address owner, address spender) external view returns (uint256) { return allowances[owner][spender]; }
    function setAllowance(address owner, address spender, uint256 amount6) external { allowances[owner][spender] = amount6; }
    function mint(address to, uint256 amount6) external { balances[to] += amount6; }
    function transferFrom(address from, address to, uint256 amount6) external returns (bool) {
        if (allowances[from][msg.sender] < amount6 || balances[from] < amount6) return false;
        allowances[from][msg.sender] -= amount6; balances[from] -= amount6; balances[to] += amount6;
        emit Transfer(from, to, amount6);
        return true;
    }
}

contract PolicySettlementV1Test {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant ATTESTATION_TYPEHASH = keccak256("MilestoneAttestationV1(bytes32 policyId,bytes32 policyVersion,bytes32 milestoneId,bytes32 deliverableHash,uint64 observedAt,uint64 validUntil,uint64 attestationNonce,uint256 chainId,address verifyingContract)");
    MockNativeFiatToken token;
    PolicySettlementV1 policy;
    address payer;
    address reviewer;
    address recipient;
    bytes32 policyId;
    bytes32 constant MILESTONE = keccak256("MILESTONE-1");
    bytes32 constant VERSION = keccak256("V1");

    function setUp() public {
        vm.chainId(5042002); vm.warp(1_000_000);
        payer = vm.addr(1); reviewer = vm.addr(2); recipient = vm.addr(3);
        token = new MockNativeFiatToken(); policy = new PolicySettlementV1(address(token));
        token.mint(payer, 2_000_000);
        vm.prank(payer);
        policyId = policy.createPolicy(recipient, reviewer, 1_500_000, MILESTONE, VERSION, uint64(block.timestamp + 3600), 300);
    }

    function testExactAllowanceAndMatchedSettlement() public {
        PolicySettlementV1.Policy memory created = policy.getPolicy(policyId);
        require(created.payer == payer && created.recipient == recipient && created.cap6 == 1_500_000, "policy readback mismatch");
        (PolicySettlementV1.MilestoneAttestationV1 memory attestation, bytes memory signature) = signedAttestation(1_000_000, 1);
        token.setAllowance(payer, address(policy), 1_000_000);
        vm.recordLogs();
        vm.prank(payer);
        bytes32 transferId = policy.approveTransfer(policyId, attestation, signature, 1_000_000, uint64(block.timestamp + 120), 9);
        policy.settle(policyId, attestation, signature);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        PolicySettlementV1.Approval memory approval = policy.getApproval(transferId);
        PolicySettlementV1.Policy memory settled = policy.getPolicy(policyId);
        require(token.balances(recipient) == 1_000_000, "recipient amount6 mismatch");
        require(token.allowances(payer, address(policy)) == 0, "allowance must be consumed");
        require(policy.usedTransferId(transferId), "transfer must be marked used");
        require(policy.attestationNonceTransferId(policyId, 1) == transferId && policy.isAttestationNonceUsed(policyId, 1), "nonce readback mismatch");
        require(approval.amount6 == 1_000_000 && settled.cumulativeSettled6 == 1_000_000, "approval/readback amount mismatch");
        require(logs.length == 3 && logs[0].emitter == address(policy) && logs[1].emitter == address(token) && logs[2].emitter == address(policy), "three records must form one local logical payment");
    }

    function test_RevertWhenAllowanceIsNotExact() public {
        (PolicySettlementV1.MilestoneAttestationV1 memory attestation, bytes memory signature) = signedAttestation(1_000_000, 2);
        token.setAllowance(payer, address(policy), 999_999);
        vm.prank(payer);
        (bool ok,) = address(policy).call(abi.encodeCall(policy.approveTransfer, (policyId, attestation, signature, 1_000_000, uint64(block.timestamp + 120), 10)));
        require(!ok, "non-exact allowance must reject");
        require(token.balances(recipient) == 0, "reject must not move principal");
    }

    function testCancelPreventsSettlement() public {
        (PolicySettlementV1.MilestoneAttestationV1 memory attestation, bytes memory signature) = signedAttestation(1_000_000, 3);
        token.setAllowance(payer, address(policy), 1_000_000);
        vm.prank(payer); policy.approveTransfer(policyId, attestation, signature, 1_000_000, uint64(block.timestamp + 120), 11);
        vm.prank(payer); policy.cancelPolicy(policyId);
        (bool ok,) = address(policy).call(abi.encodeCall(policy.settle, (policyId, attestation, signature)));
        require(!ok, "cancelled policy must not settle");
        require(token.balances(recipient) == 0, "cancelled policy cannot move principal");
    }

    function signedAttestation(uint256, uint64 nonce) private returns (PolicySettlementV1.MilestoneAttestationV1 memory a, bytes memory signature) {
        a = PolicySettlementV1.MilestoneAttestationV1(policyId, VERSION, MILESTONE, keccak256("canonical-deliverable"), uint64(block.timestamp), uint64(block.timestamp + 120), nonce, block.chainid, address(policy));
        bytes32 structHash = keccak256(abi.encode(ATTESTATION_TYPEHASH, a.policyId, a.policyVersion, a.milestoneId, a.deliverableHash, a.observedAt, a.validUntil, a.attestationNonce, a.chainId, a.verifyingContract));
        bytes32 domain = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("ArcMilestoneSettlement"), keccak256("1"), block.chainid, address(policy)));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(2, digest); signature = abi.encodePacked(r, s, v);
    }
}
