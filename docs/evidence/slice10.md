# Slice 10 Evidence ledger (Sandbox Computer)

| Feature | Grok-like intent | Ours | Verification |
|---------|------------------|------|--------------|
| Watch agent computer in-product | Cloud VNC pane | Embedded WebContentsView in Live pane | Manual: Computer bot → navigate |
| Isolation from host OS | Cloud sandbox | Separate Chromium partition; OS tools blocked by default | Settings sandbox.allowHostDesktop=false |
| Full Linux VM | Cloud pod | Deferred (Docker/noVNC) | Not in Slice 10 |

Unknown: exact Grok provisioning — not replicated.
