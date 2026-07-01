**Verdict:** APPROVE  
**Reviewer:** Qwen  
**Target:** PR #348 at df622d02a3c80272f29f8ca0c3ccd39d1c3696e1

**Findings:** No blocking findings.

**Rationale:**  
The implementation correctly hardens the promotion gate with a layered provenance check: `approvalMatchesProvenanceBackedRecord()` requires `source: "structured"`, a non-null `artifact` field, git-tracked artifact existence, and explicit rejection of ledger self-references (both via string check and path equality). Audit (`validateApprovalGate`) and promotion (`promoteBlueprint`) both call `countDistinctProvenanceBackedApprovals`, ensuring gate alignment. Regression tests cover bare ledger, ledger-pointing artifacts, untracked artifacts, and manual-source entries. Docs/templates consistently describe the new "provenance-backed" requirement. The security model appropriately relies on git history visibility rather than content validation of artifacts.
