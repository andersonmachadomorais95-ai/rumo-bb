"""Importa questões ativas, PDFs privados e o bootstrap do Supabase."""
import getpass
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import ANSWERS, CONTENT, EXPLANATIONS, PACKAGE, QUESTIONS, SOURCES

BATCH_SIZE = 50
MAX_FILE_SIZE = 50_000_000


def build_question_rows():
    explanations_by_question = {}
    for explanation in EXPLANATIONS:
        explanations_by_question.setdefault(explanation["questao_id"], []).append(explanation)

    sources_by_question = {}
    for source in SOURCES:
        if source.get("documento_id"):
            sources_by_question.setdefault(source["questao_id"], source)

    rows = []
    for question_id, question in QUESTIONS.items():
        answer = ANSWERS.get(question_id)
        if not answer or not answer.get("resposta"):
            raise ValueError(f"Questão ativa sem gabarito: {question_id}")
        explanations = sorted(
            explanations_by_question.get(question_id, []),
            key=lambda item: item["autoria"] != "IA_revisao_editorial_com_calculo",
        )
        source = sources_by_question.get(question_id)
        rows.append({
            "id": question_id,
            "payload": question,
            "correction": {
                "answer": answer["resposta"],
                "explanations": explanations,
                "source": (
                    {
                        "documento_id": source["documento_id"],
                        "pagina_inicio": source["pagina_inicio"],
                    }
                    if source
                    else None
                ),
            },
        })
    return rows


def document_files():
    files = []
    for document in CONTENT["documents"]:
        path = PACKAGE / "storage" / document["caminho_storage"]
        if not path.is_file():
            raise FileNotFoundError(f"PDF do pacote não encontrado: {path}")
        size = path.stat().st_size
        if size <= 0 or size > MAX_FILE_SIZE:
            raise ValueError(f"Tamanho inválido para upload ({size} bytes): {path}")
        files.append((document, path, size))
    return files


def request(url, key, path, data, content_type="application/json", headers=None):
    body = (
        json.dumps(data, ensure_ascii=False).encode("utf-8")
        if content_type == "application/json"
        else data
    )
    request_headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": content_type,
        **(headers or {}),
    }
    req = urllib.request.Request(url + path, data=body, method="POST", headers=request_headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            return response.status
    except urllib.error.HTTPError as error:
        raise RuntimeError(
            f"Falha HTTP {error.code} ao importar {path.split('?')[0]}; "
            "nenhuma credencial foi registrada."
        ) from None


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    dry_run = "--dry-run" in args
    args = [arg for arg in args if arg != "--dry-run"]
    if len(args) != 1:
        raise SystemExit(
            "Uso: python upload.py https://<project-ref>.supabase.co [--dry-run]"
        )

    url = args[0].rstrip("/")
    if not url.startswith("https://") or not url.endswith(".supabase.co"):
        raise SystemExit("Use a URL HTTPS oficial do projeto")

    question_rows = build_question_rows()
    files = document_files()
    storage_bytes = sum(size for _, _, size in files)
    bootstrap_bytes = len(json.dumps(CONTENT, ensure_ascii=False).encode("utf-8"))
    if dry_run:
        print(
            f"Validação concluída: {len(question_rows)} questões ativas, "
            f"{len(files)} PDFs ({storage_bytes} bytes) e bootstrap "
            f"({bootstrap_bytes} bytes); nenhuma gravação realizada."
        )
        return

    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or getpass.getpass(
        "Chave service_role (entrada oculta, não será salva): "
    )
    if not key:
        raise SystemExit("A chave service_role é obrigatória para importar conteúdo.")

    endpoint = "/rest/v1/bb_questions?on_conflict=id"
    for start in range(0, len(question_rows), BATCH_SIZE):
        batch = question_rows[start:start + BATCH_SIZE]
        request(
            url,
            key,
            endpoint,
            batch,
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
        )
        print(
            f"Questões importadas: {min(start + len(batch), len(question_rows))}/"
            f"{len(question_rows)}."
        )

    for index, (document, path, _) in enumerate(files, start=1):
        request(
            url,
            key,
            "/storage/v1/object/bb-content/" + document["caminho_storage"],
            path.read_bytes(),
            "application/pdf",
            {"x-upsert": "true"},
        )
        if index % 10 == 0 or index == len(files):
            print(f"PDFs importados: {index}/{len(files)}.")

    request(
        url,
        key,
        "/rest/v1/bb_content?on_conflict=id",
        {"id": "bootstrap", "payload": CONTENT},
        headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
    )
    key = None
    print(
        "Conteúdo ativo, PDFs privados e bootstrap importados. "
        "O histórico de usuários foi preservado."
    )


if __name__ == "__main__":
    main()
