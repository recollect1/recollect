"""FalkorDB access for the agent worker. Same conventions as `FalkorGraph` in packages/core:
nodes are merged by `id`, scalar or list properties, edges merged by type between two ids.
Labels and edge types are code constants; they are still checked before reaching Cypher.
"""

from __future__ import annotations

import re
from typing import Any

from falkordb import FalkorDB

_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _safe(name: str) -> str:
    if not _NAME.match(name):
        raise ValueError(f"unsafe graph identifier: {name}")
    return name


class FalkorStore:
    def __init__(self, url: str, graph: str = "recollect") -> None:
        self._db = FalkorDB.from_url(url)
        self._g = self._db.select_graph(graph)

    # --- generic ---
    def _nodes(self, cypher: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        return [row[0].properties for row in self._g.ro_query(cypher, params or {}).result_set]

    def get(self, label: str, id_: str) -> dict[str, Any] | None:
        rows = self._nodes(f"MATCH (n:{_safe(label)} {{id: $id}}) RETURN n", {"id": id_})
        return rows[0] if rows else None

    def find(self, label: str, **where: Any) -> list[dict[str, Any]]:
        cond = " AND ".join(f"n.{_safe(k)} = ${k}" for k in where)
        return self._nodes(f"MATCH (n:{_safe(label)}){' WHERE ' + cond if cond else ''} RETURN n", where)

    def upsert(self, label: str, props: dict[str, Any]) -> None:
        params: dict[str, Any] = {"id": props["id"]}
        sets = []
        for k, v in props.items():
            if k == "id" or v is None:
                continue
            sets.append(f"n.{_safe(k)} = $p_{k}")
            params[f"p_{k}"] = v
        self._g.query(f"MERGE (n:{_safe(label)} {{id: $id}})" + (f" SET {', '.join(sets)}" if sets else ""), params)

    def link(self, src: tuple[str, str], type_: str, dst: tuple[str, str], props: dict[str, Any] | None = None) -> None:
        props = props or {}
        sets = [f"r.{_safe(k)} = $p_{k}" for k in props]
        params = {"a": src[1], "b": dst[1], **{f"p_{k}": v for k, v in props.items()}}
        self._g.query(
            f"MATCH (a:{_safe(src[0])} {{id: $a}}), (b:{_safe(dst[0])} {{id: $b}}) "
            f"MERGE (a)-[r:{_safe(type_)}]->(b)" + (f" SET {', '.join(sets)}" if sets else ""),
            params,
        )

    # --- worker queries ---
    def pending_jobs(self, queue: str, limit: int = 5, markers_only: bool = False) -> list[dict[str, Any]]:
        """Open jobs. In markers-only mode (no Bedrock), skip jobs whose markers already ran."""
        extra = " AND coalesce(n.markersDone, false) = false" if markers_only else ""
        return self._nodes(
            "MATCH (n:Job) WHERE n.queue = $queue AND n.done = false AND coalesce(n.failed, false) = false"
            f"{extra} RETURN n ORDER BY n.at LIMIT $limit",
            {"queue": queue, "limit": limit},
        )

    def session_quotes(self, session_id: str) -> list[dict[str, Any]]:
        rows = self._g.ro_query(
            "MATCH (:Session {id: $id})-[:HAS_QUOTE]->(q:Quote) "
            "RETURN q.id, q.text, q.seq, q.embedding IS NOT NULL ORDER BY q.seq",
            {"id": session_id},
        ).result_set
        return [{"id": r[0], "text": r[1], "seq": r[2], "embedded": r[3]} for r in rows]

    def entities(self) -> list[dict[str, Any]]:
        rows = self._g.ro_query("MATCH (e:Entity) RETURN e.id, e.name, e.kind, e.aliases").result_set
        return [{"id": r[0], "name": r[1], "kind": r[2], "aliases": r[3] or []} for r in rows]

    def mention_count(self, entity_id: str) -> int:
        rows = self._g.ro_query(
            "MATCH (q:Quote)-[:MENTIONS]->(:Entity {id: $id}) RETURN count(DISTINCT q)", {"id": entity_id}
        ).result_set
        return int(rows[0][0]) if rows else 0

    def session_retold(self, session_id: str) -> bool:
        rows = self._g.ro_query(
            "MATCH (:Session {id: $id})-[:HAS_QUOTE]->(:Quote)-[:RETELLS]->(:Quote) RETURN count(*)", {"id": session_id}
        ).result_set
        return bool(rows and rows[0][0])

    def open_prompts(self) -> int:
        rows = self._g.ro_query("MATCH (p:StoryPrompt) WHERE p.used = false RETURN count(p)").result_set
        return int(rows[0][0]) if rows else 0
