"""Imports quarantined content privately; this data is not exposed through app RPCs."""
import getpass
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

PACKAGE = Path(__file__).resolve().parents[2] / "Gran Banco do Brasil" / "pacote-conteudo-v1"


def load(table):
    path = PACKAGE / "dados" / f"{table}.json"
    return json.loads(path.read_text(encoding="utf-8"))["registros"]


def build_rows():
    tables = {
        name: load(name)
        for name in (
            "questoes",
            "alternativas",
            "gabaritos",
            "explicacoes",
            "questao_fontes",
            "revisoes_conteudo",
            "questao_assuntos",
            "contextos",
        )
    }
    quarantined = [q for q in tables["questoes"] if q["status"] == "quarentena"]
    ids = {q["id"] for q in quarantined}
    by_question = {
        table: {}
        for table in (
            "alternativas",
            "gabaritos",
            "explicacoes",
            "questao_fontes",
            "revisoes_conteudo",
            "questao_assuntos",
        )
    }
    for table, records in by_question.items():
        for record in tables[table]:
            if record["questao_id"] in ids:
                by_question[table].setdefault(record["questao_id"], []).append(record)
    contexts = {context["id"]: context for context in tables["contextos"]}
    rows = []
    for question in quarantined:
        question_id = question["id"]
        answer = by_question["gabaritos"].get(question_id, [])
        context = contexts.get(question.get("contexto_id"))
        payload = {
            "question": question,
            "alternatives": by_question["alternativas"].get(question_id, []),
            "answer": answer[0] if answer else None,
            "explanations": by_question["explicacoes"].get(question_id, []),
            "sources": by_question["questao_fontes"].get(question_id, []),
            "reviews": by_question["revisoes_conteudo"].get(question_id, []),
            "topics": by_question["questao_assuntos"].get(question_id, []),
            "context": context,
            "practice_enabled": False,
        }
        rows.append({"id": question_id, "payload": payload})
    return rows


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Uso: python upload_quarantine.py https://<project>.supabase.co [--dry-run]")
    url = sys.argv[1].rstrip("/")
    if not url.startswith("https://") or not url.endswith(".supabase.co"):
        raise SystemExit("Use a URL HTTPS oficial do projeto Supabase")
    dry_run = "--dry-run" in sys.argv[2:]
    rows = build_rows()
    if not rows:
        raise SystemExit("Nenhuma questão em quarentena encontrada")
    if dry_run:
        size = sum(len(json.dumps(row, ensure_ascii=False).encode("utf-8")) for row in rows)
        print(f"Validação concluída: {len(rows)} questões em quarentena, {size} bytes JSON; nenhuma gravação realizada.")
        return

    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or getpass.getpass(
        "Chave service_role (entrada oculta; nunca compartilhe): "
    )
    endpoint = f"{url}/rest/v1/bb_quarantine?on_conflict=id"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    batch_size = 50
    for start in range(0, len(rows), batch_size):
        batch = rows[start : start + batch_size]
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(batch, ensure_ascii=False).encode("utf-8"),
            method="POST",
            headers=headers,
        )
        try:
            with urllib.request.urlopen(request, timeout=120):
                pass
        except urllib.error.HTTPError as error:
            raise RuntimeError(
                f"Importação interrompida no lote {start // batch_size + 1} "
                f"(HTTP {error.code}); os lotes concluídos podem ser repetidos com segurança."
            ) from None
        print(f"Importadas {min(start + len(batch), len(rows))}/{len(rows)} questões em quarentena.")
    key = None
    headers.clear()
    print("Importação privada concluída. Questões em quarentena não são servidas pela aplicação.")


if __name__ == "__main__":
    main()
