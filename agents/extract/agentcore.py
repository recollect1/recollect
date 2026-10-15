"""Worker-side client for the extract agent hosted on Bedrock AgentCore Runtime."""

from __future__ import annotations

import json
import os
import time
import uuid

import boto3

from extract.validate import Extraction, Proposed, Relation


#: A new runtime session starts a new microVM (a cold start of about 10 s per call). The agent is
#: stateless (a fresh Strands agent per sentence inside), so one session is reused across calls and
#: renewed hourly, well inside AgentCore's session lifetime.
SESSION_RENEW_S = 3600


class AgentCoreExtractor:
    """Same interface as StrandsExtractor; the Strands agent runs inside AgentCore instead."""

    def __init__(self, runtime_arn: str, region: str | None = None) -> None:
        self.name = f"agentcore:{runtime_arn.rsplit('/', 1)[-1]}"
        self._arn = runtime_arn
        self._client = boto3.client("bedrock-agentcore", region_name=region or os.environ.get("AWS_REGION", "us-east-1"))
        self._session, self._session_started = "", 0.0

    def _session_id(self) -> str:
        if not self._session or time.monotonic() - self._session_started > SESSION_RENEW_S:
            self._session = f"recollect-extract-{uuid.uuid4()}"  # ≥ 33 characters
            self._session_started = time.monotonic()
        return self._session

    def extract(self, quote: str, known_names: list[str]) -> Extraction:
        r = self._client.invoke_agent_runtime(
            agentRuntimeArn=self._arn,
            runtimeSessionId=self._session_id(),
            payload=json.dumps({"quote": quote, "known_names": known_names}).encode(),
            contentType="application/json", accept="application/json",
        )
        body = json.loads(r["response"].read())
        # The runtime already validated; the worker validates again anyway (the graph trusts nothing).
        return Extraction(
            [Proposed(e["kind"], e["name"], e["span"], e.get("year")) for e in body.get("entities", [])],
            [Relation(x["source"], x["target"], x["label"]) for x in body.get("relations", [])],
        )
