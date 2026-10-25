"""Promote only answerable quarantined questions to the authenticated practice bank."""
import getpass
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(ROOT))
import server
import upload_quarantine


def build_rows():
    active_ids = {question["id"] for question in server.CONTENT["questions"]}
    quarantined = [
        question
        for question in server.load("questoes")
        if question["status"] == "quarentena" and question["id"] in active_ids
    ]
    explanations = {}
    for item in server.EXPLANATIONS:
        explanations.setdefault(item["questao_id"], []).append(item)
    sources = {}
    for item in server.SOURCES:
        if item.get("documento_id"):
            sources.setdefault(item["questao_id"], item)

    rows = []
    for question in quarantined:
        question_id = question["id"]
        answer = server.ANSWERS[question_id]
        question_explanations = sorted(
            explanations.get(question_id, []),
            key=lambda item: item["autoria"] != "IA_revisao_editorial_com_calculo",
        )
        source = sources.get(question_id)
        rows.append(
            {
                "id": question_id,
                "payload": server.QUESTIONS[question_id],
                "correction": {
                    "answer": answer["resposta"],
                    "explanations": question_explanations,
                    "source": (
                        {
                            "documento_id": source["documento_id"],
                            "pagina_inicio": source["pagina_inicio"],
                        }
                        if source
                        else None
                    ),
                },
            }
        )
    return rows


def request(url, key, path, data=None, method="GET", headers=None):
    body = json.dumps(data, ensure_ascii=False).encode("utf-8") if data is not None else None
    request_headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        **(headers or {}),
    }
    if data is not None:
        request_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url + path, data=body, method=method, headers=request_headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            return response.headers, response.read()
    except urllib.error.HTTPError as error:
        raise RuntimeError(
            f"Falha HTTP {error.code} em {method} {path.split('?')[0]}; "
            "a operação pode ser repetida com segurança."
        ) from None


def exact_count(url, key, table, filters=None):
    params = {"select": "id", **(filters or {})}
    path = f"/rest/v1/{table}?{urllib.parse.urlencode(params)}"
    headers, _ = request(url, key, path, headers={"Prefer": "count=exact", "Range": "0-0"})
    content_range = headers.get("Content-Range", "")
    try:
        return int(content_range.rsplit("/", 1)[1])
    except (IndexError, ValueError):
        raise RuntimeError(f"O Supabase não retornou a contagem exata de {table}.") from None


def table_ids(url, key, table, filters=None):
    params = {"select": "id", **(filters or {})}
    path = f"/rest/v1/{table}?{urllib.parse.urlencode(params)}"
    ids = []
    start = 0
    while True:
        headers, body = request(
            url,
            key,
            path,
            headers={"Prefer": "count=exact", "Range": f"{start}-{start + 999}"},
        )
        batch = json.loads(body)
        if not isinstance(batch, list):
            raise RuntimeError(f"O Supabase retornou dados inválidos ao listar {table}.")
        ids.extend(row["id"] for row in batch)
        content_range = headers.get("Content-Range", "")
        try:
            total = int(content_range.rsplit("/", 1)[1])
        except (IndexError, ValueError):
            raise RuntimeError(f"O Supabase não retornou a contagem exata de {table}.") from None
        if len(ids) >= total:
            return ids
        if not batch:
            raise RuntimeError(f"A paginação de {table} terminou antes da contagem informada.")
        start += len(batch)


def delete_ids(url, key, table, ids):
    for start in range(0, len(ids), 50):
        batch = ids[start : start + 50]
        query = urllib.parse.urlencode({"id": f"in.({','.join(batch)})"})
        request(
            url,
            key,
            f"/rest/v1/{table}?{query}",
            method="DELETE",
            headers={"Prefer": "return=minimal"},
        )


