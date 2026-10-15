"""Worker-side client for the extract agent hosted on Bedrock AgentCore Runtime."""

from __future__ import annotations

import json
import os
import uuid

import boto3

from extract.validate import Extraction, Proposed, Relation


class AgentCoreExtractor:
    """Same interface as StrandsExtractor; the Strands agent runs inside AgentCore instead."""

    def __init__(self, runtime_arn: str, region: str | None = None) -> None:
        self.name = f"agentcore:{runtime_arn.rsplit('/', 1)[-1]}"
        self._arn = runtime_arn
        self._client = boto3.client("bedrock-agentcore", region_name=region or os.environ.get("AWS_REGION", "us-east-1"))

    def extract(self, quote: str, known_names: list[str]) -> Extraction:
        r = self._client.invoke_agent_runtime(
            agentRuntimeArn=self._arn,
            runtimeSessionId=f"recollect-extract-{uuid.uuid4()}",  # ≥ 33 chars; one session per call
            payload=json.dumps({"quote": quote, "known_names": known_names}).encode(),
            contentType="application/json", accept="application/json",
        )
        body = json.loads(r["response"].read())
        # The runtime already validated; the worker validates again anyway (the graph trusts nothing).
        return Extraction(
            [Proposed(e["kind"], e["name"], e["span"], e.get("year")) for e in body.get("entities", [])],
            [Relation(x["source"], x["target"], x["label"]) for x in body.get("relations", [])],
        )
