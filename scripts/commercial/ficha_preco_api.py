from __future__ import annotations

import importlib.util
import json
import shutil
import sys
from dataclasses import asdict
from datetime import datetime
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
SCRIPT_DIR = Path(__file__).resolve().parent
ORIGINAL_DIR = SCRIPT_DIR / "original"
DATA_DIR = ROOT_DIR / "server" / "data" / "commercial"
SIGNED_DIR = DATA_DIR / "contratos_aceitos"
DB_PATH = DATA_DIR / "propostas.db"

DATA_DIR.mkdir(parents=True, exist_ok=True)
SIGNED_DIR.mkdir(parents=True, exist_ok=True)


def load_original_module():
    source_path = ORIGINAL_DIR / "Ficha_Preço.py"
    spec = importlib.util.spec_from_file_location("ficha_preco_original", source_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Nao foi possivel carregar o modulo original: {source_path}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


ORIGINAL = load_original_module()
MODEL = ORIGINAL.WorkbookModel()
DATABASE = ORIGINAL.ProposalDatabase(DB_PATH)


STATUS_OPTIONS = [
    "Proposta em Analise",
    "Proposta Aceita",
    "Proposta Recusada",
]


def normalize_string(value) -> str:
    return str(value if value is not None else "").strip()


def normalize_values(values: dict | None) -> dict:
    base = dict(getattr(ORIGINAL, "DEFAULT_VALUES_FICHA_1", {}))
    incoming = values or {}

    for key, default_value in base.items():
        raw = incoming.get(key, default_value)
        if isinstance(default_value, str):
            base[key] = str(raw if raw is not None else default_value).strip()
        else:
            base[key] = raw

    if ORIGINAL.to_float(base.get("branch_qty", "0")) > 0:
        base["branches"] = "Sim"
    elif base.get("branches") not in {"Sim", "Nao", "Não"}:
        base["branches"] = "Nao"

    if ORIGINAL.to_float(base.get("audit_hours", "0")) > 0:
        base["audit"] = "Sim"
    elif base.get("audit") not in {"Sim", "Nao", "Não"}:
        base["audit"] = "Nao"

    if base.get("branches") == "Nao":
        base["branches"] = "Não"
    if base.get("audit") == "Nao":
        base["audit"] = "Não"

    return base


def rows_to_dict(rows) -> list[dict]:
    return [asdict(row) for row in rows]


def money(value: float) -> str:
    return ORIGINAL.money(float(value or 0.0))


def area_totals_from_rows(rows) -> dict[str, float]:
    totals = {"fiscal": 0.0, "contabil": 0.0, "dp": 0.0}
    for row in rows:
        seq = str(getattr(row, "seq", ""))
        contract = float(getattr(row, "contract", 0.0) or 0.0)
        if seq.startswith("3."):
            totals["dp"] += contract
        elif seq.startswith(("1.2", "4.")):
            totals["fiscal"] += contract
        else:
            totals["contabil"] += contract
    return totals


def build_summary(values: dict, rows, totals: dict) -> list[str]:
    company_name = normalize_string(values.get("company_name")) or "Empresa sem nome"
    cnpj = normalize_string(values.get("cnpj")) or "CNPJ nao informado"
    annual_gross_revenue = normalize_string(values.get("annual_gross_revenue")) or "Nao informado"
    area_totals = area_totals_from_rows(rows)

    return [
        "RESUMO FINAL",
        "",
        f"Empresa: {company_name}",
        f"CNPJ: {cnpj}",
        f"Faturamento bruto mensal: {annual_gross_revenue}",
        f"Segmento: {normalize_string(values.get('segment')) or '-'}",
        f"Tabela: {normalize_string(values.get('table')) or '-'}",
        f"Tributacao: {normalize_string(values.get('tax')) or '-'}",
        "",
        "Fechamento comercial",
        f"Mensalidade cheia: {money(totals.get('monthly_full', 0.0))}",
        f"Mensalidade contrato: {money(totals.get('monthly_contract', 0.0))}",
        f"Total anual cheio: {money(totals.get('annual_full', 0.0))}",
        f"Total anual contrato: {money(totals.get('annual_contract', 0.0))}",
        "",
        "Distribuicao por area",
        f"Fiscal: {money(area_totals['fiscal'])}",
        f"Contabil: {money(area_totals['contabil'])}",
        f"DP: {money(area_totals['dp'])}",
    ]


def sanitize_filename_part(value: str) -> str:
    return ORIGINAL.sanitize_filename_part(value)


def create_signed_contract(values: dict, totals: dict, ficha_name: str) -> dict | None:
    source = ORIGINAL_DIR / ORIGINAL.CONTRACT_TEMPLATE_NAME
    if not source.exists():
        return None

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    target_name = (
        f"{sanitize_filename_part(ficha_name)}__"
        f"{sanitize_filename_part(values.get('company_name', 'sem_empresa'))}__"
        f"{timestamp}__"
        f"{sanitize_filename_part(source.stem)}{source.suffix}"
    )
    target_path = SIGNED_DIR / target_name

    if source.suffix.lower() == ".docx":
        document = ORIGINAL.Document(source)
        ORIGINAL.apply_contract_template_replacements(document, values, totals)
        document.save(target_path)
    else:
        shutil.copy2(source, target_path)

    return {
        "signed_contract_name": source.name,
        "signed_contract_path": str(target_path),
    }


def proposal_payload(values: dict, rows, totals: dict, status: str, ficha_name: str) -> dict:
    summary_lines = build_summary(values, rows, totals)
    payload = {
        **values,
        "_status": status,
        "_ficha_name": ficha_name,
        "_rows": rows_to_dict(rows),
        "_totals": totals,
        "_summary_lines": summary_lines,
    }
    if status == "Proposta Aceita":
        contract_meta = create_signed_contract(values, totals, ficha_name)
        if contract_meta:
            payload.update(contract_meta)
    return payload


def serialize_db_row(row) -> dict:
    payload = json.loads(row["payload_json"])
    return {
        "ficha_name": row["ficha_name"],
        "company_name": row["company_name"],
        "cnpj": row["cnpj"],
        "status": row["status"],
        "monthly_contract": row["monthly_contract"],
        "extras_total": row["extras_total"],
        "updated_at": row["updated_at"],
        "payload": payload,
    }


def ensure_proposal_exists(ficha_name: str, company_name: str, cnpj: str):
    row = DATABASE.get_proposal(ficha_name, company_name, cnpj)
    if row is None:
        raise ValueError("Proposta nao encontrada.")
    return row


def resolve_contract_path(payload: dict) -> Path | None:
    raw_path = normalize_string(payload.get("signed_contract_path"))
    if not raw_path:
        return None
    candidate = Path(raw_path).resolve()
    try:
        candidate.relative_to(SIGNED_DIR.resolve())
    except ValueError:
        return None
    if not candidate.exists():
        return None
    return candidate


def handle_bootstrap(_payload: dict) -> dict:
    return {
        "fichas": list(getattr(ORIGINAL, "FICHA_NAMES", [])),
        "defaults": dict(getattr(ORIGINAL, "DEFAULT_VALUES_FICHA_1", {})),
        "segments": MODEL.segments,
        "tables": MODEL.tables,
        "taxes": MODEL.taxes,
        "modes": ["Registros Digitados", "Registros Importados"],
        "statuses": STATUS_OPTIONS,
    }


def handle_calculate(payload: dict) -> dict:
    values = normalize_values(payload.get("values"))
    unit_overrides = payload.get("unit_overrides") or {}
    rows, totals = MODEL.calculate(values, unit_overrides)
    return {
        "values": values,
        "rows": rows_to_dict(rows),
        "totals": totals,
        "summary_lines": build_summary(values, rows, totals),
        "area_totals": area_totals_from_rows(rows),
    }


def handle_save_proposal(payload: dict) -> dict:
    values = normalize_values(payload.get("values"))
    status = normalize_string(payload.get("status")) or "Proposta em Analise"
    ficha_name = normalize_string(payload.get("ficha_name")) or "Ficha 1"
    unit_overrides = payload.get("unit_overrides") or {}

    rows, totals = MODEL.calculate(values, unit_overrides)
    proposal = proposal_payload(values, rows, totals, status, ficha_name)
    DATABASE.save_proposal(ficha_name, proposal, totals, 0.0, status)

    saved = ensure_proposal_exists(ficha_name, normalize_string(values.get("company_name")), normalize_string(values.get("cnpj")))
    return serialize_db_row(saved)


def handle_list_proposals(payload: dict) -> dict:
    search = normalize_string(payload.get("search"))
    items = [serialize_db_row(row) for row in DATABASE.search(search)]
    return {
        "items": items,
        "counts": DATABASE.status_counts(),
    }


def handle_delete_proposal(payload: dict) -> dict:
    ficha_name = normalize_string(payload.get("ficha_name"))
    company_name = normalize_string(payload.get("company_name"))
    cnpj = normalize_string(payload.get("cnpj"))
    if not ficha_name or not company_name:
        raise ValueError("Informe ficha e empresa para excluir a proposta.")

    row = DATABASE.get_proposal(ficha_name, company_name, cnpj)
    if row is None:
        return {"deleted": False}

    stored_payload = json.loads(row["payload_json"])
    contract_path = resolve_contract_path(stored_payload)
    if contract_path and contract_path.exists():
        contract_path.unlink(missing_ok=True)

    DATABASE.delete_proposal(ficha_name, company_name, cnpj)
    return {"deleted": True}


def handle_get_contract(payload: dict) -> dict:
    ficha_name = normalize_string(payload.get("ficha_name"))
    company_name = normalize_string(payload.get("company_name"))
    cnpj = normalize_string(payload.get("cnpj"))
    row = ensure_proposal_exists(ficha_name, company_name, cnpj)
    stored_payload = json.loads(row["payload_json"])
    contract_path = resolve_contract_path(stored_payload)
    if not contract_path:
        raise ValueError("Contrato nao disponivel para esta proposta.")

    return {
        "path": str(contract_path),
        "name": contract_path.name,
    }


HANDLERS = {
    "bootstrap": handle_bootstrap,
    "calculate": handle_calculate,
    "save_proposal": handle_save_proposal,
    "list_proposals": handle_list_proposals,
    "delete_proposal": handle_delete_proposal,
    "get_contract": handle_get_contract,
}


def write_json(payload: dict):
    sys.stdout.buffer.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))


def main():
    action = normalize_string(sys.argv[1] if len(sys.argv) > 1 else "")
    if action not in HANDLERS:
        raise ValueError(f"Acao invalida: {action}")

    raw = sys.stdin.buffer.read().decode("utf-8", errors="replace").strip()
    payload = json.loads(raw) if raw else {}
    result = HANDLERS[action](payload)
    write_json({"ok": True, "data": result})


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        write_json({"ok": False, "error": str(exc)})
        sys.exit(1)
