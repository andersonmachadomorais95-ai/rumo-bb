"""Index syllabus topics to pages in their matching local subject PDFs."""
import json
import math
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT.parent / "Gran Banco do Brasil" / "pacote-conteudo-v1"
OUTPUT = ROOT / "supabase" / "theory_page_map.json"
STOP_WORDS = set(
    "de da do das dos e em no na nos nas a o as os para por com um uma ao que "
    "se sua seu sobre entre como qual quais definicao conceito caracteristicas "
    "tipo tipos aplicacao aplicacoes calculo exemplo exemplos relacao questoes "
    "questao parte geral gerais principios principio introducao papel".split()
)
NON_CONTENT_HEADINGS = {"sumario", "indice", "gabarito", "referencias", "questoes"}


def load(name):
    path = PACKAGE / "dados" / f"{name}.json"
    return json.loads(path.read_text(encoding="utf-8"))["registros"]


def normalize(value):
    decomposed = unicodedata.normalize("NFKD", value or "")
    plain = "".join(char for char in decomposed if not unicodedata.combining(char)).lower()
    return re.sub(r"[^a-z0-9]+", " ", plain).strip()


def words(value):
    return list(dict.fromkeys(
        word for word in normalize(value).split()
        if len(word) > 2 and word not in STOP_WORDS
    ))


def is_non_content_heading(value):
    heading_words = words(value)
    return len(heading_words) == 1 and heading_words[0] in NON_CONTENT_HEADINGS


def main():
    subjects = load("assuntos")
    documents = {
        document["id"]: document
        for document in load("documentos")
        if document["tipo"] == "teoria" and document["canonica"]
    }
    sections_by_document = defaultdict(list)
    for section in load("secoes_documentos"):
        if section["documento_id"] in documents:
            sections_by_document[section["documento_id"]].append(section)

    curated_subjects = {item["assunto_id"] for item in load("trechos_teoria")}
    sections_by_discipline = defaultdict(list)
    for document_id, sections in sections_by_document.items():
        document = documents[document_id]
        for section in sections:
            sections_by_discipline[document["disciplina_id"]].append((document, section))
    pages_by_discipline = defaultdict(list)
    for document in documents.values():
        path = PACKAGE / "storage" / document["caminho_storage"]
        if not path.is_file():
            raise FileNotFoundError(f"PDF de teoria não encontrado: {path}")
        sections = sections_by_document[document["id"]]
        with pymupdf.open(path) as pdf:
            for index, page in enumerate(pdf):
                text = normalize(page.get_text())
                if text:
                    active_sections = [
                        section for section in sections
                        if section["pagina_inicio"] <= index + 1 <= section["pagina_fim"]
                    ]
                    section = min(
                        active_sections,
                        key=lambda item: item["pagina_fim"] - item["pagina_inicio"],
                        default=None,
                    )
                    pages_by_discipline[document["disciplina_id"]].append({
                        "document": document,
                        "number": index + 1,
                        "text": text,
                        "section": section,
                    })

    records = []
    for subject in subjects:
        if subject["id"] in curated_subjects:
            continue
        pages = pages_by_discipline[subject["disciplina_id"]]
        topic = normalize(subject["nome"])
        topic_words = words(subject["nome"])
        if not topic_words:
            continue

        exact = []
        for page in pages:
            if page["section"] and is_non_content_heading(page["section"]["titulo"]):
                continue
            if len(topic) >= 4 and f" {topic} " in f" {page['text']} ":
                exact.append(page)

        best = None
        method = "pdf_frase_exata"
        confidence = "alta"
        if exact:
            candidates = exact
            score = 1.0
        else:
            frequencies = {
                word: sum(f" {word} " in f" {page['text']} " for page in pages)
                for word in topic_words
            }
            weights = {
                word: math.log(1 + (len(pages) - count + 0.5) / (count + 0.5))
                for word, count in frequencies.items()
            }
            total_weight = sum(weights.values())
            candidates = []
            for page in pages:
                if page["section"] and is_non_content_heading(page["section"]["titulo"]):
                    continue
                matched = [
                    word for word in topic_words
                    if f" {word} " in f" {page['text']} "
                ]
                if not matched or len(matched) < min(2, len(topic_words)):
                    continue
                text_score = sum(weights[word] for word in matched) / total_weight
                if text_score < 0.8:
                    continue
                if len(topic_words) == 1 and frequencies[topic_words[0]] / max(1, len(pages)) > 0.1:
                    continue
                candidates.append((text_score, page, matched))
            if candidates:
                candidates.sort(key=lambda item: (-item[0], item[1]["number"]))
                score, best, matched = candidates[0]
                method = "pdf_termos_concordantes"
                confidence = "boa"

        if exact:
            def exact_rank(page):
                heading_score = len(set(topic_words) & set(words(page["section"]["titulo"]))) / max(1, len(topic_words)) if page["section"] else 0
                return (-heading_score, page["number"], page["document"]["id"])

            best = sorted(exact, key=exact_rank)[0]
        elif best is None:
            matching_sections = []
            topic_terms = set(topic_words)
            for document, section in sections_by_discipline[subject["disciplina_id"]]:
                heading_terms = set(words(section["titulo"]))
                if not topic_terms.issubset(heading_terms) or is_non_content_heading(section["titulo"]):
                    continue
                matching_sections.append((
                    len(heading_terms - topic_terms),
                    section["pagina_fim"] - section["pagina_inicio"],
                    section["pagina_inicio"],
                    document,
                    section,
                    heading_terms,
                ))
            if matching_sections:
                matching_sections.sort(key=lambda item: item[:3])
                _, _, _, document, section, heading_terms = matching_sections[0]
                best = {"document": document, "number": section["pagina_inicio"], "section": section}
                method = "pdf_sumario_titulo_exato" if topic_terms == heading_terms else "pdf_sumario_titulo_correspondente"
                confidence = "alta"
                score = 1.0
            else:
                continue

        heading = best["section"]
        records.append({
            "assunto_id": subject["id"],
            "documento_id": best["document"]["id"],
            "pagina_inicio": best["number"],
            "pagina_fim": best["number"],
            "titulo": heading["titulo"] if heading else subject["nome"],
            "metodo": method,
            "confianca": confidence,
            "indice_score": round(score, 4),
        })

    result = {"version": 1, "records": sorted(records, key=lambda item: item["assunto_id"])}
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Mapeados {len(records)} de {len(subjects)} assuntos; arquivo: {OUTPUT}")


if __name__ == "__main__":
    main()
