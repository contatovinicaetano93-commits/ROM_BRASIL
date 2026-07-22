from __future__ import annotations

import os
import re
import time
from typing import Any

import boto3


def run_athena(sql: str, timeout: int = 600) -> list[list[str | None]]:
    client = boto3.client("athena", region_name=os.environ["AWS_DEFAULT_REGION"])
    query = client.start_query_execution(
        QueryString=sql,
        QueryExecutionContext={"Database": os.environ["ATHENA_DB"]},
        ResultConfiguration={"OutputLocation": os.environ["ATHENA_OUTPUT"]},
        WorkGroup=os.environ["ATHENA_WG"],
    )
    query_id = query["QueryExecutionId"]
    for _ in range(timeout):
        status = client.get_query_execution(QueryExecutionId=query_id)["QueryExecution"][
            "Status"
        ]
        state = status["State"]
        if state in ("SUCCEEDED", "FAILED", "CANCELLED"):
            if state != "SUCCEEDED":
                raise RuntimeError(status.get("StateChangeReason", state))
            break
        time.sleep(1)
    else:
        raise TimeoutError(sql[:120])

    rows: list[list[str | None]] = []
    token = None
    while True:
        kwargs: dict[str, Any] = {"QueryExecutionId": query_id, "MaxResults": 1000}
        if token:
            kwargs["NextToken"] = token
        result = client.get_query_results(**kwargs)
        data = result["ResultSet"]["Rows"]
        start = 1 if not rows else 0
        if not rows:
            rows.append([column.get("VarCharValue") for column in data[0]["Data"]])
            start = 1
        for row in data[start:]:
            rows.append([column.get("VarCharValue") for column in row["Data"]])
        token = result.get("NextToken")
        if not token:
            break
    return rows


def norm_phone(raw: str | None) -> str | None:
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return None
    if digits.startswith("55") and len(digits) >= 12:
        return f"+{digits}"
    if len(digits) in (10, 11):
        return f"+55{digits}"
    if len(digits) >= 12:
        return f"+{digits}"
    return None


def phone_key(raw: str | None) -> str | None:
    phone = norm_phone(raw)
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    return digits[-11:] if len(digits) >= 11 else digits


def categorize(service: str | None) -> str:
    normalized = (service or "").upper()
    if re.search(r"COLOR|REFLEX|MECHA|LOURO|TINT", normalized):
        return "coloracao"
    if re.search(r"HIDRAT|BOTOX|CRONOGRAM|RECONSTR|TRATAM|PROGRESS", normalized):
        return "tratamento"
    if re.search(r"CORTE|ESCOVA|PENTEADO|ESCOV|BRUSHING|FINALIZ", normalized):
        return "corte"
    if re.search(r"MANIC|PEDIC|UNHA|ESMALT|SPA\s*DOS\s*PES|MAO|MÃO", normalized):
        return "bem_estar"
    if re.search(r"PRODUTO|VAREJO", normalized):
        return "produto"
    return "outro"
