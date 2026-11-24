"""Register a household's Bharosa MCP endpoint with ElevenLabs (optional; the dashboard works too).

    pip install elevenlabs
    ELEVENLABS_API_KEY=... python deploy/elevenlabs/register_mcp.py "https://<server>/mcp?key=bp_..." [agent_id]

Uses the documented SDK call `conversational_ai.mcp_servers.create`. If you pass an agent id, the
printed server id still has to be attached to the agent (Agent → Tools → MCP servers); the dashboard is
the most reliable place to do that while the API evolves.
"""
import os
import sys


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    from elevenlabs import ElevenLabs

    client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
    server = client.conversational_ai.mcp_servers.create(config={
        "url": sys.argv[1],
        "name": "Bharosa",
        "description": "Family-controlled actions for an elderly parent: medicines, bills, scam reports.",
        "approval_policy": "auto_approve_all",   # Bharosa's policy engine + the guardian do the approving
        "transport": os.getenv("ELEVENLABS_MCP_TRANSPORT", "STREAMABLE_HTTP"),
    })
    print("MCP server id:", getattr(server, "id", server))
    if len(sys.argv) > 2:
        print(f"Now attach it to agent {sys.argv[2]} in the ElevenLabs dashboard (Agent → Tools → MCP).")


if __name__ == "__main__":
    main()
