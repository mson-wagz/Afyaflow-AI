# Custom MCP server

Owner: Mejja (backend developer 2), responsible for `feature/backend-patient-prioritisation`, `feature/backend-deterioration-monitoring` and shared MCP foundations. Review all tool contracts with the relevant feature owner.

Implement distinct typed tools for retrieving observations, scoring a protocol-based proposal and persisting a pending recommendation. Authenticate tool access and log calls. The agent cannot approve recommendations or mutate approved queues. Integrate the borrowed server through the agent service.

Status: directory scaffold only; implementation follows specification review.