def main():
    if len(sys.argv) < 2:
        raise SystemExit(
            "Uso: python promote_quarantine.py https://<project>.supabase.co [--dry-run]"
        )
    url = sys.argv[1].rstrip("/")
    if not url.startswith("https://") or not url.endswith(".supabase.co"):
        raise SystemExit("Use a URL HTTPS oficial do projeto Supabase")
    rows = build_rows()
    if len(rows) != 5003 or len(server.CONTENT["questions"]) != 5025:
        raise RuntimeError("Contagens inesperadas; nenhuma alteração foi enviada.")
    private_rows = upload_quarantine.build_rows()
    bootstrap = server.CONTENT
    size = len(json.dumps(bootstrap, ensure_ascii=False).encode("utf-8"))
    print(
        f"Validação: {len(rows)} questões answeráveis serão liberadas; "
        f"{server.CONTENT['coverage']['quarantine']} permanecerão isoladas. "
        f"{len(private_rows)} registros privados serão sincronizados. Bootstrap: {size} bytes."
    )
    if "--dry-run" in sys.argv[2:]:
        print("Dry-run concluído; nenhuma gravação realizada.")
        return

    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or getpass.getpass(
        "Chave service_role (entrada oculta; nunca compartilhe): "
    )
    quarantine_endpoint = "/rest/v1/bb_quarantine?on_conflict=id"
    for start in range(0, len(private_rows), 50):
        request(
            url,
            key,
            quarantine_endpoint,
            private_rows[start : start + 50],
            method="POST",
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
        )
        print(f"Quarentena sincronizada: {min(start + 50, len(private_rows))}/{len(private_rows)}")

    endpoint = "/rest/v1/bb_questions?on_conflict=id"
    for start in range(0, len(rows), 50):
        headers = {"Prefer": "resolution=merge-duplicates,return=minimal"}
        request(url, key, endpoint, rows[start : start + 50], method="POST", headers=headers)
        print(f"Questões preparadas: {min(start + 50, len(rows))}/{len(rows)}")

    bootstrap_filter = urllib.parse.urlencode({"id": "eq.bootstrap"})
    request(
        url,
        key,
        f"/rest/v1/bb_content?{bootstrap_filter}",
        {"payload": bootstrap},
        method="PATCH",
        headers={"Prefer": "return=minimal"},
    )
    active_ids = {question["id"] for question in server.CONTENT["questions"]}
    stale_active_ids = sorted(
        set(table_ids(url, key, "bb_questions", {"payload->>status": "eq.liberada"}))
        - active_ids
    )
    delete_ids(url, key, "bb_questions", stale_active_ids)
    if stale_active_ids:
        print(f"Questões retiradas da prática por pendência estrutural: {len(stale_active_ids)}")

    active_count = exact_count(
        url,
        key,
        "bb_questions",
        {"payload->>status": "eq.liberada"},
    )
    if active_count != 5025:
        raise RuntimeError(
            f"Conteúdo não ativado: esperado 5025 questões, Supabase retornou {active_count}. "
            "As questões seguem repetíveis; não remova os registros em quarentena."
        )

    promoted_ids = [row["id"] for row in rows]
    delete_ids(url, key, "bb_quarantine", promoted_ids)

    expected_quarantine_ids = {
        question["id"]
        for question in server.load("questoes")
        if question["status"] == "quarentena" and question["id"] not in active_ids
    }
    stored_quarantine_ids = set(table_ids(url, key, "bb_quarantine"))
    delete_ids(
        url,
        key,
        "bb_quarantine",
        sorted(stored_quarantine_ids - expected_quarantine_ids),
    )
    stored_quarantine_ids = set(table_ids(url, key, "bb_quarantine"))
    if stored_quarantine_ids != expected_quarantine_ids:
        raise RuntimeError(
            "A sincronização da quarentena não corresponde ao pacote local; "
            "verifique os registros antes de repetir."
        )
    quarantine_count = len(stored_quarantine_ids)
    if quarantine_count != 124:
        raise RuntimeError(
            f"Ativação concluída, mas a quarentena contém {quarantine_count} registros "
            "em vez de 124. Verifique a tabela antes de repetir."
        )
    key = None
    print(
        f"Concluído e verificado: {active_count} questões disponíveis, "
        f"{quarantine_count} isoladas. As {len(rows)} recém-liberadas ainda não passaram "
        "por revisão editorial completa."
    )


if __name__ == "__main__":
    main()
